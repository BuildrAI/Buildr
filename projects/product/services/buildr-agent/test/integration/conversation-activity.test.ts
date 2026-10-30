import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONVERSATION_SCHEMA_VERSION, ConversationRepository } from '../../src/persistence/conversation-repository.ts';
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

test('waiting and unseen outrank newer running input across all pages, filters and seen transitions',t=>{
  const repo=fixture(t);
  const make=(id:string,status:NonNullable<StoredConversation['view']['run']>['status'],at:string,seen=false,workspaceId='w1')=>{
    const r=record(id,workspaceId);r.view.updatedAt=at;
    message(r,'input-'+id,'input '+id);
    r.view.run={id:'run-'+id,participantId:'p',provider:'codex',generation:'g',status,accepted:true,tools:[],model:'m',startedAt:at,updatedAt:at};
    repo.saveConversation(r);
    save(repo,r,row=>message(row,'answer-'+id,'answer','message','assistant'));
    if(seen)repo.markSeen(workspaceId,id,r.view.activity!.version);
    return r;
  };
  const waiting=make('waiting','waiting-question','2026-10-27T01:00:00Z',false,'w2');
  const unseen=make('unseen','completed','2026-10-27T02:00:00Z');
  const running=make('running','running','2026-10-27T03:00:00Z');
  make('running-tie','running','2026-10-27T03:00:00Z');
  make('unknown','unknown','2026-10-27T04:00:00Z');
  make('history','completed','2026-10-27T05:00:00Z',true);
  const read=(options:Parameters<ConversationRepository['querySummaries']>[1])=>repo.querySummaries(['w1','w2'],options);
  const ids=(options:Parameters<ConversationRepository['querySummaries']>[1])=>read(options).conversations.map(row=>row.id);
  const expected=['unseen','waiting','unknown','running-tie','running','history'];
  assert.deepEqual(ids({limit:20}),expected);
  for(const limit of [1,2,3,4]){
    const found:string[]=[];let cursor:string|undefined;
    do {const page=read({limit,cursor});found.push(...page.conversations.map(row=>row.id));cursor=page.nextCursor;}while(cursor);
    assert.deepEqual(found,expected,'分页容量 '+limit);
  }
  assert.deepEqual(ids({limit:20,activeOnly:true}),expected.slice(0,-1));
  assert.deepEqual(ids({limit:20,workspaceId:'w1'}),expected.filter(id=>id!=='waiting'));
  assert.deepEqual(ids({limit:20,activityState:'attention'}),['unseen','waiting','unknown']);
  assert.deepEqual(ids({limit:20,model:'m'}),['running-tie','running']);
  assert.deepEqual(ids({limit:20,query:'running'}),['running-tie','running']);
  const first=read({limit:1}),old=JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString());
  delete old.priority;old.active=1;
  assert.throws(()=>read({limit:1,cursor:Buffer.from(JSON.stringify(old)).toString('base64url')}),/顺序/);
  const userAt=read({limit:20}).conversations.find(row=>row.id==='running')!.activity!.userInputAt;
  save(repo,running,r=>{r.view.updatedAt='2026-10-27T06:00:00Z';message(r,'new-input','newest user input');});
  assert.deepEqual(ids({limit:20}),['unseen','waiting','running','unknown','running-tie','history']);
  assert.notEqual(read({limit:20}).conversations.find(row=>row.id==='running')!.activity!.userInputAt,userAt);
  const latestUserAt=read({limit:20}).conversations.find(row=>row.id==='running')!.activity!.userInputAt;
  save(repo,running,r=>{message(r,'output','background response','message','assistant');});
  assert.equal(read({limit:20}).conversations.find(row=>row.id==='running')!.activity!.userInputAt,latestUserAt);
  assert.deepEqual(ids({limit:20}).slice(0,3),['unseen','waiting','running']);
  const cursor=read({limit:1}).nextCursor;
  repo.markSeen('w1','unseen',unseen.view.activity!.version);
  assert.throws(()=>read({limit:1,cursor}),/顺序/);
  assert.deepEqual(ids({limit:20}),['waiting','running','unknown','running-tie','history','unseen']);
  repo.markSeen('w2','waiting',waiting.view.activity!.version);
  assert.equal(ids({limit:20})[0],'waiting','等待明确决定不会被已读降级');
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

test('executing models aggregate by actual account across executors and expose user input time independently of replies',t=>{
  const repo=fixture(t);
  for(const [id,provider,accountId,label] of [['a','codex','account-a','账号甲'],['b','qoder','account-a','账号甲'],['c','codex','account-b','账号乙']] as const){
    const item=record(id);message(item,'input','work');
    item.view.run={id:'run-'+id,participantId:'p',provider,generation:'g',status:'running',accepted:true,tools:[],model:'shared-model',modelAccountId:accountId,modelSourceLabel:label,startedAt:item.view.updatedAt,updatedAt:item.view.updatedAt};repo.saveConversation(item);
  }
  const page=repo.querySummaries(['w1'],{limit:1,query:'no match',activityState:'waiting'});
  assert.deepEqual(page.stats.modelExecutions,[{accountId:'account-a',accountLabel:'账号甲',model:'shared-model',count:2},{accountId:'account-b',accountLabel:'账号乙',model:'shared-model',count:1}]);
  const before=repo.querySummaries(['w1'],{limit:10}).conversations;
  const item=repo.readConversation('a')!;item.view.updatedAt='2026-10-29T00:00:00Z';message(item,'answer','new assistant output','message','assistant');repo.saveConversation(item,item.view.revision);
  const after=repo.querySummaries(['w1'],{limit:10}).conversations;
  assert.deepEqual(after.map(row=>row.id),before.map(row=>row.id));assert.deepEqual(after.map(row=>row.activity?.userInputAt),before.map(row=>row.activity?.userInputAt));
});


test('hidden unknown outcomes stop reminding only after execution and resources are independently released',t=>{
 const repo=fixture(t),r=record();message(r,'u','one operation');
 r.view.run={id:'r',participantId:'p',provider:'codex',generation:'g',status:'unknown',accepted:true,tools:[{id:'tool',label:'result missing',status:'unknown'}],startedAt:r.view.updatedAt,updatedAt:r.view.updatedAt};
 repo.saveConversation(r);save(repo,r,r=>{r.view.hidden=true;r.view.run!.executionState='ended';});
 assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).activityCounts.unknown,1,'ended without release proof remains visible');
 save(repo,r,r=>{r.view.run!.resourcesReleased=true;});
 const quiet=repo.querySummaries(['w1'],{activeOnly:true,limit:10});assert.equal(quiet.total,0);assert.equal(quiet.activityCounts.unknown,0);assert.equal(quiet.stats.modelExecutions.length,0);
 const archived=repo.querySummaries(['w1'],{hidden:true,limit:10});assert.equal(archived.total,1);assert.equal(archived.conversations[0].run?.status,'unknown');assert.equal(repo.readConversation(r.view.id)?.view.run?.tools[0].status,'unknown');
 save(repo,r,r=>{r.view.hidden=false;});assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).activityCounts.unknown,1,'an unhidden historical doubt is still discoverable');
});

