import test from 'node:test';
import assert from 'node:assert/strict';
import {readParticipationRun} from '../src/features/agent-conversations/participation-navigation.ts';
const page=(entries=[],nextEntryCursor)=>({entries,nextEntryCursor});
test('participation navigation loads only missing metadata pages and stops on the exact original run',async()=>{
 let reads=0,prepends=0;const initial=page([{runId:'new'}],20);
 const result=await readParticipationRun({initial,runId:'old',signal:new AbortController().signal,current:()=>true,read:async cursor=>{reads++;assert.equal(cursor,20);return page([{runId:'old'}]);},prepend:()=>prepends++});
 assert.equal(result,'found');assert.equal(reads,1);assert.equal(prepends,1);
 assert.equal(await readParticipationRun({initial:page([{runId:'old'}]),runId:'old',signal:new AbortController().signal,current:()=>true,read:()=>assert.fail('already loaded'),prepend:()=>{}}),'found');
});
test('late pages cannot change another selection and pagination cycles are bounded',async()=>{
 let current=true,prepends=0;
 const result=await readParticipationRun({initial:page([],20),runId:'old',signal:new AbortController().signal,current:()=>current,read:async()=>{current=false;return page([{runId:'old'}]);},prepend:()=>prepends++});assert.equal(result,'cancelled');assert.equal(prepends,0);
 assert.equal(await readParticipationRun({initial:page([],20),runId:'old',signal:new AbortController().signal,current:()=>true,read:async()=>page([],20),prepend:()=>{}}),'limit');
});
