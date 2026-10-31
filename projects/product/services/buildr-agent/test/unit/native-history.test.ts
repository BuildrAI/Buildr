import test from 'node:test';
import assert from 'node:assert/strict';
import { dshHistoryItems, dshItem } from '../../src/executors/dsh/protocol.ts';
import { qoderHistoryItems, qoderResultOutcome, qoderInterruptionIds, qoderInterruptedObservation } from '../../src/executors/qoder/protocol.ts';

test('DSH context envelopes are not user inputs and steering keeps the original execution owner',()=>{
  const user=(id:string,rpcId:string)=>({type:'user/message',data:{id,source:{kind:'user',rpcId},content:[{type:'text',text:'继续'}]}});
  const contexts=['time-context','runtime-context','agent-instructions','tool-jobs'].map((kind,index)=>({type:'user/message',seq:index+10,data:{id:'context-'+index,source:{kind,rpcId:'internal-request'},content:[{type:'text',text:'private runtime context'}]}}));
  for(const event of contexts)assert.deepEqual(dshItem(event),[]);
  const items=dshHistoryItems([{type:'turn/start',data:{turn:1}},user('initial','request-one'),...contexts,{type:'tool/call',data:{turn:1,callId:'tool',name:'bash',arguments:'{}'}},user('extra','request-two'),{type:'tool/result',data:{turn:1,message:{toolCallId:'tool',content:[{type:'text',text:'done'}]}}}]);
  assert.deepEqual(items.filter(item=>item.role==='user').map(item=>[item.id,item.clientRequestId]),[['initial','request-one'],['extra','request-two']]);
  assert.equal(items.find(item=>item.id==='tool')?.executionId,'request-one');
  assert.ok(!JSON.stringify(items).includes('private runtime context'));
});

test('Qoder result failures retain explicit errors with credentials and URLs redacted',()=>{
  const outcome=qoderResultOutcome({type:'result',subtype:'error_during_execution',is_error:true,errors:['invalid_argument: request rejected https://qoder.invalid/?token=private-url api_key="private-key" Bearer vendor-secret raw-gateway-key','The selected provider rejected the request.']},false,['raw-gateway-key']);
  assert.equal(outcome.status,'failed');assert.match(outcome.diagnostic!,/invalid_argument: request rejected/);assert.match(outcome.diagnostic!,/selected provider rejected/);
  for(const secret of ['qoder.invalid','private-url','private-key','vendor-secret','raw-gateway-key'])assert.ok(!outcome.diagnostic!.includes(secret),secret);
});

test('Qoder result diagnostics keep the fallback and never turn success or stop into failure',()=>{
  const failed={type:'result',subtype:'error_during_execution',is_error:true};
  for(const errors of [undefined,[],['',' '],[{message:'not an explicit string'}]])assert.deepEqual(qoderResultOutcome({...failed,errors}),{status:'failed',diagnostic:'qoder_turn_failed'});
  const errors=['unused failure text'];
  assert.deepEqual(qoderResultOutcome({type:'result',subtype:'success',is_error:false,errors}),{status:'completed'});
  assert.deepEqual(qoderResultOutcome({...failed,errors},true),{status:'stopped'});
  for(const terminal_reason of ['aborted','aborted_tools'])assert.deepEqual(qoderResultOutcome({...failed,errors,terminal_reason}),{status:'stopped'});
});

