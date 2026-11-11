#!/usr/bin/env node
// Minimal Qoder CN ACP fixture: newline-delimited JSON-RPC over stdio, no network.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {spawn} from 'node:child_process';
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
const queue = [];
let sequence = 0;
let toolSequence = 0;
const scenario = () => { try { return readFileSync(join(config, 'scenario'), 'utf8').trim(); } catch { return ''; } };
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
const log = (name, value) => { try { mkdirSync(config, { recursive: true }); writeFileSync(join(config, name), JSON.stringify(value) + '\n', { flag: 'a' }); } catch { /* fixture logging stays optional */ } };
log('fixture-launch.jsonl', { args });
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
  const { id, sessionId, toolId, userMessageId, assistantId } = pendingPrompt; pendingPrompt = undefined;
  // The real native aborts an approval wait without a terminal tool_call_update.
  const skipToolUpdate = scenario() === 'unsettled-tool'
    || (stopReason === 'cancelled' && (scenario() === 'stop-approval-pending' || scenario() === 'stop-running-tool'));
  if (!skipToolUpdate) {
    notify('session/update', { sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: toolId, status: scenario() === 'failed-tool' ? 'failed' : 'completed', content: [{ type: 'content', content: { type: 'text', text: '文件已读取' } }] } });
    notify('session/update', { sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: toolId } });
  }
  if (stopReason !== 'cancelled') {
    notify('session/update', { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'fixture ' } } });
    notify('session/update', { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'answer' } } });
  }
  const session = readSession(sessionId);
  if (session) {
    session.messages.push({ role: 'assistant', text: 'fixture answer' });
    const responseId=randomUUID(),finalId=randomUUID();
    appendNative(session, {type:'user',uuid:responseId,parentUuid:assistantId,promptId:userMessageId,sourceToolAssistantUUID:assistantId,toolUseResult:{stdout:'native full detail '.repeat(1500),stderr:''},message:{content:[{type:'tool_result',tool_use_id:toolId,content:'native summary'}]}});
    appendNative(session, {type:'assistant',uuid:finalId,parentUuid:responseId,message:{content:[{type:'text',text:'fixture answer'}],usage:{input_tokens:2345,output_tokens:50}}});
    writeSession(session);
  }
  result(id, { ...((scenario()==='queue-missing-receipt'||scenario().startsWith('queue-durable'))&&toolSequence>1?{}:{userMessageId}), stopReason: scenario() === 'truncated' ? 'max_tokens' : scenario() === 'unknown-reason' ? 'vendor_new_reason' : stopReason });
  if(queue.length)setTimeout(()=>handle(queue.shift()),5);
}

function appendNative(session,row) {
  const directory=join(config,'projects','fixture');mkdirSync(directory,{recursive:true});
  const file=join(directory,session.id+'.jsonl');
  writeFileSync(file,JSON.stringify({sessionId:session.id,cwd:session.cwd,isSidechain:false,...row})+'\n',{flag:'a'});
  writeFileSync(file,JSON.stringify({type:'active-leaf',sessionId:session.id,leafUuid:row.uuid})+'\n',{flag:'a'});
}

