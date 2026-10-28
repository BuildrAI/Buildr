import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

function fixture(t:TestContext) {
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
  r.view.entries.push({id,sequence:r.view.entries.length+1,text,kind,role,createdAt:r.view.updatedAt});
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

test('execution overview is full-scope, independent from search/page/filter and counts only actual current runs',t=>{
  const repo=fixture(t);
  const statuses=['running','tools-active','waiting-question','unknown','completed'] as const;
  for(let i=0;i<statuses.length;i++){
    const r=record('stats-'+i,i===1?'w2':'w1');
    message(r,'input','hello '+i);
    r.view.run={id:'run-'+i,participantId:'p',provider:'codex',generation:'g',status:statuses[i],accepted:true,tools:[],model:i===1?undefined:'actual-model',startedAt:r.view.updatedAt,updatedAt:r.view.updatedAt};
    repo.saveConversation(r);
  }
  const all=repo.querySummaries(['w1','w2'],{limit:1});
  assert.equal(all.conversations.length,1);assert.deepEqual(all.stats.agents,[{label:'codex',count:2}]);
  assert.deepEqual(all.stats.executions,[{provider:'codex',model:'actual-model',count:1},{provider:'codex',model:'未指定',count:1}]);
  const search=repo.querySummaries(['w1','w2'],{limit:1,query:'no matching text',model:'actual-model'});
  assert.equal(search.total,0);assert.deepEqual(search.stats,all.stats);
  const missing=repo.querySummaries(['w1','w2'],{limit:10,model:'未指定'});
  assert.equal(missing.total,1);assert.equal(missing.conversations[0].workspaceId,'w2');
  assert.deepEqual(repo.querySummaries(['w1','w2'],{limit:1,workspaceId:'w1'}).stats.agents,[{label:'codex',count:1}]);
});

test('activity counts are exclusive, full-scope and filter before pagination without marking seen',t=>{
  const repo=fixture(t);
  const statuses=['running','starting','tools-active','waiting-approval','waiting-question','completed','failed','unknown'] as const;
  for(const [i,status] of statuses.entries()){
    const r=record('counts-'+i,i===7?'w2':'w1');
    repo.saveConversation(r);
    save(repo,r,r=>{
      message(r,'input','work '+i);
      r.view.hidden=true;
      r.view.run={id:'run-'+i,participantId:'p',provider:'codex',generation:'g',status,accepted:true,tools:[],model:'m',startedAt:r.view.updatedAt,updatedAt:r.view.updatedAt};
    });
  }
  const counts={active:8,running:3,waiting:2,unseen:2,unknown:1,attention:5};
  const first=repo.querySummaries(['w1','w2'],{limit:1,activeOnly:true});
  assert.deepEqual(first.activityCounts,counts);
  const search=repo.querySummaries(['w1','w2'],{limit:1,query:'no result',hidden:false,model:'m'});
  assert.equal(search.total,0);assert.deepEqual(search.activityCounts,counts);
  const waiting=repo.querySummaries(['w1','w2'],{limit:1,activityState:'waiting'});
  assert.equal(waiting.total,2);assert.equal(waiting.conversations[0].run?.status,'waiting-question');
  assert.deepEqual(waiting.activityCounts,counts);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:1,activityState:'waiting',cursor:waiting.nextCursor}).conversations[0].run?.status,'waiting-approval');
  assert.throws(()=>repo.querySummaries(['w1','w2'],{limit:1,activityState:'unseen',cursor:waiting.nextCursor}),/位置|顺序/);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:10,activityState:'attention'}).total,5);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:10,workspaceId:'w1'}).activityCounts.unknown,0);
  assert.throws(()=>repo.querySummaries(['w1'],{limit:1,activityState:'invalid'}),/分类/);
  assert.equal(repo.readConversation('counts-4')?.view.activity?.seenThrough,0);
  repo.markSeen('w1','counts-4',1);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:1}).activityCounts.waiting,2,'viewing a question does not answer it');
  repo.markSeen('w1','counts-5',1);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:1}).activityCounts.unseen,1);
  const stale=repo.querySummaries(['w1','w2'],{limit:1,generation:'new'});
  assert.deepEqual(stale.activityCounts,{active:7,running:0,waiting:0,unseen:1,unknown:6,attention:7});
  assert.deepEqual(stale.stats.agents,[]);
  assert.equal(repo.querySummaries(['w1'],{limit:10,generation:'new',activityState:'unknown'}).total,5);
});

