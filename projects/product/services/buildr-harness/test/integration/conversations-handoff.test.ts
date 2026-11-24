import { dshItem } from '../../src/executors/dsh/protocol.ts';
import { qoderHistoryItems } from '../../src/executors/qoder/protocol.ts';
import zlib from 'node:zlib';
import { syncBuiltinESMExports } from 'node:module';
import { body } from '../../src/process/transport.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import type { ConversationEntry, ExecutorItem } from '../../src/contracts.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { fake, fixture, connected, waitUntil, send } from '../support/conversations-fixture.ts';

test('handoff references preserve ordered inputs and read details without duplicating or decoding old tools',async t=>{
 const a=fake('a'),b=fake('b'),f=fixture([a.executor,b.executor]);t.after(()=>f.close());
 await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
 send(f.service,chat.id,'a','initial');const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),v=>v.run?.status==='completed');
 const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));t.after(()=>repo.stopReadModels());const record=repo.readConversation(chat.id)!,runId=done.run!.id;
 const text='handoff-user-original',output='HUGE_TOOL_BODY_'.repeat(40000),toolId=randomUUID();
 const entry=(sequence:number,fields:Partial<ConversationEntry>):ConversationEntry=>({id:randomUUID(),sequence,createdAt:'now',kind:'message',role:'user',runId,text,...fields});
 record.view.entries=[entry(1,{}),entry(2,{role:'assistant',text:'next stage'}),entry(3,{id:toolId,kind:'tool',role:'system',name:'command',input:'PRIVATE_COMMAND',text:output,status:'completed'}),entry(4,{text:'追加纠正'}),entry(5,{kind:'notice',text:'问题回答'}),entry(6,{role:'assistant',text:'final response',status:'completed'})];record.view.revision=randomUUID();repo.saveConversation(record,done.revision);
 const original=zlib.zstdDecompressSync;let decodes=0;zlib.zstdDecompressSync=((...args:any[])=>{decodes++;return (original as any)(...args);}) as any;syncBuiltinESMExports();
 let preview:ReturnType<typeof f.service.conversations.prepareSend>;
 try{
  const draft={expectedRevision:record.view.revision,connectionId:'b',text:'continue'};preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
  const again=f.service.conversations.prepareSend('workspace-one',chat.id,draft);assert.equal(preview.handoff!.sourcePath,again.handoff!.sourcePath);assert.equal(decodes,0);
 }finally{zlib.zstdDecompressSync=original;syncBuiltinESMExports();}
 const material=preview!.handoff!,sourceId=material.sourceId!,directory=path.dirname(material.sourcePath!),body=fs.readFileSync(material.sourcePath!,'utf8');
 assert.ok(!body.includes(text)&&!body.includes('HUGE_TOOL_BODY_')&&!body.includes('PRIVATE_COMMAND'));assert.ok(Buffer.byteLength(body)<10000);assert.deepEqual(fs.readdirSync(directory),[sourceId]);t.diagnostic(JSON.stringify({toolBytes:Buffer.byteLength(output),indexBytes:Buffer.byteLength(body),handoffOldToolDecompressions:decodes,sourceFiles:1}));
 assert.deepEqual(material.rounds[0].userInputs,[text,'追加纠正','问题回答']);assert.equal(material.rounds[0].finalReply,'final response');
 let cursor:number|undefined=0;const entries:ConversationEntry[]=[];
 do{const page=f.service.conversations.readHistory('workspace-one',chat.id,{sourceId,limit:2,cursor});assert.equal(page.unavailable.length,0);entries.push(...page.entries);cursor=page.nextCursor;}while(cursor!==undefined);
 assert.deepEqual(entries.map(e=>e.sequence),[1,2,3,4,5,6]);assert.equal(entries[2].text,'');assert.equal(entries[2].input,undefined);assert.equal(f.service.conversations.readEntry('workspace-one',chat.id,toolId,entries[2].detail!.revision).text,output);
 const messages:ConversationEntry[]=[];cursor=0;
 do{const page=f.service.conversations.readHistory('workspace-one',chat.id,{sourceId,view:'messages',limit:2,cursor});assert.deepEqual(page.unavailable,[]);messages.push(...page.entries);cursor=page.nextCursor;}while(cursor!==undefined);
 assert.deepEqual(messages.map(e=>e.sequence),[1,2,4,5,6]);assert.deepEqual(messages.filter(e=>e.role==='user').map(e=>e.text),[text,'追加纠正','问题回答']);
 assert.deepEqual(f.service.conversations.readHistory('workspace-one',chat.id,{sourceId,view:'all'}).entries,entries);
 assert.throws(()=>f.service.conversations.readHistory('workspace-one',chat.id,{sourceId,view:'invalid' as any}),{code:'agent_handoff_source_invalid'});
 assert.throws(()=>f.service.conversations.readHistory('foreign',chat.id,{sourceId}),{code:'agent_conversation_missing'});
 assert.throws(()=>f.service.conversations.readHistory('workspace-one',chat.id,{sourceId:'../../secret'}),{code:'agent_handoff_source_invalid'});
 assert.throws(()=>f.service.conversations.readHistory('workspace-one',chat.id,{sourceId,roundId:'other'}),{code:'agent_handoff_round_missing'});
 const later=repo.readConversation(chat.id)!;later.view.entries.push(entry(7,{text:'later input excluded'}));later.view.revision=randomUUID();repo.saveConversation(later,record.view.revision);
 assert.equal(f.service.conversations.readHistory('workspace-one',chat.id,{sourceId}).entries.length,6);
 const draft={expectedRevision:later.view.revision,connectionId:'b',text:'continue'};const next=f.service.conversations.prepareSend('workspace-one',chat.id,draft);f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:next.token,clientRequestId:randomUUID()});
 const complete=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),v=>v.run?.status==='completed');
 const receipt=complete.entries.find(e=>e.kind==='handoff'&&e.handoff?.sourceOnly)!.handoff!;assert.ok(receipt.sourceId);assert.ok(!JSON.stringify(receipt).includes(text));assert.deepEqual(receipt.rounds[0].userInputs,[]);assert.equal(b.sends.length,1);
 const changed=repo.readConversation(chat.id)!;changed.view.entries.find(e=>e.sequence===1)!.text='changed original';changed.view.revision=randomUUID();repo.saveConversation(changed,complete.revision);
 const missing=f.service.conversations.readHistory('workspace-one',chat.id,{sourceId});assert.ok(missing.unavailable.some(e=>e.id===entries[0].id));assert.ok(!JSON.stringify(missing).includes('changed original'));
 fs.unlinkSync(material.sourcePath!);assert.throws(()=>f.service.conversations.readHistory('workspace-one',chat.id,{sourceId}),{code:'agent_handoff_source_unavailable'});
});

