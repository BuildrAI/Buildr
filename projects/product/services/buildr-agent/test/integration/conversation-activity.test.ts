import Ajv2020 from 'ajv/dist/2020.js';
import { AGENT_OPERATION_SCHEMAS } from '../../src/operation-schemas.ts';
import { PendingSendRepository } from '../../src/persistence/pending-send-repository.ts';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONVERSATION_SCHEMA_VERSION, ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { conversationActive } from '../../src/domain/conversation-activity.ts';
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
test('nonblocking pending decisions survive summary compatibility and count alongside actual execution',t=>{
 const repo=fixture(t),pending=record('pending'),other=record('other');
 message(pending,'user','question context');message(other,'user','newer conversation');
 pending.view.run={id:'r',participantId:'p',provider:'codex',generation:'g',status:'running',accepted:true,tools:[],model:'m',modelAccountId:'account',startedAt:pending.view.updatedAt,updatedAt:pending.view.updatedAt};
 pending.view.requests=[{id:'q',kind:'question',blocking:false,title:'private question',questions:[],conversationId:pending.view.id,workspaceId:'w1',runId:'r',participantId:'p',generation:'g'}];
 repo.saveConversation(pending);repo.saveConversation(other);repo.markSeen('w1',pending.view.id,0);
 const check=()=>{
  const page=repo.querySummaries(['w1'],{limit:1});
  assert.equal(page.conversations[0]!.id,'pending');
  assert.equal(page.conversations[0]!.run!.status,'running');
  assert.equal(page.conversations[0]!.activity!.pendingDecisionCount,1);
  assert.deepEqual(page.conversations[0]!.requests,[]);
  assert.deepEqual(page.activityCounts,{active:1,running:1,waiting:1,unseen:0,unknown:0,attention:1});
  assert.equal(page.stats.modelExecutions[0]!.count,1);
  assert.equal(repo.querySummaries(['w1'],{limit:1,activityState:'waiting'}).total,1);
  assert.equal(repo.querySummaries(['w1'],{limit:1,activityState:'running'}).total,1);
 };
 check();
 const db=new DatabaseSync(repo.filename);db.prepare("UPDATE conversations SET summary=json_remove(summary,'$.activity.pendingDecisionCount') WHERE id=?").run(pending.view.id);db.close();
 const before=fs.readFileSync(repo.filename);check();assert.deepEqual(fs.readFileSync(repo.filename),before,'legacy summary compatibility reads stay zero-write');
 save(repo,pending,r=>{r.view.requests=[];});
 assert.equal(repo.querySummaries(['w1'],{limit:10}).activityCounts.waiting,0);
 assert.equal(repo.querySummaries(['w1'],{limit:10}).activityCounts.running,1);
});

test('assistant unread priority remains independent from user ordering and message time',t=>{
 const repo=fixture(t),older=record('older'),newer=record('newer');
 message(older,'input','old input');newer.view.updatedAt='2026-10-27T01:00:00Z';message(newer,'input','new input');
 repo.saveConversation(older);repo.saveConversation(newer);
 const read=()=>repo.querySummaries(['w1'],{limit:20});
 assert.deepEqual(read().conversations.map(row=>row.id),['newer','older']);
 save(repo,older,r=>{r.view.updatedAt='2026-10-27T02:00:00Z';message(r,'answer','new reply','message','assistant');});
 assert.deepEqual(read().conversations.map(row=>row.id),['older','newer']);
 const at=read().conversations[0]!.activity!.updatedAt;
 save(repo,older,r=>{message(r,'tool','log','notice','system');r.view.title='renamed';});
 assert.equal(read().conversations.find(row=>row.id==='older')!.activity!.updatedAt,at);
 repo.markSeen('w1',older.view.id,older.view.activity!.version);
 assert.equal(read().conversations.find(row=>row.id==='older')!.activity!.updatedAt,at);
});
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

