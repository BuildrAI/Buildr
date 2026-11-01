import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryView } from '../../src/domain/conversation-activity.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

test('released historical unknown rounds do not keep a stopped conversation active; unresolved tools still do',()=>{
 const run={id:'old',status:'unknown',resourcesReleased:true,executionState:'unknown',tools:[]} as any;
 const record={view:{run:{id:'cancelled',status:'stopped',resourcesReleased:true,tools:[]},retainedRuns:[run],requests:[],hidden:false},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false);
 assert.equal(summaryView(record,4,3,'now').activity!.active,true,'unread work remains visible');
 run.tools=[{id:'uncertain-operation',status:'unknown'}];assert.equal(summaryView(record,3,3,'now').activity!.active,true);
 run.tools=[];run.resourcesReleased=false;assert.equal(summaryView(record,3,3,'now').activity!.active,true,'unreleased work remains visible');
});

test('confirmed replacement keeps uncertain resources internal and does not create user attention',()=>{
 const old={id:'old',status:'unknown',supersededBy:'new',tools:[{id:'uncertain',status:'unknown'}]} as any;
 const record={view:{run:{id:'new',status:'completed',tools:[]},retainedRuns:[old],requests:[],hidden:false},participants:[]} as unknown as StoredConversation;
 assert.equal(summaryView(record,3,3,'now').activity!.active,false);
 assert.equal(summaryView(record,4,3,'now').activity!.active,true,'unread new answers still require attention');
 assert.equal(record.view.retainedRuns![0]!.tools[0]!.status,'unknown','physical facts remain preserved');
});
