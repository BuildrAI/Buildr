import Ajv2020 from 'ajv/dist/2020.js';
import {AGENT_OPERATION_SCHEMAS} from '../../src/operation-schemas.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationEventDecoder, conversationEventEncoder } from '../../src/domain/conversation-transfer.ts';
import { pendingConversationSummary } from '../../src/domain/pending-summary.ts';
import type { ServiceEvent } from '../../src/contracts.ts';

function event(cursor: number): ServiceEvent {
  return { cursor, generation: 'generation', type: cursor ? 'conversation' : 'snapshot',
    workspaceId: 'workspace', conversationId: 'chat', revision: `r${cursor}`,
    payload: { conversation: { id: 'chat', workspaceId: 'workspace', cwd: '/workspace', title: 'work',
      hidden: false, revision: `r${cursor}`, updatedAt: 'now', participants: [], requests: [],
      entries: Array.from({ length: 60 }, (_, i) => ({
        id: `entry-${i}`, sequence: i + 1, kind: 'message', role: 'assistant',
        text: 'history '.repeat(1024), createdAt: 'now',
      })) } } };
}

test('long conversation deltas preserve changed, added, deleted and reordered entries and remove metadata', () => {
  const encode = conversationEventEncoder(), decode = conversationEventDecoder();
  const first = event(0);
  first.payload.conversation!.taskId = 'removed-task';
  assert.deepEqual(decode(encode(first)), first);
  const next = event(1), view = next.payload.conversation!;
  view.entries.pop(); view.entries.reverse();
  view.entries[0] = { ...view.entries[0]!, text: 'new text' };
  view.entries.push({ ...view.entries[0]!, id: 'added', sequence: 61 });
  const wire = encode(next);
  assert.equal(wire.payload.delta!.entries.length, 2);
  assert.equal(wire.payload.conversation, undefined);
  assert.ok(JSON.stringify(wire).length < JSON.stringify(next).length / 20);
  assert.deepEqual(decode(wire), next);
  assert.equal(decode(encode(event(2))).payload.conversation!.taskId, undefined);
  console.log(`long-conversation fixture: full=${JSON.stringify(next).length} delta=${JSON.stringify(wire).length}`);
});

test('mismatched cursor, revision, generation, scope, missing and duplicate entries refuse delta assembly', () => {
  const encode = conversationEventEncoder(), first = event(0);
  encode(first);
  const wire = encode(event(1));
  for (const change of [
    (x: any) => { x.payload.delta.baseCursor++; },
    (x: any) => { x.payload.delta.baseRevision = 'stale'; },
    (x: any) => { x.generation = 'other'; },
    (x: any) => { x.conversationId = 'other'; },
    (x: any) => { x.workspaceId = 'other'; },
    (x: any) => { x.payload.delta.entryIds.push('missing'); },
    (x: any) => { x.payload.delta.entryIds.push(x.payload.delta.entryIds[0]); },
  ]) {
    const decode = conversationEventDecoder(); decode(first);
    const invalid = structuredClone(wire); change(invalid);
    assert.throws(() => decode(invalid), /conversation_delta_/);
  }
  assert.throws(() => conversationEventDecoder()(wire), /baseline/);
});

test('new subscriptions, snapshots, generation changes and larger deltas use complete events', () => {
  const encode = conversationEventEncoder(), first = event(0);
  assert.deepEqual(encode(first), first);
  const changed = event(1);
  for (const entry of changed.payload.conversation!.entries) entry.text += 'new';
  assert.deepEqual(encode(changed), changed);
  const snapshot = { ...event(2), type: 'snapshot' as const };
  assert.deepEqual(encode(snapshot), snapshot);
  const generation = { ...event(3), generation: 'new-generation' };
  assert.deepEqual(encode(generation), generation);
  assert.deepEqual(conversationEventEncoder()(event(10)), event(10));
});

