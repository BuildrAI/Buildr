import { createAgentService } from '../../src/index.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { zstdCompressSync } from 'node:zlib';
import test from 'node:test';
import type { ConversationEntry } from '../../src/contracts.ts';
import { createNativeExecutors } from '../../src/executors/index.ts';
import { nativeToolReference } from '../../src/executors/native-content.ts';
import { NativeContentReader, nativeContentHash } from '../../src/storage/native-content.ts';
import { nativePreview } from '../../src/executors/native-process.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { ConversationEntryStore } from '../../src/persistence/conversation-entry-store.ts';
import { NativeContentStore } from '../../src/persistence/native-content-store.ts';
import { maintainNativeContent } from '../../src/application/native-content-maintenance.ts';
import { NativeContentResolver } from '../../src/application/native-content-resolver.ts';
import { ConversationAttachments } from '../../src/application/conversation-attachments.ts';
import { DatabaseSync } from 'node:sqlite';
import { StorageMaintenance } from '../../src/process/storage-maintenance.ts';
import { modelLeaseIdentity } from '../../src/model-access/model-preferences.ts';

function conversation(t: test.TestContext, provider = 'qoder') {
  const f=fixture(t,provider), repo=new ConversationRepository(f.root), runId=randomUUID(), participantId=randomUUID(), binding='fixture-binding';
  t.after(()=>repo.stopReadModels());
  f.entry.runId=runId;
  const r:StoredConversation={view:{id:randomUUID(),workspaceId:'ws',revision:'r1',cwd:f.cwd,title:'保留主线',updatedAt:'2026-11-03T00:00:00Z',hidden:false,requests:[],participants:[],entries:[
    {...f.entry},{id:randomUUID(),sequence:2,role:'user',kind:'message',text:'searchable visible message',createdAt:'now',runId}]},
    participants:[{id:participantId,connectionId:provider,provider,label:provider,bindingIdentity:binding,deliveredThrough:2,contextRef:{id:f.contextId,data:{native:opaqueReference(provider,f.contextId,f.cwd,binding)}}}],
    sources:{[participantId+':tool:'+f.toolId]:f.entry.id},attachments:{},requests:{},
    attempts:[{clientRequestId:'request',inputDigest:'digest',runId,participantId,through:2,userEntryId:'user',accepted:true,executionRef:{id:'execution',data:{resourceContext:f.contextId,resourceBinding:binding}}}],
    runOutcomes:{[runId]:{status:'completed',updatedAt:'now',provider}}};
  repo.saveConversation(r);
  return {...f,repo,r};
}

function fixture(t: test.TestContext, provider: string) {
  const dataRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'native-content-'))), root=path.join(dataRoot,'agent-service');
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const configRoot = path.join(root, 'connections', provider), contextId = (provider === 'dsh' ? 'session-' : '') + randomUUID(), cwd = '/exact/workspace';
  const output = randomBytes(9000).toString('hex'), input = 'exact command', toolId = 'native-call';
  let file: string, rows: any[];
  if (provider === 'codex') {
    file = path.join(configRoot, 'codex-home/sessions/2026/11/03', 'rollout-' + contextId + '.jsonl');
    rows = [{ type: 'session_meta', payload: { id: contextId, cwd } },
      { type: 'response_item', payload: { type: 'function_call', call_id: toolId, arguments: JSON.stringify({ cmd: input }) } },
      { type: 'response_item', payload: { type: 'function_call_output', call_id: toolId, output } }];
  } else if (provider === 'qoder') {
    file = path.join(configRoot, 'qoder-config/projects/bucket', contextId + '.jsonl');
    const meta = { sessionId: contextId, cwd, isSidechain: false };
    rows = [{ ...meta, type: 'assistant', message: { content: [{ type: 'tool_use', id: toolId, input: { command: input } }] } },
      { ...meta, type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolId, content: output }] } }];
  } else {
    file = path.join(configRoot, 'dsh-home/sessions/bucket', contextId, 'session.v4.jsonl.zstd');
    rows = [{ type: 'session', version: 4, id: contextId, cwd }, { seq: 0, type: 'tool/call', data: { callId: toolId, arguments: input } },
      { seq: 1, type: 'tool/result', data: { message: { toolCallId: toolId, content: [{ type: 'text', text: output }] } } }];
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const source = Buffer.from(rows.map(row => JSON.stringify(row) + '\n').join(''));
  fs.writeFileSync(file, provider === 'dsh' ? Buffer.concat(rows.map(row => zstdCompressSync(Buffer.from(JSON.stringify(row) + '\n')))) : source);
  const executor = createNativeExecutors().find(value => value.descriptor.id === provider)!;
  const read = () => executor.nativeContent!({ root, configRoot, contextId, cwd });
  const entry: ConversationEntry = { id: randomUUID(), sequence: 1, kind: 'tool', role: 'system', text: input + '\n' + nativePreview(output), input, provider, status: 'completed', createdAt: 'now' };
  return { dataRoot, root, configRoot, contextId, cwd, file, rows, source, executor, read, entry, output, toolId };
}

