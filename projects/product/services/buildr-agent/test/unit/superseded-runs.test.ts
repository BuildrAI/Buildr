import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLegacySupersededRuns } from '../../src/domain/superseded-runs.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

for(const mode of ['confirmed','preview','same-selection','unaccepted','later-old-input','wrong-participant','new-turn-policy'] as const)test('legacy retirement requires an exact accepted later switch: '+mode,()=>{
  const record={view:{run:{id:'current'},retainedRuns:[{id:'old',participantId:'old-owner'}],entries:[{kind:'handoff',sequence:20,runId:'new',participantId:'new-owner',status:mode==='preview'?'sending':'accepted',handoff:{changes:mode==='same-selection'?[]:[{kind:'model'}]}}]},attempts:[
    {runId:'old',participantId:'old-owner',through:10,accepted:true},
    {runId:'new',participantId:mode==='wrong-participant'?'someone-else':'new-owner',through:21,accepted:mode!=='unaccepted',...(mode==='new-turn-policy'?{questionWaits:[]}: {})},
    ...(mode==='later-old-input'?[{runId:'old',participantId:'old-owner',through:30,accepted:true}]:[]),
  ]} as unknown as StoredConversation;
  assert.equal(reconcileLegacySupersededRuns(record),mode==='confirmed');
  assert.equal(record.view.retainedRuns![0]!.supersededBy,mode==='confirmed'?'new':undefined);
  assert.equal(record.view.run!.id,'current');assert.equal(reconcileLegacySupersededRuns(record),false,'idempotent');
});
