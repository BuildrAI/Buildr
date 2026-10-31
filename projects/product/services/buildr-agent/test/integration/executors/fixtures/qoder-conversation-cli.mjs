import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
if (process.argv.includes('--version')) { console.log('Qoder CLI 1.1.75'); process.exit(0); }
const config = process.env.QODER_CONFIG_DIR, cwd = fs.realpathSync(process.cwd());
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const sid = option('--session-id') ?? option('--resume');
const providers = JSON.parse(option('--settings') ?? '{}').providers ?? {};
const models = Object.entries(providers).flatMap(([id, provider]) => provider.models.map(model => ({ value: id + '/' + model.model, displayName: model.displayName })));
if (!models.length) models.push({ value: 'fixture-model', displayName: 'Fixture' });
let encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-'), hash = 5381;
for (let i = 0; i < cwd.length; i++) hash = hash * 33 ^ cwd.charCodeAt(i);
if (encoded.length > 200) encoded = encoded.slice(0, 200) + '-' + Math.abs(hash).toString(36);
const directory = path.join(config, 'projects', encoded), filename = path.join(directory, sid + '.jsonl');
fs.mkdirSync(directory, { recursive: true });
fs.appendFileSync(path.join(config, 'conversation-launches.jsonl'), JSON.stringify({ pid: process.pid, args: process.argv }) + '\n');
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const ack = (id, response = {}) => emit({ type: 'control_response', response: { subtype: 'success', request_id: id, response } });
const persist = records => {
  fs.appendFileSync(filename, records.map(record => JSON.stringify(record)).join('\n') + '\n');
  if (current?.message?.content[0]?.text !== 'no-mirror') emit({ type: 'transcript_mirror', session_id: sid, filePath: filename, entries: records });
};
let parent = null, current;
const record = (type, uuid, message) => {
  const result = { type, uuid, parentUuid: parent, sessionId: sid, cwd, isSidechain: false, timestamp: new Date().toISOString(), userType: 'external', entrypoint: 'cli', version: '1.1.75', message };
  parent = uuid; return result;
};
const result = () => emit({ type: 'result', subtype: 'success', is_error: false, terminal_reason: 'completed', session_id: sid, uuid: randomUUID(), num_turns: 1, usage: {}, modelUsage: {}, permission_denials: [], result: 'complete' });
const stream = (id, text, parentId = null) => {
  emit({ type: 'stream_event', session_id: sid, parent_tool_use_id: parentId, uuid: randomUUID(), event: { type: 'message_start', message: { id } } });
  emit({ type: 'stream_event', session_id: sid, parent_tool_use_id: parentId, uuid: randomUUID(), event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
};
createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.type === 'control_request') {
    const method = m.request.subtype ?? m.request.type;
    if (method === 'account_info') {
      const gate = path.join(config, 'hold-account');
      if (fs.existsSync(gate)) { fs.writeFileSync(path.join(config, 'account-held'), 'yes'); const timer = setInterval(() => { if (!fs.existsSync(gate)) { clearInterval(timer); ack(m.request_id, { userId: 'fixture' }); } }, 5); }
      else ack(m.request_id, { userId: 'fixture' });
      return;
    }
    if (method === 'get_models') { ack(m.request_id, { models }); return; }
    if (method === 'initialize') {
      ack(m.request_id, { commands: [], agents: [], models, account: { userId: 'fixture' }, capabilities: ['background_tasks_v1'] });
      emit({ type: 'system', subtype: 'init', session_id: sid, uuid: randomUUID(), cwd, capabilities: ['background_tasks_v1'], tools: ['Read', 'Skill', 'AskUserQuestion'], mcp_servers: [], model: 'fixture-model', permissionMode: option('--permission-mode') ?? 'default', protocol_version: '1.5.0', qodercli_version: '1.1.75' });
    } else if (method === 'interrupt') { ack(m.request_id, { still_queued: [] }); emit({ type: 'result', subtype: 'success', is_error: true, terminal_reason: 'aborted', session_id: sid, uuid: randomUUID(), usage: {}, modelUsage: {}, permission_denials: [], result: '' }); }
    else ack(m.request_id, {});
    return;
  }
  if (m.type === 'control_response') {
    if (m.response.request_id === 'child-question-request') {
      if (m.response.response.updatedInput?.answers?.choose !== 'yes') throw Error('wrong child answer');
      emit({ type: 'assistant', session_id: sid, parent_tool_use_id: 'background-tool', uuid: randomUUID(), message: { id: randomUUID(), content: [{ type: 'text', text: 'child answered yes' }] } });
      emit({ type: 'user', session_id: sid, parent_tool_use_id: null, uuid: randomUUID(), message: { content: [{ type: 'tool_result', tool_use_id: 'background-tool', content: 'child finished' }] } });
      emit({ type: 'system', subtype: 'task_notification', session_id: sid, uuid: randomUUID(), task_id: 'background-task', tool_use_id: 'background-tool' });
      return;
    }
    if (m.response.request_id === 'known-permission') {
      if (m.response.response.behavior !== 'allow') throw Error('known full-access tool was not allowed');
      emit({ type: 'assistant', session_id: sid, uuid: randomUUID(), parent_tool_use_id: null, message: { id: randomUUID(), content: [{ type: 'text', text: 'known tool permitted' }] } });
      result();
    }
    return;
  }
  if (m.type !== 'user') return;
  fs.appendFileSync(path.join(config, 'native-inputs.jsonl'), JSON.stringify(m) + '\n');
  current = m;
  if (m.shouldQuery === false) { emit({ ...m, isReplay: true }); return; }
  const text = m.message.content.find(part => part.type === 'text')?.text;
  if (text === 'close-slow') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }
  if (text === 'late-unowned-task') emit({ type: 'system', subtype: 'task_started', session_id: sid, uuid: randomUUID(), task_id: 'background-task', tool_use_id: 'retired-tool' });
  if (text === 'child-before-receipt') {
    stream('early-child', 'early child', 'delegate-tool');
    emit({ type: 'stream_event', session_id: sid, parent_tool_use_id: 'delegate-tool', uuid: randomUUID(), event: { type: 'message_stop' } });
    emit({ type: 'result', subtype: 'success', session_id: sid, parent_tool_use_id: 'delegate-tool', uuid: randomUUID(), is_error: false, usage: {}, result: 'child finished' });
  }
  persist([record('user', m.uuid, m.message)]);
  emit({ ...m, isReplay: true });
  if (text === 'permission-known' || text === 'permission-unknown' || text === 'permission-special' || text === 'question') {
    const tool = text === 'question' ? 'AskUserQuestion' : ['permission-known', 'permission-special'].includes(text) ? 'Skill' : 'UnadvertisedTool';
    emit({ type: 'control_request', request_id: 'known-permission', session_id: sid, request: { subtype: 'can_use_tool', ...(text === 'permission-special' ? { permission_kind: 'repeated_tool_call' } : {}), tool_name: tool, tool_use_id: 'permission-call', input: tool === 'AskUserQuestion' ? { questions: [{ question: 'choose', options: [{ label: 'yes' }] }] } : { skill: 'fixture' } } });
    return;
  }
  if (text === 'stream-children') {
    const mainId = randomUUID(), childId = randomUUID();
    stream(mainId, 'main before ');
    stream(childId, 'child report ', 'delegate-tool');
    emit({ type: 'stream_event', session_id: sid, parent_tool_use_id: null, uuid: randomUUID(), event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'main after' } } });
    emit({ type: 'assistant', session_id: sid, parent_tool_use_id: 'delegate-tool', uuid: randomUUID(), message: { id: childId, content: [{ type: 'text', text: 'child report complete' }] } });
    const assistant = record('assistant', randomUUID(), { role: 'assistant', id: mainId, content: [{ type: 'text', text: 'main before main after' }] }); persist([assistant]);
    emit({ type: 'assistant', session_id: sid, parent_tool_use_id: null, uuid: assistant.uuid, message: assistant.message });
  } else if (text === 'background' || text === 'unsettled-tool' || text === 'child-question' || text === 'settled-child-parent' || text === 'late-task-start' || text === 'background-stop-wait') {
    const assistant = record('assistant', randomUUID(), { role: 'assistant', id: randomUUID(), content: [{ type: 'tool_use', id: 'background-tool', name: 'Agent', input: {} }] }); persist([assistant]);
    emit({ type: 'assistant', session_id: sid, parent_tool_use_id: null, uuid: assistant.uuid, message: assistant.message });
    emit({ type: 'system', subtype: 'task_started', session_id: sid, uuid: randomUUID(), task_id: 'background-task', tool_use_id: 'background-tool' });
    const launchReceipt = record('user', randomUUID(), { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'background-tool', content: 'background launched' }] }); persist([launchReceipt]);
    emit({ type: 'user', session_id: sid, parent_tool_use_id: null, uuid: launchReceipt.uuid, message: launchReceipt.message });
    if (text === 'settled-child-parent' || text === 'late-task-start') emit({ type: 'system', subtype: 'task_notification', session_id: sid, uuid: randomUUID(), task_id: 'background-task', tool_use_id: 'background-tool' });
    if (text === 'late-task-start') setTimeout(() => emit({ type: 'system', subtype: 'task_started', session_id: sid, uuid: randomUUID(), task_id: 'background-task', tool_use_id: 'background-tool' }), 30);
    if (text === 'child-question') setTimeout(() => emit({ type: 'control_request', request_id: 'child-question-request', session_id: sid, request: { subtype: 'can_use_tool', agent_id: 'background-task', tool_name: 'AskUserQuestion', tool_use_id: 'child-question', input: { questions: [{ question: 'choose', options: [{ label: 'yes' }] }] } } }), 30);
    if (text === 'background') setTimeout(() => {
      emit({ type: 'assistant', session_id: sid, parent_tool_use_id: 'background-tool', uuid: randomUUID(), message: { id: randomUUID(), content: [{ type: 'text', text: 'late child report' }] } });
      const completed = record('user', randomUUID(), { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'background-tool', content: 'background complete' }] }); persist([completed]);
      emit({ type: 'user', session_id: sid, parent_tool_use_id: null, uuid: completed.uuid, message: completed.message });
      emit({ type: 'system', subtype: 'task_notification', session_id: sid, uuid: randomUUID(), task_id: 'background-task', tool_use_id: 'background-tool' });
    }, 100);
    if (text === 'background-stop-wait') return;
  } else {
    const assistant = record('assistant', randomUUID(), { role: 'assistant', id: randomUUID(), content: [{ type: 'text', text: 'complete ' + text }] }); persist([assistant]);
    emit({ type: 'assistant', session_id: sid, parent_tool_use_id: null, uuid: assistant.uuid, message: assistant.message });
  }
  result();
});

const trigger = setInterval(() => {
  const question = path.join(config, 'inject-child-question'), finished = path.join(config, 'settle-background');
  if (fs.existsSync(question)) { fs.unlinkSync(question); emit({ type: 'control_request', request_id: 'child-question-request', session_id: sid, request: { subtype: 'can_use_tool', agent_id: 'background-task', tool_name: 'AskUserQuestion', tool_use_id: 'child-question', input: { questions: [{ question: 'choose', options: [{ label: 'yes' }] }] } } }); }
  if (fs.existsSync(finished)) { fs.unlinkSync(finished); emit({ type: 'system', subtype: 'task_notification', session_id: sid, uuid: randomUUID(), task_id: 'background-task', tool_use_id: 'background-tool', summary: 'actual background report', output_file: path.join(config, 'native-report.md') }); }
}, 5);
trigger.unref();