for (const provider of ['codex', 'qoder', 'dsh']) test(`${provider}: exact persisted fragments reconstruct original tool bytes without native execution`, t => {
  const f = fixture(t, provider), before = fs.readFileSync(f.file), inventory = f.read(); assert.ok(inventory);
  const reference = nativeToolReference(f.root, provider, f.contextId, f.toolId, f.entry, inventory); assert.ok(reference);
  const reader = new NativeContentReader(f.root), revision = nativeContentHash(JSON.stringify(f.entry));
  assert.deepEqual(reader.tool(reference, revision), f.entry);
  assert.equal(JSON.stringify(reference).includes(f.output), false);
  assert.equal(JSON.stringify(reference).length < JSON.stringify(f.entry).length / 2, true);
  assert.deepEqual(fs.readFileSync(f.file), before, 'read never repairs or writes native history');
  assert.equal(f.executor.nativeContent!({ root: f.root, configRoot: f.configRoot, contextId: f.contextId, cwd: '/other/workspace' }), undefined);
  assert.equal(nativeToolReference(f.root, provider, f.contextId, 'other-call', f.entry, inventory), undefined);
});

test('native references permit unrelated append and reject rewrites, missing files, links and changed content revision', t => {
  const f = fixture(t, 'qoder'), reference = nativeToolReference(f.root, 'qoder', f.contextId, f.toolId, f.entry, f.read()!)!;
  const reader = new NativeContentReader(f.root), revision = nativeContentHash(JSON.stringify(f.entry));
  assert.deepEqual(reader.tool(reference, revision), f.entry);
  fs.appendFileSync(f.file, JSON.stringify({ type: 'active-leaf', sessionId: f.contextId, leafUuid: 'future' }) + '\n');
  assert.deepEqual(reader.tool(reference, revision), f.entry);
  assert.throws(() => reader.tool(reference, '0'.repeat(64)), /原生正文/);
  fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replace('exact command', 'other command'));
  assert.throws(() => reader.tool(reference, revision), /原生正文/);
  fs.unlinkSync(f.file); assert.throws(() => reader.tool(reference, revision), /原生正文/);
  const external = path.join(f.root, 'external'); fs.writeFileSync(external, f.source); fs.symlinkSync(external, f.file);
  assert.throws(() => reader.tool(reference, revision), /原生正文/);
  fs.unlinkSync(f.file); fs.linkSync(external, f.file); assert.throws(() => reader.tool(reference, revision), /原生正文/);
});

test('native image values return independently persisted bytes and reject private namespace escape', t => {
  const f = fixture(t, 'qoder'), image = Buffer.from('original-image-bytes');
  const row = { sessionId: f.contextId, cwd: f.cwd, isSidechain: false, type: 'user', message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: image.toString('base64') } }] } };
  fs.appendFileSync(f.file, JSON.stringify(row) + '\n');
  const found = f.read()!.images[0]!;
  const reference = { version: 1 as const, provider: 'qoder', contextId: f.contextId, value: found.value, size: image.length, sha256: nativeContentHash(image) };
  const reader = new NativeContentReader(f.root); assert.deepEqual(reader.attachment(reference), image);
  const escaped = structuredClone(reference); escaped.value.source.path = 'connections/qoder/qoder-config/auth.json';
  assert.throws(() => reader.attachment(escaped), /原生正文/);
  const oversized = structuredClone(reference); oversized.value.source.length = 1024 * 1024 * 1024;
  assert.throws(() => reader.attachment(oversized), /原生正文/);
});