test('DSH flat user event maps request identity to all corresponding turn items', () => {
  const items = dshHistoryItems([
    { type: 'turn/start', seq: 1, data: { turn: 7 } },
    { type: 'user/message', seq: 2, data: { id: 'u-native', content: [{ type: 'text', text: '同样的问题' }], source: { kind: 'user', rpcId: 'client-exact' } } },
    { type: 'request/context', seq: 3, data: { secret: 'hidden reasoning and credentials' } },
    { type: 'assistant/message', seq: 4, data: { turn: 7, step: 1, message: { content: [{ type: 'reasoning', text: 'hidden' }, { type: 'text', text: '完成' }] } } },
    { type: 'tool/call', seq: 5, data: { turn: 7, callId: 'tool-native', name: 'read', arguments: '{}' } },
    { type: 'tool/result', seq: 6, data: { turn: 7, message: { toolCallId: 'tool-native', content: [{ type: 'text', text: '文件结果' }] } } },
  ]);
  assert.equal(items.length, 3); assert.equal(items[0].id, 'u-native'); assert.equal(items[0].executionId, 'client-exact');
  assert.equal(items[1].id, 'assistant:7:1'); assert.equal(items[1].executionId, 'client-exact'); assert.equal(items[2].status, 'completed');
  assert.equal(items[2].name, 'read'); assert.equal(items[2].input, '{}');
  assert.ok(!JSON.stringify(items).includes('hidden'));
});
test('Qoder durable snapshots collapse by native message ID, preserving exact user UUIDs', () => {
  const messages = [
    { type: 'user', uuid: 'request-1', session_id: 'session-a', parent_tool_use_id: null, message: { content: [{ type: 'text', text: '继续' }] } },
    { type: 'assistant', uuid: 'snapshot-1', session_id: 'session-a', message: { id: 'message-a', content: [{ type: 'text', text: '正在' }] } },
    { type: 'assistant', uuid: 'snapshot-2', session_id: 'session-a', message: { id: 'message-a', content: [{ type: 'text', text: '正在完成' }, { type: 'tool_use', id: 'tool-a', name: 'Read', input: { path: '/file' } }] } },
    { type: 'user', uuid: 'tool-result', session_id: 'session-a', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-a', content: '读完' }] } },
    { type: 'user', uuid: 'request-2', session_id: 'session-a', message: { content: [{ type: 'text', text: '继续' }] } },
  ];
  const items = qoderHistoryItems(messages, 'session-a');
  assert.equal(items.length, 4); assert.equal(items[1].id, 'message:message-a'); assert.equal(items[1].text, '正在完成');
  assert.equal(items[1].executionId, 'request-1'); assert.equal(items[2].status, 'completed');
  assert.equal(items[2].name, 'Read'); assert.equal(items[2].input, JSON.stringify({path:'/file'}));
  assert.equal(items[3].id, 'request-2'); assert.equal(items[3].executionId, 'request-2');
  assert.throws(() => qoderHistoryItems(messages, 'different-session'), /identity_mismatch/);
});

test('Qoder history preserves child roles and parent tools without treating child inputs as a new user execution', () => {
  const messages = [
    { type: 'user', uuid: 'main-input', session_id: 's', message: { content: [{ type: 'text', text: 'work' }] } },
    { type: 'assistant', uuid: 'child-output', session_id: 's', parent_tool_use_id: 'delegate', message: { id: 'child-output', content: [{ type: 'text', text: 'child report' }, { type: 'tool_use', id: 'child-tool', name: 'Read', input: { file_path: '/file' } }] } },
    { type: 'user', uuid: 'child-input', session_id: 's', parent_tool_use_id: 'delegate', message: { content: [{ type: 'text', text: 'child instruction' }] } },
    { type: 'user', uuid: 'child-tool-output', session_id: 's', parent_tool_use_id: 'delegate', message: { content: [{ type: 'tool_result', tool_use_id: 'child-tool', content: 'read result' }] } },
    { type: 'assistant', uuid: 'main-output', session_id: 's', message: { id: 'main-output', content: [{ type: 'text', text: 'main reply' }] } },
  ];
  const items = qoderHistoryItems(messages, 's');
  assert.equal(items.filter(item => item.role === 'user').length, 1);
  assert.equal(items.find(item => item.text === 'child report')?.role, 'assistant');
  assert.equal(items.find(item => item.text === 'child report')?.parentToolId, 'delegate');
  assert.equal(items.find(item => item.id === 'child-tool')?.parentToolId, 'delegate');
  assert.ok(items.every(item => item.executionId === 'main-input'));
  assert.equal(items.at(-1)?.parentToolId, undefined);
});

test('Qoder task completion preserves the launch receipt and exact native report facts in the parent tool history', () => {
  const items = qoderHistoryItems([
    { type: 'user', uuid: 'input', session_id: 's', message: { content: [{ type: 'text', text: 'work' }] } },
    { type: 'assistant', uuid: 'agent', session_id: 's', message: { content: [{ type: 'tool_use', id: 'delegate', name: 'Agent', input: {} }] } },
    { type: 'user', uuid: 'launch', session_id: 's', message: { content: [{ type: 'tool_result', tool_use_id: 'delegate', content: 'started native child' }] } },
    { type: 'system', subtype: 'task_notification', session_id: 's', tool_use_id: 'delegate', status: 'completed', summary: 'actual child report', output_file: '/exact/native/output.md' },
  ], 's');
  const tool = items.find(item => item.id === 'delegate'); assert.equal(tool?.status, 'completed');
  assert.match(tool!.text, /started native child/); assert.match(tool!.text, /actual child report/); assert.match(tool!.text, /\/exact\/native\/output\.md/);
  assert.equal(items.filter(item => item.role === 'assistant').length, 0);
});

test('DSH cold stop observation cannot borrow another completed turn as success', async () => {
  const { dshExecutionObservation } = await import('../../src/executors/dsh/protocol.ts');
  const events = [
    { type: 'turn/start', data: { turn: 1 } }, { type: 'user/message', data: { source: { rpcId: 'old' } } }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'turn/start', data: { turn: 2 } }, { type: 'user/message', data: { source: { rpcId: 'current' } } }, { type: 'tool/call', data: { turn: 2, callId: 'tool-2', name: 'bash' } },
  ];
  assert.equal(dshExecutionObservation(events, 'current').status, 'unknown');
  assert.equal(dshExecutionObservation(events, 'missing').status, 'unknown');
  events.push({ type: 'tool/result', data: { turn: 2, message: { toolCallId: 'tool-2' } } } as any, { type: 'turn/end', data: { turn: 2, reason: { kind: 'aborted' } } } as any);
  assert.equal(dshExecutionObservation(events, 'current').status, 'stopped');
});