test('empty and attachment-only drafts stay readable but absent from every list; failed or unknown work remains discoverable',t=>{
 const repo=fixture(t),draft=record('draft');draft.view.taskId='task';
 draft.attachments.image={mimeType:'image/png',size:8,createdAt:draft.view.updatedAt};
 repo.saveConversation(draft);
 assert.ok(repo.readConversation('draft')?.attachments.image);
 assert.deepEqual(repo.listConversations('w1',{limit:10}),[]);
 assert.deepEqual(repo.listConversations('w1',{limit:10,taskId:'task',query:'测试'}),[]);
 assert.equal(repo.querySummaries(['w1'],{limit:10}).total,0);
 assert.equal(repo.querySummaries(['w1'],{limit:10,hidden:true}).total,0);
 const unknown=record('unknown');unknown.view.run={id:'run',participantId:'p',provider:'codex',generation:'g',status:'unknown',accepted:true,tools:[],startedAt:unknown.view.updatedAt,updatedAt:unknown.view.updatedAt};repo.saveConversation(unknown);
 const failed=record('failed');message(failed,'input','sent before failure');failed.view.run={...unknown.view.run,status:'failed'};repo.saveConversation(failed);
 assert.deepEqual(new Set(repo.listConversations('w1',{limit:10}).map(row=>row.view.id)),new Set(['unknown','failed']));
 assert.equal(repo.querySummaries(['w1'],{limit:10}).total,2);
 save(repo,draft,r=>message(r,'first','first sent input'));
 assert.equal(repo.querySummaries(['w1'],{limit:10}).total,3);
 assert.equal(repo.listConversations('w1',{limit:10,taskId:'task'}).length,1);
});
test('列表顺序只跟随用户输入，智能体输出与工具动作不改变位置',t=>{
  const repo=fixture(t),a=record('a'),b=record('b');
  repo.saveConversation(a);repo.saveConversation(b);
  const order=()=>repo.querySummaries(['w1'],{limit:10}).conversations.map(row=>row.id);
  save(repo,a,r=>{r.view.updatedAt='2026-10-27T00:01:00Z';message(r,'a1','first');});
  save(repo,b,r=>{r.view.updatedAt='2026-10-27T00:02:00Z';message(r,'b1','first');});
  assert.deepEqual(order(),['b','a']);
  save(repo,a,r=>{r.view.updatedAt='2026-10-27T00:03:00Z';message(r,'a-assistant','reply','message','assistant');message(r,'a-tool','tool output','notice','system');});
  assert.equal(a.view.activity?.version,2,'智能体回复仍推进活动提醒');
  assert.deepEqual(order(),['b','a'],'回复与工具输出不改变列表顺序');
  save(repo,a,r=>{r.view.updatedAt='2026-10-27T00:04:00Z';message(r,'a2','next');});
  assert.deepEqual(order(),['a','b'],'用户再次输入后才前移');
});

test('execution model and agent pairs aggregate full scope without guessing across pagination',t=>{
  const repo=fixture(t);
  for(const [id,provider,model,status] of [['c1','codex','shared-model','running'],['c2','codex','shared-model','tools-active'],['q1','qoder','shared-model','running'],['wait','qoder','shared-model','waiting-question']] as const){
    const item=record(id);message(item,'input','work');
    item.view.run={id:'run-'+id,participantId:'p',provider,generation:'g',status,accepted:true,tools:[],model,startedAt:item.view.updatedAt,updatedAt:item.view.updatedAt};
    repo.saveConversation(item);
  }
  const page=repo.querySummaries(['w1'],{limit:1,query:'no match',activityState:'waiting'});
  assert.equal(page.conversations.length,0);
  assert.deepEqual(page.stats.executions,[{provider:'codex',model:'shared-model',count:2},{provider:'qoder',model:'shared-model',count:1}]);
});