test('native child messages preserve provenance without becoming user activity or unread primary replies',t=>{
  const repo=fixture(t),r=record();repo.saveConversation(r);
  save(repo,r,row=>message(row,'primary-user','authorized request'));
  const version=r.view.activity!.version,userAt=repo.querySummaries(['w1'],{limit:10}).conversations[0]!.activity!.userInputAt;
  save(repo,r,row=>{
    message(row,'child-user','delegated instruction');row.view.entries.at(-1)!.parentToolId='delegate';
    message(row,'child-answer','child report','message','assistant');row.view.entries.at(-1)!.parentToolId='delegate';
  });
  assert.equal(r.view.activity!.version,version);
  assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations[0]!.activity!.userInputAt,userAt);
  assert.equal(repo.readConversation(r.view.id)!.view.entries.at(-1)!.parentToolId,'delegate');
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
test('search matches titles and visible messages only, ANDs terms, and returns a bounded snippet',t=>{
  const repo=fixture(t);
  const entry=(r:StoredConversation,id:string,kind:'message'|'tool'|'notice',role:'user'|'assistant'|'system',text:string,extra:{thinking?:boolean}={})=>{
    r.view.entries.push({id,sequence:r.view.entries.length+1,kind,role,text,createdAt:r.view.updatedAt,...extra});
  };
  const titleOnly=record('title-only');titleOnly.view.title='标题包含命中词和另一个词';entry(titleOnly,'title-only-entry','message','user','普通内容');
  const visible=record('visible');visible.view.title='普通标题';entry(visible,'visible-message','message','user','这里包含命中词');
  const both=record('both');both.view.title='普通标题二';entry(both,'both-message','message','assistant','这里同时包含命中词和另一个词');
  const tool=record('tool');tool.view.title='工具现场';entry(tool,'tool-message','tool','system','命中词和另一个词');
  const notice=record('notice');notice.view.title='通知现场';entry(notice,'notice-message','notice','system','命中词和另一个词');
  const thinking=record('thinking');thinking.view.title='思考现场';entry(thinking,'thinking-message','message','assistant','命中词和另一个词',{thinking:true});
  for(const r of [titleOnly,visible,both,tool,notice,thinking])repo.saveConversation(r);
  const search=(query:string)=>repo.querySummaries(['w1'],{limit:10,query});
  assert.deepEqual(search('命中词').conversations.map(row=>row.id).sort(),['both','title-only','visible']);
  assert.deepEqual(search('命中词 另一个词').conversations.map(row=>row.id).sort(),['both','title-only']);
  assert.deepEqual(search('缺乏第二个词').conversations.map(row=>row.id),[]);
  assert.equal(search('命中词').conversations.find(row=>row.id==='title-only')?.searchSnippet,undefined);
  const snippet=search('命中词').conversations.find(row=>row.id==='visible')?.searchSnippet;
  assert.ok(snippet?.includes('命中词'));assert.ok(snippet!.length<=120);assert.ok(!snippet!.includes('另一个词'));
  assert.deepEqual(repo.listConversations('w1',{limit:10,query:'命中词'}).map(r=>r.view.id).sort(),['both','title-only','visible']);
});

test('historical unknown without in-flight work no longer keeps a completed conversation active',()=>{
  const view=record('active-rule').view, at='2026-10-27T00:00:00Z';
  view.run={id:'current',participantId:'p',provider:'codex',generation:'g',status:'completed',accepted:true,executionState:'ended',tools:[],startedAt:at,updatedAt:at};
  view.retainedRuns=[{id:'old',participantId:'p',provider:'codex',generation:'g0',status:'unknown',accepted:false,stopRequested:true,canContinue:false,executionState:'unknown',tools:[],startedAt:at,updatedAt:at}];
  assert.equal(conversationActive(view,1,1),false);
  view.retainedRuns[0].tools=[{id:'tool',label:'bash',status:'running'}];
  assert.equal(conversationActive(view,1,1),true);
  view.retainedRuns[0].tools=[{id:'tool',label:'bash',status:'unknown'}];
  assert.equal(conversationActive(view,1,1),true);
  view.retainedRuns[0].tools=[];view.retainedRuns[0].executionState='active';
  assert.equal(conversationActive(view,1,1),true);
  view.retainedRuns[0].executionState='unknown';
  assert.equal(conversationActive(view,2,1),true);
  view.requests=[{id:'q',kind:'question',blocking:false,title:'question',questions:[],conversationId:view.id,workspaceId:view.workspaceId,runId:'old',participantId:'p',generation:'g0'}];
  assert.equal(conversationActive(view,1,1),true);
});

test('list reinterprets old active summaries with retained unknown runs without writing',t=>{
  const repo=fixture(t),at='2026-10-27T00:00:00Z';
  const stale=record('stale');message(stale,'stale-input','old input');
  stale.view.run={id:'current',participantId:'p',provider:'codex',generation:'g',status:'completed',accepted:true,executionState:'ended',tools:[],startedAt:at,updatedAt:at};
  stale.view.retainedRuns=[{id:'old',participantId:'p',provider:'codex',generation:'g0',status:'unknown',accepted:false,stopRequested:true,canContinue:false,executionState:'unknown',tools:[],startedAt:at,updatedAt:at}];
  repo.saveConversation(stale);repo.markSeen('w1',stale.view.id,stale.view.activity!.version);
  const newer=record('newer');newer.view.updatedAt='2026-10-27T01:00:00Z';message(newer,'newer-input','new input');repo.saveConversation(newer);repo.markSeen('w1',newer.view.id,newer.view.activity!.version);
  const db=new DatabaseSync(repo.filename);db.prepare("UPDATE conversations SET is_active=1, summary=json_set(summary,'$.activity.active',json('true')) WHERE id='stale'").run();db.close();
  const before=fs.readFileSync(repo.filename);
  const read=repo.querySummaries(['w1'],{limit:10});
  assert.equal(read.conversations.find(row=>row.id==='stale')?.activity?.active,false);
  assert.deepEqual(read.conversations.map(row=>row.id),['newer','stale']);
  assert.equal(repo.querySummaries(['w1'],{limit:10,activeOnly:true}).total,0);
  assert.deepEqual(fs.readFileSync(repo.filename),before,'compatibility read stays zero-write');
});

test('old active summaries exit for unaccepted stops without work but keep unknown evidence and live tools',t=>{
  const repo=fixture(t),at='2026-11-09T00:00:00Z';
  const saveStale=(id:string,toolStatus?:'running'|'unknown')=>{
    const item=record(id);message(item,id+'-input','old input');
    item.view.run={id:'run-'+id,participantId:'p',provider:'qoder',generation:'g',status:'unknown',accepted:false,stopRequested:true,canContinue:false,resourcesReleased:false,executionState:'unknown',tools:toolStatus?[{id:'tool',label:'command',status:toolStatus}]:[],diagnostic:'上一轮资源仍待释放，请稍后核对。',model:'m',startedAt:at,updatedAt:at};
    repo.saveConversation(item);repo.markSeen('w1',item.view.id,item.view.activity!.version);
    return item;
  };
  const quiet=saveStale('unaccepted-quiet'),busy=saveStale('unaccepted-busy','unknown');
  const db=new DatabaseSync(repo.filename);
  db.prepare("UPDATE conversations SET is_active=1,summary=json_set(summary,'$.activity.active',json('true')) WHERE id IN (?,?)").run(quiet.view.id,busy.view.id);
  db.close();
  const before=fs.readFileSync(repo.filename);
  const active=repo.querySummaries(['w1'],{activeOnly:true,limit:10});
  assert.deepEqual(active.conversations.map(row=>row.id),[busy.view.id]);
  assert.equal(active.activityCounts.active,1);assert.equal(active.activityCounts.unknown,1);
  const all=repo.querySummaries(['w1'],{limit:10});
  const quietRow=all.conversations.find(row=>row.id===quiet.view.id)!;
  assert.equal(quietRow.activity!.active,false);assert.equal(quietRow.run!.status,'unknown');assert.equal(quietRow.run!.stopRequested,true);
  const preserved=repo.readConversation(quiet.view.id)!;
  assert.equal(preserved.view.run!.status,'unknown');assert.equal(preserved.view.run!.stopRequested,true);
  assert.match(preserved.view.run!.diagnostic??'',/待释放/);
  assert.deepEqual(fs.readFileSync(repo.filename),before,'summary reinterpretation stays zero-write');
});

test('search matches conversation id substrings while keeping title and message scope',t=>{
  const repo=fixture(t);
  const entry=(r:StoredConversation,id:string,kind:'message'|'tool'|'notice',role:'user'|'assistant'|'system',text:string,extra:{thinking?:boolean}={})=>{
    r.view.entries.push({id,sequence:r.view.entries.length+1,kind,role,text,createdAt:r.view.updatedAt,...extra});
  };
  const idOnly=record('id-only-7f3a');idOnly.view.title='普通标题';entry(idOnly,'id-only-entry','message','user','普通内容');
  const idAndMessage=record('id-and-message-9b2c');idAndMessage.view.title='普通标题二';entry(idAndMessage,'id-message-entry','message','user','这里包含关键词');
  const titleOnly=record('title-hit');titleOnly.view.title='关键词标题';entry(titleOnly,'title-hit-entry','message','user','普通内容');
  const messageOnly=record('message-hit');messageOnly.view.title='普通标题三';entry(messageOnly,'message-hit-entry','message','user','关键词内容');
  const toolOnly=record('tool-hit');toolOnly.view.title='工具现场';entry(toolOnly,'tool-hit-entry','tool','system','7f3a');
  for(const r of [idOnly,idAndMessage,titleOnly,messageOnly,toolOnly])repo.saveConversation(r);
  const search=(query:string)=>repo.querySummaries(['w1'],{limit:10,query});
  assert.deepEqual(search('7f3a').conversations.map(row=>row.id).sort(),['id-only-7f3a']);
  assert.deepEqual(search('ID-ONLY').conversations.map(row=>row.id).sort(),['id-only-7f3a']);
  assert.deepEqual(search('9b2c 关键词').conversations.map(row=>row.id).sort(),['id-and-message-9b2c']);
  assert.deepEqual(search('7f3a 关键词').conversations.map(row=>row.id),[]);
  assert.equal(search('7f3a').conversations[0]?.searchSnippet,undefined);
  const snippet=search('关键词').conversations.find(row=>row.id==='message-hit')?.searchSnippet;
  assert.ok(snippet?.includes('关键词'));
  assert.deepEqual(repo.listConversations('w1',{limit:10,query:'7f3a'}).map(r=>r.view.id).sort(),['id-only-7f3a']);
  assert.deepEqual(repo.listConversations('w1',{limit:10,query:'9b2c 关键词'}).map(r=>r.view.id).sort(),['id-and-message-9b2c']);
});

test('legacy reads are zero-write, upgrade establishes seen baseline, then counts only new messages',t=>{
  const repo=fixture(t),r=record();message(r,'old','historical');
  const db=new DatabaseSync(repo.filename);db.exec('CREATE TABLE connections(id TEXT PRIMARY KEY,provider TEXT,revision TEXT,body TEXT); CREATE TABLE conversations(id TEXT PRIMARY KEY,workspace_id TEXT,task_id TEXT,hidden INTEGER,updated_at TEXT,revision TEXT,body TEXT); PRAGMA user_version=1;');
  db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?,?)').run(r.view.id,'w1',null,0,r.view.updatedAt,r.view.revision,JSON.stringify(r));db.close();
  const before=fs.readFileSync(repo.filename);assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations[0].activity?.version,0);assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations[0].titleState?.status??'unknown','unknown');assert.deepEqual(fs.readFileSync(repo.filename),before);
  save(repo,r,r=>{r.view.title='upgraded';});assert.equal(r.view.activity?.version,0);assert.equal(r.view.activity?.active,false);
  save(repo,r,r=>message(r,'new','new'));assert.equal(r.view.activity?.version,1);
});

