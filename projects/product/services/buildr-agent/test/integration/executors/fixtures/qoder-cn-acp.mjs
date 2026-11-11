#!/usr/bin/env node
// Minimal Qoder CN ACP fixture: newline-delimited JSON-RPC over stdio, no network.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--version')) { process.stdout.write('1.1.86\n'); process.exit(0); }
if (args.includes('login')) {
  process.stdout.write('Open https://qoder.cn/device?code=fixture to sign in\n');
  setTimeout(() => process.exit(0), 50);
}
if (!args.includes('--acp')) { process.stderr.write('fixture expects --acp\n'); process.exit(2); }

const config = process.env.QODERCN_CONFIG_DIR ?? '';
const sessions = join(config, 'fixture-sessions');
const models = ['auto', 'fast', 'qmodel_latest', 'dfmodel'];
const autoAllow = () => existsSync(join(config, 'auto-allow'));
let buffer = '';
let pendingPrompt;
let sequence = 0;
let toolSequence = 0;
const scenario = () => { try { return readFileSync(join(config, 'scenario'), 'utf8').trim(); } catch { return ''; } };
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
const log = (name, value) => { try { mkdirSync(config, { recursive: true }); writeFileSync(join(config, name), JSON.stringify(value) + '\n', { flag: 'a' }); } catch { /* fixture logging stays optional */ } };
const sessionPath = id => join(sessions, id + '.json');
const readSession = id => { try { return JSON.parse(readFileSync(sessionPath(id), 'utf8')); } catch { return undefined; } };
const writeSession = session => { mkdirSync(sessions, { recursive: true }); writeFileSync(sessionPath(session.id), JSON.stringify(session)); };
const configOptions = session => [
  { id: 'mode', currentValue: session.mode ?? 'default', options: [{ value: 'default', name: 'Default' }, { value: 'yolo', name: 'Bypass Permissions' }] },
  { id: 'model', currentValue: session.model ?? 'auto', options: models.map(value => ({ value, name: value })) },
  { id: 'reasoning_effort', currentValue: session.effort ?? 'medium', options: [{ group: 'Reasoning', options: [{ value: 'medium', name: 'Medium' }, { value: 'high', name: 'High' }] }] },
];

function finishPrompt(stopReason) {
  if (!pendingPrompt) return;
  const { id, sessionId, toolId } = pendingPrompt; pendingPrompt = undefined;
  if (scenario() !== 'unsettled-tool') {
    notify('session/update', { sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: toolId, status: scenario() === 'failed-tool' ? 'failed' : 'completed', content: [{ type: 'content', content: { type: 'text', text: '文件已读取' } }] } });
    notify('session/update', { sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: toolId } });
  }
  if (stopReason !== 'cancelled') {
    notify('session/update', { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'fixture ' } } });
    notify('session/update', { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'answer' } } });
  }
  const session = readSession(sessionId);
  if (session) { session.messages.push({ role: 'assistant', text: 'fixture answer' }); writeSession(session); }
  result(id, { stopReason: scenario() === 'truncated' ? 'max_tokens' : scenario() === 'unknown-reason' ? 'vendor_new_reason' : stopReason });
}

function handle(message) {
  const { id, method, params = {} } = message;
  // A response from the client (permission decision) finishes the pending prompt.
  if (!method) { log('fixture-permission-responses.jsonl', message); if (id === 900 && scenario() !== 'cancel-delayed' && scenario() !== 'cancel-ignored') finishPrompt('end_turn'); return; }
  if (method === 'initialize') { log('fixture-initialize.jsonl', params); return result(id, { protocolVersion: 1, authMethods: [{ id: 'qoderclicn-login', name: 'Use qoderclicn login' }], agentInfo: { name: 'qoder-cli-cn', title: 'Qoder CLI CN', version: '1.1.86' }, agentCapabilities: { loadSession: true, promptCapabilities: { image: true } }, sessionCapabilities: { resume: {} } }); }
  if (method === 'session/new') {
    if (process.env.FIXTURE_UNAUTHENTICATED === '1' || existsSync(join(process.env.QODERCN_CONFIG_DIR ?? '', 'unauthenticated'))) return send({ jsonrpc: '2.0', id, error: { code: -32000, message: 'Authentication required: Authentication is required.' } });
    const sessionId = `fixture-session-${process.pid}-${++sequence}`;
    const session = { id: sessionId, cwd: params.cwd, model: 'auto', mode: 'default', messages: [] };
    writeSession(session); log('fixture-session-new.jsonl', { sessionId, cwd: params.cwd });
    return result(id, { sessionId, configOptions: configOptions(session) });
  }
  if (method === 'session/load') {
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
    const session = readSession(sessionId);
    if (!session) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session identifier "${sessionId}"` } });
    log('fixture-session-load.jsonl', { sessionId });
    for (const entry of session.messages) notify('session/update', { sessionId, update: { sessionUpdate: entry.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk', content: { type: 'text', text: entry.text } } });
    return result(id, { configOptions: configOptions(session) });
  }
  if (method === 'session/set_config_option') {
    const session = readSession(params.sessionId);
    if (!session) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session identifier "${params.sessionId}"` } });
    log('fixture-config-selections.jsonl', { sessionId: params.sessionId, configId: params.configId, value: params.value });
    if (params.configId === 'model') session.model = params.value;
    if (params.configId === 'mode' && scenario() !== 'mode-not-applied') session.mode = params.value;
    if (params.configId === 'reasoning_effort') session.effort = params.value;
    writeSession(session);
    return result(id, { configOptions: configOptions(session) });
  }
  if (method === 'session/prompt') {
    const text = (params.prompt ?? []).map(part => part.text ?? '').join('');
    log('fixture-prompts.jsonl', { sessionId: params.sessionId, text });
    const session = readSession(params.sessionId);
    if (session) { session.messages.push({ role: 'user', text }); writeSession(session); }
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '收到：' + text } } });
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: '检查文件内容' } } });
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } });
    const toolId = `tool-${++toolSequence}`;
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: toolId, title: '读取文件', kind: 'read', rawInput: { path: 'fixture.txt' }, status: 'running' } });
    pendingPrompt = { id, sessionId: params.sessionId, toolId };
    if (scenario() === 'disconnect') { process.exit(0); return; }
    if (autoAllow() || session?.mode === 'yolo') { setTimeout(() => finishPrompt('end_turn'), 5); return; }
    send({ jsonrpc: '2.0', id: 900, method: 'session/request_permission', params: { sessionId: params.sessionId, toolCall: { toolCallId: toolId, title: '读取文件', kind: 'read' }, options: [{ optionId: 'allow-always', name: '总是允许', kind: 'allow_always' }, { optionId: 'allow-once', name: '允许一次', kind: 'allow_once' }, { optionId: 'reject-once', name: '拒绝', kind: 'reject_once' }] } });
    return;
  }
  if (method === 'session/cancel') {
    log('fixture-cancels.jsonl', params);
    if (scenario() === 'cancel-ignored') return;
    if (scenario() === 'cancel-delayed') { setTimeout(() => finishPrompt('cancelled'), 100); return; }
    finishPrompt('cancelled'); return;
  }
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