test('the rebuildable list index preserves storage compatibility and follows older body-only writes',t=>{
  const repo=fixture(t),draft=record('legacy-writer');
  repo.saveConversation(draft);
  const db=new DatabaseSync(repo.filename);
  try{
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,CONVERSATION_SCHEMA_VERSION);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='conversations_list_summary'").get());
    assert.equal(repo.querySummaries(['w1'],{limit:5}).total,0);

    // Retained writers do not know about the index. SQLite must maintain its
    // membership even if only the history changes and the summary is unchanged.
    message(draft,'sent','sent by an older writer');
    const write=db.prepare('UPDATE conversations SET body=? WHERE id=?');
    write.run(JSON.stringify(draft),draft.view.id);
    assert.equal(repo.querySummaries(['w1'],{limit:5}).total,1);
    assert.equal(repo.listConversations('w1',{limit:5}).length,1);
    draft.view.entries=[];
    write.run(JSON.stringify(draft),draft.view.id);
    assert.equal(repo.querySummaries(['w1'],{limit:5}).total,0);

    db.exec('DROP INDEX conversations_list_summary');
    const before=fs.readFileSync(repo.filename);
    assert.equal(repo.querySummaries(['w1'],{limit:5}).total,0);
    assert.deepEqual(fs.readFileSync(repo.filename),before,'reads must not create the optional index');
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='conversations_list_summary'").get()!.n,0);
    save(repo,draft,()=>{});
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='conversations_list_summary'").get());
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,CONVERSATION_SCHEMA_VERSION);
  }finally{db.close();}
});