test('continuation survives streaming, metadata, same-priority seen and out-of-scope updates',t=>{
  const repo=fixture(t);
  const rows=Array.from({length:6},(_,i)=>{
    const r=record('page-'+i);
    message(r,'input','hello');
    r.view.run={id:'run-'+i,participantId:'p',provider:'codex',generation:'g',status:'running',accepted:true,tools:[],startedAt:r.view.updatedAt,updatedAt:r.view.updatedAt};
    repo.saveConversation(r);
    save(repo,r,row=>message(row,'answer','first chunk','message','assistant'));
    return r;
  });
  const outside=record('outside','private');message(outside,'input','private');repo.saveConversation(outside);
  const read=(cursor?:string)=>repo.querySummaries(['w1'],{limit:1,cursor});
  const expected=repo.querySummaries(['w1'],{limit:20}).conversations.map(row=>row.id);
  let page=read();const found=page.conversations.map(row=>row.id);
  const changes=[
    ()=>save(repo,rows[0],r=>{r.view.entries[1].text+=' streamed chunk';}),
    ()=>save(repo,rows[0],r=>{r.view.title='renamed';}),
    ()=>save(repo,outside,r=>{r.view.title='outside renamed';}),
    // Partial acknowledgement leaves this row unseen, so its priority is unchanged.
    ()=>{save(repo,rows[0],r=>{r.view.entries[1].text+=' another chunk';});repo.markSeen('w1',rows[0].view.id,1);},
    ()=>save(repo,rows[0],r=>{r.view.run!.status='stopping';}),
  ];
  for(const change of changes){
    assert.ok(page.nextCursor);change();
    page=read(page.nextCursor);found.push(...page.conversations.map(row=>row.id));
  }
  assert.deepEqual(found,expected);
  assert.equal(page.nextCursor,undefined);
  // New readers reject legacy global-epoch cursors rather than mixing semantics.
  const legacy=JSON.parse(Buffer.from(read().nextCursor!,'base64url').toString());
  legacy.epoch=123;
  assert.throws(()=>read(Buffer.from(JSON.stringify(legacy)).toString('base64url')),/顺序/);
});