for (const provider of ['dsh', 'qoder'] as const) test(`${provider} unchanged native-tool references resume past an unknown old outcome without hiding new work`, async () => {
  const native = fake(provider), open = native.executor.open;
  native.executor.open = async options => {
    const runtime = await open(options), create = runtime.createContext.bind(runtime), original = runtime.send.bind(runtime);
    runtime.createContext = async input => {
      const ref = await create(input);
      return { ...ref, data: { native: opaqueReference(provider, ref.id, input.cwd, runtime.bindingIdentity) } };
    };
    runtime.send = async input => {
      await original({ ...input, onEvent: event => {
        if (event.type === 'accepted') event.executionRef.data = { resourceContext: input.contextRef.id, resourceBinding: runtime.bindingIdentity };
        if (event.type === 'completed' && native.sends.length === 1) {
          const context = native.contexts.get(input.contextRef.id)!, executionId = context.observation.executionRef!.id;
          const call = provider === 'dsh'
            ? { type: 'tool/call', data: { turn: 1, callId: 'native-history-tool', name: 'shell', arguments: '{"command":"read-only"}' } }
            : { type: 'assistant', session_id: input.contextRef.id, message: { content: [{ type: 'tool_use', id: 'native-history-tool', name: 'shell', input: { command: 'read-only' } }] } };
          const result = provider === 'dsh'
            ? { type: 'tool/result', data: { turn: 1, message: { toolCallId: 'native-history-tool', content: [{ type: 'text', text: 'unchanged native body' }] } } }
            : { type: 'user', session_id: input.contextRef.id, message: { content: [{ type: 'tool_result', tool_use_id: 'native-history-tool', content: 'unchanged native body' }] } };
          const projected = provider === 'dsh'
            ? [...dshItem(call), ...dshItem(result)]
            : qoderHistoryItems([call, result], input.contextRef.id);
          for (const item of projected) input.onEvent({ type: 'item', item: { ...item, executionId } });
          context.items.push({ ...projected.at(-1)!, executionId, name: 'shell', input: '{"command":"read-only"}' });
        }
        input.onEvent(event);
      } });
    };
    return runtime;
  };
  const f = fixture([native.executor]);
  const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
  try {
    await connected(f.service, provider);
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, provider, 'original work');
    const first = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id, { compactTools: true }), view => view.run?.status === 'completed');
    const record = repository.readConversation(chat.id)!, old = record.view.run!, originalRunId = old.id;
    assert.equal(record.view.entries.find(entry => entry.kind === 'tool')?.text, '', 'real v3 persistence must reload an empty body skeleton');
    old.status = 'unknown'; old.executionState = 'unknown'; old.resourcesReleased = true;
    record.view.retainedRuns = [old];
    record.runOutcomes![old.id].status = 'unknown';
    const retryId = randomUUID(), userEntryId = randomUUID();
    record.view.run = { ...old, id: retryId, status: 'failed', accepted: false, tools: [], resourcesReleased: undefined };
    record.view.entries.push({ id: userEntryId, sequence: record.view.entries.at(-1)!.sequence + 1, createdAt: 'now', kind: 'message', role: 'user', text: 'not delivered', participantId: old.participantId, runId: retryId, status: 'failed' });
    record.attempts.push({ clientRequestId: randomUUID(), inputDigest: 'unsent', runId: retryId, participantId: old.participantId, through: record.view.entries.at(-1)!.sequence, userEntryId, accepted: false });
    record.view.revision = randomUUID(); repository.saveConversation(record, first.revision);
    for (const text of ['new requirement', 'another new requirement']) {
      send(f.service, chat.id, provider, text);
      const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id, { compactTools: true }), view => ['completed', 'failed'].includes(view.run?.status ?? ''));
      assert.equal(done.run?.status, 'completed', done.run?.diagnostic);
      assert.equal(done.participants.length, 1, 'resume the exact native context, not a replacement that bypasses history');
      assert.equal(done.retainedRuns?.find(run => run.id === originalRunId)?.status, 'unknown');
    }
    assert.equal(native.sends.length, 3, 'only explicit new inputs are sent; the failed input is never replayed');
    const context = native.contexts.values().next().value!;
    context.items.push({ ...context.items.find(item => item.id === 'native-history-tool')!, id: 'genuinely-new-tool', status: 'running' });
    send(f.service, chat.id, provider, 'must first review genuinely new work');
    const blocked = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id, { compactTools: true }), view => view.run?.status === 'failed');
    assert.match(blocked.run!.diagnostic!, /原生记录有新变化/);
    assert.equal(native.sends.length, 3);
  } finally { repository.stopReadModels(); await f.close(); }
});

test('resuming history preserves a concurrent metadata update without failing the new input', async () => {
  const native = fake('local'), open = native.executor.open;
  let onHistory: (() => void) | undefined;
  native.executor.open = async options => {
    const runtime = await open(options), history = runtime.readHistory.bind(runtime);
    runtime.readHistory = async input => {
      const items = await history(input);
      if (onHistory) {
        const callback = onHistory; onHistory = undefined; callback();
        const answer = items.find(item => item.role === 'assistant');
        if (answer) answer.text = 'refreshed completed answer';
        const stored = native.contexts.get(input.contextRef.id)!.items.find(item => item.role === 'assistant');
        if (stored) stored.text = 'refreshed completed answer';
      }
      return items;
    };
    return runtime;
  };
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'first');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'completed');
    onHistory = () => {
      const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
      const record = repository.readConversation(chat.id)!;
      const prior = record.view.revision;
      record.view.title = 'concurrently renamed';
      record.view.revision = randomUUID();
      repository.saveConversation(record, prior);
    };
    send(f.service, chat.id, 'local', 'second');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id),
      view => ['completed', 'failed', 'unknown'].includes(view.run?.status ?? ''));
    assert.equal(done.run?.status, 'completed', done.run?.diagnostic);
    assert.equal(done.title, 'concurrently renamed');
    assert.equal(native.sends.length, 2);
    assert.ok(done.entries.some(entry => entry.text === 'refreshed completed answer'));
  } finally { await f.close(); }
});