test('pending summaries contain only required reminder data, never native or user content', () => {
  const view = event(0).payload.conversation!;
  const summary = pendingConversationSummary(view);
  assert.deepEqual(summary, { conversationId: 'chat', workspaceId: 'workspace', title: 'work', status: 'unknown', count: 0 });
  assert.ok(JSON.stringify(summary).length < JSON.stringify(view).length / 100);
});

test('v2 round trips append, Unicode, final status, removal, corrections and ordering',()=>{
 const encode=conversationEventEncoder('delta-v2'),decode=conversationEventDecoder(),first=event(0);
 first.payload.conversation!.entries=first.payload.conversation!.entries.slice(0,2);first.payload.conversation!.entries[1]!.text='中😀';first.payload.conversation!.entries[1]!.status='running';first.payload.conversation!.taskId='remove';
 assert.deepEqual(decode(encode(first)),first);
 const next=structuredClone(first);next.type='conversation';next.cursor=1;next.revision=next.payload.conversation!.revision='r1';next.payload.conversation!.entries[1]!.text+='\n追加😀';next.payload.conversation!.entries[1]!.status='completed';delete next.payload.conversation!.taskId;
 const wire=encode(next),p=wire.payload.patch!;assert.equal(p.entryIds,undefined);assert.deepEqual(p.entries,[]);assert.equal(p.texts[0]!.offset,3);assert.equal(p.texts[0]!.append,'\n追加😀');assert.deepEqual(p.texts[0]!.changes,{status:'completed'});assert.deepEqual(p.unset,['taskId']);assert.deepEqual(decode(wire),next);
 const corrected=structuredClone(next);corrected.cursor=2;corrected.revision=corrected.payload.conversation!.revision='r2';corrected.payload.conversation!.entries.reverse();corrected.payload.conversation!.entries[0]!.text='纠正';assert.deepEqual(decode(encode(corrected)),corrected);
 const removed=structuredClone(corrected);removed.cursor=3;removed.revision=removed.payload.conversation!.revision='r3';removed.payload.conversation!.entries=[];assert.deepEqual(decode(encode(removed)),removed);
});

test('v2 rejects wrong baselines, offsets and conflicting patches without poisoning state',()=>{
 const first=event(0),next=event(1);next.payload.conversation!.entries[0]!.text+='后缀';const encode=conversationEventEncoder('delta-v2');encode(first);const wire=encode(next);
 for(const change of [
  (x:any)=>{x.payload.patch.baseCursor++;},(x:any)=>{x.payload.patch.baseRevision='stale';},(x:any)=>{x.generation='foreign';},(x:any)=>{x.workspaceId='foreign';},(x:any)=>{x.conversationId='foreign';},
  (x:any)=>{x.payload.patch.runs=[{id:'foreign',changes:{updatedAt:'late'}}];},(x:any)=>{delete x.payload.patch.runs;},(x:any)=>{x.payload.patch.texts[0].offset--;},(x:any)=>{x.payload.patch.texts[0].id='unknown';},(x:any)=>{x.payload.patch.entries.push(next.payload.conversation!.entries[0]);},
  (x:any)=>{x.payload.patch.unset=['title'];},(x:any)=>{x.payload.patch.changes.id='other';},(x:any)=>{x.payload.patch.texts[0].unset=['text'];},(x:any)=>{x.payload.patch.entryIds=['missing'];},
  (x:any)=>{x.payload.patch.changes=JSON.parse('{"__proto__":{}}');},
 ]){const decode=conversationEventDecoder();decode(first);const invalid=structuredClone(wire);change(invalid);assert.throws(()=>decode(invalid),/conversation_patch_/);assert.deepEqual(decode(wire),next);}
 assert.throws(()=>conversationEventDecoder()(wire),/baseline/);
});

