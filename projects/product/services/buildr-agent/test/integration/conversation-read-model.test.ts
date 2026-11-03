import {createAgentService} from '../../src/application/agent-service.ts';
import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ConversationRepository,CONVERSATION_SCHEMA_VERSION} from '../../src/persistence/conversation-repository.ts';
import {ConversationReadModel} from '../../src/persistence/conversation-read-model.ts';
import {ConversationEntryStore} from '../../src/persistence/conversation-entry-store.ts';
import {writeLegacyConversationDatabase} from '../support/legacy-conversation-database.ts';
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
 const old=new DatabaseSync(repo.filename);try{for(const r of records){r.view.revision+='-old';assert.throws(()=>old.prepare('UPDATE conversations SET body=?,revision=? WHERE id=?').run(JSON.stringify(r),r.view.revision,r.view.id),/agent_storage_writer_incompatible/);}}finally{old.close();}
 for(const active of [false,true])assert.deepEqual(repo.listPendingStates(active).map(r=>r.view.id).sort(),records.filter(r=>priorPending(r,active)).map(r=>r.view.id).sort(),'old writer status must match all pending cases');
});

test('thinking entries keep their process-only flag through the read model',t=>{
 const repo=fixture(t),r=record();r.view.entries=[{id:'think',sequence:1,kind:'message',role:'assistant',text:'内部推理',thinking:true,createdAt:'now'},{id:'say',sequence:2,kind:'message',role:'assistant',text:'答复',createdAt:'now'}];repo.saveConversation(r);
 const page=repo.readPage(r.view.id)!;
 assert.deepEqual(page.view.entries.map(entry=>[entry.id,entry.thinking===true,entry.text]),[['think',true,'内部推理'],['say',false,'答复']]);
});

test('page reads retrieve a bounded suffix and every original entry remains reachable in order',t=>{
 const repo=fixture(t),r=record();r.view.entries=Array.from({length:1000},(_,i)=>({id:'e'+i,sequence:i+1,kind:i%2?'tool':'message',role:i%2?'system':'user',runId:'round'+Math.floor(i/10),text:'x'.repeat(i===999?100*1024:100),input:i===999?'command '+ 'a'.repeat(20000):undefined,createdAt:'now'}));repo.saveConversation(r);
 const compact=repo.readPage(r.view.id,undefined,undefined,true)!;assert.ok(compact.view.entries.length<=50);assert.ok(JSON.stringify(compact).length<256*1024);const last=compact.view.entries.at(-1)!;assert.ok(last.detail);assert.equal(repo.readEntry(r.view.id,last.id,last.detail!.revision)?.input,r.view.entries.at(-1)!.input);
 assert.throws(()=>repo.readEntry(r.view.id,last.id,'0'.repeat(64)),{code:'agent_entry_changed'});
 const all=[];let before: number|undefined;
 do{const page=repo.readPage(r.view.id,before)!;all.unshift(...page.view.entries);before=page.view.nextEntryCursor;}while(before!==undefined);
 assert.deepEqual(all,JSON.parse(JSON.stringify(r.view.entries)));assert.deepEqual(repo.readConversation(r.view.id)!.view.entries,JSON.parse(JSON.stringify(r.view.entries)));
});

test('normalized writers update positions atomically and stale pages retain revision protection',t=>{
 const repo=fixture(t),r=record();r.view.entries=[{id:'tool',sequence:1,kind:'tool',role:'system',text:'x'.repeat(17000),createdAt:'now'}];repo.saveConversation(r);const preview=repo.readPage(r.view.id,undefined,undefined,true)!.view.entries[0];
 const db=new DatabaseSync(repo.filename);t.after(()=>db.close());r.view.run=run('waiting-question');r.view.revision='old-writer-2';r.view.entries[0].text+='new result';
 db.exec('BEGIN IMMEDIATE');ConversationEntryStore.save(db,r);db.prepare('UPDATE conversations SET body=?,revision=? WHERE id=?').run(ConversationEntryStore.header(r),r.view.revision,r.view.id);
 const separate=new ConversationRepository(path.dirname(repo.filename));assert.equal(separate.listPendingStates().length,0,'uncommitted old output is not visible');separate.stopReadModels();db.exec('COMMIT');
 assert.equal(repo.listPendingStates(true)[0].view.revision,'old-writer-2');assert.equal(repo.readPage(r.view.id),undefined,'stale projected messages must never escape');
 assert.throws(()=>repo.readEntry(r.view.id,'tool',preview.detail!.revision),{code:'agent_entry_changed'});
 repo.rebuildReadModel(r.view.id);assert.deepEqual(repo.readPage(r.view.id)!.view.entries,r.view.entries);assert.equal(repo.readConversation(r.view.id)!.view.run?.status,'waiting-question');
 r.view.revision='old-writer-3';r.view.run=run('completed');db.prepare('UPDATE conversations SET body=?,revision=? WHERE id=?').run(ConversationEntryStore.header(r),r.view.revision,r.view.id);assert.equal(repo.listPendingStates(true).length,0);
});