test('a lost native context is replaced visibly instead of failing later messages', async () => {
  const native = fake('qoder-cn', { resumeUnavailable: true }), f = fixture([native.executor]);
  try {
    await connected(f.service, 'qoder-cn');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'qoder-cn', 'first');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'completed');
    const second = send(f.service, chat.id, 'qoder-cn', 'second');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.id === second.run.id && ['completed', 'failed', 'unknown'].includes(view.run.status));
    assert.equal(done.run?.status, 'completed', done.run?.diagnostic);
    assert.equal(native.contexts.size, 2, 'the lost context is replaced by one new native context');
    assert.deepEqual(native.sends.map(input => input.text), ['first', 'second'], 'the earlier input is never resent');
    const receipt = done.entries.find(entry => entry.kind === 'handoff' && entry.nativeSession?.reason === 'session-replacement');
    assert.ok(receipt, 'the replacement is visible in the transcript');
    assert.match(receipt.text, /原生会话已无法恢复/);
  } finally { await f.close(); }
});

test('manual A to B to C to A resumes exact contexts and sends only missing visible changes', async () => {
  const a = fake('a'); const b = fake('b'); const c = fake('c'); const f = fixture([a.executor, b.executor, c.executor]);
  try {
    for (const id of ['a', 'b', 'c']) await connected(f.service, id);
    const created = await f.service.conversations.create('workspace-one', {});
    for (const id of ['a', 'b', 'c']) { send(f.service, created.id, id, `work-${id}`); await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed'); }
    const before = f.service.conversations.read('workspace-one', created.id);
    const ref = before.participants.find(p => p.provider === 'a')!.contextId;
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, { expectedRevision: before.revision, connectionId: 'a', text: 'return' });
    assert.equal(preview.history.some(item => item.text === 'answer from a'), false);
    assert.equal(preview.history.some(item => item.text === 'answer from b'), true);
    send(f.service, created.id, 'a', 'return');
    const after = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    assert.equal(after.participants.length, 3); assert.equal(after.participants.find(p => p.provider === 'a')!.contextId, ref);
    assert.equal(a.contexts.size, 1); assert.equal(a.sends[1]!.contextRef.id, ref);
    assert.equal(after.entries.filter(item => item.role === 'user' && item.kind === 'message').length, 4);
  } finally { await f.close(); }
});

test('preview revision binds the local source range and legacy summaries cannot replace it', async () => {
  const a = fake('a'); const b = fake('b'); b.executor.descriptor.capabilities.maxInputBytes = 300;
  const f = fixture([a.executor, b.executor]);
  try {
    await connected(f.service, 'a'); await connected(f.service, 'b'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'a', 'x'.repeat(1000));
    const completed = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    const draft = { expectedRevision: completed.revision, connectionId: 'b', text: 'continue' };
    const tooLarge = f.service.conversations.prepareSend('workspace-one', created.id, draft); assert.equal(tooLarge.fits, false);
    assert.throws(() => f.service.conversations.send('workspace-one', created.id, { ...draft, previewToken: tooLarge.token, clientRequestId: 'too-large' }), { code: 'agent_handoff_capacity' });
    assert.equal(b.sends.length, 0);
    const changed = await f.service.conversations.update('workspace-one', created.id, { expectedRevision: completed.revision, title: 'changed' });
    assert.throws(() => f.service.conversations.prepareSend('workspace-one', created.id, draft), { code: 'agent_revision_conflict' });
    const summary = f.service.conversations.prepareSend('workspace-one', created.id, { ...draft, expectedRevision: changed.revision, handoffSummary: 'user chosen scope' });
    assert.equal(summary.history[0]!.text,'x'.repeat(1000));assert.ok(summary.handoff!.body.includes('user chosen scope'));
    assert.ok(f.service.conversations.read('workspace-one', created.id).entries.some(item => item.text.length === 1000));
  } finally { await f.close(); }
});

test('late authorization acknowledgment preserves a terminal event already observed', async () => {
  const native = fake('local', { request: true, replyAfterTerminal: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'ask');
    const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
    const result = await f.service.conversations.reply('workspace-one', created.id, waiting.requests[0]!.id, { expectedRevision: waiting.revision, runId: waiting.run!.id, participantId: waiting.run!.participantId, generation: waiting.run!.generation, answer: 'allow-once' });
    assert.equal(result.run!.status, 'completed');
  } finally { await f.close(); }
});

test('normal running tools do not imply an interrupted model or override a pending approval', async () => {
  const native=fake('local',{hold:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','run command');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.accepted===true);
    const input=native.sends[0]!,context=native.contexts.get(input.contextRef.id)!;
    context.observation={...context.observation,status:'running',tools:[{id:'command',label:'command',status:'running'}]};
    input.onEvent({type:'observation',observation:context.observation});
    assert.equal(f.service.conversations.read('workspace-one',chat.id).run?.status,'running');
    assert.equal((await f.service.conversations.observe('workspace-one',chat.id)).run?.status,'running');
    input.onEvent({type:'request',request:{id:'permission',kind:'approval',title:'Continue?'}});
    context.observation={...context.observation,status:'waiting'};
    input.onEvent({type:'observation',observation:context.observation});
    const waiting=f.service.conversations.read('workspace-one',chat.id);assert.equal(waiting.run?.status,'waiting-approval');assert.equal(waiting.requests.length,1);
    await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:waiting.revision,runId:waiting.run!.id,participantId:waiting.run!.participantId,generation:waiting.run!.generation});
  }finally{await f.close();}
});

