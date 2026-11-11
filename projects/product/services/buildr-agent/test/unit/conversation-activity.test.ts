import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryView, pendingDecisionCount, finalReplyActivityAt } from '../../src/domain/conversation-activity.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

test('legacy requests without a run identity remain pending rather than crashing discovery',()=>{
 const record={view:{requests:[{id:'pending'}]},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,0,0,'now').activity!.active,true);
});


test('final reply comes only from the latest completed run and ignores intermediate evidence',()=>{
 const at='2026-11-05T00:00:00Z';
 const run={id:'current',participantId:'p',generation:'g',status:'completed',startedAt:at,updatedAt:at,tools:[]} as any;
 const entry=(id:string,createdAt:string,extra:Record<string,unknown>={})=>({id,sequence:1,kind:'message' as const,role:'assistant' as const,text:id,createdAt,runId:'current',...extra});
 const record={view:{run,entries:[
  {id:'user',sequence:1,kind:'message',role:'user',text:'input',createdAt:at,runId:'current'},
  entry('middle','2026-11-05T00:01:00Z'),
  entry('thinking','2026-11-05T00:02:00Z',{thinking:true}),
  entry('child','2026-11-05T00:03:00Z',{parentToolId:'tool'}),
  entry('failed','2026-11-05T00:04:00Z',{status:'failed'}),
  {id:'old-run',sequence:6,kind:'message',role:'assistant',text:'old',createdAt:'2026-11-05T00:06:00Z',runId:'old'},
  entry('final','2026-11-05T00:05:00Z')
 ],requests:[]},participants:[]} as unknown as StoredConversation;
 assert.equal(finalReplyActivityAt(record),'2026-11-05T00:05:00Z');
 assert.equal(summaryView(record,1,0,'now').activity!.finalReplyAt,'2026-11-05T00:05:00Z');
 run.status='running';assert.equal(finalReplyActivityAt(record),undefined);
 run.status='failed';assert.equal(finalReplyActivityAt(record),undefined);
 run.status='completed';record.view.run!.supersededBy='new';assert.equal(finalReplyActivityAt(record),undefined);
 delete record.view.run!.supersededBy;
 // Legacy entries without runId only count from the current run's start.
 record.view.run={...run,id:'legacy',startedAt:'2026-11-05T00:10:00Z'};
 record.view.entries=[{id:'legacy-user',sequence:1,kind:'message',role:'user',text:'input',createdAt:'2026-11-05T00:10:00Z'},{id:'legacy-old',sequence:2,kind:'message',role:'assistant',text:'old',createdAt:'2026-11-05T00:09:00Z'},{id:'legacy-final',sequence:3,kind:'message',role:'assistant',text:'final',createdAt:'2026-11-05T00:11:00Z'}];
 assert.equal(finalReplyActivityAt(record),'2026-11-05T00:11:00Z');
 record.view.entries=[];assert.equal(finalReplyActivityAt(record),undefined);
});

test('historical unknown rounds only keep a stopped conversation active while work is in flight',()=>{
 const run={id:'old',status:'unknown',resourcesReleased:true,executionState:'unknown',tools:[]} as any;
 const record={view:{run:{id:'cancelled',status:'stopped',resourcesReleased:true,tools:[]},retainedRuns:[run],requests:[],hidden:false},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false);
 assert.equal(summaryView(record,4,3,'now').activity!.active,true,'unread work remains visible');
 run.tools=[{id:'uncertain-operation',status:'unknown'}];assert.equal(summaryView(record,3,3,'now').activity!.active,false);
 run.tools=[{id:'live-operation',status:'running'}];assert.equal(summaryView(record,3,3,'now').activity!.active,true);
 run.executionState='active';run.tools=[];assert.equal(summaryView(record,3,3,'now').activity!.active,true);run.executionState='unknown';
 run.tools=[];run.resourcesReleased=false;assert.equal(summaryView(record,3,3,'now').activity!.active,false,'historical unknown without in-flight work is not active');
 run.tools=[{id:'live-operation',status:'running'}];assert.equal(summaryView(record,3,3,'now').activity!.active,true,'unreleased running work remains visible');
});

test('stopped retained unknown rounds are historical evidence unless real work or unread output remains',()=>{
 const run={id:'old',status:'unknown',accepted:true,stopRequested:true,executionState:'unknown',tools:[{id:'uncertain',status:'unknown'}]} as any;
 const record={view:{run:{id:'current',status:'completed',tools:[]},retainedRuns:[run],requests:[],hidden:false},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false,'a requested historical stop without live work does not pin the conversation');
 assert.equal(run.status,'unknown');assert.equal(run.tools[0].status,'unknown');
 run.attentionSettled=true;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false,'settlement closes the attention, not the evidence');
 assert.equal(run.status,'unknown');assert.equal(run.tools[0].status,'unknown');
 run.tools=[{id:'live',status:'running'}];assert.equal(summaryView(record,3,3,'now').activity!.active,true,'running work overrides settlement');
 run.tools=[];run.executionState='active';assert.equal(summaryView(record,3,3,'now').activity!.active,true,'active execution overrides settlement');
 run.executionState='unknown';
 assert.equal(summaryView(record,4,3,'now').activity!.active,true,'unread output still needs attention');
 record.view.requests=[{id:'q',runId:'old'}] as any;assert.equal(summaryView(record,3,3,'now').activity!.active,true,'valid questions still need attention');
 record.view.requests=[];run.stopRequested=false;run.attentionSettled=false;run.tools=[{id:'uncertain',status:'unknown'}];
 assert.equal(summaryView(record,3,3,'now').activity!.active,true,'unknown tools without a stop request remain protected');
});

