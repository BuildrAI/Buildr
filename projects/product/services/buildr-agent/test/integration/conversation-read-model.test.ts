import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ConversationRepository,CONVERSATION_SCHEMA_VERSION} from '../../src/persistence/conversation-repository.ts';
import {ConversationReadModel} from '../../src/persistence/conversation-read-model.ts';
import {BUSY_STATES,unfinishedRun,type StoredConversation} from '../../src/domain/agent-state.ts';

function fixture(t:TestContext){const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-read-model-'));const repo=new ConversationRepository(root);t.after(()=>{repo.stopReadModels();fs.rmSync(root,{recursive:true,force:true});});return repo;}
function record(id='one'):StoredConversation{return {view:{id,workspaceId:'ws',revision:'r1',title:'history',cwd:'/workspace',updatedAt:'2026-10-31T00:00:00Z',hidden:false,entries:[],requests:[],participants:[]},participants:[],sources:{},attempts:[],requests:{},attachments:{}};}
const run=(status='completed',tools:any[]=[])=>({id:'run',participantId:'p',provider:'codex' as const,generation:'g',status:status as any,accepted:true,tools,startedAt:'now',updatedAt:'now'});
function priorPending(r:StoredConversation,active:boolean){return Boolean(r.view.requests.length||r.view.retainedRuns?.some(unfinishedRun)||r.view.run?.tools.some(t=>t.status!=='completed')||(active?[...BUSY_STATES]:['unknown','tools-active']).includes(r.view.run?.status??'' as any));}

test('compact status exactly preserves pending semantics, including retained work and tools after completion',t=>{
 const repo=fixture(t);const records:StoredConversation[]=[];
 for(const status of ['starting','running','waiting-approval','waiting-question','stopping','stopped','unknown','tools-active','completed','failed']){
  for(const mode of ['none','tool','retained','request']){const r=record(status+mode);r.view.run=run(status,mode==='tool'?[{id:'t',label:'tool',status:'unknown'}]:[]);if(mode==='retained')r.view.retainedRuns=[run('completed',[{id:'old',label:'old tool',status:'running'}])];if(mode==='request')r.view.requests=[{id:'q'} as any];r.view.entries=[{id:'large',sequence:1,kind:'tool',role:'system',text:'x'.repeat(64*1024),createdAt:'now'}];repo.saveConversation(r);records.push(r);}
 }
 for(const active of [false,true]){assert.deepEqual(repo.listPendingStates(active).map(r=>r.view.id).sort(),records.filter(r=>priorPending(r,active)).map(r=>r.view.id).sort());assert.ok(repo.listPendingStates(active).every(r=>r.view.entries.length===0));}
 const db=new DatabaseSync(repo.filename,{readOnly:true});t.after(()=>db.close());
 for(const field of ['pending','active'])assert.match(JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN SELECT state FROM conversation_read_states WHERE ${field}=1 ORDER BY updated_at DESC`).all()),/USING INDEX conversation_read_/);
 assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,CONVERSATION_SCHEMA_VERSION);
 const old=new DatabaseSync(repo.filename);try{for(const r of records){r.view.revision+='-old';old.prepare('UPDATE conversations SET body=?,revision=? WHERE id=?').run(JSON.stringify(r),r.view.revision,r.view.id);}}finally{old.close();}
 for(const active of [false,true])assert.deepEqual(repo.listPendingStates(active).map(r=>r.view.id).sort(),records.filter(r=>priorPending(r,active)).map(r=>r.view.id).sort(),'old writer status must match all pending cases');
});

test('page reads retrieve a bounded suffix and every original entry remains reachable in order',t=>{
 const repo=fixture(t),r=record();r.view.entries=Array.from({length:1000},(_,i)=>({id:'e'+i,sequence:i+1,kind:i%2?'tool':'message',role:i%2?'system':'user',runId:'round'+Math.floor(i/10),text:'x'.repeat(i===999?100*1024:100),input:i===999?'command '+ 'a'.repeat(20000):undefined,createdAt:'now'}));repo.saveConversation(r);
 const compact=repo.readPage(r.view.id,undefined,undefined,true)!;assert.ok(compact.view.entries.length<=50);assert.ok(JSON.stringify(compact).length<256*1024);const last=compact.view.entries.at(-1)!;assert.ok(last.detail);assert.equal(repo.readEntry(r.view.id,last.id,last.detail!.revision)?.input,r.view.entries.at(-1)!.input);
 assert.throws(()=>repo.readEntry(r.view.id,last.id,'0'.repeat(64)),{code:'agent_entry_changed'});
 const all=[];let before: number|undefined;
 do{const page=repo.readPage(r.view.id,before)!;all.unshift(...page.view.entries);before=page.view.nextEntryCursor;}while(before!==undefined);
 assert.deepEqual(all,JSON.parse(JSON.stringify(r.view.entries)));assert.deepEqual(repo.readConversation(r.view.id)!.view.entries,JSON.parse(JSON.stringify(r.view.entries)));
});

test('old body-only writers update status atomically, invalidate pages and retain exact original content',t=>{
 const repo=fixture(t),r=record();r.view.entries=[{id:'tool',sequence:1,kind:'tool',role:'system',text:'x'.repeat(17000),createdAt:'now'}];repo.saveConversation(r);const preview=repo.readPage(r.view.id,undefined,undefined,true)!.view.entries[0];
 const db=new DatabaseSync(repo.filename);t.after(()=>db.close());r.view.run=run('waiting-question');r.view.revision='old-writer-2';r.view.entries[0].text+='new result';
 db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE conversations SET body=?,revision=? WHERE id=?').run(JSON.stringify(r),r.view.revision,r.view.id);
 const separate=new ConversationRepository(path.dirname(repo.filename));assert.equal(separate.listPendingStates().length,0,'uncommitted old output is not visible');separate.stopReadModels();db.exec('COMMIT');
 assert.equal(repo.listPendingStates(true)[0].view.revision,'old-writer-2');assert.equal(repo.readPage(r.view.id),undefined,'stale projected messages must never escape');
 assert.throws(()=>repo.readEntry(r.view.id,'tool',preview.detail!.revision),{code:'agent_entry_changed'});
 repo.rebuildReadModel(r.view.id);assert.deepEqual(repo.readPage(r.view.id)!.view.entries,r.view.entries);assert.equal(repo.readConversation(r.view.id)!.view.run?.status,'waiting-question');
 r.view.revision='old-writer-3';r.view.run=run('completed');db.prepare('UPDATE conversations SET body=?,revision=? WHERE id=?').run(JSON.stringify(r),r.view.revision,r.view.id);assert.equal(repo.listPendingStates(true).length,0);
});

test('migration preserves legacy bodies and user_version; plain legacy reads are zero-write',t=>{
 const repo=fixture(t),r=record();r.view.entries=[{id:'m',sequence:1,kind:'message',role:'user',text:'original',createdAt:'now'}];repo.saveConversation(r);
 const db=new DatabaseSync(repo.filename);db.exec('DROP TRIGGER conversation_read_legacy_0;DROP TRIGGER conversation_read_legacy_1;DROP TRIGGER conversation_read_delete;DROP TRIGGER conversation_read_activity;DROP TABLE conversation_read_states;DROP TABLE conversation_read_entries;');const body=db.prepare('SELECT body FROM conversations WHERE id=?').get(r.view.id)!.body;db.close();
 const before=fs.readFileSync(repo.filename);assert.equal(repo.readPage(r.view.id),undefined);repo.listPendingStates();assert.deepEqual(fs.readFileSync(repo.filename),before);
 repo.rebuildReadModel(r.view.id);const check=new DatabaseSync(repo.filename,{readOnly:true});t.after(()=>check.close());assert.equal(check.prepare('SELECT body FROM conversations WHERE id=?').get(r.view.id)!.body,body);assert.equal(check.prepare('PRAGMA user_version').get()!.user_version,CONVERSATION_SCHEMA_VERSION);assert.deepEqual(repo.readPage(r.view.id)!.view.entries,r.view.entries);
});

test('status and projected pages do not parse canonical bodies, even when unrelated history is unreadable',t=>{
 const repo=fixture(t),r=record();r.view.entries=[{id:'m',sequence:1,kind:'message',role:'user',text:'visible',createdAt:'now'}];repo.saveConversation(r);const other=record('unrelated');repo.saveConversation(other);
 const db=new DatabaseSync(repo.filename);t.after(()=>db.close());db.exec('DROP TRIGGER conversation_read_legacy_1;DROP INDEX conversations_list_summary;');db.prepare('UPDATE conversations SET body=?').run('invalid original body');
 assert.deepEqual(repo.listPendingStates(),[]);assert.equal(repo.hasUnfinishedWork(),false);assert.equal(repo.readPage(r.view.id)!.view.entries[0].text,'visible');
});

test('deleting a source removes only its projections and round inference matches legacy untagged entries',t=>{
 const repo=fixture(t),r=record();r.view.entries=[{id:'a',sequence:1,kind:'message',role:'user',text:'first',createdAt:'now'},{id:'b',sequence:2,kind:'tool',role:'system',runId:'native-round',text:'result',createdAt:'now'}];repo.saveConversation(r);assert.equal(repo.readPage(r.view.id)!.view.nextEntryCursor,undefined);
 const db=new DatabaseSync(repo.filename);t.after(()=>db.close());db.prepare('DELETE FROM conversations WHERE id=?').run(r.view.id);assert.equal(repo.readPage(r.view.id),undefined);assert.equal(db.prepare('SELECT count(*) AS n FROM conversation_read_entries').get()!.n,0);
 assert.ok(ConversationReadModel.available(db));
});

test('seen updates from new and retained writers reach projected pages and observation versions without reading history',t=>{
 const repo=fixture(t),r=record();repo.saveConversation(r);const prior=r.view.revision;r.view.revision='r2';r.view.entries.push({id:'u',sequence:1,kind:'message',role:'user',text:'new message',createdAt:'now'});repo.saveConversation(r,prior);
 const version=r.view.activity!.version;repo.markSeen('ws',r.view.id,version);assert.equal(repo.readPage(r.view.id)!.view.activity!.seenThrough,version);assert.equal(repo.readRevision(r.view.id)!.seenThrough,version);
 const db=new DatabaseSync(repo.filename);t.after(()=>db.close());const summary=JSON.parse((db.prepare('SELECT summary FROM conversations WHERE id=?').get(r.view.id) as any).summary);summary.activity.seenThrough=0;db.prepare('UPDATE conversations SET summary=? WHERE id=?').run(JSON.stringify(summary),r.view.id);assert.equal(repo.readRevision(r.view.id)!.seenThrough,0);assert.equal(repo.readPage(r.view.id)!.view.activity!.seenThrough,0);
 db.exec('DROP TRIGGER conversation_read_legacy_1;DROP INDEX conversations_list_summary;');db.prepare('UPDATE conversations SET body=?').run('unreadable original');assert.equal(repo.readPage(r.view.id)!.view.entries[0].text,'new message');assert.equal(repo.readRevision(r.view.id)!.seenThrough,0);
});
