import test from 'node:test';
import assert from 'node:assert/strict';
import {associationPages,associationKey,taskLinkKey,conversationTaskLinks,associationCandidates,associationQueryReady,prefixAssociationMatches} from '../src/features/agent-conversations/conversation-associations.ts';
import {readDraft,writeDraft} from '../src/features/agent-conversations/conversation-state.ts';

test('association identity includes workspace and legacy links remain local',()=>{
  const local={workspaceId:'a',taskId:'same'},remote={workspaceId:'b',taskId:'same'};
  assert.notEqual(taskLinkKey(local),taskLinkKey(remote));
  assert.equal(taskLinkKey(local),associationKey({workspaceId:'a',id:'same'}));
  assert.deepEqual(conversationTaskLinks({workspaceId:'a',taskId:'same'}),[local]);
  assert.deepEqual(conversationTaskLinks({workspaceId:'a',taskIds:['same'],taskLinks:[remote]}),[remote]);
});
test('prefix discovery includes later pages and accepts title or identifier prefixes',async()=>{
  const signal=new AbortController().signal,calls=[];
  const rows=await associationPages(async cursor=>{calls.push(cursor);return cursor?{items:[{workspaceId:'b',id:'same',title:'完整标题'}]}:{items:[{workspaceId:'a',id:'same',title:'完整标题附加'}],nextCursor:'next'};},signal);
  assert.deepEqual(calls,[undefined,'next']);assert.equal(prefixAssociationMatches(rows,'same').length,2);
  assert.deepEqual(prefixAssociationMatches(rows,'完整标题').map(row=>row.workspaceId),['a','b']);assert.equal(prefixAssociationMatches(rows,'完整').length,2);assert.equal(prefixAssociationMatches(rows,'标题').length,0);
  assert.equal(prefixAssociationMatches(rows,' s ').length,0);assert.equal(prefixAssociationMatches(rows,' SAME ').length,0);assert.equal(prefixAssociationMatches(rows,' sa ').length,2);
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

test('association search requires two Unicode characters after trimming',()=>{
  assert.equal(associationQueryReady(' 地 '),false);assert.equal(associationQueryReady(' 地方 '),true);
  assert.equal(associationQueryReady('😀'),false);assert.equal(associationQueryReady('😀😀'),true);
});

test('both endpoints cap after deduplication and retain separate workspace identities',()=>{
  const items=Array.from({length:8},(_,index)=>({workspaceId:'space-'+index,id:'same',title:'标题'}));
  assert.deepEqual(associationCandidates([items[0],items[0],...items.slice(1)]),items.slice(0,5));
});