function interruptedQoder(completed = true) {
  const base = { session_id: 'qoder-session', sessionId: 'qoder-session', isSidechain: false };
  return [
    { ...base, type: 'user', uuid: 'exact-request', origin: { kind: 'human' }, humanInput: { text: 'work' }, promptId: 'prompt', message: { content: [{ type: 'text', text: 'work' }] } },
    { ...base, type: 'assistant', uuid: 'assistant', parentUuid: 'exact-request', message: { id: 'assistant', content: [{ type: 'tool_use', id: 'append', name: 'Bash', input: { command: 'append once' } }] } },
    ...(completed ? [{ ...base, type: 'user', uuid: 'result', parentUuid: 'assistant', message: { content: [{ type: 'tool_result', tool_use_id: 'append', content: 'COMMITTED' }] } }] : []),
    { ...base, type: 'user', uuid: 'interruption', parentUuid: completed ? 'result' : 'assistant', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
  ];
}
test('Qoder cold recovery uses exact native interruption evidence and retains completed operations', () => {
  const messages = interruptedQoder(), ids = qoderInterruptionIds(messages, messages, 'qoder-session');
  assert.deepEqual([...ids], ['interruption']);
  const items = qoderHistoryItems(messages, 'qoder-session', ids);
  assert.deepEqual(items.filter(item => item.role === 'user').map(item => item.id), ['exact-request']);
  assert.equal(items.find(item => item.id === 'append')?.status, 'completed');
  const observation = qoderInterruptedObservation(messages, messages, 'qoder-session', 'exact-request');
  assert.equal(observation.status, 'stopped'); assert.equal(observation.executionRef?.id, 'exact-request');
  for (const id of ['other', undefined]) assert.equal(qoderInterruptedObservation(messages, messages, 'qoder-session', id).status, 'unknown');
  assert.equal(qoderInterruptedObservation(messages.slice(0, -1), messages, 'qoder-session', 'exact-request').status, 'unknown');
});
test('Qoder cannot mistake genuine user interruption text, untrusted metadata or unrelated chain for a stop', () => {
  for (const patch of [{ humanInput: { text: '[Request interrupted by user]' } }, { origin: { kind: 'human' } }, { promptId: 'human' }, { isSidechain: true }, { parentUuid: 'unrelated' }, { sessionId: 'other' }]) {
    const messages = interruptedQoder(), records = structuredClone(messages); Object.assign(records.at(-1)!, patch);
    const ids = qoderInterruptionIds(messages, records, 'qoder-session'); assert.equal(ids.size, 0);
    assert.equal(qoderHistoryItems(messages, 'qoder-session', ids).at(-1)?.role, 'user');
    assert.equal(qoderInterruptedObservation(messages, records, 'qoder-session', 'exact-request').status, 'unknown');
  }
  const messages = interruptedQoder(); assert.equal(qoderInterruptedObservation(messages, [], 'qoder-session', 'exact-request').status, 'unknown');
});
test('Qoder crash recovery holds incomplete, failed and background side effects instead of replaying', () => {
  const active = interruptedQoder(false);
  assert.equal(qoderInterruptedObservation(active, active, 'qoder-session', 'exact-request').status, 'unknown');
  const failed = interruptedQoder(); (failed[2].message.content[0] as any).is_error = true;
  assert.equal(qoderInterruptedObservation(failed, failed, 'qoder-session', 'exact-request').status, 'unknown');
  const background = interruptedQoder(); (background[1].message.content[0] as any).input.run_in_background = true;
  assert.equal(qoderInterruptedObservation(background, background, 'qoder-session', 'exact-request').status, 'unknown');
  const metadata = interruptedQoder(); (metadata[2] as any).toolUseResult = { backgroundTaskId: 'native-job' };
  assert.equal(qoderInterruptedObservation(metadata, metadata, 'qoder-session', 'exact-request').status, 'unknown');
});

test('Qoder distinguishes an explicit failed tool receipt from an interrupted tool with unknown effects', () => {
  const messages = interruptedQoder(); (messages[2].message.content[0] as any).is_error = true;
  const records = structuredClone(messages);
  Object.assign(records[2], { sourceToolAssistantUUID: 'assistant', promptId: 'prompt', toolUseResult: { errorType: 'file_not_found', isHardFailure: false } });
  assert.equal(qoderInterruptedObservation(messages, records, 'qoder-session', 'exact-request').status, 'stopped');
  (records[2] as any).toolUseResult.errorType = 'interrupted';
  assert.equal(qoderInterruptedObservation(messages, records, 'qoder-session', 'exact-request').status, 'unknown');
});


test('DSH native synthetic repair cannot turn an unknown side effect into a completed tool result',async()=>{
 const {dshExecutionObservation,dshHistoryItems}=await import('../../src/executors/dsh/protocol.ts');
 const events:any[]=[{type:'turn/start',data:{turn:1}},{type:'user/message',data:{turn:1,id:'input',source:{rpcId:'request'},content:[]}},{type:'tool/call',data:{turn:1,callId:'operation',name:'bash'}}];
 const result={type:'tool/result',data:{turn:1,error:{code:'TOOL_OUTCOME_UNKNOWN',name:'ToolOutcomeUnknownError'},message:{toolCallId:'operation',isError:true,content:[{type:'text',text:'no durable result'}]}}};
 events.push(result,{type:'turn/end',data:{turn:1,reason:{kind:'interrupted'}}});
 assert.equal(dshExecutionObservation(events,'request').status,'unknown');assert.equal(dshExecutionObservation(events,'request').tools[0]?.status,'unknown');assert.equal(dshHistoryItems(events).find(item=>item.id==='operation')?.status,'unknown');
 assert.equal(dshExecutionObservation(events,'request',[{id:'operation',kind:'tool',role:'system',text:'received real output',executionId:'request',status:'completed'}]).status,'stopped');
 assert.equal(dshExecutionObservation(events,'request',[{id:'operation',kind:'tool',role:'system',text:'another execution',executionId:'other',status:'completed'}]).status,'unknown');
 result.data.error={code:'TOOL_NOT_STARTED',name:'ToolNotStartedError'};assert.equal(dshExecutionObservation(events,'request').status,'stopped');
 result.data.error={code:'KNOWN_TOOL_FAILURE',name:'ToolError'};assert.equal(dshExecutionObservation(events,'request').status,'stopped');assert.equal(dshHistoryItems(events).find(item=>item.id==='operation')?.status,'failed');
});