test('an unaccepted stop without in-flight work settles activity while preserving unknown evidence',()=>{
 const at='2026-11-09T00:00:00Z';
 const run={id:'unaccepted',participantId:'p',generation:'g',status:'unknown',accepted:false,stopRequested:true,resourcesReleased:false,executionState:'unknown',tools:[],diagnostic:'上一轮资源仍待释放，请稍后核对。',startedAt:at,updatedAt:at} as any;
 const record={view:{run,requests:[],hidden:false},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false);
 assert.equal(record.view.run?.status,'unknown');assert.equal(record.view.run?.stopRequested,true);assert.match(record.view.run?.diagnostic??'',/待释放/);
 assert.equal(summaryView(record,4,3,'now').activity!.active,true,'unread output still needs attention');
 run.tools=[{id:'live-operation',status:'running'}];assert.equal(summaryView(record,3,3,'now').activity!.active,true);
 run.tools=[{id:'uncertain-operation',status:'unknown'}];assert.equal(summaryView(record,3,3,'now').activity!.active,true);
 run.tools=[];run.executionState='active';assert.equal(summaryView(record,3,3,'now').activity!.active,true);
 run.executionState='unknown';run.accepted=true;assert.equal(summaryView(record,3,3,'now').activity!.active,true,'only a proven unaccepted stop settles the unknown');
 run.accepted=false;record.view.requests=[{id:'q',runId:'unaccepted',participantId:'p',generation:'g'} as any];
 assert.equal(summaryView(record,3,3,'now').activity!.active,true,'pending decisions always keep attention');
});

test('closing a released unknown result preserves facts and cannot mute retained live work',()=>{
 const run={id:'released',status:'unknown',executionState:'unknown',resourcesReleased:true,tools:[{id:'missing',status:'unknown'}]} as any;
 const record={view:{hidden:true,run,requests:[]},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,4,1,'now').activity!.active,false);
 assert.equal(record.view.run?.tools[0].status,'unknown');assert.equal(record.view.run?.executionState,'unknown');
 record.view.pendingSend={} as any;assert.equal(summaryView(record,4,1,'now').activity!.active,true,'an already submitted next request cannot be closed away');delete record.view.pendingSend;
 record.view.retainedRuns=[run];record.view.run={...run,id:'finished',status:'completed',tools:[]};
 assert.equal(summaryView(record,4,1,'now').activity!.active,false,'a completed latest round can close attention to released historical unknowns');record.view.run=run;
 for(const retained of [{...run,id:'live',resourcesReleased:false},{...run,id:'known-active',executionState:'active'},
   {...run,id:'running-tool',tools:[{id:'working',status:'running'}]}]){
  record.view.retainedRuns=[retained];assert.equal(summaryView(record,4,1,'now').activity!.active,true);
 }
});

test('confirmed replacement keeps uncertain resources internal and does not create user attention',()=>{
 const old={id:'old',status:'unknown',supersededBy:'new',tools:[{id:'uncertain',status:'unknown'}]} as any;
 const record={view:{run:{id:'new',status:'completed',tools:[]},retainedRuns:[old],requests:[],hidden:false},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false);
 record.view.requests=[{id:'late',runId:'old'} as any];
 assert.equal(summaryView(record,3,3,'now').activity!.active,false,'a legacy owner cannot recreate user attention with a retired request');
 assert.equal(summaryView(record,4,3,'now').activity!.active,true,'unread new answers still require attention');
 assert.equal(record.view.retainedRuns![0]!.tools[0]!.status,'unknown','physical facts remain preserved');
});

test('nonblocking questions remain pending while execution and seen state are independent',()=>{
 const run={id:'r',participantId:'p',generation:'g',status:'running',tools:[]} as any;
 const request={id:'q',runId:'r',participantId:'p',generation:'g',kind:'question',blocking:false} as any;
 const record={view:{run,requests:[request]},participants:[]} as unknown as StoredConversation;
 const summary=summaryView(record,4,4,'now');
 assert.equal(summary.activity!.pendingDecisionCount,1);
 assert.equal(summary.activity!.active,true);
 assert.equal(summary.run!.status,'running');
 assert.deepEqual(summary.requests,[],'private question content stays out of summaries');
 for(const change of [{supersededBy:'new'},{resourcesReleased:true},{status:'completed'},{status:'failed'},{status:'stopped'}]){
  assert.equal(pendingDecisionCount({...record.view,run:{...run,...change}}),0);
 }
 assert.equal(pendingDecisionCount({...record.view,requests:[{...request,generation:'other'}]}),0);
 assert.equal(pendingDecisionCount({...record.view,requests:[]}),0);
});

test('model-ended background jobs do not keep read conversations active but decisions, unread and another model do',()=>{
 const background={id:'background',status:'tools-active',executionState:'active',tools:[{id:'job',status:'running'}]};
 const record={view:{run:background,requests:[],retainedRuns:[]},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false);
 assert.equal(summaryView(record,4,3,'now').activity!.active,true);
 record.view.requests=[{id:'question',runId:'background'} as any];assert.equal(summaryView(record,3,3,'now').activity!.active,true);
 record.view.requests=[];record.view.retainedRuns=[background as any];record.view.run={...background,id:'latest',status:'completed',executionState:'ended',tools:[]} as any;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false);
 record.view.run={...background,id:'model',status:'running'} as any;assert.equal(summaryView(record,3,3,'now').activity!.active,true);
 assert.equal(background.tools[0].status,'running','background physical facts are preserved');
});