test('settled tools move once, preserve detail/history/search/fork bytes and keep controls usable after external loss', t=>{
  const f=conversation(t), original=structuredClone(f.r), nativeBefore=fs.readFileSync(f.file);
  const result=maintainNativeContent(f.dataRoot); assert.equal(result.diagnostic,undefined); assert.equal(result.tools,1); assert.ok(result.contentBytesSaved>1024);
  assert.equal(maintainNativeContent(f.dataRoot).tools,0);
  const db=new DatabaseSync(f.repo.filename);t.after(()=>db.close());
  const content=db.prepare("SELECT * FROM conversation_entry_contents WHERE codec LIKE 'native-%'").get()!;
  assert.ok(content); assert.equal(Buffer.from(content.body as Uint8Array).includes(Buffer.from(f.output)),false);
  const revision=String(content.content_revision);
  const preview=f.repo.readPage(f.r.view.id,undefined,undefined,true)!.view.entries[0]; assert.equal(preview.detail!.revision,revision);
  assert.deepEqual(f.repo.readEntry(f.r.view.id,f.entry.id,revision),original.view.entries[0]);
  const service=createAgentService({dataRoot:f.dataRoot,executors:[],modelProviders:[],resolveWorkspace:()=>({rootPath:f.cwd}),assertTask:()=>{}});t.after(()=>service.close());
  assert.equal(service.conversations.read('ws',f.r.view.id,{compactTools:true}).entries[0]!.detail!.revision,revision);
  assert.equal(service.conversations.readEntry('ws',f.r.view.id,f.entry.id,revision).text,original.view.entries[0]!.text);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries,original.view.entries);
  assert.deepEqual(structuredClone(f.repo.readConversation(f.r.view.id)!.view.entries),original.view.entries,'fork and handoff consumers receive original text');
  assert.equal(f.repo.querySummaries(['ws'],{query:'searchable',limit:10}).total,1);
  assert.deepEqual(fs.readFileSync(f.file),nativeBefore);
  const stale=f.repo.readConversation(f.r.view.id)!; fs.unlinkSync(f.file);
  assert.equal(f.repo.readPage(f.r.view.id,undefined,undefined,true)!.view.entries[0].detail!.revision,revision);
  assert.throws(()=>f.repo.readEntry(f.r.view.id,f.entry.id,revision),{code:'agent_native_content_unavailable'});
  assert.throws(()=>structuredClone(f.repo.readConversation(f.r.view.id)!.view.entries),{code:'agent_native_content_unavailable'});
  stale.view.revision='r2';stale.view.title='控制字段仍可保存'; f.repo.saveConversation(stale,'r1');
  f.repo.rebuildReadModel(f.r.view.id);
  assert.equal(f.repo.readState(f.r.view.id)!.view.title,'控制字段仍可保存');
  assert.equal(db.prepare("SELECT count(*) AS n FROM conversation_entry_contents WHERE codec LIKE 'native-%'").get()!.n,1,'save never replaces unavailable body with an empty preview');
});

test('a stable tool can use native bytes in an unknown round while stale conversions cannot overwrite new input',t=>{
  const f=conversation(t); f.r.runOutcomes![f.entry.runId!]!.status='unknown';f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  assert.equal(maintainNativeContent(f.dataRoot).tools,1);
  assert.equal(f.repo.readConversation(f.r.view.id)!.runOutcomes![f.entry.runId!]!.status,'unknown');
  f.r.runOutcomes![f.entry.runId!]!.status='completed';f.r.view.revision='r3';f.repo.saveConversation(f.r,'r2');
  const store=new NativeContentStore(f.repo.filename,true);t.after(()=>store.close());const row=store.entries(0,10)[0]!;
  const reference=nativeToolReference(f.root,'qoder',f.contextId,f.toolId,f.entry,f.read()!)!;
  let changed=false; assert.equal(store.replaceTool(row,reference,()=>false),false);
  f.r.view.entries.push({id:'new-input',sequence:3,kind:'message',role:'user',text:'new input retained',createdAt:'later'});f.r.view.revision='r4';f.repo.saveConversation(f.r,'r3');
  assert.equal(store.replaceTool(row,reference,()=>{changed=true;return true;}),false);assert.equal(changed,false);
  assert.equal(maintainNativeContent(f.dataRoot).tools,0);
  assert.equal(f.repo.readPage(f.r.view.id)!.view.entries.at(-1)!.text,'new input retained');
});

test('v5 upgrade preserves normalized bodies and rejects a retained old writer before reference conversion',t=>{
  const f=conversation(t);const db=new DatabaseSync(f.repo.filename);
  db.exec("DROP TRIGGER conversation_body_format_insert; DROP TRIGGER conversation_body_format_update; UPDATE conversations SET body=json_set(body,'$._bodyFormat',5); PRAGMA user_version=5");
  const original=f.repo.readPage(f.r.view.id)!.view.entries;
  assert.equal(maintainNativeContent(f.dataRoot).diagnostic,'native_content_maintenance_deferred','maintenance cannot silently upgrade an old live store');
  f.repo.startReadModels();assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,7);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries,original);
  assert.equal(fs.readdirSync(f.root).some(name=>name.startsWith('conversations.pre-v7-')),false);
  assert.throws(()=>db.prepare("UPDATE conversations SET body=json_set(body,'$._bodyFormat',5)").run(),/agent_storage_writer_incompatible/);db.close();
});