function handle(message) {
  const { id, method, params = {} } = message;
  // A response from the client (permission decision) finishes the pending prompt.
  if (!method) { log('fixture-permission-responses.jsonl', message); if ((id === 900 || id===901) && !['cancel-delayed', 'stop-running-tool'].includes(scenario()) && !scenario().startsWith('cancel-ignored')) finishPrompt('end_turn'); return; }
  if (method === 'initialize') { log('fixture-initialize.jsonl', params); return result(id, { protocolVersion: 1, authMethods: [{ id: 'qoderclicn-login', name: 'Use qoderclicn login' }], agentInfo: { name: 'qoder-cli-cn', title: 'Qoder CLI CN', version: '1.1.86' }, agentCapabilities: { loadSession: true, promptCapabilities: { image: true } }, sessionCapabilities: { resume: {} } }); }
  if (method === 'session/new') {
    if (process.env.FIXTURE_UNAUTHENTICATED === '1' || existsSync(join(process.env.QODERCN_CONFIG_DIR ?? '', 'unauthenticated'))) return send({ jsonrpc: '2.0', id, error: { code: -32000, message: 'Authentication required: Authentication is required.' } });
    const sessionId = randomUUID(); ++sequence;
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
    if(pendingPrompt) {
      queue.push(message);log('fixture-queued.jsonl',{id,sessionId:params.sessionId,prompt:params.prompt});
      if(scenario()==='queue-durable-receipt'){
        const session=readSession(params.sessionId);
        if(session)appendNative(session,{type:'attachment',uuid:randomUUID(),timestamp:new Date().toISOString(),attachment:{prompt:params.prompt,commandMode:'prompt',origin:{kind:'bridge',sessionId:params.sessionId},type:'bridge_prompt'}});
      }
      if(scenario()==='queue-durable-user-receipt'){
        const session=readSession(params.sessionId);
        if(session){
          const text=(params.prompt ?? []).map(part=>part.text ?? '').join('');
          appendNative(session,{type:'user',uuid:randomUUID(),timestamp:new Date().toISOString(),message:{role:'user',content:[{type:'text',text}]},permissionMode:'yolo',origin:{kind:'human'},promptId:randomUUID(),humanInput:{text,mode:'prompt'}});
          session.queuedReceipt=true;writeSession(session);
        }
      }
      return;
    }
    const text = (params.prompt ?? []).map(part => part.text ?? '').join('');
    log('fixture-prompts.jsonl', { sessionId: params.sessionId, text });
    const session = readSession(params.sessionId);
    const queuedReceipt = Boolean(session?.queuedReceipt);
    if (session) {
      if(queuedReceipt)delete session.queuedReceipt;
      else session.messages.push({ role: 'user', text });
      writeSession(session);
    }
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '收到：' + text } } });
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: '检查文件内容' } } });
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } });
    const toolId = `tool-${++toolSequence}`, userMessageId=randomUUID(),assistantId=randomUUID();
    if(scenario()==='cancel-ignored-child'){const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});log('fixture-owned-child.jsonl',{pid:child.pid});}
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: toolId, title: '读取文件', kind: scenario()==='cancel-ignored-execute'?'execute':'read', rawInput: { path: 'fixture.txt' }, status: 'running' } });
    if(!queuedReceipt&&scenario()!=='queue-missing-receipt')appendNative(session,{type:'user',uuid:userMessageId,timestamp:new Date().toISOString(),humanInput:true,origin:{kind:'human'},message:{content:[{type:'text',text}]}});
    appendNative(session,{type:'assistant',uuid:assistantId,parentUuid:userMessageId,message:{content:[{type:'tool_use',id:toolId,name:'Read',input:{path:'fixture.txt'}}],usage:{input_tokens:1234,output_tokens:20}}});
    pendingPrompt = { id, sessionId: params.sessionId, toolId, userMessageId,assistantId };
    if (scenario() === 'disconnect' || scenario()==='queue-disconnect'&&toolSequence>1) { process.exit(0); return; }
    if(scenario()==='question'){
      send({jsonrpc:'2.0',id:901,method:'elicitation/create',params:{sessionId:params.sessionId,mode:'form',toolCallId:toolId,message:'确认实施方案',requestedSchema:{type:'object',additionalProperties:false,properties:{choice:{type:'string',title:'方案',oneOf:[{const:'A',title:'方案A'},{const:'B',title:'方案B'}]},features:{type:'array',title:'功能',items:{type:'string',anyOf:[{const:'问答'},{const:'追加'}]},minItems:1},note:{type:'string',minLength:1},count:{type:'integer',minimum:1},confirm:{type:'boolean'}},required:['choice','features','note','count','confirm']}}});return;
    }
    if(scenario().startsWith('queue')&&toolSequence>1){setTimeout(()=>finishPrompt('end_turn'),scenario().startsWith('queue-durable')?6000:30);return;}
    if (autoAllow() || session?.mode === 'yolo') { setTimeout(() => finishPrompt('end_turn'), 5); return; }
    send({ jsonrpc: '2.0', id: 900, method: 'session/request_permission', params: { sessionId: params.sessionId, toolCall: { toolCallId: toolId, title: '读取文件', kind: 'read' }, options: [{ optionId: 'allow-always', name: '总是允许', kind: 'allow_always' }, { optionId: 'allow-once', name: '允许一次', kind: 'allow_once' }, { optionId: 'reject-once', name: '拒绝', kind: 'reject_once' }] } });
    return;
  }
  if (method === 'session/cancel') {
    log('fixture-cancels.jsonl', params);
    if (scenario().startsWith('cancel-ignored')) return;
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
