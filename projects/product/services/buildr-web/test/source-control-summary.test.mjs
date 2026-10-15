import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceControlReadDiagnostics } from '../src/features/code/source-control-summary.ts';

const diagnostic = (message, repositoryId = 'api', worktreeId = 'api-task', code = 'code_worktree_read_limit') => ({code,message,repositoryId,worktreeId});
const worktree = (repositoryId, extra = {}) => ({worktreeId:repositoryId+'-task',name:'feature-task',location:'/code/'+repositoryId+'/feature-task',status:'complete',diagnostics:[],taskDiagnostic:null,...extra});
const repository = (id, extra = {}) => ({id,name:id.toUpperCase(),location:'/code/'+id,status:'complete',diagnostics:[],worktrees:[worktree(id)],...extra});
const state = (repositories = [], extra = {}) => ({data:{repositories,diagnostics:[]},error:'',repositoryErrors:{},...extra});

test('HTTP200的工作树不可用仍展示真实读取原因与实际来源，聚合重复诊断只显示一次', () => {
  const failure=diagnostic(' 超出本次读取预算 ');
  const source=repository('api',{status:'partial',diagnostics:[failure],worktrees:[worktree('api',{status:'unavailable',diagnostics:[failure,{...failure,message:'超出本次读取预算'}],taskDiagnostic:'任务目录关联尚未完整读取。'})]});
  assert.deepEqual(sourceControlReadDiagnostics(state([source])), {
    readDiagnostics:['API · feature-task · /code/api/feature-task：超出本次读取预算'],failedRepositoryIds:['api'],
  });
});

test('HTTP200的部分路径和整库不可用原因都保留，重试仅针对对应代码库', () => {
  const partial=diagnostic('只返回1000个路径','api','api-task','code_changes_truncated');
  const offline=diagnostic('登记目录暂不可读取','web',null,'code_source_unavailable');
  const result=sourceControlReadDiagnostics(state([
    repository('api',{status:'partial',diagnostics:[partial],worktrees:[worktree('api',{status:'partial',diagnostics:[partial]})]}),
    repository('healthy'),repository('web',{status:'unavailable',worktrees:[],diagnostics:[offline]}),
  ]));
  assert.deepEqual(result, {readDiagnostics:[
    'API · feature-task · /code/api/feature-task：只返回1000个路径',
    'WEB · web · /code/web：登记目录暂不可读取',
  ],failedRepositoryIds:['api','web']});
});

test('空诊断与已完整读取的任务关联消息不会制造读取失败，部分来源也不借用任务原因', () => {
  const task=diagnostic('任务目录关联尚未完整读取。','api','api-task','code_task_location_unavailable');
  const source=repository('api',{diagnostics:[task],worktrees:[worktree('api',{diagnostics:[task],taskDiagnostic:task.message})]});
  assert.deepEqual(sourceControlReadDiagnostics(state([source],{data:{repositories:[source],diagnostics:[task]}})),{readDiagnostics:[],failedRepositoryIds:[]});
  const partial=repository('api',{status:'partial',diagnostics:[task,diagnostic('  ','api',null)],worktrees:[worktree('api',{status:'unavailable',diagnostics:[task,diagnostic('')],taskDiagnostic:task.message})]});
  assert.deepEqual(sourceControlReadDiagnostics(state([partial])),{readDiagnostics:[],failedRepositoryIds:['api']});
});

test('HTTP错误和响应中的局部失败合并去空去重，健康库不会加入局部重试', () => {
  const failure=diagnostic('读取超时','api','api-task');
  const source=repository('api',{status:'partial',diagnostics:[failure],worktrees:[worktree('api',{status:'unavailable',diagnostics:[failure]})]});
  const result=sourceControlReadDiagnostics(state([source,repository('web'),repository('healthy')],{repositoryErrors:{api:' 本库HTTP暂不可读取 ',web:'Web请求失败',healthy:'  ',removed:'已移除来源'}}));
  assert.deepEqual(result.failedRepositoryIds,['api','web','removed']);
  assert.deepEqual(result.readDiagnostics,[
    'API · api · /code/api：本库HTTP暂不可读取','WEB · web · /code/web：Web请求失败','removed：已移除来源',
    'API · feature-task · /code/api/feature-task：读取超时',
  ]);
});

test('多代码库相同失败文本各自可定位，完整的另一工作树不会因聚合库partial误报', () => {
  const sources=['api','web'].map(id=>{
    const failed=diagnostic('读取超时',id,id+'-task'),healthy=diagnostic('与当前读取无关',id,id+'-main');
    return repository(id,{status:'partial',diagnostics:[failed,failed,healthy],worktrees:[worktree(id,{status:'unavailable',diagnostics:[failed]}),worktree(id,{worktreeId:id+'-main',name:'main',diagnostics:[healthy]})]});
  });
  assert.deepEqual(sourceControlReadDiagnostics(state(sources)),{readDiagnostics:[
    'API · feature-task · /code/api/feature-task：读取超时','WEB · feature-task · /code/web/feature-task：读取超时',
  ],failedRepositoryIds:['api','web']});
});

test('全局读取失败保留独立原因供全局核对，正常或未读取现场返回空', () => {
  assert.deepEqual(sourceControlReadDiagnostics(state([],{data:null,error:' 全目录读取失败 ',repositoryErrors:{api:' '}})),{readDiagnostics:['全目录读取失败'],failedRepositoryIds:[]});
  assert.deepEqual(sourceControlReadDiagnostics(state([repository('api')])),{readDiagnostics:[],failedRepositoryIds:[]});
  assert.deepEqual(sourceControlReadDiagnostics(state([],{data:null})),{readDiagnostics:[],failedRepositoryIds:[]});
});

test('渐进登记骨架保持未知但pending不成为失败原因或局部重试对象', () => {
  const waiting=diagnostic('尚未检查','api',null,'code_source_control_pending');
  const source=repository('api',{status:'unavailable',worktrees:[],diagnostics:[waiting]});
  assert.deepEqual(sourceControlReadDiagnostics(state([source],{data:{repositories:[source],diagnostics:[waiting]}})),{readDiagnostics:[],failedRepositoryIds:[]});
});