test('a late exact command receipt during next-turn preparation updates only the original history', async () => {
  const native=fake('local',{toolSurvives:true,multipleModels:true});const f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','first');
    const before=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='tools-active');
    const context=[...native.contexts.values()][0]!;
    context.observation.canContinue=true;
    const old=native.sends[0]!,executionId=context.observation.executionRef!.id;
    const item:ExecutorItem={id:'old-command',kind:'tool',role:'system',text:'browser helper',executionId,status:'running'};
    old.onEvent({type:'item',item});
    await f.service.conversations.observe('workspace-one',chat.id);
    const ready=f.service.conversations.read('workspace-one',chat.id);
    assert.equal(f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:ready.revision,connectionId:'local',model:'other-model',text:'switch model'}).fits,true);
    send(f.service,chat.id,'local','next');
    const current=f.service.conversations.read('workspace-one',chat.id).run!;
    old.onEvent({type:'item',item:{...item,status:'completed',text:'closed'}});
    // Neither a stale terminal event nor a receipt for the wrong execution may
    // alter the new round or overwrite the accepted exact command result.
    old.onEvent({type:'completed',status:'failed',diagnostic:'old failure'});
    old.onEvent({type:'item',item:{...item,executionId:'wrong',text:'wrong result',status:'completed'}});
    const after=f.service.conversations.read('workspace-one',chat.id);
    assert.equal(after.run!.id,current.id);assert.equal(after.run!.status,current.status);
    const receipt=after.entries.find(entry=>entry.kind==='tool'&&entry.text==='closed')!;
    assert.ok(receipt);assert.equal(receipt.runId,before.run!.id);assert.equal(receipt.status,'completed');
    assert.equal(after.entries.some(entry=>entry.text==='wrong result'),false);
  } finally {await f.close();}
});

test('large native items remain durable while the handoff carries actions and readable local sources', async () => {
  const a = fake('a'); const b = fake('b'); const f = fixture([a.executor, b.executor]);
  try {
    await connected(f.service, 'a'); await connected(f.service, 'b');
    const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'a', 'read large tool output');
    const completed = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    const context = a.contexts.values().next().value!;
    for (let index = 0; index < 10; index++) {
      const item: ExecutorItem = { id: `large-tool-${index}`, kind: 'tool', role: 'assistant', text: `${index}:` + 'x'.repeat(700 * 1024), executionId: 'execution-1', status: 'completed' };
      context.items.push(item); a.sends[0]!.onEvent({ type: 'item', item });
    }
    const recent = f.service.conversations.read('workspace-one', created.id, { limit: 100 });
    assert.ok(recent.entries.length < 10); assert.ok(recent.nextEntryCursor);
    const pages = []; let page = recent;
    for (;;) {
      assert.ok(page.entries.length > 0); assert.ok(Buffer.byteLength(JSON.stringify(page.entries)) <= 4 * 1024 * 1024);
      pages.unshift(...page.entries);
      if (page.nextEntryCursor === undefined) break;
      const next = f.service.conversations.read('workspace-one', created.id, { before: page.nextEntryCursor, limit: 100 });
      assert.ok(next.entries.at(-1)!.sequence < page.entries[0]!.sequence); page = next;
    }
    assert.deepEqual(pages.map(entry => entry.sequence), Array.from({ length: 12 }, (_, index) => index + 1));
    assert.equal(new Set(pages.map(entry => entry.id)).size, 12);
    assert.deepEqual(pages.filter(entry => entry.kind === 'tool').map(entry => entry.text), context.items.filter(item => item.kind === 'tool').map(item => item.text));
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'), { readOnly: true });
    try {
      const row = db.prepare('SELECT body FROM conversations WHERE id=?').get(created.id) as { body: string };
      assert.deepEqual(JSON.parse(row.body).view.entries, [], 'the header must not duplicate durable entry bodies');
      const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
      assert.deepEqual(JSON.parse(JSON.stringify(repository.readConversation(created.id)!.view.entries)), pages, 'pagination must not truncate the durable record');
    } finally { db.close(); }
    const subscription = f.service.conversations.subscribe('workspace-one', created.id);
    const iterator = subscription.events[Symbol.asyncIterator]();
    try {
      const snapshot = (await iterator.next()).value!;
      const defaultPage = f.service.conversations.read('workspace-one', created.id);
      assert.equal(snapshot.type, 'snapshot'); assert.deepEqual(snapshot.payload.conversation!.entries, defaultPage.entries);
      assert.equal(snapshot.payload.conversation!.nextEntryCursor, defaultPage.nextEntryCursor);
      assert.equal(defaultPage.entries[0]?.text, 'read large tool output');
      assert.deepEqual(defaultPage.entries.slice(1), recent.entries);
      assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 8 * 1024 * 1024);
    } finally { subscription.close(); await iterator.return?.(); }
    const draft = { expectedRevision: recent.revision, connectionId: 'b', text: 'continue' };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    assert.equal(preview.history.length,12);assert.equal(preview.fits,true);assert.ok(preview.inputBytes<preview.maxInputBytes);
    assert.ok(!preview.handoff!.body.includes('x'.repeat(1000)));
    const index=JSON.parse(fs.readFileSync(preview.handoff!.sourcePath!,'utf8'));
    const original=f.service.conversations.readHistory('workspace-one',created.id,{sourceId:path.basename(preview.handoff!.sourcePath!),roundId:index.rounds[0].id});assert.equal(original.entries.filter((e:any)=>e.kind==='tool').length,10);
    f.service.conversations.send('workspace-one',created.id,{...draft,previewToken:preview.token,clientRequestId:'indexed-handoff'});
    await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');assert.equal(b.sends.length,1);
  } finally { await f.close(); }
});

