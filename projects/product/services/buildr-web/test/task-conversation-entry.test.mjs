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

function markup({loading=false,creating=false}={}) {
  const states=[[],loading,'',false,creating];let index=0;
  globalThis.__taskEntryState=()=>[states[index++],()=>{}];
  globalThis.__taskEntryContext={api:{},create(){},openConversation(){}};
  try {return renderToStaticMarkup(TaskConversationEntry({workspaceId:'workspace',taskId:'task',cwd:'/workspace'}));}
  finally {delete globalThis.__taskEntryState;delete globalThis.__taskEntryContext;}
}

test('任务入口读取中保持动作名称，另以busy/disabled表达等待',()=>{
  const html=markup({loading:true});
  const button=html.match(/<button\b[^>]*aria-label="打开对话"[^>]*>/)?.[0];
  assert.ok(button,'加载图标不能把动作名称改为 loading 打开对话');
  assert.match(button,/aria-busy="true"/);assert.match(button,/disabled=""/);
  assert.match(html,/aria-label="loading"/,'实际Ant Design装饰图标参与此反例');
});

test('任务入口创建中仍使用相同名称并保留真实busy状态',()=>{
  const html=markup({creating:true});
  const button=html.match(/<button\b[^>]*aria-label="打开对话"[^>]*>/)?.[0];
  assert.ok(button);assert.match(button,/aria-busy="true"/);assert.match(html,/aria-label="loading"/);
});

test('任务入口ready时名称不变且清除busy，不依赖装饰动画完成',()=>{
  const html=markup();
  const button=html.match(/<button\b[^>]*aria-label="打开对话"[^>]*>/)?.[0];
  assert.ok(button);assert.match(button,/aria-busy="false"/);assert.doesNotMatch(button,/disabled=""/);
});