test('native image bytes serve directly, materialize only when needed, ignore legacy paths and survive stale saves',t=>{
  const f=conversation(t), id=randomUUID(), bytes=randomBytes(2048), filename=path.join(f.root,'attachments',f.r.view.id,id);
  fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes);
  f.r.attachments[id]={size:bytes.length,mimeType:'image/png'};f.r.view.entries[1]!.attachments=[id];
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');const stale=f.repo.readConversation(f.r.view.id)!;
  fs.appendFileSync(f.file,JSON.stringify({type:'runtime-config',sessionId:f.contextId,model:'fixture'})+'\n');
  fs.appendFileSync(f.file,JSON.stringify({sessionId:f.contextId,cwd:f.cwd,isSidechain:false,type:'user',message:{content:[{type:'image',source:{type:'base64',data:bytes.toString('base64')}}]}})+'\n');
  const issued=path.join(f.root,'handoff-materials','issued.txt');fs.mkdirSync(path.dirname(issued));fs.writeFileSync(issued,filename);
  const result=maintainNativeContent(f.dataRoot);assert.equal(result.attachments,1,'legacy handoff paths no longer retain a duplicate');assert.ok(fs.existsSync(issued));fs.unlinkSync(issued);
  assert.equal(result.attachments,1);assert.ok(result.attachmentBytesRemoved>=bytes.length);assert.equal(fs.existsSync(filename),false);
  const record=f.repo.readConversation(f.r.view.id)!, media=new ConversationAttachments({root:f.root,now:()=>new Date().toISOString(),save:()=>{}});
  assert.deepEqual(media.read(record,id).bytes,bytes);assert.equal(fs.existsSync(path.join(f.root,'attachment-cache')),false,'byte reads do not create another file');
  const materialized=media.get(record,id);assert.deepEqual(fs.readFileSync(materialized.path),bytes);assert.notEqual(materialized.path,filename);
  stale.view.revision='r3';stale.view.title='concurrent stale metadata save';f.repo.saveConversation(stale,'r2');
  assert.ok(f.repo.readState(record.view.id)!.attachments[id]!.nativeContent);assert.deepEqual(media.read(f.repo.readState(record.view.id)!,id).bytes,bytes);
  fs.writeFileSync(issued,materialized.path);
  const before=new Date(Date.now()-20*60_000);fs.utimesSync(materialized.path,before,before);maintainNativeContent(f.dataRoot);assert.equal(fs.existsSync(materialized.path),false,'legacy paths no longer prevent cold materialization reclamation');
  const target=structuredClone(record);target.view.id=randomUUID();target.attachments={};media.inherit(record,target,[id]);assert.deepEqual(media.read(target,id).bytes,bytes);assert.ok(target.attachments[id]!.nativeContent);
  assert.equal(fs.existsSync(path.join(f.root,'attachments',target.view.id,id)),false,'native inheritance does not copy image bytes');
  fs.unlinkSync(f.file);assert.throws(()=>media.read(record,id),{code:'agent_native_content_unavailable'});assert.throws(()=>media.read(target,id),{code:'agent_native_content_unavailable'});
});

test('the existing automatic maintenance worker converts a settled copy without any model or CLI request',async t=>{
  const f=conversation(t), before=fs.readFileSync(f.file), maintenance=new StorageMaintenance(f.dataRoot,{initialMs:1,intervalMs:60000});t.after(()=>maintenance.close());
  const deadline=Date.now()+15000;let converted=false;
  while(Date.now()<deadline){const db=new DatabaseSync(f.repo.filename,{readOnly:true});converted=!!db.prepare("SELECT 1 FROM conversation_entry_contents WHERE codec LIKE 'native-%'").get();db.close();if(converted)break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(converted,true);assert.deepEqual(fs.readFileSync(f.file),before);assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries[0],f.entry);
});


test('unsent media and DSH attachment handles retain the unique local bytes',t=>{
  const f=conversation(t,'dsh'), id=randomUUID(), bytes=randomBytes(2048), filename=path.join(f.root,'attachments',f.r.view.id,id);
  fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes);
  f.r.attachments[id]={size:bytes.length,mimeType:'image/png'};
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  assert.equal(maintainNativeContent(f.dataRoot).attachments,0);assert.ok(fs.existsSync(filename),'unsent bytes stay local');
  f.r.view.entries[1]!.attachments=[id];f.r.view.revision='r3';f.repo.saveConversation(f.r,'r2');
  fs.appendFileSync(f.file,zstdCompressSync(Buffer.from(JSON.stringify({seq:2,type:'user/message',data:{content:[{type:'image',attachment:{attachmentId:id,mediaType:'image/png',bytes:bytes.length}}]}})+'\n')));
  assert.equal(f.read()!.images.length,0,'opaque DSH attachment handles do not prove independent readable bytes');
  assert.equal(maintainNativeContent(f.dataRoot).attachments,0);assert.ok(fs.existsSync(filename),'missing independent native media is not a reference');
});


test('discovery rejects a concurrent growing native file within its original byte allocation',t=>{
  const f=fixture(t,'qoder'), read=fs.readSync;let changed=false;
  const mock=t.mock.method(fs,'readSync',(...args:any[])=>{
    if (!changed) { changed=true;fs.appendFileSync(f.file,JSON.stringify({type:'runtime-config',sessionId:f.contextId})+'\n'); }
    return (read as any)(...args);
  });
  assert.equal(f.read(),undefined);mock.mock.restore();assert.equal(changed,true);assert.ok(f.read());
});


