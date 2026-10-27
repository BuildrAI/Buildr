import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

function fixture(t:Parameters<Parameters<typeof test>[1]>[0]) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-activity-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  return new ConversationRepository(directory);
}
function record(id='one',workspaceId='w1'):StoredConversation {
  return {view:{id,workspaceId,cwd:'/workspace',title:'测试标题',revision:'r0',hidden:false,updatedAt:'2026-10-27T00:00:00Z',participants:[],entries:[],requests:[]},participants:[],sources:{},attachments:{},attempts:[],requests:{}};
}
function save(repo:ConversationRepository,r:StoredConversation,change:(r:StoredConversation)=>void) {
  const prior=r.view.revision;change(r);r.view.revision+='x';r.view.updatedAt=new Date(Date.parse(r.view.updatedAt)+1000).toISOString();repo.saveConversation(r,prior);
}
function message(r:StoredConversation,id:string,text:string,kind:'message'|'notice'='message',role:'user'|'assistant'|'system'='user') {
  r.view.entries.push({id,text,kind,role,createdAt:r.view.updatedAt});
}
test('reads never create storage; new messages and streaming advance activity, metadata and tool notices do not',t=>{
  const repo=fixture(t);assert.equal(repo.querySummaries(['w1'],{limit:10}).total,0);assert.equal(fs.existsSync(repo.filename),false);
  const r=record();repo.saveConversation(r);
  save(repo,r,r=>message(r,'m1','hello'));assert.equal(r.view.activity?.version,1);
  const at=r.view.activity!.updatedAt;
  save(repo,r,r=>{r.view.title='renamed';r.view.hidden=true;message(r,'tool-notice','tool output','notice','system');});
  assert.equal(r.view.activity?.version,1);assert.equal(r.view.activity?.updatedAt,at);
  save(repo,r,r=>{r.view.entries[0].text+=' streamed';});assert.equal(r.view.activity?.version,2);
  save(repo,r,r=>message(r,'reply-request','answer','notice'));assert.equal(r.view.activity?.version,3);
  save(repo,r,()=>{});assert.equal(r.view.activity?.version,3);
});
test('seen is monotonic, revision independent, cannot acknowledge future output or another workspace',t=>{
  const repo=fixture(t),r=record();repo.saveConversation(r);save(repo,r,r=>message(r,'a','one'));
  const observed=r.view.activity!.version;save(repo,r,r=>message(r,'b','two'));
  const revision=r.view.revision;
  assert.equal(repo.markSeen('w1',r.view.id,observed).active,true);
  assert.equal(repo.markSeen('w1',r.view.id,0).seenThrough,observed);
  assert.throws(()=>repo.markSeen('w2',r.view.id,2));assert.throws(()=>repo.markSeen('w1',r.view.id,3));
  assert.equal(repo.readConversation(r.view.id)?.view.revision,revision);
  assert.equal(repo.markSeen('w1',r.view.id,2).active,false);
  save(repo,r,r=>{r.view.title='renamed after read';});
  assert.equal(repo.readConversation(r.view.id)?.view.activity?.seenThrough,2);
  assert.equal(new ConversationRepository(path.dirname(repo.filename)).readConversation(r.view.id)?.view.activity?.active,false);
});
test('global summary is scoped, active first by message time, paginated, and cursor invalidates on new activity',t=>{
  const repo=fixture(t),a=record('a'),b=record('b','w2'),c=record('c','private');
  repo.saveConversation(a);repo.saveConversation(b);repo.saveConversation(c);
  save(repo,a,r=>{message(r,'a','first');r.view.hidden=true;});
  save(repo,b,r=>{message(r,'b','later');r.view.updatedAt='2026-10-27T00:05:00Z';});
  assert.throws(()=>repo.querySummaries(['w1','w2'],{limit:1,cursor:Buffer.from('null').toString('base64url')}));
  const page=repo.querySummaries(['w1','w2'],{limit:1});assert.equal(page.total,2);assert.equal(page.conversations[0].id,'b');assert.ok(page.nextCursor);
  const next=repo.querySummaries(['w2','w1'],{limit:1,cursor:page.nextCursor});assert.equal(next.conversations[0].id,'a');assert.equal(next.nextCursor,undefined);
  assert.throws(()=>repo.querySummaries(['w1'],{limit:1,cursor:page.nextCursor}));
  assert.equal(page.conversations[0].entries.length,0);assert.equal(page.conversations[0].requests.length,0);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:10,query:'later'}).total,1);
  save(repo,a,r=>message(r,'new','new message'));assert.throws(()=>repo.querySummaries(['w1','w2'],{limit:1,cursor:page.nextCursor}));
  repo.markSeen('w1','a',a.view.activity!.version);assert.equal(repo.querySummaries(['w1','w2'],{limit:10}).total,1);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:10,hidden:true}).total,2);
});
test('legacy reads are zero-write, upgrade establishes seen baseline, then counts only new messages',t=>{
  const repo=fixture(t),r=record();message(r,'old','historical');
  const db=new DatabaseSync(repo.filename);db.exec('CREATE TABLE connections(id TEXT PRIMARY KEY,provider TEXT,revision TEXT,body TEXT); CREATE TABLE conversations(id TEXT PRIMARY KEY,workspace_id TEXT,task_id TEXT,hidden INTEGER,updated_at TEXT,revision TEXT,body TEXT); PRAGMA user_version=1;');
  db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?,?)').run(r.view.id,'w1',null,0,r.view.updatedAt,r.view.revision,JSON.stringify(r));db.close();
  const before=fs.readFileSync(repo.filename);assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations[0].activity?.version,0);assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations[0].titleState?.status??'unknown','unknown');assert.deepEqual(fs.readFileSync(repo.filename),before);
  save(repo,r,r=>{r.view.title='upgraded';});assert.equal(r.view.activity?.version,0);assert.equal(r.view.activity?.active,false);
  save(repo,r,r=>message(r,'new','new'));assert.equal(r.view.activity?.version,1);
});
