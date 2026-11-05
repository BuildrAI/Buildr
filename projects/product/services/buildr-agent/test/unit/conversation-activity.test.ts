import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryView, pendingDecisionCount } from '../../src/domain/conversation-activity.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

test('legacy requests without a run identity remain pending rather than crashing discovery',()=>{
 const record={view:{requests:[{id:'pending'}]},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,0,0,'now').activity!.active,true);
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