test('incremental maintenance physically returns free database pages within its per-pass budget',t=>{
  const f=conversation(t),db=new DatabaseSync(f.repo.filename);
  db.exec('CREATE TABLE disposable_fixture(body BLOB); INSERT INTO disposable_fixture VALUES(randomblob(6*1024*1024)); PRAGMA wal_checkpoint(TRUNCATE)');
  assert.equal(db.prepare('PRAGMA auto_vacuum').get()!.auto_vacuum,2);
  const before=fs.statSync(f.repo.filename).size;
  db.exec('DELETE FROM disposable_fixture');
  const store=new NativeContentStore(f.repo.filename,true);t.after(()=>store.close());
  const reclaimed=store.reclaim();assert.ok(reclaimed>0 && reclaimed<=2*1024*1024);
  const after=fs.statSync(f.repo.filename).size;assert.equal(before-after,reclaimed);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries,f.r.view.entries);
  db.close();
});

test('Codex quoted inner JSON and partially persisted output keep only necessary residual bytes',t=>{
  const f=conversation(t,'codex'),command='printf "quoted"\nprintf \'next\'\n',output=randomBytes(12000).toString('hex');
  f.rows[1].payload.arguments=JSON.stringify({cmd:command});
  f.rows[2].payload.output='Execution metadata\nOutput:\n'+output.slice(0,8000)+'\n[model omitted middle]\n'+output.slice(-2000);
  fs.writeFileSync(f.file,f.rows.map(row=>JSON.stringify(row)+'\n').join(''));
  f.entry.input='/bin/zsh -lc '+JSON.stringify(command);f.entry.text=f.entry.input+'\n'+nativePreview(output);
  f.r.view.entries[0]={...f.entry};f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  const before=fs.readFileSync(f.file),result=maintainNativeContent(f.dataRoot);
  assert.equal(result.tools,1);assert.ok(result.localResidualBytes>0);assert.ok(result.localResidualBytes<Buffer.byteLength(f.entry.text));
  assert.equal(result.reasons['codex:convertible_partial']!.items,1);
  const db=new DatabaseSync(f.repo.filename);t.after(()=>db.close());
  const row=db.prepare("SELECT * FROM conversation_entry_contents WHERE codec LIKE 'native-%'").get() as any;
  const reference=ConversationEntryStore.reference(row)!;
  assert.ok(reference.input!.some(part=>'source'in part&&part.jsonPointer?.includes('cmd')));
  assert.deepEqual(f.repo.readEntry(f.r.view.id,f.entry.id,row.content_revision),f.entry);
  assert.deepEqual(fs.readFileSync(f.file),before);
  const metadata=f.repo.readConversation(f.r.view.id)!;metadata.view.entries[0]!.name='updated display name';metadata.view.revision='r3';
  f.repo.saveConversation(metadata,'r2');
  assert.equal(db.prepare("SELECT count(*) n FROM conversation_entry_contents WHERE codec LIKE 'native-%'").get()!.n,1,'late metadata does not recreate the full body');
  const updated=f.repo.readPage(f.r.view.id,undefined,10,true)!.view.entries[0]!;
  assert.equal(f.repo.readEntry(f.r.view.id,f.entry.id,updated.detail!.revision)!.name,'updated display name');
  fs.unlinkSync(f.file);assert.throws(()=>f.repo.readEntry(f.r.view.id,f.entry.id,updated.detail!.revision),{code:'agent_native_content_unavailable'});
});

test('historical context remains eligible while a newer context of the same participant is protected',t=>{
  const f=conversation(t),participant=f.r.participants[0]!,newer=randomUUID();
  participant.contextRef={id:newer,data:{native:opaqueReference('qoder',newer,f.cwd,participant.bindingIdentity)}};
  f.r.attempts.push({...f.r.attempts[0]!,runId:'newer-unknown',clientRequestId:'newer-request',executionRef:{id:'newer-execution',data:{resourceContext:newer,resourceBinding:participant.bindingIdentity}}});
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  assert.ok(f.repo.storageDependencies().contexts.includes('qoder:'+newer));
  assert.equal(maintainNativeContent(f.dataRoot).tools,1);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries[0],f.entry);
});

test('legacy missing context is located by its unique native tool id within the exact configuration',t=>{
  const f=conversation(t),participant=f.r.participants[0]!,newer=randomUUID();
  participant.contextRef={id:newer,data:{native:opaqueReference('qoder',newer,f.cwd,participant.bindingIdentity)}};
  f.r.attempts[0]!.executionRef={id:'legacy-turn-without-context'};
  const foreign=path.join(f.root,'connections/qoder/model-bindings','0'.repeat(64),'qoder-config/projects/bucket',path.basename(f.file));
  fs.mkdirSync(path.dirname(foreign),{recursive:true});fs.copyFileSync(f.file,foreign);
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  assert.equal(maintainNativeContent(f.dataRoot).tools,1);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries[0],f.entry);
});

test('a profitable tool below four KiB is converted using actual stored size',t=>{
  const f=conversation(t),output=randomBytes(1450).toString('hex');
  f.rows[1].message.content[0].content=output;fs.writeFileSync(f.file,f.rows.map(row=>JSON.stringify(row)+'\n').join(''));
  f.entry.text=f.entry.input+'\n'+output;f.r.view.entries[0]={...f.entry};
  assert.ok(Buffer.byteLength(JSON.stringify(f.entry))<4096);
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  assert.equal(maintainNativeContent(f.dataRoot).tools,1);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries[0],f.entry);
});

