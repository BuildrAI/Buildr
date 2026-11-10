import { retainObservation } from '../src/features/agent-conversations/retain-observation.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedConversationRead } from '../src/features/agent-conversations/api/shared-conversation-read.ts';
import { conversationTransferDecoder } from '../src/features/agent-conversations/api/conversation-transfer.ts';
import { conversationEventEncoder } from '../../buildr-agent/src/domain/conversation-transfer.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
test('short-lived reads do not start network, later remount reads fresh data', async () => {
  let calls = 0;
  const read = sharedConversationRead(async () => ++calls), controller = new AbortController();
  const abandoned = read('/same', controller.signal);
  controller.abort();
  await assert.rejects(abandoned, { name: 'AbortError' });
  await tick(); assert.equal(calls, 0);
  assert.equal(await read('/same'), 1);
  assert.equal(await read('/same'), 2);
});

test('same-path readers share network, cancellation isolates a consumer and remount shares an active read', async () => {
  const calls = [], releases = [];
  const read = sharedConversationRead((url, signal) => {
    calls.push({ url, signal });
    return new Promise(resolve => releases.push(resolve));
  });
  const controller = new AbortController();
  const first = read('/same', controller.signal), second = read('/same');
  await tick(); assert.equal(calls.length, 1);
  controller.abort(); await assert.rejects(first, { name: 'AbortError' });
  assert.equal(calls[0].signal.aborted, false);
  const third = read('/same'); releases[0]('latest');
  assert.deepEqual(await Promise.all([second, third]), ['latest', 'latest']);
  const next = read('/same'); await tick(); assert.equal(calls.length, 2); releases[1]('new');
  assert.equal(await next, 'new');
});

test('last consumer leaving aborts transport; a new observer starts a fresh read', async () => {
  const signals = [], releases = []; let calls = 0;
  const read = sharedConversationRead((_url, networkSignal) => {
    calls++; signals.push(networkSignal); return new Promise(resolve => releases.push(resolve));
  });
  const controller = new AbortController(), first = read('/same', controller.signal);
  await tick(); controller.abort(); await assert.rejects(first);
  assert.equal(signals[0].aborted, true);
  const nextController = new AbortController(), next = read('/same', nextController.signal);
  await tick(); assert.equal(calls, 2); assert.equal(signals[1].aborted, false);
  nextController.abort(); await assert.rejects(next); assert.equal(signals[1].aborted, true);
});

test('different scope/query is never merged, failures are visible and not cached', async () => {
  let calls = 0;
  const read = sharedConversationRead(async () => { calls++; throw Error('real failure'); });
  await Promise.all(['/a', '/b', '/a?cursor=2'].map(url => assert.rejects(read(url), /real failure/)));
  assert.equal(calls, 3);
  await assert.rejects(read('/a'), /real failure/); assert.equal(calls, 4);
});

function snapshot(cursor = 0) {
  return { cursor, generation: 'g', type: cursor ? 'conversation' : 'snapshot',
    workspaceId: 'workspace', conversationId: 'chat', revision: `r${cursor}`,
    payload: { conversation: { id: 'chat', workspaceId: 'workspace', cwd: '/workspace',
      title: 'work', revision: `r${cursor}`, hidden: false, updatedAt: 'now', participants: [], requests: [],
      entries: Array.from({ length: 30 }, (_, i) => ({ id: `entry-${i}`, sequence: i + 1,
        kind: 'message', role: 'assistant', text: 'history '.repeat(100), createdAt: 'now' })) } } };
}
test('browser reducer matches backend snapshot through updates, deletion, reorder and optional-field removal', () => {
  const encode = conversationEventEncoder(), decode = conversationTransferDecoder('workspace', 'chat');
  const first = snapshot(); first.payload.conversation.taskId = 'removed';
  assert.deepEqual(decode(encode(first)), first);
  const next = snapshot(1);
  next.payload.conversation.entries.pop(); next.payload.conversation.entries.reverse();
  next.payload.conversation.entries[0].text = 'changed';
  const wire = encode(next); assert.ok(wire.payload.delta);
  assert.deepEqual(decode(wire), next);
  assert.throws(() => conversationTransferDecoder('workspace', 'chat')(wire), /基准/);
  const unrelated = { ...next, conversationId: 'other' };
  assert.equal(decode(unrelated), unrelated, 'existing selection guard ignores legacy unrelated events');
  assert.throws(() => decode({ ...wire, conversationId: 'other' }), /不属于/);
  // A fresh stream accepts the full snapshot regardless of the old stream cursor.
  assert.deepEqual(conversationTransferDecoder('workspace', 'chat')(snapshot()), snapshot());
});

 test('unchanged polling data preserves state identity, changed status and counts remain visible',()=>{
  const previous=[{conversationId:'chat',status:'running',count:0}];
  assert.equal(retainObservation(previous,structuredClone(previous)),previous);
  const next=[{conversationId:'chat',status:'waiting-question',count:1}];
  assert.equal(retainObservation(previous,next),next);
  assert.equal(retainObservation(undefined,undefined),undefined);
 });

