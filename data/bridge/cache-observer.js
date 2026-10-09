'use strict';
const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const logPath = path.join(__dirname, 'cache-usage.jsonl');
function write(record) {
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 8 * 1024 * 1024) fs.renameSync(logPath, logPath + '.1');
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', { mode: 0o600 });
  } catch { /* Observability must never interrupt a conversation. */ }
}
function observeCache(child, meta, emit = write) {
  if (!child?.stdout?.on) return;
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  const requests = new Map();
  function parse(line) {
    try {
      const event = JSON.parse(line);
      const message = event.type === 'assistant' ? event.message : null;
      if (!message?.id || !message.usage) return;
      const u = message.usage;
      const count = k => Number.isFinite(u[k]) ? u[k] : 0;
      requests.set(message.id, { at: new Date().toISOString(), ...meta, event: 'api_usage',
        request_id: message.id, model: message.model || meta.model,
        input_tokens: count('input_tokens'), cache_read_input_tokens: count('cache_read_input_tokens'),
        cache_creation_input_tokens: count('cache_creation_input_tokens'), output_tokens: count('output_tokens'),
        write_5m: u.cache_creation?.ephemeral_5m_input_tokens ?? null,
        write_1h: u.cache_creation?.ephemeral_1h_input_tokens ?? null });
    } catch {}
  }
  child.stdout.on('data', data => {
    buffer += decoder.write(data);
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) { parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1); }
  });
  child.on('close', () => {
    buffer += decoder.end();
    if (buffer.trim()) parse(buffer);
    for (const record of requests.values()) emit(record);
  });
}
module.exports = { observeCache };