test('ordinary summary reads use the compact index without loading history and share one overview scan',t=>{
  const repo=fixture(t),item=record('large-history');
  message(item,'input','history-only-search-token '+ 'x'.repeat(1024*1024));
  item.view.run={id:'run',participantId:'p',provider:'codex',generation:'g',status:'running',accepted:true,tools:[],model:'m',startedAt:item.view.updatedAt,updatedAt:item.view.updatedAt};
  repo.saveConversation(item);
  const statements:Array<{sql:string;args:unknown[]}>=[];
  const prepare=DatabaseSync.prototype.prepare;
  t.mock.method(DatabaseSync.prototype,'prepare',function(this:DatabaseSync,sql:string){
    const statement=prepare.call(this,sql);
    if(sql.includes('json_array_length(json_extract(body') && /^(SELECT|WITH)\b/.test(sql)){
      for(const method of ['all','get'] as const){
        const invoke=statement[method];
        t.mock.method(statement,method,function(...args:unknown[]){
          statements.push({sql,args});
          return Reflect.apply(invoke,statement,args);
        });
      }
    }
    return statement;
  });
  const result=repo.querySummaries(['w1'],{limit:5,generation:'g'},()=>false);
  assert.equal(result.total,1);
  assert.equal(result.conversations[0].entries.length,0);
  assert.deepEqual(result.stats.models,[{label:'m',count:1}]);
  assert.equal(statements.length,4,'generation, overview, total and page are the only scoped reads');
  assert.equal(statements.filter(row=>row.sql.includes('AS MATERIALIZED')).length,1);

  const db=new DatabaseSync(repo.filename,{readOnly:true});
  try{
    const root=db.prepare("SELECT rootpage FROM sqlite_master WHERE name='conversations'").get()!.rootpage;
    const bodyColumn=db.prepare('PRAGMA table_info(conversations)').all().find(row=>row.name==='body')!.cid;
    for(const {sql,args} of statements){
      const queryPlan=prepare.call(db,'EXPLAIN QUERY PLAN '+sql);
      const plan=Reflect.apply(queryPlan.all,queryPlan,args) as Array<{detail:string}>;
      assert.ok(plan.some(row=>row.detail.includes('conversations_list_summary')),JSON.stringify(plan));
      const explain=prepare.call(db,'EXPLAIN '+sql);
      const operations=Reflect.apply(explain.all,explain,args) as Array<{opcode:string;p1:number;p2:number}>;
      const tableCursors=new Set(operations.filter(row=>row.opcode==='OpenRead'&&row.p2===root).map(row=>row.p1));
      assert.equal(operations.filter(row=>row.opcode==='Column'&&tableCursors.has(row.p1)&&row.p2===bodyColumn).length,0,'normal list reads must not load the full body');
    }
  }finally{db.close();}
  assert.equal(repo.querySummaries(['w1'],{limit:5,query:'history-only-search-token'}).total,1,'explicit search still includes full history');
});