test('write invalidation separates old and new reads; old completion cannot evict a newer flight',async()=>{
 const releases=[];let calls=0;
 const read=sharedConversationRead(async()=>{calls++;return new Promise(resolve=>releases.push(resolve));});
 const old=read('/same');await tick();read.invalidate();
 const fresh=read('/same');await tick();assert.equal(calls,2);
 releases[0]('old');assert.equal(await old,'old');
 const joined=read('/same');releases[1]('fresh');assert.deepEqual(await Promise.all([fresh,joined]),['fresh','fresh']);assert.equal(calls,2);
});

test('browser v2 reconstruction matches committed snapshots across append, correction, controls and reconnect',()=>{
 const encode=conversationEventEncoder('delta-v2'),decode=conversationTransferDecoder('workspace','chat');
 let previous={cursor:0,generation:'g',type:'snapshot',workspaceId:'workspace',conversationId:'chat',revision:'r0',payload:{conversation:{id:'chat',workspaceId:'workspace',cwd:'/workspace',title:'work',revision:'r0',hidden:false,updatedAt:'now',participants:[],requests:[],entries:[{id:'e',sequence:1,kind:'message',role:'assistant',text:'中😀',createdAt:'now',status:'running'}]}}};
 previous.payload.conversation.run={id:'run',participantId:'p',provider:'codex',generation:'g',status:'running',accepted:true,tools:[{id:'tool',label:'read',status:'running'}],startedAt:'now',updatedAt:'now'};
 assert.deepEqual(decode(encode(previous)),previous);
 for(const [i,modify] of [
  v=>{v.entries[0].text+='\n追加';},v=>{v.entries[0].status='completed';v.run.status='stopping';v.run.stopRequested=true;v.run.tools[0].status='completed';},v=>{v.entries[0].text='修正';v.taskId='t';},
  v=>{delete v.taskId;v.entries.push({id:'tool',sequence:2,kind:'tool',role:'system',text:'',status:'running',createdAt:'now'});},
  v=>{v.entries[1].status='completed';v.entries.reverse();},v=>{v.entries=[];v.retainedRuns=[v.run];delete v.run;},
 ].entries()){
  const next=structuredClone(previous);next.cursor=i+1;next.type='conversation';next.revision=next.payload.conversation.revision='r'+next.cursor;if(next.payload.conversation.run)next.payload.conversation.run.updatedAt='time-'+i;modify(next.payload.conversation);
  const wire=encode(next);assert.ok(wire.payload.patch);const bad=structuredClone(wire);bad.payload.patch.baseRevision='wrong';assert.throws(()=>decode(bad),/基准/);if(wire.payload.patch.texts.length){const offset=structuredClone(wire);offset.payload.patch.texts[0].offset++;assert.throws(()=>decode(offset),/基准/);}if(wire.payload.patch.runs.length){const owner=structuredClone(wire);owner.payload.patch.runs[0].id='foreign';assert.throws(()=>decode(owner),/基准/);}assert.deepEqual(decode(wire),next);previous=next;
 }
 assert.throws(()=>conversationTransferDecoder('workspace','chat')(encode({...previous,cursor:20,type:'conversation',revision:'last',payload:{conversation:{...previous.payload.conversation,revision:'last'}}})),/基准/);
 const snapshot={...previous,cursor:21,type:'snapshot'};assert.deepEqual(decode(encode(snapshot)),snapshot);
});