test('continuation rejects changed membership and ordering, including search and execution filters',t=>{
  const repo=fixture(t),a=record('a'),b=record('b'),c=record('c');
  for(const r of [a,b,c]){
    message(r,'input','matching');
    r.view.run={id:'run-'+r.view.id,participantId:'p',provider:'codex',generation:'g',status:'running',accepted:true,tools:[],model:'m',startedAt:r.view.updatedAt,updatedAt:r.view.updatedAt};
    repo.saveConversation(r);
  }
  const rejects=(options:Parameters<ConversationRepository['querySummaries']>[1],change:()=>void)=>{
    const page=repo.querySummaries(['w1'],options);assert.ok(page.nextCursor);change();
    assert.throws(()=>repo.querySummaries(['w1'],{...options,cursor:page.nextCursor}),/顺序/);
  };
  rejects({limit:1,query:'matching'},()=>save(repo,a,r=>{r.view.entries[0].text='no longer matches';}));
  rejects({limit:1,model:'m'},()=>save(repo,a,r=>{r.view.run!.model='other';}));
  rejects({limit:1},()=>save(repo,b,r=>{r.view.updatedAt='2026-10-27T01:00:00Z';message(r,'new-input','new input');}));
  rejects({limit:1},()=>{const added=record('new');message(added,'input','new');repo.saveConversation(added);});
  save(repo,c,r=>{r.view.run!.status='completed';});
  rejects({limit:1},()=>save(repo,c,r=>{r.view.hidden=true;}));
});

test('retained generation changes outside the requested workspace do not invalidate continuation',t=>{
  const repo=fixture(t);
  for(const id of ['a','b']){const r=record(id);message(r,'input','hello');repo.saveConversation(r);}
  const outside=record('outside','private');message(outside,'input','hello');
  outside.view.run={id:'old-run',participantId:'p',provider:'codex',generation:'retained',status:'running',accepted:true,tools:[],startedAt:outside.view.updatedAt,updatedAt:outside.view.updatedAt};
  repo.saveConversation(outside);
  const read=(cursor?:string)=>repo.querySummaries(['w1'],{limit:1,generation:'current',cursor},()=>true);
  const first=read();assert.ok(first.nextCursor);
  save(repo,outside,r=>{r.view.run!.status='completed';});
  const next=read(first.nextCursor);
  assert.deepEqual([...first.conversations,...next.conversations].map(row=>row.id),['b','a']);
  assert.equal(next.nextCursor,undefined);
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
  assert.equal(all.conversations.length,1);assert.deepEqual(all.stats.agents,[{label:'codex',count:1}]);
  assert.deepEqual(all.stats.executions,[{provider:'codex',model:'actual-model',count:1}]);
  const search=repo.querySummaries(['w1','w2'],{limit:1,query:'no matching text',model:'actual-model'});
  assert.equal(search.total,0);assert.deepEqual(search.stats,all.stats);
  const missing=repo.querySummaries(['w1','w2'],{limit:10,model:'未指定'});
  assert.equal(missing.total,0);
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
  const counts={active:8,running:2,waiting:2,unseen:3,unknown:1,attention:6};
  const first=repo.querySummaries(['w1','w2'],{limit:1,activeOnly:true});
  assert.deepEqual(first.activityCounts,counts);
  const search=repo.querySummaries(['w1','w2'],{limit:1,query:'no result',hidden:false,model:'m'});
  assert.equal(search.total,0);assert.deepEqual(search.activityCounts,counts);
  const waiting=repo.querySummaries(['w1','w2'],{limit:1,activityState:'waiting'});
  assert.equal(waiting.total,2);assert.equal(waiting.conversations[0].run?.status,'waiting-question');
  assert.deepEqual(waiting.activityCounts,counts);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:1,activityState:'waiting',cursor:waiting.nextCursor}).conversations[0].run?.status,'waiting-approval');
  assert.throws(()=>repo.querySummaries(['w1','w2'],{limit:1,activityState:'unseen',cursor:waiting.nextCursor}),/位置|顺序/);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:10,activityState:'attention'}).total,6);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:10,workspaceId:'w1'}).activityCounts.unknown,0);
  assert.throws(()=>repo.querySummaries(['w1'],{limit:1,activityState:'invalid'}),/分类/);
  assert.equal(repo.readConversation('counts-4')?.view.activity?.seenThrough,0);
  repo.markSeen('w1','counts-4',1);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:1}).activityCounts.waiting,2,'viewing a question does not answer it');
  repo.markSeen('w1','counts-5',1);
  assert.equal(repo.querySummaries(['w1','w2'],{limit:1}).activityCounts.unseen,2);
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
test('列表仅按用户新输入前移，助手与工具输出不改变排序',t=>{
  const repo=fixture(t),a=record('a'),b=record('b');
  repo.saveConversation(a);repo.saveConversation(b);
  const order=()=>repo.querySummaries(['w1'],{limit:10}).conversations.map(row=>row.id);
  save(repo,a,r=>{r.view.updatedAt='2026-10-27T00:01:00Z';message(r,'a1','first');});
  save(repo,b,r=>{r.view.updatedAt='2026-10-27T00:02:00Z';message(r,'b1','first');});
  assert.deepEqual(order(),['b','a']);
  save(repo,a,r=>{r.view.updatedAt='2026-10-27T00:03:00Z';message(r,'a-assistant','reply','message','assistant');message(r,'a-tool','tool output','notice','system');});
  assert.equal(a.view.activity?.version,2,'智能体回复仍推进活动提醒');
  assert.deepEqual(order(),['b','a'],'新回复不改变用户输入顺序');
  const at=a.view.activity!.updatedAt;
  save(repo,b,r=>{message(r,'b-tool','tool output','notice','system');});
  assert.deepEqual(order(),['b','a'],'单独工具输出不改变顺序');
  assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations.find(row=>row.id==='a')!.activity!.updatedAt,at);
  save(repo,a,r=>{r.view.updatedAt='2026-10-27T00:04:00Z';message(r,'a2','next');});
  assert.deepEqual(order(),['a','b'],'用户输入也更新消息时间');
});