test('legacy reads are zero-write and verified migration preserves content before deleting its backup',t=>{
 const repo=fixture(t),r=record();r.view.entries=[{id:'m',sequence:1,kind:'message',role:'user',text:'original',createdAt:'now'}];
 writeLegacyConversationDatabase(repo.filename,[r]);
 const before=fs.readFileSync(repo.filename);assert.equal(repo.readPage(r.view.id),undefined);repo.listPendingStates();assert.deepEqual(fs.readFileSync(repo.filename),before);
 repo.rebuildReadModel(r.view.id);const check=new DatabaseSync(repo.filename,{readOnly:true});t.after(()=>check.close());assert.equal(check.prepare('PRAGMA user_version').get()!.user_version,CONVERSATION_SCHEMA_VERSION);assert.deepEqual(repo.readPage(r.view.id)!.view.entries,r.view.entries);
 assert.deepEqual(repo.readConversation(r.view.id)!.view.entries,r.view.entries);assert.equal(fs.readdirSync(path.dirname(repo.filename)).some(name=>name.startsWith('conversations.pre-v6-')),false);
});

test('status and projected pages do not parse canonical bodies, even when unrelated history is unreadable',t=>{
 const repo=fixture(t),r=record();r.view.entries=[{id:'m',sequence:1,kind:'message',role:'user',text:'visible',createdAt:'now'}];repo.saveConversation(r);const other=record('unrelated');repo.saveConversation(other);
 const db=new DatabaseSync(repo.filename);t.after(()=>db.close());db.exec('DROP TRIGGER conversation_read_legacy_1;DROP TRIGGER conversation_body_format_update;DROP INDEX conversations_list_summary;');db.prepare('UPDATE conversations SET body=?').run('invalid original body');
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
 db.exec('DROP TRIGGER conversation_read_legacy_1;DROP TRIGGER conversation_body_format_update;DROP INDEX conversations_list_summary;');db.prepare('UPDATE conversations SET body=?').run('unreadable original');assert.equal(repo.readPage(r.view.id)!.view.entries[0].text,'new message');assert.equal(repo.readRevision(r.view.id)!.seenThrough,0);
});


test('legacy present files survive compact paging without rewriting history or starting native work',async t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-presented-files-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const repo=new ConversationRepository(path.join(base,'agent-service')),r=record('presented');
 r.view.run={...run(),provider:'dsh'};
 const tool:any={id:'native-present',sequence:1,kind:'tool',role:'system',provider:'dsh',runId:'run',participantId:'p',name:'present',status:'completed',input:JSON.stringify({files:[{path:'/workspace/release-process.md',description:'发布记录'}],padding:'x'.repeat(20000)}),text:'Presented /workspace/release-process.md',createdAt:'now'};
 r.view.entries=[tool,{id:'reply',sequence:2,kind:'message',role:'assistant',runId:'run',participantId:'p',text:'已提供文件。',createdAt:'now',status:'completed'}];repo.saveConversation(r);
 const db=new DatabaseSync(repo.filename);t.after(()=>db.close());const original=db.prepare('SELECT body FROM conversations WHERE id=?').get(r.view.id)!.body;
 const compact=JSON.parse(db.prepare('SELECT compact FROM conversation_read_entries WHERE id=?').get(tool.id)!.compact as string);delete compact.presentedFiles;
 db.prepare('UPDATE conversation_read_entries SET compact=? WHERE id=?').run(JSON.stringify(compact),tool.id);
 const service=createAgentService({dataRoot:base,executors:[],resolveWorkspace:()=>({rootPath:'/workspace'}),assertTask(){}});t.after(()=>service.close());
 const view=service.conversations.read('ws','presented',{compactTools:true});
 assert.deepEqual(view.entries[0].presentedFiles,[{path:'/workspace/release-process.md',description:'发布记录'}]);
 assert.equal(view.entries[0].input,undefined);assert.ok(view.entries[0].detail);
 assert.deepEqual(service.conversations.read('ws','presented').entries[0].presentedFiles,view.entries[0].presentedFiles);
 assert.equal(db.prepare('SELECT body FROM conversations WHERE id=?').get(r.view.id)!.body,original);
 assert.equal(service.conversations.read('ws','presented').run?.status,'completed');
});

