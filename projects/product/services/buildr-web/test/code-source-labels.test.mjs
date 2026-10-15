import assert from 'node:assert/strict';
import test from 'node:test';
import { codeWorktreeLabel, codeWorktreeGroupLabel } from '../src/features/code/code-source-labels.ts';

const member = (id, repositoryId, path, extra = {}) => ({id, repositoryId, groupId:'main', path, branch:'dev', kind:'main', taskId:null, available:true, ...extra});
const catalog = worktrees => ({worktrees, worktreeGroups:[{id:'main',name:'主目录',kind:'main',taskId:null,repositoryIds:['api','web']} ]});

test('登记目录的主名称使用实际工作树名，角色与分支路径单独说明且不改身份', () => {
  const source = member('registered-linked','api','/workspace/.worktrees/checkout-r143');
  const before = structuredClone(source);
  assert.deepEqual(codeWorktreeLabel(source), {
    name:'checkout-r143', role:'工作空间登记目录', description:'dev · /workspace/.worktrees/checkout-r143',
  });
  assert.deepEqual(source, before);
});

test('多库同组列出各自真实目录名，并按代码库范围重新计算', () => {
  const sources = catalog([member('api-main','api','/workspace/api-tree'),member('web-main','web','/workspace/web-tree')]);
  assert.equal(codeWorktreeGroupLabel(sources).name,'api-tree、web-tree');
  assert.equal(codeWorktreeGroupLabel(sources,'main',['api']).name,'api-tree');
  assert.equal(codeWorktreeGroupLabel(sources,'main',['web']).name,'web-tree');
  assert.equal(codeWorktreeGroupLabel(sources).description,'dev · /workspace/api-tree；dev · /workspace/web-tree');
});

test('同名不同目录用实际路径消歧，缩到单库后不保留无关路径', () => {
  const api = member('api-main','api','/workspace/api/shared');
  const web = member('web-main','web','/workspace/web/shared');
  const sources = catalog([api,web]);
  assert.equal(codeWorktreeLabel(api,[api,web]).name,'shared（/workspace/api/shared）');
  assert.equal(codeWorktreeGroupLabel(sources).name,'shared（/workspace/api/shared）、shared（/workspace/web/shared）');
  assert.equal(codeWorktreeGroupLabel(sources,'main',['api']).name,'shared');
  assert.equal(codeWorktreeGroupLabel(catalog([api,{...api,id:'alias',repositoryId:'web'}])).name,'shared');
});

test('不同工作树组选项的同名目录仍可区分，但不借未选代码库扩展路径', () => {
  const one=member('api-one','api','/workspace/one/shared',{groupId:'worktree:one',kind:'worktree'});
  const two=member('api-two','api','/workspace/two/shared',{groupId:'worktree:two',kind:'worktree'});
  const web=member('web-only','web','/workspace/web/shared',{groupId:'worktree:web',kind:'worktree'});
  const sources={worktrees:[one,two,web],worktreeGroups:[one,two,web].map(source=>({id:source.groupId,name:'shared',kind:'worktree',taskId:null,repositoryIds:[source.repositoryId]}))};
  assert.equal(codeWorktreeGroupLabel(sources,one.groupId,['api']).name,'shared（/workspace/one/shared）');
  assert.equal(codeWorktreeGroupLabel(sources,two.groupId,['api']).name,'shared（/workspace/two/shared）');
  assert.equal(codeWorktreeGroupLabel(sources,web.groupId,['web']).name,'shared');
  assert.equal(codeWorktreeGroupLabel(sources,web.groupId).name,'shared（/workspace/web/shared）');
});

test('Windows盘符、反斜线和UNC路径都取真实末级目录，末尾分隔符不产生空名', () => {
  const paths = ['C:\\workspace\\.worktrees\\source-refresh\\','C:/workspace/.worktrees/source-refresh/','\\\\server\\share\\source-refresh\\'];
  for (const path of paths) assert.equal(codeWorktreeLabel(member('tree','api',path)).name,'source-refresh');
  assert.equal(codeWorktreeLabel(member('root','api','C:\\')).name,'C:\\');
  assert.equal(codeWorktreeLabel(member('root','api','/')).name,'/');
});

test('任务角色与任务标题只作补充，失效成员仍保留已知目录名', () => {
  const source = member('task-checkout','api','/workspace/.worktrees/feature-task',{groupId:'task:feature',kind:'task',taskId:'feature',branch:null,available:false});
  const sources = {worktrees:[source],worktreeGroups:[{id:'task:feature',name:'实现需求',kind:'task',taskId:'feature',repositoryIds:['api']}]};
  assert.deepEqual(codeWorktreeGroupLabel(sources,'task:feature',['api']), {
    name:'feature-task',role:'任务工作树',description:'实现需求；/workspace/.worktrees/feature-task',
  });
});

test('没有实际成员时不将角色或其他范围的目录冒充为当前工作树名', () => {
  const sources = catalog([member('api-main','api','/workspace/api-tree')]);
  assert.deepEqual(codeWorktreeGroupLabel(sources,'main',['missing']), {name:'目录暂不可确认',role:'工作空间登记目录',description:''});
  assert.equal(codeWorktreeGroupLabel(null).name,'目录暂不可确认');
  assert.equal(codeWorktreeGroupLabel(sources,'unknown').name,'目录暂不可确认');
});