test('completed final replies move non-active conversations while failed rounds and intermediate output do not',t=>{
  const repo=fixture(t);
  const make=(id:string,userAt:string)=>{const r=record(id);r.view.updatedAt=userAt;message(r,`${id}-user`,'input');return r;};
  const a=make('final-a','2026-11-05T11:08:00Z'),b=make('final-b','2026-11-05T11:23:00Z'),c=make('final-c','2026-11-05T11:30:00Z');
  for(const r of [a,b,c]){repo.saveConversation(r);repo.markSeen('w1',r.view.id,r.view.activity!.version);}
  const order=()=>repo.querySummaries(['w1'],{limit:10}).conversations.map(row=>row.id);
  assert.deepEqual(order(),['final-c','final-b','final-a']);
  const runFor=(id:string,status:'completed'|'running'|'failed'='completed')=>({id:`run-${id}`,participantId:'p',provider:'codex',generation:'g',status,accepted:true,tools:[],startedAt:'2026-11-05T11:08:00Z',updatedAt:'2026-11-05T11:35:00Z'});
  const reply=(r:StoredConversation,id:string,createdAt:string,runId:string)=>r.view.entries.push({id,sequence:r.view.entries.length+1,kind:'message',role:'assistant',text:id,createdAt,runId});
  save(repo,a,r=>{reply(r,'final-a-reply','2026-11-05T11:35:00Z','run-final-a');r.view.run=runFor('final-a');});
  repo.markSeen('w1',a.view.id,a.view.activity!.version);
  assert.deepEqual(order(),['final-a','final-c','final-b']);
  assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations[0]!.activity!.finalReplyAt,'2026-11-05T11:35:00Z');
  save(repo,b,r=>{reply(r,'failed-b-reply','2026-11-05T11:50:00Z','run-final-b');r.view.run=runFor('final-b','failed');});
  repo.markSeen('w1',b.view.id,b.view.activity!.version);
  assert.deepEqual(order(),['final-a','final-c','final-b'],'a failed latest round is not a final reply');
  save(repo,b,r=>{r.view.run!.status='completed';});
  repo.markSeen('w1',b.view.id,b.view.activity!.version);
  assert.deepEqual(order(),['final-b','final-a','final-c']);
  save(repo,b,r=>{r.view.run!.supersededBy='new';});
  repo.markSeen('w1',b.view.id,b.view.activity!.version);
  assert.deepEqual(order(),['final-a','final-c','final-b'],'a superseded completed run falls back to user input');
  save(repo,b,r=>{delete r.view.run!.supersededBy;});
  repo.markSeen('w1',b.view.id,b.view.activity!.version);
  assert.deepEqual(order(),['final-b','final-a','final-c']);
  const cursor=repo.querySummaries(['w1'],{limit:1}).nextCursor;
  save(repo,c,r=>{reply(r,'running-c-reply','2026-11-05T11:55:00Z','run-final-c');r.view.run=runFor('final-c','running');});
  assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations[0].id,'final-c');
  assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations[0].activity!.active,true);
  assert.throws(()=>repo.querySummaries(['w1'],{limit:1,cursor}),/顺序/,'intermediate running work changes priority and invalidates the old cursor');
  repo.markSeen('w1',c.view.id,c.view.activity!.version);
  save(repo,c,r=>{r.view.run!.status='completed';});
  repo.markSeen('w1',c.view.id,c.view.activity!.version);
  assert.deepEqual(order(),['final-c','final-b','final-a']);
});