test('v2 long-stream bytes grow with new text instead of historical state and accumulated text',t=>{
 const initial=event(0);initial.payload.conversation!.retainedRuns=Array.from({length:200},(_,i)=>({id:'old-'+i,participantId:'p',provider:'codex',generation:'old',status:'completed',accepted:true,tools:[],startedAt:'now',updatedAt:'now'}));
 initial.payload.conversation!.run={id:'current',participantId:'p',provider:'codex',generation:'generation',status:'running',accepted:true,tools:Array.from({length:500},(_,i)=>({id:'tool-'+i,label:'command',status:'completed'})),startedAt:'now',updatedAt:'now'};
 const v1=conversationEventEncoder(),v2=conversationEventEncoder('delta-v2'),decode=conversationEventDecoder();v1(initial);decode(v2(initial));let oldBytes=0,newBytes=0,last=initial;
 for(let i=1;i<=1000;i++){
  const next:ServiceEvent={...last,type:'conversation',cursor:i,revision:'r'+i,payload:{conversation:{...last.payload.conversation!,revision:'r'+i,run:{...last.payload.conversation!.run!,updatedAt:'time-'+i},entries:last.payload.conversation!.entries.map((e,j)=>j===59?{...e,text:e.text+'字'}:e)}}};
  oldBytes+=Buffer.byteLength(JSON.stringify(v1(next)));const wire=v2(next);newBytes+=Buffer.byteLength(JSON.stringify(wire));assert.deepEqual(Object.keys(wire.payload.patch!.changes),['revision']);assert.equal(wire.payload.patch!.entryIds,undefined);assert.deepEqual(wire.payload.patch!.runs[0]!.changes,{updatedAt:'time-'+i});assert.equal(wire.payload.patch!.texts[0]!.append,'字');assert.equal(decode(wire).payload.conversation!.entries[59]!.text,next.payload.conversation!.entries[59]!.text);last=next;
 }
 assert.ok(newBytes<oldBytes/50);assert.deepEqual(decode(v2({...last,type:'snapshot',cursor:1001})).payload.conversation,last.payload.conversation);t.diagnostic(JSON.stringify({fragments:1000,v1Bytes:oldBytes,v2Bytes:newBytes}));
});

test('v2 supports seen-only or pending-only changes and repeated observations at the same durable revision',()=>{
 const encode=conversationEventEncoder('delta-v2'),decode=conversationEventDecoder(),first=event(0);decode(encode(first));
 const next={...first,cursor:1,type:'conversation' as const,payload:{conversation:{...first.payload.conversation!,activity:{version:1,seenThrough:1,active:false,updatedAt:'now'}}}};
 assert.deepEqual(decode(encode(next)),next);const repeated={...next,cursor:2};assert.deepEqual(decode(encode(repeated)),repeated);
});

test('v2 JSON wire satisfies strict public schema for append, run metadata, tools and deletion',()=>{
 const validate=new Ajv2020({strict:false}).compile(AGENT_OPERATION_SCHEMAS.event),encode=conversationEventEncoder('delta-v2'),decode=conversationEventDecoder();
 const first=event(0);first.payload.conversation!.run={id:'run',participantId:'p',provider:'codex',generation:'generation',status:'running',accepted:true,tools:[],startedAt:'now',updatedAt:'now',diagnostic:'old'};
 let previous=first;
 for(let i=0;i<5;i++){
  const next=structuredClone(previous);next.cursor=i;next.revision=next.payload.conversation!.revision='wire-'+i;
  if(i){next.type='conversation';next.payload.conversation!.entries[0]!.text+='😀';next.payload.conversation!.run!.updatedAt='time-'+i;delete next.payload.conversation!.run!.diagnostic;}
  if(i===2)next.payload.conversation!.run!.tools.push({id:'tool',label:'command',status:'running'});
  if(i===3){next.payload.conversation!.run!.tools[0]!.status='completed';next.payload.conversation!.run!.status='completed';}
  if(i===4){next.payload.conversation!.retainedRuns=[next.payload.conversation!.run!];delete next.payload.conversation!.run;}
  const wire=JSON.parse(JSON.stringify(encode(next)));assert.equal(validate(wire),true,JSON.stringify(validate.errors));assert.deepEqual(decode(wire),JSON.parse(JSON.stringify(next)));previous=next;
 }
});
