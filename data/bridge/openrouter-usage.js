'use strict';
const fs = require('fs');
const path = require('path');
const HOUR = 3600000;
const num = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
function aggregate(rows, now = Date.now()) {
  const seen = new Map();
  for (const row of rows) if (row.event === 'api_usage' && row.request_id) seen.set(row.request_id, row);
  const empty = () => ({ requests: 0, hits: 0, input: 0, read: 0, write: 0, write1h: 0, write5m: 0 });
  const current = empty(), previous = empty();
  const buckets = Array.from({ length: 12 }, (_, i) => ({ ...empty(), at: new Date(now - (12 - i) * 2 * HOUR).toISOString() }));
  let first = null;
  function add(g, r) {
    g.requests++; if (r.cache_read_input_tokens > 0) g.hits++;
    g.input += Math.max(0, num(r.input_tokens) || 0); g.read += Math.max(0, num(r.cache_read_input_tokens) || 0);
    g.write += Math.max(0, num(r.cache_creation_input_tokens) || 0);
    g.write1h += Math.max(0, num(r.write_1h) || 0); g.write5m += Math.max(0, num(r.write_5m) || 0);
  }
  for (const r of seen.values()) {
    const t = Date.parse(r.at); if (!Number.isFinite(t) || t > now) continue;
    first = first === null ? t : Math.min(first, t);
    const age = now - t;
    if (age < 24 * HOUR) { add(current, r); add(buckets[Math.min(11, Math.floor((t - (now - 24 * HOUR)) / (2 * HOUR)))], r); }
    else if (age < 48 * HOUR) add(previous, r);
  }
  const rate = g => g.input + g.read + g.write ? g.read / (g.input + g.read + g.write) : null;
  return { ...current, rate: rate(current), request_rate: current.requests ? current.hits / current.requests : null,
    change: rate(current) !== null && rate(previous) !== null ? rate(current) - rate(previous) : null,
    since: first === null ? null : new Date(first).toISOString(),
    buckets: buckets.map(g => ({ at: g.at, rate: rate(g), requests: g.requests })) };
}
function cacheStats() {
  const rows = [];
  for (const name of ['cache-usage.jsonl.1', 'cache-usage.jsonl']) {
    try { for (const line of fs.readFileSync(path.join(__dirname, name), 'utf8').split('\n')) { try { rows.push(JSON.parse(line)); } catch {} } } catch {}
  }
  return aggregate(rows);
}
let cached = null, pending = null;
async function getOpenRouterUsage() {
  if (cached && Date.now() - cached.time < 60000) return { ...cached.data, cache: cacheStats() };
  if (!pending) pending = (async () => {
    let key; try { key = fs.readFileSync(path.join(__dirname, '.openrouter-key'), 'utf8').trim(); } catch {}
    async function read(endpoint) {
      if (!key) return { error: 'not_configured' };
      try {
        const r = await fetch('https://openrouter.ai/api/v1/' + endpoint, { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(10000) });
        return r.ok ? { data: (await r.json()).data } : { error: r.status === 403 ? 'permission' : 'unavailable' };
      } catch { return { error: 'unavailable' }; }
    }
    const [credits, keyInfo] = await Promise.all([read('credits'), read('key')]);
    const c = credits.data, k = keyInfo.data;
    const data = { fetchedAt: new Date().toISOString(), currency: 'USD',
      balance: num(c?.total_credits) !== null && num(c?.total_usage) !== null ? c.total_credits - c.total_usage : null,
      balanceError: credits.error || null,
      daily: num(k?.usage_daily), monthly: num(k?.usage_monthly), total: num(k?.usage),
      keyLimitRemaining: num(k?.limit_remaining), spendingError: keyInfo.error || null };
    cached = { time: Date.now(), data }; return data;
  })().finally(() => { pending = null; });
  return { ...await pending, cache: cacheStats() };
}
module.exports = { getOpenRouterUsage, aggregate };