test('long handoff uses paged navigation over a large internal index without auxiliary summary; receipt identifies the exact sent body',async t=>{
 let calls=0;const a=fake('a',{summary:async()=>{calls++;return 'unique auxiliary summary: verify the directory';}}),b=fake('b'),c=fake('c');
 b.executor.descriptor.capabilities.maxInputBytes=8192;
 const f=fixture([a.executor,b.executor,c.executor]);
 try{
  for(const id of ['a','b','c'])await connected(f.service,id);
  const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','x'.repeat(12000));const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));const record=repo.readConversation(chat.id)!;
  try{
   const entry=(sequence:number,fields:Partial<ConversationEntry>):ConversationEntry=>({id:randomUUID(),sequence,kind:'message',role:'user',runId:done.run!.id,text:'',createdAt:'now',...fields});
   record.view.entries=[entry(1,{text:'x'.repeat(12000)}),...Array.from({length:800},(_,i)=>entry(i+2,{kind:'tool',role:'system',name:'read',status:'completed'})),entry(802,{text:'保留最新纠正'}),entry(803,{kind:'notice',text:'保留问题回答'}),entry(804,{role:'assistant',text:'original final',status:'completed'})];
   record.view.revision=randomUUID();repo.saveConversation(record,done.revision);
  }finally{repo.stopReadModels();}
  const draft={expectedRevision:record.view.revision,connectionId:'b',text:'continue'};
  const skipped=await f.service.conversations.prepareHandoff('workspace-one',chat.id,{...draft,skipHandoffSummary:true});assert.equal(skipped.handoff!.mode,'indexed');assert.equal(calls,0);
  const preview=await f.service.conversations.prepareHandoff('workspace-one',chat.id,draft);
  assert.equal(preview.handoff!.mode,'indexed');assert.equal(calls,0);assert.equal(a.sends.length,1,'summary must not enter the work context');
  assert.ok(fs.statSync(preview.handoff!.sourcePath!).size>256*1024);
  assert.equal(preview.fits,true);assert.ok(preview.inputBytes<=preview.maxInputBytes);
  const query=JSON.parse(preview.handoff!.body.match(/history '([^']+)'/)![1]);
  assert.deepEqual(query,{sourceId:preview.handoff!.sourceId!,view:'messages' as const,limit:10});
  const page=f.service.conversations.readHistory('workspace-one',chat.id,query);
  assert.deepEqual(page.entries.map(e=>e.sequence),[1,802,803,804]);assert.deepEqual(page.unavailable,[]);
  assert.deepEqual(page.truncatedIds,[page.entries[0].id]);assert.equal(page.nextCursor,undefined);
  assert.equal(f.service.conversations.readEntry('workspace-one',chat.id,page.entries[0].id,page.entries[0].detail!.revision,query.sourceId).text,'x'.repeat(12000));
  assert.ok(preview.handoff!.body.includes('roundId='+done.run!.id));assert.ok(!preview.handoff!.body.includes('请先读取本地索引'));
  t.diagnostic(JSON.stringify({indexBytes:fs.statSync(preview.handoff!.sourcePath!).size,promptBytes:preview.inputBytes,messageCount:page.entries.length,toolMetadataSkipped:800}));
  f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:'summarized'});
  const second=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  assert.equal(b.sends[0]!.text,preview.handoff!.body);assert.equal(second.entries.find(e=>e.kind==='handoff')!.handoff!.bodyDigest,createHash('sha256').update(b.sends[0]!.text).digest('hex'));
  assert.equal(second.entries.find(e=>e.kind==='handoff')!.status,'accepted');assert.equal(calls,0);
  const next=await f.service.conversations.prepareHandoff('workspace-one',chat.id,{expectedRevision:second.revision,connectionId:'c',text:'continue again'});
  assert.ok(!next.handoff!.body.includes('unique auxiliary summary'),'next material must derive from local originals, not the previous packet');
  assert.equal(calls,0);
 }finally{await f.close();}
});

test('quota failure preserves long local source records and still permits handoff',async()=>{
 let calls=0;const a=fake('a',{summary:async()=>{calls++;throw new Error('quota exhausted');}}),b=fake('b');b.executor.descriptor.capabilities.maxInputBytes=8192;
 const f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','user original '.repeat(1500));const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const draft={expectedRevision:done.revision,connectionId:'b',text:'continue'};const preview=await f.service.conversations.prepareHandoff('workspace-one',chat.id,draft);
  assert.equal(preview.handoff!.mode,'indexed');assert.equal(preview.fits,true);assert.equal(calls,0);
  const index=JSON.parse(fs.readFileSync(preview.handoff!.sourcePath!,'utf8'));const source=f.service.conversations.readHistory('workspace-one',chat.id,{sourceId:path.basename(preview.handoff!.sourcePath!),roundId:index.rounds[0].id});
  assert.ok(source.truncatedIds.includes(source.entries[0].id));assert.equal(f.service.conversations.readEntry('workspace-one',chat.id,source.entries[0].id,source.entries[0].detail!.revision).text,'user original '.repeat(1500));
  f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:'quota-fallback'});
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');assert.equal(b.sends.length,1);
 }finally{await f.close();}
});

test('a stale explicit preview cannot bypass a changed conversation revision',async()=>{
 const a=fake('a'),b=fake('b');b.executor.descriptor.capabilities.maxInputBytes=8192;
 const f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','x'.repeat(12000));const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const draft={expectedRevision:done.revision,connectionId:'b',text:'continue'};
  const preview=await f.service.conversations.prepareHandoff('workspace-one',chat.id,draft);
  const changed=await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:done.revision,title:'new title'});
  assert.throws(()=>f.service.conversations.send('workspace-one',chat.id,{...draft,expectedRevision:changed.revision,previewToken:preview.token,clientRequestId:'stale'}),{code:'agent_preview_stale'});
  assert.equal(b.sends.length,0);
 }finally{await f.close();}
});

test('answers retain the original question and run when another executor takes over',async()=>{
 const a=fake('a',{request:true}),b=fake('b'),f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','make the approved change');
  const waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='waiting-approval');
  const request=waiting.requests[0]!,run=waiting.run!;
  await f.service.conversations.reply('workspace-one',chat.id,request.id,{expectedRevision:waiting.revision,runId:run.id,participantId:run.participantId,generation:run.generation,answer:'allow-once'});
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const answer=done.entries.find(e=>e.id==='reply-'+request.id)!;assert.equal(answer.runId,run.id);assert.equal(answer.status,'accepted');
  const preview=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:done.revision,connectionId:'b',text:'continue'});
  assert.equal(preview.handoff!.rounds.length,1);assert.equal(preview.handoff!.rounds[0]!.userInputs.length,2);
  assert.ok(preview.handoff!.body.includes('Write a file?'));assert.ok(preview.handoff!.body.includes('allow-once'));assert.ok(preview.handoff!.body.includes('一次性'));
 }finally{await f.close();}
});

