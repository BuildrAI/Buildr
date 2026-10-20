import assert from 'node:assert/strict';
import test from 'node:test';
import {createCodeSourceSelectionStore,codeSourceSelectionFilter} from '../src/features/code/code-source-selection.ts';

test('工作空间选择互相隔离，默认初始化没有选择意图',()=>{
  const one=createCodeSourceSelectionStore(),other=createCodeSourceSelectionStore();
  assert.equal(one.snapshot(),null);assert.equal(other.snapshot(),null);
  one.select('explorer',[{repositoryId:'repo',checkoutId:'registered'}]);
  assert.equal(other.snapshot(),null);
});
test('显式选择按真实库与检出身份去重，首选来源须属于目标集合，输入对象不被借用',()=>{
  const store=createCodeSourceSelectionStore(),target={repositoryId:'repo',checkoutId:'linked'};
  let notifications=0;const release=store.subscribe(()=>notifications++);
  store.select('source-control',[target,{...target},{repositoryId:'other',checkoutId:'linked'},{repositoryId:'',checkoutId:'invalid'}],target);
  target.checkoutId='replaced';
  assert.deepEqual(store.snapshot(),{sequence:1,origin:'source-control',targets:[{repositoryId:'repo',checkoutId:'linked'},{repositoryId:'other',checkoutId:'linked'}],preferredTarget:{repositoryId:'repo',checkoutId:'linked'}});
  assert.equal(notifications,1);release();
  store.select('explorer',[],target);assert.equal(notifications,1);assert.equal(store.snapshot().preferredTarget,undefined);
});
test('相同目标再次明确选择仍产生新意图，能覆盖另一入口刚打开的任务来源',()=>{
  const store=createCodeSourceSelectionStore(),target={repositoryId:'repo',checkoutId:'registered'};
  store.select('explorer',[target],target);const first=store.snapshot();
  store.select('explorer',[target],target);
  assert.equal(store.snapshot().sequence,first.sequence+1);assert.deepEqual(store.snapshot().targets,first.targets);
});
test('检出身份映射资源管理器范围，不按同名分支或路径替换失效身份',()=>{
  const catalog={worktrees:[{id:'registered',repositoryId:'repo',groupId:'main',path:'/repo',branch:'same'},
    {id:'linked',repositoryId:'repo',groupId:'worktree:linked',path:'/same/path',branch:'same'},
    {id:'linked',repositoryId:'other',groupId:'task:shared',path:'/same/path',branch:'same'}]};
  assert.deepEqual(codeSourceSelectionFilter(catalog,{targets:[{repositoryId:'repo',checkoutId:'registered'}]}),{repositoryIds:['repo'],groupId:'checkout:registered'});
  assert.deepEqual(codeSourceSelectionFilter(catalog,{targets:[{repositoryId:'other',checkoutId:'linked'}]}),{repositoryIds:['other'],groupId:'checkout:linked'});
  assert.equal(codeSourceSelectionFilter(catalog,{targets:[{repositoryId:'repo',checkoutId:'retired'}]}),null);
  assert.equal(codeSourceSelectionFilter(catalog,{targets:[{repositoryId:'repo',checkoutId:'retired'},{repositoryId:'repo',checkoutId:'linked'}],preferredTarget:{repositoryId:'repo',checkoutId:'retired'}}),null,'首选失效不能回退集合中另一来源');
});
test('集合保留同组多个代码库，已确认但不可用的身份仍映射原范围',()=>{
  const catalog={worktrees:[{id:'api-task',repositoryId:'api',groupId:'task:shared',available:false},{id:'web-task',repositoryId:'web',groupId:'task:shared',available:true}]};
  assert.deepEqual(codeSourceSelectionFilter(catalog,{targets:[{repositoryId:'api',checkoutId:'api-task'},{repositoryId:'web',checkoutId:'web-task'}]}),{repositoryIds:['api','web'],groupId:'task:shared'});
});
