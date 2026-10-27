import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';

registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith('/TaskConversationEntry.tsx')) return next(specifier, context);
    if (specifier === 'react') return {url:'data:text/javascript,'+encodeURIComponent('export const useState=initial=>globalThis.__taskEntryState(initial);export const useEffect=()=>{};export const useContext=()=>true;'),shortCircuit:true};
    if (specifier.endsWith('/pageTabs')) return {url:'data:text/javascript,export const WorkspaceViewActiveContext={};',shortCircuit:true};
    if (specifier === './AgentConversationsContext') return {url:'data:text/javascript,export const useOptionalAgentConversations=()=>globalThis.__taskEntryContext;',shortCircuit:true};
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/TaskConversationEntry.tsx')) return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    return next(url, context);
  },
});
const {TaskConversationEntry}=await import('../src/features/agent-conversations/TaskConversationEntry.tsx');

function markup({rows=[],loading=false,error=''}={}) {
  const states=[rows,loading,error,false];let index=0;
  globalThis.__taskEntryState=()=>[states[index++],()=>{}];
  globalThis.__taskEntryContext={api:{},openConversation(){},newConversation(){}};
  try {return renderToStaticMarkup(TaskConversationEntry({workspaceId:'workspace',taskId:'task'}));}
  finally {delete globalThis.__taskEntryState;delete globalThis.__taskEntryContext;}
}

test('任务入口读取中保持动作名称，另以busy/disabled表达等待',()=>{
  const html=markup({loading:true});
  const button=html.match(/<button\b[^>]*aria-label="任务对话"[^>]*>/)?.[0];
  assert.ok(button,'读取中不能把动作名称改为 loading 任务对话');
  assert.match(button,/aria-busy="true"/);assert.match(button,/disabled=""/);
  assert.match(html,/读取中…/);
});

test('任务入口无对话时名称不含计数，ready时清除busy',()=>{
  const html=markup();
  const button=html.match(/<button\b[^>]*aria-label="任务对话"[^>]*>/)?.[0];
  assert.ok(button);assert.match(button,/aria-busy="false"/);assert.doesNotMatch(button,/disabled=""/);
  assert.match(html,/任务对话/);assert.doesNotMatch(html,/内部对话/);
});

test('任务入口有多条对话时展示数量而不是双入口文案',()=>{
  const html=markup({rows:[{id:'a',title:'甲',participants:[],updatedAt:'2026-10-26T00:00:00Z'},{id:'b',title:'乙',participants:[],updatedAt:'2026-10-26T00:00:00Z'}]});
  assert.match(html,/任务对话 · 2/);
  const button=html.match(/<button\b[^>]*aria-label="任务对话"[^>]*>/)?.[0];
  assert.ok(button);assert.doesNotMatch(button,/disabled=""/);
});
