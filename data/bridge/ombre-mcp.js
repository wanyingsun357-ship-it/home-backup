'use strict';

// Independent stdio transport for the existing Ombre Brain MCP service.
// OAuth credentials stay on the VPS; stdout contains JSON-RPC only.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const root = 'https://myo.zeabur.app';
const authFile = path.join(__dirname, '.ombre-mcp-auth.json');
let sessionId = '';
let protocol = '2024-11-05';

async function credentials(force = false) {
  let auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  if (!force && auth.expires_at > Date.now() + 60000) return auth;
  if (!auth.refresh_token) throw new Error('Ombre authorization requires renewal');
  const response = await fetch(root + '/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refresh_token, client_id: auth.client_id }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Ombre renewal failed (${response.status})`);
  const renewed = await response.json();
  if (!renewed.access_token) throw new Error('Ombre renewal returned no credential');
  auth = { ...auth, ...renewed, expires_at: Date.now() + (renewed.expires_in || 3600) * 1000 };
  const temp = authFile + '.new';
  fs.writeFileSync(temp, JSON.stringify(auth), { mode: 0o600 });
  fs.renameSync(temp, authFile);
  return auth;
}

async function forward(message, retried = false) {
  const auth = await credentials(retried);
  const response = await fetch(root + '/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': protocol,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify(message), signal: AbortSignal.timeout(60000),
  });
  if (response.status === 401 && !retried) { await response.body?.cancel(); return forward(message, true); }
  if (!response.ok) throw new Error(`Ombre MCP request failed (${response.status})`);
  if (response.headers.get('mcp-session-id')) sessionId = response.headers.get('mcp-session-id');
  if (response.status === 204 || message.id === undefined) { await response.body?.cancel(); return; }
  const body = await response.text();
  const messages = [];
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    for (const block of body.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') messages.push(JSON.parse(data));
    }
  } else if (body.trim()) messages.push(JSON.parse(body));
  const result = messages.find(item => item.id === message.id);
  if (!result) throw new Error('Ombre returned no matching response');
  if (message.method === 'initialize' && result.result?.protocolVersion) protocol = result.result.protocolVersion;
  return result;
}

let queue = Promise.resolve();
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  queue = queue.then(async () => {
    let message;
    try {
      message = JSON.parse(line);
      const reply = await forward(message);
      if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
    } catch (error) {
      if (message?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: error.message } }) + '\n');
      else process.stderr.write('Ombre MCP notification failed\n');
    }
  });
});
