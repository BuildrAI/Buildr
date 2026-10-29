import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingSubmission, clearPendingSubmission } from '../src/features/agent-conversations/conversation-pending.ts';

test('unknown pending submission keeps its original request and payload across refreshed observations',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const input={expectedRevision:'first',connectionId:'codex',text:'continue',modelAccountRevision:'account-before'};
  const original=pendingSubmission('workspace','conversation',input,storage);
  const retried=pendingSubmission('workspace','conversation',{...input,expectedRevision:'newer-stream',modelAccountRevision:'account-after'},storage);
  assert.equal(retried.clientRequestId,original.clientRequestId);assert.deepEqual(retried.input,input);
  const changed=pendingSubmission('workspace','conversation',{...input,text:'different instruction'},storage);
  assert.notEqual(changed.clientRequestId,original.clientRequestId);
  clearPendingSubmission('workspace','conversation',storage);
  assert.notEqual(pendingSubmission('workspace','conversation',input,storage).clientRequestId,original.clientRequestId);
});