test('unmatched contexts cannot permanently starve later convertible contexts',t=>{
  const first=conversation(t);
  for(let i=0;i<10;i++) {
    const f=i===0?first:conversation(t);
    if(i<8){f.rows[0].message.content[0].id='unmatched-'+i;f.rows[1].message.content[0].tool_use_id='unmatched-'+i;}
    const file=path.join(first.root,path.relative(f.root,f.file));fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,f.rows.map(row=>JSON.stringify(row)+'\n').join(''));
    if(i)first.repo.saveConversation(f.r);
  }
  const initial=maintainNativeContent(first.dataRoot,{maximumItems:1024,budgetMs:60000});
  assert.equal(initial.tools,0);assert.ok(initial.nextEntry>0);assert.equal(initial.reasons['qoder:native_tool_not_found']!.items,8);
  const next=maintainNativeContent(first.dataRoot,{maximumItems:1024,budgetMs:60000});
  assert.equal(next.tools,2);assert.equal(next.nextEntry,0);
});

test('v6 reference migration verifies persisted bytes even when the native source has gone',t=>{
  const f=conversation(t);assert.equal(maintainNativeContent(f.dataRoot).tools,1);
  const db=new DatabaseSync(f.repo.filename);t.after(()=>db.close());
  const row=db.prepare("SELECT * FROM conversation_entry_contents WHERE codec LIKE 'native-%'").get() as any;
  const reference=ConversationEntryStore.reference(row)!;reference.version=1;
  db.prepare("UPDATE conversation_entry_contents SET codec='native-v1',body=? WHERE content_revision=?").run(JSON.stringify(reference),row.content_revision);
  db.exec("DROP TRIGGER conversation_body_format_insert; DROP TRIGGER conversation_body_format_update; UPDATE conversations SET body=json_set(body,'$._bodyFormat',6); PRAGMA user_version=6");
  fs.unlinkSync(f.file);f.repo.startReadModels();
  assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,7);
  assert.equal(db.prepare("SELECT count(*) n FROM conversation_entry_contents WHERE codec='native-v1'").get()!.n,1);
  assert.equal(fs.readdirSync(f.root).some(name=>name.startsWith('conversations.pre-v7-')),false,'verified migration backup does not retain another database copy');
  assert.throws(()=>db.prepare("UPDATE conversations SET body=json_set(body,'$._bodyFormat',6)").run(),/agent_storage_writer_incompatible/);
  assert.throws(()=>f.repo.readEntry(f.r.view.id,f.entry.id,row.content_revision),{code:'agent_native_content_unavailable'});
});

test('Codex legacy display ids use exact native command evidence without changing run identity',t=>{
  const f=conversation(t,'codex'),run=f.entry.runId,command='printf "legacy exact command"';
  f.rows.splice(1,0,{type:'turn_context',payload:{turn_id:'native-turn'}});
  f.rows[2].payload.arguments=JSON.stringify({cmd:command});
  fs.writeFileSync(f.file,f.rows.map(row=>JSON.stringify(row)+'\n').join(''));
  f.entry.input='/bin/zsh -lc '+JSON.stringify(command);f.entry.text=f.entry.input+'\n'+nativePreview(f.output);f.r.view.entries[0]={...f.entry};
  f.r.sources={[f.r.participants[0]!.id+':tool:exec_command:70#c26aad']:f.entry.id};
  f.r.attempts[0]!.executionRef={id:'native-turn'};
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  assert.equal(maintainNativeContent(f.dataRoot).tools,1);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries[0],f.entry);
  assert.equal(f.repo.readConversation(f.r.view.id)!.attempts[0]!.runId,run);
});

test('inherited tool bytes resolve through their recorded parent without using child configuration',t=>{
  const f=conversation(t),child=structuredClone(f.r);
  child.view.id=randomUUID();child.view.entries=[];child.view.childOf={conversationId:f.r.view.id,workspaceId:'ws',title:'source',createdAt:'now',sourceRevision:'r1',throughSequence:2};
  child.inheritedContext={entries:[structuredClone(f.entry)],outcomes:structuredClone(f.r.runOutcomes!),pendingQuestions:[]};
  child.sources={};child.participants=[];child.attempts=[];child.runOutcomes={};
  f.repo.saveConversation(child);
  assert.equal(maintainNativeContent(f.dataRoot).tools,2);
  assert.deepEqual(f.repo.readConversation(child.view.id)!.inheritedContext!.entries[0],f.entry);
});

