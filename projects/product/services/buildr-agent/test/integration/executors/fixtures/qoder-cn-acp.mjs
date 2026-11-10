#!/usr/bin/env node
// Minimal Qoder CN ACP fixture: newline-delimited JSON-RPC over stdio, no network.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--version')) { process.stdout.write('1.1.86\n'); process.exit(0); }
if (args.includes('login')) {
  process.stdout.write('Open https://qoder.cn/device?code=fixture to sign in\n');
  setTimeout(() => process.exit(0), 50);
}
if (!args.includes('--acp')) { process.stderr.write('fixture expects --acp\n'); process.exit(2); }

let buffer = '';
let pendingPrompt;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });

function finishPrompt(stopReason) {
  if (!pendingPrompt) return;
  const { id, sessionId } = pendingPrompt; pendingPrompt = undefined;
  notify('session/update', { sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: 'tool-1', status: 'completed', content: { type: 'text', text: '文件已读取' } } });
  result(id, { stopReason });
}

function handle(message) {
  const { id, method, params = {} } = message;
  // A response from the client (permission decision) finishes the pending prompt.
  if (!method) { finishPrompt('end_turn'); return; }
  if (method === 'initialize') return result(id, { protocolVersion: 1, authMethods: [{ id: 'qoderclicn-login', name: 'Use qoderclicn login' }], agentInfo: { name: 'qoder-cli-cn', title: 'Qoder CLI CN', version: '1.1.86' }, agentCapabilities: { promptCapabilities: { image: true } } });
  if (method === 'session/new') {
    if (process.env.FIXTURE_UNAUTHENTICATED === '1' || existsSync(join(process.env.QODERCN_CONFIG_DIR ?? '', 'unauthenticated'))) return send({ jsonrpc: '2.0', id, error: { code: -32000, message: 'Authentication required: Authentication is required.' } });
    return result(id, { sessionId: 'fixture-session' });
  }
  if (method === 'session/prompt') {
    const text = (params.prompt ?? []).map(part => part.text ?? '').join('');
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '收到：' + text } } });
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: 'tool-1', title: '读取文件', kind: 'read', status: 'running' } });
    pendingPrompt = { id, sessionId: params.sessionId };
    send({ jsonrpc: '2.0', id: 900, method: 'session/request_permission', params: { sessionId: params.sessionId, toolCall: { toolCallId: 'tool-1', title: '读取文件', kind: 'read' }, options: [{ optionId: 'allow-once', name: '允许一次', kind: 'allow_once' }, { optionId: 'reject-once', name: '拒绝', kind: 'reject_once' }] } });
    return;
  }
  if (method === 'session/cancel') { finishPrompt('cancelled'); return; }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found' } });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    handle(message);
  }
});
