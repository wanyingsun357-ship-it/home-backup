'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { randomUUID } = require('node:crypto');
const { hash, sanitizedMeta, safeModel } = require('./cache-diagnostics.cjs');
const logPath = path.join(__dirname, 'cache-usage.jsonl');
function write(record) {
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 8 * 1024 * 1024) fs.renameSync(logPath, logPath + '.1');
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', { mode: 0o600 });
  } catch { /* Observability must never interrupt a conversation. */ }
}
function observeCache(child, metadata, emit = write) {
  if (!child?.stdout?.on) return;
  const meta = sanitizedMeta(metadata);
  const decoder = new StringDecoder('utf8');
  const turn = { turn_id: randomUUID(), turn_started_at: new Date().toISOString() };
  const runtime = {};
  let buffer = '', dropping = false, activeId = null, finalUsageSeen = false, compacted = false, closed = false;
  const requests = new Map();
  function update(message, usage, started = false) {
    if (!message?.id || message.model === '<synthetic>' || !/^msg_[a-zA-Z0-9_-]{1,160}$/.test(message.id)) return;
    const now = new Date().toISOString();
    let record = requests.get(message.id);
    if (!record) {
      if (requests.size >= 2048) return;
      record = { at: now, ...meta, ...turn, ...runtime, event: 'api_usage', request_id: message.id,
        model: safeModel(message.model || meta.model), input_tokens: 0, cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0, output_tokens: 0, output_tokens_complete: false,
        write_5m: null, write_1h: null, compacted_since_previous_request: compacted };
      compacted = false;
      requests.set(message.id, record);
    }
    record.at = now;
    if (started) record.response_started_at = now;
    for (const k of ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens']) {
      // Streaming snapshots may repeat or arrive after the final usage. Never sum them.
      if (Number.isFinite(usage?.[k]) && usage[k] >= 0) record[k] = Math.max(record[k], usage[k]);
    }
    for (const [key, source] of [['write_5m', 'ephemeral_5m_input_tokens'], ['write_1h', 'ephemeral_1h_input_tokens']]) {
      if (Number.isFinite(usage?.cache_creation?.[source])) record[key] = usage.cache_creation[source];
    }
    return record;
  }
  function parse(line) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'system' && event.subtype === 'init') {
        if (typeof event.session_id === 'string') runtime.cli_session_hash = hash(event.session_id);
        if (/^[0-9]+\.[0-9]+\.[0-9]+$/.test(event.claude_code_version || '')) runtime.cli_version = event.claude_code_version;
        if (Array.isArray(event.tools)) {
          const names = event.tools.filter(t => typeof t === 'string');
          runtime.tool_inventory_hash = hash([...names].sort());
          runtime.tool_order_hash = hash(names);
          runtime.tool_count = names.length;
        }
        if (Array.isArray(event.mcp_servers)) runtime.mcp_connections_hash = hash(event.mcp_servers.map(s => [s.name, s.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      }
      if (event.type === 'system' && event.subtype === 'compact_boundary') compacted = true;
      if (event.type === 'assistant') update(event.message, event.message?.usage);
      const e = event.type === 'stream_event' ? event.event : null;
      if (e?.type === 'message_start') {
        activeId = e.message?.id;
        finalUsageSeen = false;
        update(e.message, e.message?.usage, true);
      }
      if (e?.type === 'message_delta' && activeId) {
        const record = update({ id: activeId }, e.usage);
        if (record && Number.isFinite(e.usage?.output_tokens)) finalUsageSeen = true;
      }
      if (e?.type === 'message_stop') {
        if (finalUsageSeen && requests.has(activeId)) requests.get(activeId).output_tokens_complete = true;
        activeId = null;
        finalUsageSeen = false;
      }
    } catch { /* No raw events/errors: may contain private text. */ }
  }
  function consume(text) {
    // Bound pending line memory even when a provider emits a malformed/huge line.
    for (const part of text.split(/(?<=\n)/)) {
      const ends = part.endsWith('\n');
      if (!dropping) {
        if (buffer.length + part.length > 8 * 1024 * 1024) { buffer = ''; dropping = true; }
        else buffer += part;
      }
      if (ends) { if (!dropping) parse(buffer); buffer = ''; dropping = false; }
    }
  }
  child.stdout.on('data', data => { try { consume(decoder.write(data)); } catch {} });
  child.on('close', () => {
    if (closed) return;
    closed = true;
    try { consume(decoder.end()); if (buffer.trim() && !dropping) parse(buffer); } catch {}
    for (const record of requests.values()) { try { emit(record); } catch {} }
  });
}
module.exports = { observeCache };
