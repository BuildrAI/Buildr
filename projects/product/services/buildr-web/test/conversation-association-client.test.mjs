import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const calls=[];
const taskApi={
  async titleSummaries(workspaceId,taskIds,options){
    calls.push({workspaceId,taskIds:[...taskIds],signal:options?.signal});
    if(workspaceId==='workspace-b')throw new Error('空间暂时不可用');
    return {
      schemaVersion:'buildr.task-title-summary-list/v1',
      items:[{taskId:'task-a1',title:'任务 A1'}],
      missingTaskIds:['task-a2'],
    };
  },
};
const workspaceApi={async listRegistered(){return {workspaces:[]};}};
Object.assign(globalThis,{__associationTaskApi:taskApi,__associationWorkspaceApi:workspaceApi});

registerHooks({
  resolve(specifier,context,next){
    if(context.parentURL?.endsWith('/conversation-association-client.ts')){
      if(specifier==='../task/api/task-api')return {url:'data:text/javascript,export const taskApi=globalThis.__associationTaskApi;',shortCircuit:true};
      if(specifier==='../workspace/api/workspace-api')return {url:'data:text/javascript,export const workspaceApi=globalThis.__associationWorkspaceApi;',shortCircuit:true};
      if(specifier==='./conversation-associations')return next(new URL('./conversation-associations.ts',context.parentURL).href,context);
    }
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.endsWith('/conversation-association-client.ts'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    return next(url,context);
  },
});

const {linkedTaskItems}=await import('../src/features/agent-conversations/conversation-association-client.ts');

test('已关联任务按工作空间批量读取标题，不逐条读取完整详情',async()=>{
  calls.length=0;
  const rows=await linkedTaskItems([
    {workspaceId:'workspace-a',taskId:'task-a1'},
    {workspaceId:'workspace-b',taskId:'task-b1'},
    {workspaceId:'workspace-a',taskId:'task-a2'},
  ],new AbortController().signal);
  assert.equal(calls.length,2);
  assert.deepEqual(calls.find(call=>call.workspaceId==='workspace-a')?.taskIds,['task-a1','task-a2']);
  assert.deepEqual(calls.find(call=>call.workspaceId==='workspace-b')?.taskIds,['task-b1']);
  assert.deepEqual(rows,[
    {workspaceId:'workspace-a',id:'task-a1',title:'任务 A1'},
    {workspaceId:'workspace-b',id:'task-b1',title:'task-b1',error:'空间暂时不可用'},
    {workspaceId:'workspace-a',id:'task-a2',title:'task-a2',error:'任务不存在。'},
  ]);
});

test('已取消的读取不继续访问任务接口',async()=>{
  calls.length=0;
  const controller=new AbortController();controller.abort();
  await assert.rejects(linkedTaskItems([{workspaceId:'workspace-a',taskId:'task-a1'}],controller.signal),{name:'AbortError'});
  assert.equal(calls.length,0);
});
