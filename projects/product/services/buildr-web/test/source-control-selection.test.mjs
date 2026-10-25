import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveTaskSourceSelection, resolveSharedSourceSelection} from '../src/features/code/source-control-selection.ts';
import {sourceControlWorktreeKey as key} from '../src/features/code/source-control-model.ts';
const target={repositoryId:'repo',checkoutId:'task'}, other={repositoryId:'repo',checkoutId:'main'};
const scope={key:'entry-1',worktrees:[{repositoryId:'repo',worktreeId:'task'},{repositoryId:'other',worktreeId:'task'}]};
const task=overrides=>resolveTaskSourceSelection({active:true,observed:true,scope,appliedKey:'',baseline:{key:'entry-1',sourceKey:'choice-1'},currentSourceKey:'choice-1',taskId:'task-1',availableSourceKeys:[key('repo','task'),key('other','task')],...overrides});
const shared=overrides=>resolveSharedSourceSelection({active:true,observed:true,scopeKey:'',currentEntry:'',selectionEpoch:'',appliedKey:'',selection:{key:'choice-1',targets:[target,other]},selectedIdentity:key('repo','main'),...overrides});

test('inactive, pending and already consumed task observations never apply a selection',()=>{
 for(const input of [{active:false},{observed:false},{scope:undefined},{appliedKey:'entry-1'}])assert.equal(task(input).kind,'wait');
});
test('task selection waits for observation and then selects the actual task checkout, not the main checkout',()=>{
 assert.equal(task({observed:false}).kind,'wait');
 assert.deepEqual(task(),{kind:'apply',saved:undefined,key:key('repo','task'),target});
});
for(const order of ['target-first','unrelated-first'])test('a newer explicit source wins over a cold task entry: '+order,()=>{
 const waiting=task({observed:false,currentSourceKey:'newer-choice'});assert.equal(waiting.kind,'wait');
 const batches=order==='target-first'?[['repo'],['other']]:[['other'],['repo']];let seen=[];
 for(const batch of batches){seen.push(...batch);const result=task({observed:seen.length===2,currentSourceKey:'newer-choice',availableSourceKeys:seen.map(id=>key(id,'task'))});assert.equal(result.kind,seen.length===2?'superseded':'wait');}
});
test('a fresh task entry consumes its own baseline once and does not ignore an older shared choice',()=>{
 assert.equal(task({baseline:{key:'entry-2',sourceKey:'older'},currentSourceKey:'choice-1'}).kind,'apply');
 assert.equal(task({appliedKey:'entry-1',currentSourceKey:'newer'}).kind,'wait');
});
test('saved task reading is retained only when its exact repository and checkout are still in scope and observed',()=>{
 const saved={selectedWorktreeKey:key('other','task'),commitHash:'fixed',position:900};
 const result=task({saved});assert.equal(result.saved,saved);assert.equal(result.key,saved.selectedWorktreeKey);assert.deepEqual(result.target,{repositoryId:'other',checkoutId:'task'});
 for(const input of [{availableSourceKeys:[key('repo','task')]},{saved:{...saved,selectedWorktreeKey:key('other','main')}}])assert.equal(task({saved,...input}).saved,undefined);
});
test('empty task scopes preserve missing identity instead of silently choosing another repository',()=>{
 assert.equal(task({scope:{key:'entry-1',worktrees:[]}}).key,'missing-task:task-1');assert.equal(task({scope:{key:'entry-1',worktrees:[]}}).target,undefined);
});
test('inactive or pending shared observations cannot mutate retained intent',()=>{
 assert.equal(shared({active:false}),null);assert.equal(shared({observed:false}),null);
});
test('a new task entry fences old shared replies until its own selection is resolved',()=>{
 assert.deepEqual(shared({scopeKey:'entry-2',currentEntry:'entry-1'}),{entryKey:'entry-2',appliedKey:'choice-1'});
 assert.deepEqual(shared({scopeKey:'entry-2',currentEntry:'entry-2',selectionEpoch:'entry-1'}),{entryKey:'entry-2',appliedKey:''});
});
test('same shared intent is idempotent while a repeated explicit choice with a new key applies',()=>{
 assert.equal(shared({appliedKey:'choice-1'}).nextKey,undefined);
 assert.equal(shared({selection:{key:'choice-2',targets:[target],preferredTarget:target},appliedKey:'choice-1'}).nextKey,key('repo','task'));
});
test('explicit preferred identity wins; otherwise retain an existing collection member, then its first member',()=>{
 assert.equal(shared().nextKey,key('repo','main'));
 assert.equal(shared({selection:{key:'choice-1',targets:[target,other],preferredTarget:target}}).nextKey,key('repo','task'));
 assert.equal(shared({selectedIdentity:key('unrelated','task')}).nextKey,key('repo','task'));
});
test('same checkout name across repositories cannot substitute the currently selected identity',()=>{
 assert.equal(shared({selection:{key:'choice-1',targets:[{repositoryId:'other',checkoutId:'task'}]},selectedIdentity:key('repo','task')}).nextKey,key('other','task'));
 assert.equal(shared({selection:{key:'choice-1',targets:[]}}).nextKey,undefined);
});