test('permission-bound Codex configuration resolves only after its persisted digest verifies the gateway value',t=>{
  const f=conversation(t,'codex'),p=f.r.participants[0]!,configuration=JSON.stringify(['standard:262000',262000]);
  p.modelAccountId='account';p.modelAccountIdentity='account-identity';p.modelId='swe-2';p.serviceTier='standard:262000';
  p.modelConfiguration=nativeContentHash(JSON.stringify({model:configuration,permission:'full-access'}));
  const identity=modelLeaseIdentity(p.modelAccountId,p.modelAccountIdentity,p.modelId,f.r.view.id,p.connectionId,configuration);
  const target=path.join(f.configRoot,'model-bindings',nativeContentHash(identity),path.relative(f.configRoot,f.file));
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.renameSync(f.file,target);
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  assert.equal(maintainNativeContent(f.dataRoot).tools,1);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries[0],f.entry);
});

test('new permission-bound participants retain the exact lease configuration without reversing a digest',t=>{
  const f=conversation(t,'codex'),p=f.r.participants[0]!,configuration=JSON.stringify(['default',500000]);
  p.modelAccountId='account';p.modelAccountIdentity='identity';p.modelId='model';p.serviceTier='default';
  p.modelConfiguration=nativeContentHash(JSON.stringify({model:configuration,permission:'full-access'}));p.modelLeaseConfiguration=configuration;
  const identity=modelLeaseIdentity(p.modelAccountId,p.modelAccountIdentity,p.modelId,f.r.view.id,p.connectionId,configuration);
  const target=path.join(f.configRoot,'model-bindings',nativeContentHash(identity),path.relative(f.configRoot,f.file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.renameSync(f.file,target);
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  const resolver=new NativeContentResolver(f.root);assert.ok(resolver.tool(f.r,f.entry));
  p.modelLeaseConfiguration=JSON.stringify(['default',1]);assert.equal(resolver.tool(f.r,f.entry),undefined,'conflicting stored policy/config values are not a native address');
});

test('DSH persisted digest media deduplicates identical bytes and rejects a normalized or changed object',t=>{
  const f=conversation(t,'dsh'),id=randomUUID(),bytes=randomBytes(2048),hash=nativeContentHash(bytes);
  const filename=path.join(f.root,'attachments',f.r.view.id,id),object=path.join(f.configRoot,'dsh-home/attachments/v1/objects',hash.slice(0,2),hash);
  for(const file of [filename,object]){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
  f.r.attachments[id]={size:bytes.length,mimeType:'image/png'};f.r.view.entries[1]!.attachments=[id];
  fs.appendFileSync(f.file,zstdCompressSync(Buffer.from(JSON.stringify({seq:2,type:'user/message',data:{content:[{type:'image',attachment:{attachmentId:'sha256:'+hash,mediaType:'image/png',bytes:bytes.length}}]}})+'\n')));
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  assert.equal(f.read()!.images.length,1);
  assert.equal(maintainNativeContent(f.dataRoot).attachments,1);assert.equal(fs.existsSync(filename),false);
  const media=new ConversationAttachments({root:f.root,now:()=>new Date().toISOString(),save:()=>{}});
  assert.deepEqual(media.read(f.repo.readConversation(f.r.view.id)!,id).bytes,bytes);
  fs.writeFileSync(object,randomBytes(bytes.length));assert.equal(f.read()!.images.length,0);
  assert.throws(()=>media.read(f.repo.readConversation(f.r.view.id)!,id),{code:'agent_native_content_unavailable'});
});

test('attachment lookup resumes inside historical contexts after its context budget',t=>{
  const f=conversation(t),p=f.r.participants[0]!,id=randomUUID(),bytes=randomBytes(2048);
  const filename=path.join(f.root,'attachments',f.r.view.id,id);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes);
  f.r.attachments[id]={size:bytes.length,mimeType:'image/png'};f.r.view.entries[1]!.attachments=[id];
  for(let i=0;i<9;i++){
    const context=randomUUID(),runId=randomUUID(),file=path.join(path.dirname(f.file),context+'.jsonl');
    fs.writeFileSync(file,JSON.stringify({sessionId:context,cwd:f.cwd,isSidechain:false,type:'user',message:{content:i===8?[{type:'image',source:{type:'base64',data:bytes.toString('base64')}}]:[]}})+'\n');
    f.r.attempts.push({...f.r.attempts[0]!,runId,clientRequestId:runId,executionRef:{id:runId,data:{resourceContext:context,resourceBinding:p.bindingIdentity}}});
    f.r.runOutcomes![runId]={status:'completed',updatedAt:'now',provider:p.provider};
  }
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  const first=maintainNativeContent(f.dataRoot);assert.equal(first.attachments,0);assert.ok(first.nextAttachment.includes('#0.8'));
  const second=maintainNativeContent(f.dataRoot);assert.equal(second.attachments,1);assert.equal(second.nextAttachment,'');
  assert.equal(fs.existsSync(filename),false);
});

test('an unconfirmed round keeps its state while its stable tool body can use a proven native source',t=>{
  const f=conversation(t),p=f.r.participants[0]!,newer=randomUUID();
  p.contextRef={id:newer,data:{native:opaqueReference('qoder',newer,f.cwd,p.bindingIdentity)}};
  f.r.attempts[0]!.executionRef={id:'old-turn-without-context'};delete f.r.runOutcomes![f.entry.runId!];
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  const result=maintainNativeContent(f.dataRoot);assert.equal(result.tools,1);
  assert.equal(f.repo.readConversation(f.r.view.id)!.runOutcomes![f.entry.runId!],undefined,'a byte reference is not a run outcome');
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries[0],f.entry);
});

test('normal persistence writes native references immediately and retries a not-yet-durable result later',t=>{
  const f=conversation(t,'codex');
  const resolver=new NativeContentResolver(f.root,id=>f.repo.readConversation(id));
  const repo=new ConversationRepository(f.root,(record,entry)=>resolver.tool(record,entry));t.after(()=>repo.stopReadModels());
  const record=repo.readConversation(f.r.view.id)!;
  record.view.entries[0]={...f.entry,name:'saved from native first'};record.view.revision='r2';repo.saveConversation(record,'r1');
  const db=new DatabaseSync(repo.filename);t.after(()=>db.close());
  assert.equal(db.prepare("SELECT count(*) n FROM conversation_entry_contents WHERE codec LIKE 'native-%'").get()!.n,1);
  assert.deepEqual(repo.readPage(record.view.id)!.view.entries[0],record.view.entries[0]);
  const pending={...f.entry,id:randomUUID(),sequence:3,text:f.entry.input+'\n'+randomBytes(2048).toString('hex')};
  record.sources[record.participants[0]!.id+':tool:delayed-native']=pending.id;record.view.entries.push(pending);
  record.view.revision='r3';repo.saveConversation(record,'r2');
  const current=db.prepare('SELECT c.* FROM conversation_entry_contents c JOIN conversation_read_entries e USING(conversation_id,content_revision) WHERE e.id=?').get(pending.id) as any;
  assert.ok(!current.codec.startsWith('native-'),'not-yet-durable result remains temporarily readable');
  fs.appendFileSync(f.file,JSON.stringify({type:'response_item',payload:{type:'function_call',call_id:'delayed-native',arguments:JSON.stringify({cmd:pending.input})}})+'\n'+JSON.stringify({type:'response_item',payload:{type:'function_call_output',call_id:'delayed-native',output:pending.text.slice(pending.input!.length+1)}})+'\n');
  assert.equal(maintainNativeContent(f.dataRoot).tools,1);
  assert.deepEqual(repo.readEntry(record.view.id,pending.id,current.content_revision),pending);
});

test('active image bytes promote to a native reference while the issued path remains temporary and stable',t=>{
  const f=conversation(t),id=randomUUID(),bytes=randomBytes(2048),filename=path.join(f.root,'attachments',f.r.view.id,id),p=f.r.participants[0]!;
  fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes);
  f.r.attachments[id]={size:bytes.length,mimeType:'image/png'};f.r.view.entries[1]!.attachments=[id];
  f.r.view.run={id:f.entry.runId!,participantId:p.id,provider:p.provider,generation:'g',status:'running',accepted:true,tools:[],startedAt:'now',updatedAt:'now'};
  fs.appendFileSync(f.file,JSON.stringify({sessionId:f.contextId,cwd:f.cwd,isSidechain:false,type:'user',message:{content:[{type:'image',source:{type:'base64',data:bytes.toString('base64')}}]}})+'\n');
  f.r.view.revision='r2';f.repo.saveConversation(f.r,'r1');
  const result=maintainNativeContent(f.dataRoot);assert.equal(result.attachmentReferences,1);assert.equal(result.attachments,0);assert.ok(fs.existsSync(filename));
  const saved=f.repo.readConversation(f.r.view.id)!,media=new ConversationAttachments({root:f.root,now:()=>new Date().toISOString(),save:()=>{}});
  assert.ok(saved.attachments[id]!.nativeContent);assert.equal(media.get(saved,id).path,filename);
  saved.view.run!.status='completed';saved.view.run!.resourcesReleased=true;saved.view.revision='r3';f.repo.saveConversation(saved,'r2');
  fs.utimesSync(filename,1,1);assert.equal(maintainNativeContent(f.dataRoot).attachments,1);assert.equal(fs.existsSync(filename),false);
  assert.deepEqual(media.read(f.repo.readConversation(f.r.view.id)!,id).bytes,bytes);
});

test('unrelated incomplete recovery metadata cannot retain a proven stable tool body',t=>{
  const f=conversation(t),other=structuredClone(f.r);other.view.id=randomUUID();
  f.repo.saveConversation(other);
  const db=new DatabaseSync(f.repo.filename);t.after(()=>db.close());
  db.prepare("UPDATE conversations SET body=json_set(body,'$.attempts[0].participantId','missing-participant') WHERE id=?").run(other.view.id);
  assert.equal(f.repo.storageDependencies().complete,false);
  const result=maintainNativeContent(f.dataRoot);assert.equal(result.diagnostic,undefined);assert.equal(result.tools,1);
  assert.deepEqual(f.repo.readPage(f.r.view.id)!.view.entries[0],f.entry);
});
