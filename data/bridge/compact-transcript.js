'use strict';
const crypto = require('crypto');
function estimateText(text) {
  const s = String(text || '');
  const cjk = (s.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  return Math.ceil(cjk * 1.5 + (s.length - cjk) / 4);
}
function textOf(event) {
  const c = event.message?.content;
  return typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b?.type === 'text').map(b => b.text || '').join('\n') : '';
}
function isUserTurn(event) {
  const c = event.message?.content;
  return event.type === 'user' && (typeof c === 'string' || Array.isArray(c) && c.some(b => b?.type === 'text') && !c.some(b => b?.type === 'tool_result'));
}
function isInternal(event) {
  const text = textOf(event).trim().replace(/^(?:(?:⸢[^⸣]*⸣|\[[^\]]*\])\s*)+/, '');
  return /^\(内部整理[,，]不是婉莹在说话/.test(text) || text.startsWith('<过往记忆>');
}
function priorMemory(events) {
  return [...events].reverse().find(e => isUserTurn(e) && textOf(e).trim().startsWith('<过往记忆>')) ?
    textOf([...events].reverse().find(e => isUserTurn(e) && textOf(e).trim().startsWith('<过往记忆>'))) : '';
}
function fold(event) {
  const e = JSON.parse(JSON.stringify(event));
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b?.type === 'tool_result') {
      const raw = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '');
      if (raw.length > 2000) b.content = [{ type: 'text', text: raw.slice(0, 300) + '…(长回包已折叠，原图/原文仍在原记录中)' }];
    }
  }
  if (e.toolUseResult && JSON.stringify(e.toolUseResult).length > 2000) e.toolUseResult = '(已折叠)';
  function clearUsage(u) {
    if (!u || typeof u !== 'object') return;
    for (const k of ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens']) if (k in u) u[k] = 0;
    if (u.cache_creation) for (const k of Object.keys(u.cache_creation)) u.cache_creation[k] = 0;
    for (const it of u.iterations || []) clearUsage(it);
  }
  clearUsage(e.message?.usage);
  return e;
}
function recordTokens(event) {
  const c = event.message?.content;
  if (typeof c === 'string') return estimateText(c);
  if (Array.isArray(c)) return c.reduce((n, b) => n + (b?.type === 'image' ? 2000 : estimateText(JSON.stringify(b))), 0);
  if (event.type === 'attachment') return estimateText(JSON.stringify(event.attachment || {}));
  return 0;
}
function buildTranscript(events, newId, memoryText, { budget = 30000, cwd = '/root/ayan', now = Date.now() } = {}) {
  if (!events.length) throw new Error('transcript为空');
  const snapshot = [...events].reverse().find(e => e.type === 'attachment' && e.attachment?.type === 'prompt_snapshot');
  let internal = false;
  const candidates = [];
  for (const original of events) {
    if (isUserTurn(original)) internal = isInternal(original);
    if (internal) continue;
    if (original.type === 'attachment' && original.attachment?.type === 'prompt_snapshot') continue;
    if ((original.type === 'user' || original.type === 'assistant') && original.message || original.type === 'attachment') candidates.push(fold(original));
  }
  const starts = candidates.flatMap((e, i) => isUserTurn(e) && !isInternal(e) ? [i] : []);
  if (!starts.length) throw new Error('没有可保留的真实对话，原窗口保持不变');
  let boundary = starts.at(-1), historyTokens = 0;
  for (let j = starts.length - 1; j >= 0; j--) {
    const end = j + 1 < starts.length ? starts[j + 1] : candidates.length;
    const tokens = candidates.slice(starts[j], end).reduce((n, e) => n + recordTokens(e), 0);
    if (historyTokens && historyTokens + tokens > budget) break;
    historyTokens += tokens; boundary = starts[j];
    if (historyTokens >= budget) break;
  }
  const retained = candidates.slice(boundary);
  let lastTime = null;
  for (const e of retained) {
    const t = Date.parse(e.timestamp || '');
    if (isUserTurn(e) && Number.isFinite(t) && (lastTime === null || t - lastTime > 600000)) {
      const d = new Date(t + 8 * 3600000);
      const tag = `⸢${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}⸣ `;
      if (typeof e.message.content === 'string') e.message.content = tag + e.message.content;
      else { const b = e.message.content.find(b => b?.type === 'text'); if (b) b.text = tag + b.text; }
    }
    if (Number.isFinite(t)) lastTime = t;
  }
  const primer = [];
  if (!retained.some(e => e.type === 'assistant' && e.message?.content?.some?.(b => b.type === 'tool_use'))) {
    for (let i = boundary - 1; i >= 0; i--) {
      const result = candidates[i];
      const tr = result.type === 'user' && Array.isArray(result.message?.content) && result.message.content.find(b => b.type === 'tool_result');
      if (!tr) continue;
      const call = candidates.slice(Math.max(0, i - 6), i).reverse().find(e => e.type === 'assistant' && e.message?.content?.some?.(b => b.type === 'tool_use' && b.id === tr.tool_use_id));
      if (!call) continue;
      const a = fold(call), b = fold(result);
      a.message.content = a.message.content.filter(x => x.type === 'tool_use' && x.id === tr.tool_use_id);
      b.message.content = b.message.content.filter(x => x.type === 'tool_result' && x.tool_use_id === tr.tool_use_id);
      primer.push(a, b); break;
    }
  }
  const memory = { type: 'user', message: { role: 'user', content: memoryText },
    isSidechain: false, userType: 'external', cwd, version: retained[0].version || '2.1.289',
    gitBranch: retained[0].gitBranch || 'HEAD', timestamp: new Date(now - 60000).toISOString() };
  const chain = [memory, ...(snapshot ? [fold(snapshot)] : []), ...primer, ...retained];
  for (let i = 0; i < chain.length; i++) {
    chain[i].uuid = crypto.randomUUID(); chain[i].parentUuid = i ? chain[i - 1].uuid : null; chain[i].sessionId = newId;
  }
  const prefix = snapshot ? estimateText(JSON.stringify(snapshot.attachment.systemPrompt || [])) + estimateText(JSON.stringify(snapshot.attachment.tools || [])) : 0;
  const history = chain.filter(e => e !== chain[1] || !snapshot).reduce((n, e) => n + recordTokens(e), 0);
  return { chain, stats: { estTokens: history + prefix, estimated: true, historyEstTokens: history,
    prefixEstTokens: prefix, kept: retained.length, total: events.length, primer: primer.length > 0,
    snapshots: snapshot ? 1 : 0, retainedConversationTokens: historyTokens, oversizedTurn: historyTokens > budget } };
}
module.exports = { buildTranscript, priorMemory, isInternal, isUserTurn, recordTokens };