test('combined overview retains empty-scope results and account label aggregation across executors',t=>{
  const repo=fixture(t);
  for(const [id,provider,label] of [['a','codex','A'],['b','qoder','Z']] as const){
    const item=record(id);message(item,'input','work');
    item.view.run={id:'run-'+id,participantId:'p',provider,generation:'g',status:'running',accepted:true,tools:[],model:'same',modelAccountId:'account',modelSourceLabel:label,startedAt:item.view.updatedAt,updatedAt:item.view.updatedAt};
    repo.saveConversation(item);
  }
  const page=repo.querySummaries(['w1'],{limit:1,query:'no result',activityState:'waiting'});
  assert.equal(page.total,0);
  assert.deepEqual(page.activityCounts,{active:2,running:2,waiting:0,unseen:0,unknown:0,attention:0});
  assert.deepEqual(page.stats.modelExecutions,[{accountId:'account',accountLabel:'Z',model:'same',count:2}]);
  assert.deepEqual(page.stats.executions,[{provider:'codex',model:'same',count:1},{provider:'qoder',model:'same',count:1}]);
  const empty=repo.querySummaries(['other'],{limit:1});
  assert.deepEqual(empty.activityCounts,{active:0,running:0,waiting:0,unseen:0,unknown:0,attention:0});
  assert.deepEqual(empty.stats,{agents:[],models:[],executions:[],modelExecutions:[]});
});

test('optional index construction cannot make an unrelated damaged history block a valid scope',t=>{
  const repo=fixture(t),good=record('good'),damaged=record('damaged','other');
  message(good,'input','valid work');
  repo.saveConversation(good);repo.saveConversation(damaged);
  const db=new DatabaseSync(repo.filename);
  try{
    db.exec('DROP INDEX conversations_list_summary');
    db.prepare('UPDATE conversations SET body=? WHERE id=?').run('damaged historical JSON',damaged.view.id);
  }finally{db.close();}
  save(repo,good,r=>{r.view.title='still writable';});
  const page=repo.querySummaries(['w1'],{limit:5,generation:'current'},()=>false);
  assert.equal(page.total,1);
  assert.equal(page.conversations[0].title,'still writable');
  const check=new DatabaseSync(repo.filename,{readOnly:true});
  try{
    assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='conversations_list_summary'").get()!.n,0);
    assert.equal(check.prepare('SELECT body FROM conversations WHERE id=?').get(damaged.view.id)!.body,'damaged historical JSON','unrelated content stays untouched');
  }finally{check.close();}
});

test('retained work remains discoverable after the latest response is read and cannot be hidden as a released current outcome',t=>{
 const repo=fixture(t),r=record('retained');
 message(r,'input','new instruction');
 const at=r.view.updatedAt;
 r.view.run={id:'new',participantId:'new-p',provider:'codex',generation:'g',status:'completed',accepted:true,tools:[],startedAt:at,updatedAt:at};
 r.view.retainedRuns=[{...r.view.run,id:'old',participantId:'old-p',status:'unknown',tools:[{id:'helper',label:'helper',status:'unknown'}]}];
 repo.saveConversation(r);save(repo,r,row=>message(row,'reply','done','message','assistant'));
 assert.equal(repo.markSeen('w1',r.view.id,r.view.activity!.version).active,true);
 assert.equal(repo.hasUnfinishedWork(),true);assert.equal(repo.listPending(true)[0]?.view.retainedRuns?.[0]?.id,'old');
 assert.equal(repo.querySummaries(['w1'],{limit:10,activeOnly:true}).total,1);
 save(repo,r,row=>{row.view.hidden=true;Object.assign(row.view.run!,{status:'unknown',executionState:'ended',resourcesReleased:true});});
 assert.equal(repo.readConversation(r.view.id)?.view.activity?.active,true,'hiding the latest released result cannot hide unfinished prior work');
 save(repo,r,row=>{row.view.run!.status='stopped';Object.assign(row.view.retainedRuns![0],{status:'stopped',executionState:'ended',tools:[]});});
 assert.equal(repo.hasUnfinishedWork(),false);
});