test('legacy completed summaries without finalReplyAt use activity time and final reply changes invalidate cursors',t=>{
  const repo=fixture(t);
  const a=record('legacy-a'),b=record('legacy-b');
  a.view.updatedAt='2026-11-05T11:08:00Z';message(a,'legacy-a-user','input');
  b.view.updatedAt='2026-11-05T11:23:00Z';message(b,'legacy-b-user','input');
  for(const r of [a,b]){repo.saveConversation(r);repo.markSeen('w1',r.view.id,r.view.activity!.version);}
  save(repo,a,r=>{
    r.view.entries.push({id:'legacy-a-reply',sequence:r.view.entries.length+1,kind:'message',role:'assistant',text:'final',createdAt:'2026-11-05T11:35:00Z',runId:'run-legacy-a'});
    r.view.run={id:'run-legacy-a',participantId:'p',provider:'codex',generation:'g',status:'completed',accepted:true,tools:[],startedAt:'2026-11-05T11:08:00Z',updatedAt:'2026-11-05T11:35:00Z'};
  });
  repo.markSeen('w1',a.view.id,a.view.activity!.version);
  const order=()=>repo.querySummaries(['w1'],{limit:10}).conversations.map(row=>row.id);
  assert.deepEqual(order(),['legacy-a','legacy-b']);
  const db=new DatabaseSync(repo.filename);db.prepare("UPDATE conversations SET summary=json_remove(summary,'$.activity.finalReplyAt') WHERE id=?").run('legacy-a');db.close();
  assert.deepEqual(order(),['legacy-a','legacy-b'],'legacy completed row falls back to activity time');
  const page=repo.querySummaries(['w1'],{limit:1});assert.ok(page.nextCursor);
  save(repo,a,r=>{r.view.entries.at(-1)!.createdAt='2026-11-05T12:00:00Z';r.view.updatedAt='2026-11-05T12:00:00Z';r.view.run!.updatedAt='2026-11-05T12:00:00Z';});
  assert.throws(()=>repo.querySummaries(['w1'],{limit:1,cursor:page.nextCursor}),/顺序/,'a changed final reply changes the order key');
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
  assert.deepEqual(page.stats.executions,[{provider:'codex',model:'shared-model',count:1},{provider:'qoder',model:'shared-model',count:1}]);
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
  assert.deepEqual(after.map(row=>row.id),before.map(row=>row.id),'new assistant reply preserves user order');
  assert.deepEqual(Object.fromEntries(after.map(row=>[row.id,row.activity?.userInputAt])),Object.fromEntries(before.map(row=>[row.id,row.activity?.userInputAt])),'user input timestamps remain independent');
});


test('closing a released historical doubt dismisses attention while execution and tool outcomes remain unknown',t=>{
 const repo=fixture(t),r=record();message(r,'u','one operation');
 r.view.run={id:'r',participantId:'p',provider:'codex',generation:'g',status:'unknown',accepted:true,tools:[{id:'tool',label:'result missing',status:'unknown'}],startedAt:r.view.updatedAt,updatedAt:r.view.updatedAt};
 repo.saveConversation(r);save(repo,r,r=>{r.view.hidden=true;r.view.run!.executionState='ended';});
 assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).activityCounts.unknown,1,'ended without release proof remains visible');
 save(repo,r,r=>{r.view.run!.resourcesReleased=true;r.view.run!.executionState='unknown';});
 const quiet=repo.querySummaries(['w1'],{activeOnly:true,limit:10});assert.equal(quiet.total,0);assert.equal(quiet.activityCounts.unknown,0);assert.equal(quiet.stats.modelExecutions.length,0);
 const archived=repo.querySummaries(['w1'],{hidden:true,limit:10});assert.equal(archived.total,1);assert.equal(archived.conversations[0].run?.status,'unknown');assert.equal(repo.readConversation(r.view.id)?.view.run?.tools[0].status,'unknown');
 assert.equal(repo.markSeen('w1',r.view.id,r.view.activity!.version).active,false,'opening the closed history cannot recreate an activity reminder');
 assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).activityCounts.unknown,0);
 assert.equal(repo.readConversation(r.view.id)?.view.run?.executionState,'unknown');
 save(repo,r,r=>{r.view.hidden=false;});assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).activityCounts.unknown,1,'an unhidden historical doubt is still discoverable');
});