test('historical images have readable references and do not permanently block text-only handoff',async()=>{
 const a=fake('a',{images:true}),b=fake('b'),f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const image=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:png});
  const draft={expectedRevision:image.revision,connectionId:'a',text:'read the image',attachmentIds:[image.id]},p=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
  f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:p.token,clientRequestId:'image'});
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const next={expectedRevision:done.revision,connectionId:'b',text:'continue with the textual findings'},preview=f.service.conversations.prepareSend('workspace-one',chat.id,next);
  assert.equal(preview.fits,true);assert.ok(preview.handoff!.body.includes('historicalImages'));assert.ok(preview.handoff!.body.includes(image.id));
  f.service.conversations.send('workspace-one',chat.id,{...next,previewToken:preview.token,clientRequestId:'text-handoff'});
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');assert.equal(b.sends[0]!.images.length,0);
 }finally{await f.close();}
});

test('the third executor still sees the first run failure after a later successful run',async()=>{
 const a=fake('a',{failure:'first run failed after work'}),b=fake('b'),c=fake('c'),f=fixture([a.executor,b.executor,c.executor]);
 try{
  for(const id of ['a','b','c'])await connected(f.service,id);const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','first attempt');await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='failed');
  send(f.service,chat.id,'b','continue carefully');const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const preview=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:done.revision,connectionId:'c',text:'continue'});
  const first=preview.handoff!.rounds[0]!;assert.equal(first.state,'failed');assert.equal(first.diagnostic,'first run failed after work');assert.equal(first.provider,'a');
  assert.ok(preview.handoff!.body.includes('first run failed after work'));
 }finally{await f.close();}
});

test('an uncertain handoff receipt stays uncertain and repeated submission never starts a second execution',async()=>{
 const a=fake('a'),b=fake('b',{unknown:true}),f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','inspect first');const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const draft={expectedRevision:done.revision,connectionId:'b',text:'continue'},p=f.service.conversations.prepareSend('workspace-one',chat.id,draft),input={...draft,previewToken:p.token,clientRequestId:'uncertain-handoff'};
  f.service.conversations.send('workspace-one',chat.id,input);const unknown=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='unknown');
  const receipt=unknown.entries.find(e=>e.kind==='handoff')!;assert.equal(receipt.status,'unknown');assert.equal(receipt.handoff!.bodyDigest,createHash('sha256').update(b.sends[0]!.text).digest('hex'));
  f.service.conversations.send('workspace-one',chat.id,input);assert.equal(b.sends.length,1);assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.accepted,false);
  assert.equal(f.service.conversations.prepareSend('workspace-one',chat.id,{...draft,expectedRevision:unknown.revision,text:'a different instruction'}).participantId,undefined);assert.equal(b.sends.length,1);
 }finally{await f.close();}
});

test('correcting a failed question response retains both user inputs and the accepted answer',async()=>{
 const a=fake('a',{request:true}),b=fake('b'),f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','continue after my answer');
  const waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='waiting-approval'),run=waiting.run!,req=waiting.requests[0]!;
  const identity={runId:run.id,participantId:run.participantId,generation:run.generation};
  await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,req.id,{...identity,expectedRevision:waiting.revision,answer:'invalid-option'}));
  const current=f.service.conversations.read('workspace-one',chat.id);
  await f.service.conversations.reply('workspace-one',chat.id,req.id,{...identity,expectedRevision:current.revision,answer:'allow-once'});
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const replies=done.entries.filter(e=>e.id.startsWith('reply-'+req.id));assert.equal(replies.length,2);assert.equal(replies[0]!.status,'unknown');assert.equal(replies[1]!.status,'accepted');assert.ok(replies[1]!.text.includes('allow-once'));
  const next=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:done.revision,connectionId:'b',text:'continue'});assert.equal(next.handoff!.rounds[0]!.userInputs.length,3);
 }finally{await f.close();}
});

test('reconciliation preserves received terminal tool evidence and supplies exact receipts to the native observer', async () => {
  const native = fake('local', { hold: true }), open = native.executor.open; let received: readonly ExecutorItem[] | undefined;
  native.executor.open = async options => { const runtime = await open(options), observe = runtime.observe.bind(runtime); runtime.observe = async input => { received = input.knownItems; return observe(input); }; return runtime; };
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {}); send(f.service, chat.id, 'local', 'one operation');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id).run?.accepted, accepted => accepted === true);
    const sending = native.sends[0]!, context = native.contexts.get(sending.contextRef.id)!;
    const tool: ExecutorItem = { id: 'native-completed-tool', kind: 'tool', role: 'system', text: 'COMMITTED', status: 'completed', executionId: context.observation.executionRef!.id };
    sending.onEvent({ type: 'item', item: tool }); context.items.push({ ...tool, status: 'running' });
    await f.service.conversations.observe('workspace-one', chat.id);
    assert.deepEqual(received?.map(item => [item.id, item.executionId, item.status]), [[tool.id, tool.executionId, 'completed']]);
    const entry = f.service.conversations.read('workspace-one', chat.id).entries.find(item => item.kind === 'tool');
    assert.equal(entry?.status, 'completed'); assert.equal(native.sends.length, 1);
  } finally { await f.close(); }
});

test('settled same-context image backfill preserves the new input and dispatches it exactly once', async () => {
  const native=fake(),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','first');
    await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    const context=[...native.contexts.values()][0]!;
    context.items.push({id:'old-image',kind:'tool',role:'system',name:'view-image',text:'查看图片',status:'completed',executionId:'execution-1'});
    send(f.service,created.id,'local','next');
    const result=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed'||v.run?.status==='failed');
    assert.equal(result.run?.status,'completed');assert.equal(native.sends.length,2);
    assert.equal(result.entries.filter(e=>e.text==='next').length,1);
    const image=result.entries.find(e=>e.name==='view-image')!;assert.ok(image);assert.notEqual(image.runId,result.run?.id);
    await f.service.conversations.observe('workspace-one',created.id);
    assert.equal(native.sends.length,2);assert.equal(f.service.conversations.read('workspace-one',created.id).entries.filter(e=>e.name==='view-image').length,1);
  } finally {await f.close();}
});

