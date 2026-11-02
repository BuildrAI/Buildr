import test from 'node:test';
import assert from 'node:assert/strict';
import {associationPages,associationKey,taskLinkKey,conversationTaskLinks,exactAssociationMatches} from '../src/features/agent-conversations/conversation-associations.ts';
import {readDraft,writeDraft} from '../src/features/agent-conversations/conversation-state.ts';

test('association identity includes workspace and legacy links remain local',()=>{
  const local={workspaceId:'a',taskId:'same'},remote={workspaceId:'b',taskId:'same'};
  assert.notEqual(taskLinkKey(local),taskLinkKey(remote));
  assert.equal(taskLinkKey(local),associationKey({workspaceId:'a',id:'same'}));
  assert.deepEqual(conversationTaskLinks({workspaceId:'a',taskId:'same'}),[local]);
  assert.deepEqual(conversationTaskLinks({workspaceId:'a',taskIds:['same'],taskLinks:[remote]}),[remote]);
});
test('exact discovery includes later pages and never promotes partial titles or codes',async()=>{
  const signal=new AbortController().signal,calls=[];
  const rows=await associationPages(async cursor=>{calls.push(cursor);return cursor?{items:[{workspaceId:'b',id:'same',title:'完整标题'}]}:{items:[{workspaceId:'a',id:'same',title:'完整标题附加'}],nextCursor:'next'};},signal);
  assert.deepEqual(calls,[undefined,'next']);assert.equal(exactAssociationMatches(rows,'same').length,2);
  assert.deepEqual(exactAssociationMatches(rows,'完整标题').map(row=>row.workspaceId),['b']);assert.equal(exactAssociationMatches(rows,'完整').length,0);
});
test('discovery rejects loops and cancelled responses rather than reporting completion',async()=>{
  await assert.rejects(associationPages(async()=>({items:[],nextCursor:'repeat'}),new AbortController().signal),/分页位置重复/);
  const controller=new AbortController();await assert.rejects(associationPages(async()=>{controller.abort();return {items:[]};},controller.signal),{name:'AbortError'});
});
test('new draft saves the full relation independently of local task projection',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const taskLinks=[{workspaceId:'b',taskId:'same'}];
  assert.equal(writeDraft('draft','',storage,undefined,'a',taskLinks),true);
  const restored=readDraft('draft',storage);assert.deepEqual(restored.taskLinks,taskLinks);assert.equal(restored.workspaceId,'a');assert.equal(restored.taskId,undefined);
});

test('a later failed page retains already observed candidates without claiming completeness',async()=>{
  const partial=[];
  await assert.rejects(associationPages(async cursor=>{if(cursor)throw new Error('unavailable');return {items:['observed'],nextCursor:'next'};},new AbortController().signal,page=>partial.push(...page)),/unavailable/);
  assert.deepEqual(partial,['observed']);
});