test('the rebuildable list index follows normalized writes and rejects incompatible body-only writes',t=>{
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
    assert.throws(()=>write.run(JSON.stringify(draft),draft.view.id),/agent_storage_writer_incompatible/);
    save(repo,draft,()=>{});
    assert.equal(repo.querySummaries(['w1'],{limit:5}).total,1);
    assert.equal(repo.listConversations('w1',{limit:5}).length,1);
    save(repo,draft,r=>{r.view.entries=[];});
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
  assert.equal(statements.length,5,'compact compatibility probe, generation, overview, total and page are the only scoped reads');
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
    db.exec('DROP INDEX conversations_list_summary; DROP TRIGGER conversation_body_format_update');
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

test('released retained uncertainty exits activity even with a legacy active summary, without mutating history',t=>{
 const repo=fixture(t),r=record('released-history'),newer=record('newer-idle');
 message(r,'input','finished work');message(newer,'input','newer work');
 newer.view.entries[0].createdAt=new Date(Date.parse(r.view.updatedAt)+1000).toISOString();
 const at=r.view.updatedAt;
 r.view.run={id:'current',participantId:'p',provider:'codex',generation:'g',status:'completed',accepted:true,tools:[],startedAt:at,updatedAt:at};
 r.view.retainedRuns=[{...r.view.run,id:'old',status:'unknown',executionState:'unknown',resourcesReleased:true,tools:[{id:'uncertain',label:'old command',status:'unknown'}]}];
 repo.saveConversation(r);repo.saveConversation(newer);
 const db=new DatabaseSync(repo.filename);
 const original=db.prepare('SELECT body,revision FROM conversations WHERE id=?').get(r.view.id)!;
 // A retained old writer saved the previous interpretation of activity.
 db.prepare("UPDATE conversations SET is_active=1,summary=json_set(summary,'$.activity.active',json('true')) WHERE id=?").run(r.view.id);
 db.close();
 const restarted=new ConversationRepository(path.dirname(repo.filename));
 assert.equal(restarted.querySummaries(['w1'],{activeOnly:true,limit:10}).total,0);
 const page=restarted.querySummaries(['w1'],{limit:10});
 assert.deepEqual(page.conversations.map(row=>row.id),[newer.view.id,r.view.id]);
 assert.equal(page.conversations.find(row=>row.id===r.view.id)!.activity!.active,false);
 assert.equal(restarted.markSeen('w1',r.view.id,r.view.activity!.version).active,false,'already-seen refresh also repairs the stale summary');
 const after=new DatabaseSync(repo.filename,{readOnly:true});
 assert.deepEqual(after.prepare('SELECT body,revision FROM conversations WHERE id=?').get(r.view.id),original,'unknown evidence and revision remain untouched');after.close();
 assert.equal(new ConversationRepository(path.dirname(repo.filename)).querySummaries(['w1'],{activeOnly:true,limit:10}).total,0);
});

test('legacy summary correction preserves a retained running tool and known active execution',t=>{
 const repo=fixture(t),r=record('retained-live');message(r,'input','context');const at=r.view.updatedAt;
 r.view.run={id:'current',participantId:'p',provider:'codex',generation:'g',status:'completed',accepted:true,tools:[],startedAt:at,updatedAt:at};
 r.view.retainedRuns=[{...r.view.run,id:'old',status:'unknown',resourcesReleased:true,executionState:'unknown',tools:[{id:'working',label:'worker',status:'running'}]}];
 repo.saveConversation(r);
 assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).total,1);
 assert.equal(repo.markSeen('w1',r.view.id,r.view.activity!.version).active,true,'read receipt must use tool-bearing header, not stripped summary');
 save(repo,r,row=>{row.view.retainedRuns![0].tools=[];row.view.retainedRuns![0].executionState='active';});
 assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).total,1);
});

test('后台新回复不改变同类分页边界，用户输入及有效答复更新排序',t=>{
 const repo=fixture(t),a=record('a'),b=record('b');
 repo.saveConversation(a);repo.saveConversation(b);
 message(a,'a-input','first');b.view.updatedAt='2026-10-27T01:00:00Z';message(b,'b-input','second');
 repo.saveConversation(a,a.view.revision);repo.saveConversation(b,b.view.revision);
 const first=repo.querySummaries(['w1'],{limit:1});assert.equal(first.conversations[0].id,'b');
 save(repo,a,r=>{r.view.updatedAt='2026-10-27T02:00:00Z';message(r,'assistant','new output','message','assistant');});
 assert.equal(repo.querySummaries(['w1'],{limit:1,cursor:first.nextCursor}).conversations[0].id,'a');
 save(repo,a,r=>{r.view.updatedAt='2026-10-27T03:00:00Z';message(r,'reply-question','answer','notice');});
 assert.equal(repo.querySummaries(['w1'],{limit:1}).conversations[0].id,'a');
 assert.throws(()=>repo.querySummaries(['w1'],{limit:1,cursor:first.nextCursor}),/顺序/);
});

test('background-only old summaries are reinterpreted without writes and preserve unread and real work',t=>{
 const repo=fixture(t),r=record('background');message(r,'input','start a server');
 r.view.run={id:'bg',participantId:'p',provider:'dsh',generation:'g',status:'tools-active',executionState:'active',accepted:true,tools:[{id:'server',label:'bash',status:'running',canStop:true}],model:'m',startedAt:r.view.updatedAt,updatedAt:r.view.updatedAt};
 repo.saveConversation(r);repo.markSeen('w1',r.view.id,r.view.activity!.version);
 const db=new DatabaseSync(repo.filename);db.prepare("UPDATE conversations SET is_active=1,summary=json_set(summary,'$.activity.active',json('true')) WHERE id=?").run(r.view.id);db.close();
 const before=fs.readFileSync(repo.filename),page=repo.querySummaries(['w1'],{limit:10});
 assert.equal(page.conversations[0].activity!.active,false);assert.equal(page.conversations[0].run!.status,'tools-active');
 assert.equal(page.activityCounts.running,0);assert.deepEqual(page.stats.agents,[]);
 assert.equal(repo.querySummaries(['w1'],{limit:10,activeOnly:true}).total,0);assert.deepEqual(fs.readFileSync(repo.filename),before);
 save(repo,r,r=>message(r,'answer','server started','message','assistant'));
 assert.equal(repo.querySummaries(['w1'],{limit:10,activeOnly:true}).total,1);assert.equal(repo.querySummaries(['w1'],{limit:10}).activityCounts.unseen,1);
});