test('late backfill cannot mark foreign work or the current unsent input delivered', async () => {
  const a=fake('a'),b=fake('b'),f=fixture([a.executor,b.executor]);
  try {
    await connected(f.service,'a');await connected(f.service,'b');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'a','first');await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    const through=f.service.conversations.read('workspace-one',created.id).participants[0]!.deliveredThrough;
    send(f.service,created.id,'b','foreign');await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    const context=[...a.contexts.values()][0]!;
    context.items.push({id:'unknown-tool',kind:'tool',role:'system',name:'read',text:'unknown execution',status:'completed',executionId:'foreign-execution'});
    send(f.service,created.id,'a','next');
    const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='failed');
    assert.equal(a.sends.length,1);assert.equal(failed.run?.accepted,false);
    assert.equal(failed.participants.find(p=>p.provider==='a')!.deliveredThrough,through);
    assert.match(failed.run?.diagnostic??'',/原生记录有新变化/);
  } finally {await f.close();}
});

test('new unmapped native user input still blocks dispatch while preserving the local request', async () => {
  const native=fake(),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','first');await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    [...native.contexts.values()][0]!.items.push({id:'outside-input',kind:'message',role:'user',text:'outside',executionId:'outside'});
    send(f.service,created.id,'local','next');const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='failed');
    assert.equal(native.sends.length,1);assert.equal(failed.entries.filter(e=>e.text==='next').length,1);assert.match(failed.run?.diagnostic??'',/原生用户输入尚不能准确映射/);
  } finally {await f.close();}
});

for(const media of ['image','video'] as const)test('正式材料回答校验同对话文件，保存原件并交付准确原生来源：'+media,async()=>{
  const native=fake('local',{question:true,images:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','检查');
    let waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='waiting-question');
    const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64');
    const frame=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:waiting.revision,mimeType:'image/png',bytes});
    const attachment=media==='image'?frame:f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:frame.revision,mimeType:'video/mp4',bytes:Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'),video:{duration:2,frames:[{id:frame.id,time:0}]}});
    waiting=f.service.conversations.read('workspace-one',chat.id);const request=waiting.requests[0]!,run=waiting.run!;
    const input={expectedRevision:waiting.revision,runId:run.id,participantId:run.participantId,generation:run.generation};
    await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,request.id,{...input,answer:{scope:{text:'',attachmentIds:[randomUUID()]}}}),{code:'agent_attachment_missing'});
    const other=await f.service.conversations.create('workspace-one',{}),foreign=f.service.conversations.addAttachment('workspace-one',other.id,{expectedRevision:other.revision,mimeType:'image/png',bytes});
    await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,request.id,{...input,answer:{scope:{text:'',attachmentIds:[foreign.id]}}}),{code:'agent_attachment_missing'});
    assert.equal(f.service.conversations.read('workspace-one',chat.id).requests.length,1);assert.equal(native.replies.length,0);
    await f.service.conversations.reply('workspace-one',chat.id,request.id,{...input,answer:{scope:{text:'看截图',attachmentIds:[attachment.id]}}});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(done.requests.length,0);const reply=done.entries.find(entry=>entry.id==='reply-'+request.id)!;
    assert.deepEqual(reply.attachments,[attachment.id]);assert.deepEqual(JSON.parse(reply.text).显示回答,{scope:'看截图'});assert.match(JSON.parse(reply.text).回答.scope,/未读取不能声称看过/);const delivered=(native.replies[0] as any).scope;assert.match(delivered,/看截图/);
    const sources=JSON.parse(delivered.split('：\n')[1].split('\n\n')[0]);assert.equal(fs.readFileSync(sources[0].path).equals(bytes),true);assert.equal(reply.status,'accepted');assert.equal(done.run!.id,run.id);
    if(media==='video'){assert.match(delivered,/不含音轨/);assert.match(delivered,/不能据此声称连续观看/);const video=JSON.parse(delivered.split('：\n').at(-1)!)[0];assert.equal(video.id,attachment.id);assert.equal(video.frames[0].id,frame.id);assert.equal(video.frames[0].time,0);assert.equal(fs.statSync(video.path).size,24);}
    await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,request.id,{...input,expectedRevision:done.revision,answer:{scope:'yes'}}),{code:'agent_request_stale'});assert.equal(native.replies.length,1);
  }finally{await f.close();}
});

test('明确待答快照移除旧卡片；仅运行和未知观察不证明问题结束',async()=>{
  const native=fake('local',{question:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','检查');
    const waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='waiting-question');
    const context=[...native.contexts.values()][0]!;context.observation={...context.observation,status:'unknown'};
    const unknown=await f.service.conversations.observe('workspace-one',chat.id);assert.equal(unknown.requests.length,1);
    context.observation={...context.observation,status:'running'};
    const running=await f.service.conversations.observe('workspace-one',chat.id);assert.equal(running.requests.length,1);
    context.observation={...context.observation,requests:[]};
    const current=await f.service.conversations.observe('workspace-one',chat.id);assert.equal(current.requests.length,0);assert.equal(native.replies.length,0);
    assert.ok(current.entries.some(entry=>entry.id==='retired-question-'+waiting.requests[0]!.id&&entry.text.includes('不补造答复')));
    await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{expectedRevision:current.revision,runId:current.run!.id,participantId:current.run!.participantId,generation:current.run!.generation,answer:{scope:'yes'}}),{code:'agent_request_stale'});
  }finally{await f.close();}
});

