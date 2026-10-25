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
  memory: { label: '整理记忆', model: MODEL_IDS.sonnet },
  wake: { label: '定时唤醒', model: MODEL_IDS.opus },
  background: { label: '后台回复等任务', model: MODEL_IDS.opus },
};

// 只有整理记忆固定 Sonnet 4.6（按当前通道走订阅或 OpenRouter）；其余后台角色跟随当前选择的聊天模型。
const ACCOUNT_MEMORY_MODEL = 'account/claude-sonnet-4-6';
function selectedClaudeModel() {
  try {
    const model = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-settings.json'), 'utf8')).model;
    return typeof model === 'string' && /^(account|anthropic)\//.test(model) ? model : null;
  } catch { return null; }
}
function roleModels() {
  const selected = selectedClaudeModel() || MODEL_IDS.opus;
  const memory = selected.startsWith('account/') ? ACCOUNT_MEMORY_MODEL : MODEL_IDS.sonnet;
  return Object.fromEntries(Object.entries(ROLE_MODELS).map(([name, role]) => [name, { ...role, model: name === 'memory' ? memory : selected }]));
}

// Claude 订阅账号（Claude Code 登录）：模型 id 形如 account/claude-opus-5-5。
// 引擎仍是 claude，因此沿用 200k 窗口与 170k 自动整理，不进入 Codex 220k 路径。
const ACCOUNT_RE = /^account\/(claude-(?:opus|sonnet|haiku|fable)-\d+(?:-\d+)?)$/;
const accountTokenFile = path.join(__dirname, '.claude-oauth-token');
function accountModel(id) {
  return typeof id === 'string' ? (id.match(ACCOUNT_RE) || [])[1] || null : null;
}
function accountEnv(base) {
  const env = { ...base };
  for (const name of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_CUSTOM_HEADERS',
    'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL']) delete env[name];
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  // `claude setup-token` 生成的长期令牌可放在 .claude-oauth-token；否则用 `claude auth login` 保存的登录。
  try {
    const token = fs.readFileSync(accountTokenFile, 'utf8').trim();
    if (/^sk-ant-oat\d*-[A-Za-z0-9_-]+$/.test(token)) env.CLAUDE_CODE_OAUTH_TOKEN = token;
  } catch {}
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  return env;
}
let accountState = null;
let accountStateAt = 0;
let accountPending = null;
function accountStatus() {
  if (accountState && Date.now() - accountStateAt < 60000) return Promise.resolve(accountState);
  if (!accountPending) accountPending = new Promise(resolve => {
    require('child_process').execFile('claude', ['auth', 'status'], { env: accountEnv(process.env), timeout: 15000 }, (error, stdout) => {
      let state = { ready: false, plan: null };
      try { const info = JSON.parse(stdout); state = { ready: Boolean(info.loggedIn), plan: info.subscriptionType || null }; } catch {}
      accountState = state; accountStateAt = Date.now(); resolve(state);
    });
  }).finally(() => { accountPending = null; });
  return accountPending;
}
// 订阅额度（Settings 显示）：读 Claude Code 登录保存的凭据，查 5 小时 / 7 天窗口用量，缓存 60s。
let accountUsage = null;
let accountUsageAt = 0;
async function getAccountUsage() {
  if (accountUsage && Date.now() - accountUsageAt < 60000) return accountUsage;
  const cred = JSON.parse(fs.readFileSync('/root/.claude/.credentials.json', 'utf8')).claudeAiOauth;
  const response = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: 'Bearer ' + cred.accessToken, 'anthropic-beta': 'oauth-2025-04-20', Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('usage ' + response.status);
  const data = await response.json();
  const pick = (window, minutes) => window && window.utilization != null ? { usedPercent: Number(window.utilization), resetsAt: window.resets_at, windowDurationMins: minutes } : null;
  accountUsage = { session: pick(data.five_hour, 300), week: pick(data.seven_day, 10080), weekOpus: pick(data.seven_day_opus, 10080), weekSonnet: pick(data.seven_day_sonnet, 10080) };
  accountUsageAt = Date.now();
  return accountUsage;
}
const ACCOUNT_FALLBACK =['opus-5-5', 'sonnet-5-5', 'haiku-5-5', 'fable-5-1', 'opus-4-8', 'opus-4-6', 'sonnet-4-6'];
async function getAccountCatalog(source = []) {
  const status = await accountStatus();
  const ids = source.length
    ? source.map(m => m.id.replace(/^anthropic\/claude-/, '').replace('.', '-'))
    : ACCOUNT_FALLBACK;
  const models = [...new Set(ids)].flatMap(id => {
    const match = id.match(/^(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?$/);
    if (!match || Number(match[2]) < 4) return [];
    return [{ id: `account/claude-${id}`, label: `Claude · ${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}${match[3] ? '.' + match[3] : ''}`, engine: 'claude', source: 'account', billing: 'Claude 订阅额度', disabled: !status.ready }];
  });
  return { ready: status.ready, plan: status.plan, models };
}

const CLAUDE_TRIMMED_TOOLS = [
  // App conversations use existing wake-outbox and local tools, not agent-team orchestration.
  'Agent', 'ListAgents', 'ReportFindings', 'Workflow',
  'CronCreate', 'CronDelete', 'CronList', 'EnterWorktree', 'ExitWorktree',
  'ListMcpResourcesTool', 'NotebookEdit', 'ReadMcpResourceDirTool',
  'ReadMcpResourceTool', 'SendMessage', 'TaskCreate', 'TaskGet', 'TaskList',
  'TaskStop', 'TaskUpdate', 'WaitForMcpServers', 'WebFetch',
];

function spawnClaude(args, options = {}, role = 'chat') {
  // Scoped to App subprocesses; MCP capabilities remain discoverable with ToolSearch.
  options = { ...options, env: { ...process.env, ...options.env, ENABLE_TOOL_SEARCH: 'true' } };
  const mapped = [...args];
  mapped.push('--disallowedTools', ...CLAUDE_TRIMMED_TOOLS);
  if (!key) return spawn('claude', mapped, options);
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
  mapped.push('--allowedTools', ...fullTools.filter(name => !CLAUDE_TRIMMED_TOOLS.includes(name)));
  const modelIndex = mapped.indexOf('--model');
  if (modelIndex >= 0) {
    const original = mapped[modelIndex + 1];
    mapped[modelIndex + 1] = MODEL_IDS[original] || original;
  } else {
    const roles = roleModels();
    mapped.push('--model', (roles[role] || roles.chat).model);
  }
  const chosen = mapped[mapped.indexOf('--model') + 1];
  if (accountModel(chosen)) {
    // Claude 订阅账号：走 Claude Code 自己的登录，不经过 OpenRouter。
    mapped[mapped.indexOf('--model') + 1] = accountModel(chosen);
    const env = accountEnv({ ...process.env, ...options.env });
    env.CLAUDE_CODE_PROMPT_CACHE_TTL = role === 'chat' ? '1h' : '5m';
    env.CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL = '5m';
    // 整理记忆要先写 Echo 再写交接信，订阅通道默认约 170k 就拦截；整理时放宽到 190k（模型真实窗口仍是 200k）。
    if (role === 'memory') env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE = '190000';
    const { cacheSessionId, ...spawnOptions } = options;
    const child = spawn('claude', mapped, { ...spawnOptions, env });
    observeCache(child, { role, session: 'account-' + createHash('sha256').update(String(cacheSessionId || randomUUID())).digest('hex').slice(0, 32),
      ttl: env.CLAUDE_CODE_PROMPT_CACHE_TTL, model: chosen });
    return child;
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
  if (!key) return { provider: 'anthropic', models: normalizeModels(Object.values(MODEL_IDS).filter((id, i, all) => all.indexOf(id) === i).map(id => ({ id, supported_parameters: ['tools'] }))), roles: roleModels(), default_model: MODEL_IDS.opus, stale: false };
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
  return { provider: 'openrouter', models: catalog, roles: roleModels(), default_model: MODEL_IDS.opus, stale, updated_at: new Date(catalogAt).toISOString() };
}

function registerModelRoutes(app) {
  app.get('/api/models', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await getModelCatalog()); }
    catch { res.status(503).json({ error: 'models_unavailable' }); }
  });
}

module.exports = { spawnClaude, accountModel, getAccountCatalog, getAccountUsage, roleModels, MODEL_IDS, ROLE_MODELS, normalizeModels, getModelCatalog, registerModelRoutes, provider: key ? 'openrouter' : 'anthropic' };