test('lightweight reminders equal legacy pending projection including filtered questions and interrupted runs',async t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-reminder-summary-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const repo=new ConversationRepository(path.join(base,'agent-service'));
 const a=record('pending'),b=record('retained'),c=record('idle');
 a.view.run=run('running',[{id:'tool',label:'private invocation '.repeat(2000),status:'unknown'}]);
 a.view.requests=[{id:'valid',kind:'question',title:'private question',runId:'run',participantId:'p',generation:'g'},{id:'superseded',kind:'question',title:'old question',runId:'old',participantId:'p',generation:'g'}] as any;
 a.view.entries=[{id:'body',sequence:1,kind:'message',role:'user',text:'private body '.repeat(20000),createdAt:'now'}];
 b.view.run=run();b.view.retainedRuns=[{...run('completed',[{id:'old',label:'old tool',status:'running'}]),id:'retained'}];
 for(const record of [a,b,c])repo.saveConversation(record);
 const service=createAgentService({dataRoot:base,executors:[],resolveWorkspace:()=>({rootPath:'/workspace'}),assertTask(){}});t.after(()=>service.close());
 const legacy=service.conversations.pending(),summary=service.conversations.pendingSummary();
 assert.deepEqual(summary.conversations,legacy.conversations.map(view=>({conversationId:view.id,workspaceId:view.workspaceId,title:view.title,status:view.run?.status??'unknown',count:view.requests.length})));
 assert.equal(summary.conversations.find(row=>row.conversationId==='pending')!.count,1);
 assert.equal(summary.conversations.find(row=>row.conversationId==='pending')!.status,'unknown');
 assert.ok(JSON.stringify(summary).length<JSON.stringify(legacy).length/20);
 assert.doesNotMatch(JSON.stringify(summary),/private body|private invocation|private question|entries|tools/);
});

test('related lists preserve task scope, history search, header fallback and pagination',t=>{
 const repo=fixture(t),a=record('child-a'),b=record('child-b'),foreign=record('foreign'),draft=record('draft');
 for(const [i,r] of [a,b,foreign].entries()){
   r.view.updatedAt=`2026-11-0${i+1}T00:00:00Z`;
   r.view.entries=[{id:'large',sequence:1,kind:'message',role:'user',text:'history-token '+ 'x'.repeat(1024*1024),createdAt:'now'}];r.view.taskLinks=[{workspaceId:'ws',taskId:'task'}];
 }
 a.view.childOf={conversationId:'parent'} as any;b.view.childOf={conversationId:'parent'} as any;foreign.view.workspaceId='other';
 for(const r of [a,b,foreign,draft])repo.saveConversation(r);
 const first=repo.listConversations('ws',{parentConversationId:'parent',limit:1});assert.deepEqual(first.map(r=>r.view.id),['child-b']);assert.deepEqual(first[0].view.entries,[]);
 assert.deepEqual(repo.listConversations('ws',{parentConversationId:'parent',limit:1,before:first[0].view.updatedAt+'/'+first[0].view.id}).map(r=>r.view.id),['child-a']);
 assert.deepEqual(repo.listConversations('ws',{taskId:'task',workspaceIds:['ws','other'],limit:10}).map(r=>r.view.id),['foreign','child-b','child-a']);
 assert.equal(repo.listConversations('ws',{taskId:'task',workspaceIds:['ws'],query:'history-token',limit:10}).length,2);
 const db=new DatabaseSync(repo.filename);t.after(()=>db.close());db.prepare('DELETE FROM conversation_read_states WHERE id=?').run(a.view.id);
 const before=fs.readFileSync(repo.filename);assert.equal(repo.listConversations('ws',{parentConversationId:'parent',limit:10})[1].view.id,'child-a');assert.deepEqual(fs.readFileSync(repo.filename),before);
 db.prepare('UPDATE conversation_read_states SET revision=? WHERE id=?').run('stale',b.view.id);
 assert.deepEqual(repo.listConversations('ws',{parentConversationId:'parent',limit:10}).map(r=>r.view.id),['child-b','child-a']);
});

test('projected related reads never parse canonical history for empty children or task links',t=>{
 const repo=fixture(t),r=record('child');r.view.entries=[{id:'message',sequence:1,kind:'message',role:'user',text:'x'.repeat(1024*1024),createdAt:'now'}];
 r.view.childOf={conversationId:'parent'} as any;r.view.taskLinks=[{workspaceId:'ws',taskId:'task'}];repo.saveConversation(r);
 const parse=JSON.parse;JSON.parse=((value:string,...args:any[])=>{if(value.includes('x'.repeat(1024)))throw new Error('full history parsed');return parse(value,...args);}) as typeof JSON.parse;
 try{assert.deepEqual(repo.listConversations('ws',{parentConversationId:'none',limit:10}),[]);assert.equal(repo.listConversations('ws',{parentConversationId:'parent',limit:10})[0].view.id,'child');assert.equal(repo.listConversations('ws',{taskId:'task',limit:10})[0].view.id,'child');}finally{JSON.parse=parse;}
});
