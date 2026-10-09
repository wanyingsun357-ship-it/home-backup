'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createHash, randomUUID } = require('crypto');
const { observeCache } = require('./cache-observer');

const keyFile = path.join(__dirname, '.openrouter-key');
const key = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '';
if (key && !/^sk-or-v1-[A-Za-z0-9_-]+$/.test(key)) {
  throw new Error('Invalid OpenRouter key file');
}

const MODEL_IDS = {
  'claude-opus-4-6': 'anthropic/claude-opus-4.6',
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
  'claude-haiku-4-5': 'anthropic/claude-haiku-4.5',
  'claude-opus-4-7': 'anthropic/claude-opus-4.7',
  'claude-opus-4-8': 'anthropic/claude-opus-4.8',
  'claude-opus-5': 'anthropic/claude-opus-5',
  'claude-sonnet-5': 'anthropic/claude-sonnet-5',
  'claude-fable-5': 'anthropic/claude-fable-5',
  opus: 'anthropic/claude-opus-4.6',
  sonnet: 'anthropic/claude-sonnet-4.6',
  haiku: 'anthropic/claude-haiku-4.5',
};

const ROLE_MODELS = {
  chat: { label: '聊天', model: MODEL_IDS.opus, manual: true },
  memory: { label: '整理记忆', model: MODEL_IDS.opus },
  wake: { label: '定时唤醒', model: MODEL_IDS.opus },
  background: { label: '后台回复等任务', model: MODEL_IDS.sonnet },
};

function spawnClaude(args, options = {}, role = 'chat') {
  if (!key) return spawn('claude', args, options);
  const mapped = [...args];
  // The owner authorizes all VPS tools for App-driven Claude tasks.
  // Keep explicit --tools selections (e.g. tool-free probes) intact.
  const fullTools = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
    'NotebookEdit', 'Agent', 'Task', 'TodoWrite', 'Skill', 'ToolSearch', 'TaskCreate', 'TaskGet',
    'TaskUpdate', 'TaskList', 'TaskOutput', 'TaskStop', 'Read(//**)', 'Edit(//**)'];
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'bridge-config.json'), 'utf8'));
    for (const [name, server] of Object.entries(config.customMcp || {})) {
      if (server.enabled) fullTools.push(`mcp__${name}__*`);
    }
  } catch {}
  mapped.push('--allowedTools', ...fullTools);
  const modelIndex = mapped.indexOf('--model');
  if (modelIndex >= 0) {
    const original = mapped[modelIndex + 1];
    mapped[modelIndex + 1] = MODEL_IDS[original] || original;
  } else {
    mapped.push('--model', (ROLE_MODELS[role] || ROLE_MODELS.chat).model);
  }
  const env = {
    ...process.env,
    ...options.env,
    ANTHROPIC_BASE_URL: 'https://openrouter.ai/api',
    ANTHROPIC_AUTH_TOKEN: key,
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_DEFAULT_OPUS_MODEL: MODEL_IDS.opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: MODEL_IDS.sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: MODEL_IDS.haiku,
    ANTHROPIC_SMALL_FAST_MODEL: MODEL_IDS.haiku,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  // Apply policy per App task, not globally to every Claude invocation.
  env.CLAUDE_CODE_PROMPT_CACHE_TTL = role === 'chat' ? '1h' : '5m';
  env.CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL = '5m';
  const { cacheSessionId, ...spawnOptions } = options;
  const resumeIndex = mapped.indexOf('--resume');
  const identity = cacheSessionId || (resumeIndex >= 0 ? mapped[resumeIndex + 1] : randomUUID());
  const session = 'ayan-' + createHash('sha256').update(String(identity)).digest('hex').slice(0, 40);
  const headers = (env.ANTHROPIC_CUSTOM_HEADERS || '').split('\n').filter(h => h.trim() && !/^\s*x-session-id\s*:/i.test(h));
  env.ANTHROPIC_CUSTOM_HEADERS = [...headers, `x-session-id: ${session}`].join('\n');
  const child = spawn('claude', mapped, { ...spawnOptions, env });
  observeCache(child, { role, session, ttl: env.CLAUDE_CODE_PROMPT_CACHE_TTL,
    model: mapped[mapped.indexOf('--model') + 1] });
  return child;
}

let catalog = null;
let catalogAt = 0;
let refreshing = null;
const catalogFile = path.join(__dirname, 'claude-models-cache.json');
try {
  if (fs.existsSync(catalogFile)) {
    const saved = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
    if (Array.isArray(saved.models) && saved.models.length && saved.models.every(m => /^anthropic\/claude-(opus|sonnet|haiku|fable)-\d+(\.\d+)?$/.test(m.id))) {
      catalog = saved.models;
      catalogAt = saved.at || 0;
    }
  }
} catch {}

function normalizeModels(data) {
  return data.flatMap(model => {
    const match = model.id?.match(/^anthropic\/claude-(opus|sonnet|haiku|fable)-(\d+(?:\.\d+)?)$/);
    if (!match || Number(match[2]) < 4 || !model.supported_parameters?.includes('tools')) return [];
    const price = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) * 1000000 : null;
    return [{ id: model.id, label: `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}`, input_price: price(model.pricing?.prompt), output_price: price(model.pricing?.completion) }];
  }).sort((a, b) => {
    const preferred = [MODEL_IDS.opus, MODEL_IDS.sonnet, MODEL_IDS.haiku];
    const rank = id => preferred.includes(id) ? preferred.indexOf(id) : preferred.length;
    return rank(a.id) - rank(b.id) || a.label.localeCompare(b.label, 'en', { numeric: true });
  });
}

async function getModelCatalog() {
  if (!key) return { provider: 'anthropic', models: normalizeModels(Object.values(MODEL_IDS).filter((id, i, all) => all.indexOf(id) === i).map(id => ({ id, supported_parameters: ['tools'] }))), roles: ROLE_MODELS, default_model: MODEL_IDS.opus, stale: false };
  let stale = false;
  if (!catalog || Date.now() - catalogAt > 5 * 60000) {
    if (!refreshing) refreshing = (async () => {
      const response = await fetch('https://openrouter.ai/api/v1/models/user', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Model catalogue unavailable');
      const data = await response.json();
      if (!Array.isArray(data.data)) throw new Error('Invalid model catalogue');
      const models = normalizeModels(data.data);
      if (!models.length) throw new Error('No compatible Claude models available');
      catalog = models;
      catalogAt = Date.now();
      try { fs.writeFileSync(catalogFile, JSON.stringify({ models: catalog, at: catalogAt })); } catch {}
    })().finally(() => { refreshing = null; });
    try { await refreshing; } catch { stale = true; if (!catalog) throw new Error('Model catalogue unavailable'); }
  }
  return { provider: 'openrouter', models: catalog, roles: ROLE_MODELS, default_model: MODEL_IDS.opus, stale, updated_at: new Date(catalogAt).toISOString() };
}

function registerModelRoutes(app) {
  app.get('/api/models', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await getModelCatalog()); }
    catch { res.status(503).json({ error: 'models_unavailable' }); }
  });
}

module.exports = { spawnClaude, MODEL_IDS, ROLE_MODELS, normalizeModels, getModelCatalog, registerModelRoutes, provider: key ? 'openrouter' : 'anthropic' };
