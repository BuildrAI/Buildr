import test from 'node:test';
import assert from 'node:assert/strict';
import {codeFilterMembers,codeFilterOptions,retainCodeSelections,selectCodeWorktreeGroup} from '../src/features/code/code-filters.ts';
import {codeBrowserKey,codeLocationKey} from '../src/features/code/code-navigation.ts';
const member=(id,repositoryId,groupId)=>({id,repositoryId,groupId,path:'/code/'+id,branch:'dev',kind:groupId==='main'?'main':'worktree',taskId:null,available:true});
const catalog={repositories:[{id:'api',name:'API'},{id:'web',name:'Web'}],worktreeGroups:[{id:'main',name:'主目录',repositoryIds:['api','web']},{id:'task:feature',name:'共同任务',repositoryIds:['api','web']},{id:'native',name:'原生树',repositoryIds:['web']}],worktrees:[member('api-main','api','main'),member('web-main','web','main'),member('api-task','api','task:feature'),member('web-task','web','task:feature'),member('web-native','web','native')]};
test('代码库多选与单工作树联动，工作树不选时主目录',()=>{
  assert.deepEqual(codeFilterMembers(catalog,[],'main').map(item=>item.id),['api-main','web-main']);
  assert.deepEqual(codeFilterOptions(catalog,['api']).groups.map(item=>item.id),['main','task:feature']);
  assert.deepEqual(codeFilterOptions(catalog,[],'native').repositories.map(item=>item.id),['web']);
  assert.deepEqual(codeFilterMembers(catalog,['web'],'task:feature').map(item=>item.id),['web-task']);
  assert.deepEqual(codeFilterMembers(catalog,['web'],'native').map(item=>item.id),['web-native']);
  assert.deepEqual(codeFilterMembers(catalog,['api','web'],'task:feature').map(item=>item.id),['api-task','web-task']);
  assert.deepEqual(codeFilterMembers(catalog,[]).map(item=>item.id),['api-main','web-main']);
  assert.deepEqual(codeFilterMembers(catalog,['web']).map(item=>item.id),['web-main']);
  assert.deepEqual(codeFilterOptions(catalog,[]).groups.map(item=>item.id),['main','task:feature','native']);
  assert.deepEqual(codeFilterMembers(catalog,['api'],'native'),[]);
});
test('同库多个目录与历史版本的浏览键不混用，树键不会含路径分隔符',()=>{
  const sources=[{repositoryId:'api',checkoutId:'api-main'},{repositoryId:'api',checkoutId:'api-task'},{repositoryId:'api',checkoutId:'api-task',commitHash:'a'.repeat(40)}];
  assert.equal(new Set(sources.map(codeBrowserKey)).size,3);
  for(const source of sources){const key=codeBrowserKey(source);assert.ok(!key.includes('::'));assert.equal(decodeURIComponent(key),codeLocationKey(source));}
});
test('已登记但暂不可用的实例仍可选择主目录并接收局部诊断，不消失在候选中',()=>{
  const partial={...catalog,repositories:[...catalog.repositories,{id:'offline',name:'离线代码库',available:false}]};
  assert.ok(codeFilterOptions(partial,[],'main').repositories.some(repository=>repository.id==='offline'));
  assert.deepEqual(codeFilterOptions(partial,['offline'],'main').groups.map(group=>group.id),['main']);
  assert.deepEqual(codeFilterMembers(partial,['offline'],'main'),[]);
  assert.ok(!codeFilterOptions(partial,[],'native').repositories.some(repository=>repository.id==='offline'));
});
test('已选目录消失或同路径重建保留旧身份的失败，不接受替换身份；未选组不额外保留',()=>{
  const old=catalog.worktrees.find(item=>item.id==='api-task');
  const rebuilt={...old,id:'api-task-rebuilt',available:true};
  const next={...catalog,worktrees:catalog.worktrees.filter(item=>item.id!==old.id).concat(rebuilt)};
  const retained=retainCodeSelections(next,catalog,'task:feature');
  assert.equal(retained.worktrees.find(item=>item.id===old.id).available,false);
  assert.equal(retained.worktrees.some(item=>item.id===rebuilt.id),false);
  assert.equal(retained.worktrees.find(item=>item.id==='web-task').available,true);
  const untouched=retainCodeSelections(next,catalog,'main');
  assert.equal(untouched.worktrees.some(item=>item.id===rebuilt.id),true);
  assert.equal(untouched.worktrees.some(item=>item.id===old.id),false);
  const continuing=selectCodeWorktreeGroup(next,retained,'task:feature','task:feature');
  assert.equal(continuing.worktrees.find(item=>item.id===old.id).available,false);
  assert.equal(continuing.worktrees.some(item=>item.id===rebuilt.id),false);
  const cleared=selectCodeWorktreeGroup(next,retained,'task:feature');
  assert.equal(cleared.worktrees.some(item=>item.id===rebuilt.id),true);
  assert.deepEqual(codeFilterMembers(cleared,[]).map(item=>item.id),['api-main','web-main']);
  const explicitlyReselected=selectCodeWorktreeGroup(next,cleared,undefined,'task:feature');
  assert.equal(explicitlyReselected.worktrees.some(item=>item.id===rebuilt.id),true);
  const removed=selectCodeWorktreeGroup(next,retained,'task:feature','native');
  const reselected=selectCodeWorktreeGroup(next,removed,'native','task:feature');
  assert.equal(reselected.worktrees.some(item=>item.id===rebuilt.id),true);
  assert.equal(reselected.worktrees.some(item=>item.id===old.id),false);
});