test('pending send display participates in scoped pagination and activity without loading drafts or claiming execution',t=>{
 const repo=fixture(t),pending=new PendingSendRepository(path.dirname(repo.filename));
 for(const id of ['a','b'])repo.saveConversation(record(id));
 repo.saveConversation(record('outside','w2'));
 const draft={expectedRevision:'r0',connectionId:'codex',text:'private unsent body'};
 let a=pending.submit('w1','a',draft,'request-a');
 pending.submit('w1','b',draft,'request-b');pending.submit('w2','outside',draft,'request-outside');
 const first=repo.querySummaries(['w1'],{activeOnly:true,limit:1});
 assert.equal(first.total,2);assert.equal(first.activityCounts.active,2);assert.equal(first.activityCounts.pendingSend,2);
 const validate=new Ajv2020({strict:false}).compile(AGENT_OPERATION_SCHEMAS.conversations);
 assert.equal(validate(first),true,JSON.stringify(validate.errors));
 assert.equal(first.activityCounts.running,0);assert.equal(first.activityCounts.waiting,0);assert.deepEqual(first.stats.modelExecutions,[]);
 assert.equal(first.conversations[0].activity?.pendingSend?.state,'waiting');
 assert.doesNotMatch(JSON.stringify(first),/private unsent body/);
 const next=repo.querySummaries(['w1'],{activeOnly:true,limit:1,cursor:first.nextCursor});
 assert.notEqual(first.conversations[0].id,next.conversations[0].id);assert.equal(next.nextCursor,undefined);
 assert.equal(repo.querySummaries(['w1'],{activeOnly:true,activityState:'send-waiting',limit:10}).total,2);
 const claimed=pending.claim(a,'owner',()=>false)!;
 assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations.find(v=>v.id==='a')?.activity?.pendingSend?.state,'waiting','dispatching has no third display state');
 assert.equal(repo.querySummaries(['w1'],{limit:10}).conversations.find(v=>v.id==='a')?.activity?.pendingSend?.reason,'正在投递，尚未确认受理。');
 pending.finish(claimed,'failed','specific failure');
 const failed=repo.querySummaries(['w1'],{limit:10,activityState:'send-failed'});
 assert.equal(failed.total,1);assert.equal(failed.conversations[0].activity?.pendingSend?.reason,'specific failure');
 a=pending.read('w1','a')!;pending.cancel('w1','a',a.revision);
 assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).total,1);
 pending.finish(pending.read('w1','b')!,'delivered','accepted');
 assert.equal(repo.querySummaries(['w1'],{activeOnly:true,limit:10}).total,0);
 assert.equal(repo.querySummaries(['w2'],{activeOnly:true,limit:10}).total,1);
});

test('a submitted next instruction preserves a real old model execution and decision counts',t=>{
 const repo=fixture(t),r=record('old');
 r.view.run={id:'run',participantId:'p',provider:'codex',generation:'g',status:'running',accepted:true,tools:[],model:'m',modelAccountId:'account',startedAt:r.view.updatedAt,updatedAt:r.view.updatedAt};
 r.view.requests=[{id:'q',kind:'question',title:'Choose',conversationId:'old',workspaceId:'w1',runId:'run',participantId:'p',generation:'g'}];
 repo.saveConversation(r);
 new PendingSendRepository(path.dirname(repo.filename)).submit('w1','old',{expectedRevision:'r0',connectionId:'codex',text:'next'},'request');
 const page=repo.querySummaries(['w1'],{activeOnly:true,limit:10});
 assert.equal(page.activityCounts.active,1);assert.equal(page.activityCounts.running,1);assert.equal(page.activityCounts.waiting,1);
 assert.equal(page.conversations[0].activity?.pendingDecisionCount,1);assert.equal(page.conversations[0].activity?.pendingSend?.state,'waiting');
 assert.equal(page.stats.modelExecutions[0].count,1);
 assert.equal(repo.querySummaries(['w1'],{activityState:'waiting',limit:10}).total,1);
 assert.equal(repo.querySummaries(['w1'],{activityState:'running',limit:10}).total,1);
});


test('draft priority applies before pagination without changing activity, filtering or stored records',t=>{
 const repo=fixture(t);
 const rows=['ordinary','draft','running','waiting','empty'].map(id=>record(id));
 for(const [index,row] of rows.entries()){
  row.view.updatedAt=`2026-10-${String(28-index).padStart(2,'0')}T00:00:00Z`;
  if(row.view.id!=='empty')message(row,'input-'+row.view.id,'work');
  if(['running','waiting'].includes(row.view.id))row.view.run={id:'r-'+row.view.id,participantId:'p',provider:'codex',generation:'g',status:row.view.id==='waiting'?'waiting-question':'running',accepted:true,tools:[],startedAt:row.view.updatedAt,updatedAt:row.view.updatedAt};
  repo.saveConversation(row);repo.markSeen('w1',row.view.id,0);
 }
 const normal=repo.querySummaries(['w1'],{limit:20});
 assert.deepEqual(normal.conversations.map(row=>row.id),['waiting','running','ordinary','draft']);
 const options={draftConversationIds:['draft','empty','unregistered'],limit:1};
 const found:string[]=[];let cursor:string|undefined;
 do{const page=repo.querySummaries(['w1'],{...options,cursor});assert.deepEqual(page.activityCounts,normal.activityCounts);assert.equal(page.total,4);found.push(...page.conversations.map(row=>row.id));cursor=page.nextCursor;}while(cursor);
 assert.deepEqual(found,['waiting','running','draft','ordinary']);
 const first=repo.querySummaries(['w1'],options);
 assert.throws(()=>repo.querySummaries(['w1'],{limit:1,cursor:first.nextCursor,draftConversationIds:[]}),/顺序已变化/);
 assert.equal(repo.querySummaries(['w1'],{...options,query:'missing'}).total,0);
 assert.deepEqual(repo.querySummaries(['w1'],{...options,activeOnly:true,limit:20}).conversations.map(row=>row.id),['waiting','running']);
 assert.deepEqual(repo.querySummaries(['w1'],{limit:20}).conversations.map(row=>row.id),normal.conversations.map(row=>row.id),'clearing drafts restores ordering with no write');
});