for(const visual of [true,false])test('正式材料回答的容量与能力失败不回应原问题：images='+visual,async()=>{
 const native=fake('local',{question:true,images:visual}),f=fixture([native.executor]);try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','检查');
  let waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='waiting-question');
  const ids:string[]=[];for(let n=0;n<10;n++){const attachment=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:waiting.revision,mimeType:'image/png',bytes:Buffer.from('89504e470d0a1a0a','hex')});ids.push(attachment.id);waiting=f.service.conversations.read('workspace-one',chat.id);}
  const input={expectedRevision:waiting.revision,runId:waiting.run!.id,participantId:waiting.run!.participantId,generation:waiting.run!.generation};
  await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{...input,answer:{scope:{text:'',attachmentIds:ids}}}),{code:'agent_question_answer_invalid'});
  await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{...input,answer:{scope:{text:'',attachmentIds:[ids[0]],path:'/etc/passwd'}}}),{code:'agent_question_answer_invalid'});
  assert.throws(()=>f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:waiting.revision,mimeType:'image/png',bytes:Buffer.alloc(8*1024*1024+1)}),{code:'agent_image_invalid',status:413});
  if(!visual)await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{...input,answer:{scope:{text:'',attachmentIds:[ids[0]]}}}),{code:'agent_capability_unavailable'});
  assert.equal(native.replies.length,0);assert.equal(f.service.conversations.read('workspace-one',chat.id).requests.length,1);
  if(visual){await f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{...input,answer:{scope:{text:'九份材料',attachmentIds:ids.slice(0,9)}}});assert.equal(native.replies.length,1);}
 }finally{await f.close();}
});

test('a proven continuation after a question answer retains the original run and accepts its next decision',async()=>{
  const native=fake('local',{question:true,toolSurvives:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','repair then release');
    const read=()=>f.service.conversations.read('workspace-one',chat.id);
    const waiting=await waitUntil(read,value=>value.run?.status==='waiting-question');
    const control=(view:ReturnType<typeof read>)=>({expectedRevision:view.revision,runId:view.run!.id,participantId:view.run!.participantId,generation:view.run!.generation});
    await f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0].id,{...control(waiting),answer:{scope:'yes'}});
    const stage=await waitUntil(read,value=>value.run?.status==='tools-active');
    const input=native.sends[0],context=native.contexts.get(input.contextRef.id)!;
    context.observation={status:'running',executionRef:context.observation.executionRef,tools:[]};
    input.onEvent({type:'observation',observation:context.observation});
    input.onEvent({type:'item',item:{id:'continuation-tool',kind:'tool',role:'system',name:'read',text:'repair evidence',executionId:context.observation.executionRef!.id,status:'completed'}});
    input.onEvent({type:'request',request:{id:'release-decision',kind:'question',title:'发布范围',questions:[{id:'scope',label:'发布范围',options:[{id:'yes',label:'继续'}]}]}});
    const followup=read();assert.equal(followup.run!.id,stage.run!.id);assert.equal(followup.run!.status,'waiting-question');
    assert.equal(followup.requests.length,1);assert.ok(followup.entries.some(entry=>entry.name==='read'&&entry.runId===stage.run!.id));
    await f.service.conversations.reply('workspace-one',chat.id,followup.requests[0].id,{...control(followup),answer:{scope:'yes'}});
    assert.equal(read().run!.status,'running');assert.equal(native.sends.length,1);assert.equal(native.replies.length,2);
    context.observation={status:'idle',executionRef:context.observation.executionRef,tools:[]};input.onEvent({type:'observation',observation:context.observation});
    assert.equal(read().run!.status,'completed');
  }finally{await f.close();}
});

test('request snapshots require exact execution identity and preserve public request bindings', async () => {
  const native = fake('local', { question: true }), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', '检查');
    const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.requests.length === 1);
    const input = native.sends[0], context = [...native.contexts.values()][0];
    input.onEvent({ type: 'observation', observation: { status: 'running', tools: [], executionRef: { id: 'another-execution' }, requests: [] } });
    assert.equal(f.service.conversations.read('workspace-one', chat.id).requests[0].id, waiting.requests[0].id);
    input.onEvent({ type: 'observation', observation: { status: 'running', tools: [], executionRef: context.observation.executionRef, requests: [{ id: 'question-one', kind: 'question', title: '仍待回答', blocking: false, generation: 'foreign', runId: 'foreign' } as any] } });
    const current = f.service.conversations.read('workspace-one', chat.id);
    assert.equal(current.requests[0].id, waiting.requests[0].id);
    assert.equal(current.requests[0].generation, current.run!.generation);
    assert.equal(current.requests[0].runId, current.run!.id);
    assert.equal(current.requests[0].blocking, false);
    assert.equal(current.run!.status, 'running');
  } finally { await f.close(); }
});

for (const exact of [false, true]) test('a resolved request cannot be resurrected by an older in-flight observation (exact=' + exact + ')', async () => {
  const native = fake('local', { question: true }), open = native.executor.open;
  let release!: () => void, captured!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { captured = resolve; });
  native.executor.open = async options => {
    const runtime = await open(options);
    return { ...runtime, async observe(input) { const snapshot = await runtime.observe(input); captured(); await gate; return snapshot; } };
  };
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', '检查');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.requests.length === 1);
    const context = [...native.contexts.values()][0];
    context.observation.requests = [{ id: 'question-one', kind: 'question', title: '旧快照中的问题' }];
    const waiting = f.service.conversations.read('workspace-one', chat.id);
    const observing = exact ? f.service.conversations.observeRun('workspace-one', chat.id, {expectedRevision:waiting.revision,runId:waiting.run!.id,participantId:waiting.run!.participantId,generation:waiting.run!.generation}) : f.service.conversations.observe('workspace-one', chat.id);
    await ready;
    native.sends[0].onEvent({ type: 'request-resolved', requestId: 'question-one' });
    release();
    const current = await observing;
    assert.equal(current.requests.length, 0);
    assert.equal(native.replies.length, 0);
  } finally { release(); await f.close(); }
});

for(const waiting of ['question','approval'] as const)test('same-selection ordinary input preserves the pending '+waiting+' in the original context',async()=>{
 const old=fake('local',{question:waiting==='question',request:waiting==='approval'}),f=fixture([old.executor]);try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','old goal');
  const before=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.requests.length===1);
  assert.throws(()=>send(f.service,chat.id,'local','new goal is not an answer'),{code:'agent_pending_response'});
  const after=f.service.conversations.read('workspace-one',chat.id);
  assert.equal(old.replies.length,0);assert.equal(old.contexts.size,1);assert.equal(old.sends.length,1);
  assert.deepEqual(after.run,before.run);assert.deepEqual(after.requests,before.requests);
 }finally{await f.close();}
});
