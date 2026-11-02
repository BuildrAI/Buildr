import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';

registerHooks({
  resolve(specifier, context, next) {
    if(context.parentURL?.endsWith('/ConversationAssociationPopover.tsx')){if(specifier.endsWith('.css'))return {url:'data:text/javascript,export default {};',shortCircuit:true};if(specifier==='./conversation-associations')return next(new URL('../src/features/agent-conversations/conversation-associations.ts',import.meta.url).href,context);}
    if (!context.parentURL?.endsWith('/TaskConversationEntry.tsx')) return next(specifier, context);
    if (specifier === 'react') return {url:'data:text/javascript,'+encodeURIComponent('export const useCallback=value=>value;export const useState=initial=>globalThis.__taskEntryState(initial);export const useEffect=()=>{};export const useContext=()=>true;export const useRef=initial=>({current:initial});'),shortCircuit:true};
    if (specifier.endsWith('/pageTabs')) return {url:'data:text/javascript,export const WorkspaceViewActiveContext={};',shortCircuit:true};
    if (specifier === './AgentConversationsContext') return {url:'data:text/javascript,export const useOptionalAgentConversations=()=>globalThis.__taskEntryContext;',shortCircuit:true};
    if(specifier==='./ConversationAssociationPopover')return next(new URL('../src/features/agent-conversations/ConversationAssociationPopover.tsx',import.meta.url).href,context);
    if(specifier==='./conversation-associations')return next(new URL('../src/features/agent-conversations/conversation-associations.ts',import.meta.url).href,context);
    if(specifier==='./conversation-association-client')return {url:'data:text/javascript,'+encodeURIComponent('export const ASSOCIATIONS_CHANGED="change";export const associationWorkspaces=()=>[];export const searchConversationAssociations=()=>({items:[],errors:[]});'),shortCircuit:true};
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\/(?:TaskConversationEntry|ConversationAssociationPopover)\.tsx$/.test(url)) return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    return next(url, context);
  },
});
const {TaskConversationEntry}=await import('../src/features/agent-conversations/TaskConversationEntry.tsx');

function markup({rows=[],loading=false,error=''}={}) {
  const states=[rows,loading,false,error,0,{}];let index=0;
  globalThis.__taskEntryState=()=>[states[index++],()=>{}];
  globalThis.__taskEntryContext={api:{},openConversation(){},newConversation(){}};
  try {return renderToStaticMarkup(TaskConversationEntry({workspaceId:'workspace',taskId:'task'}));}
  finally {delete globalThis.__taskEntryState;delete globalThis.__taskEntryContext;}
}

test('任务入口读取中使用未确认，不伪造零且仍可展开',()=>{
  const html=markup({loading:true});
  const button=html.match(/<button\b[^>]*aria-label="关联对话"[^>]*>/)?.[0];
  assert.ok(button);assert.match(button,/aria-busy="true"/);assert.doesNotMatch(button,/disabled=""/);
  assert.match(html,/未确认/);
});
test('零、一、多项均为同一数量入口，不常驻具体对象',()=>{
  for(const count of [0,1,2]){
    const rows=Array.from({length:count},(_,i)=>({workspaceId:'workspace',id:'hidden-id-'+i,title:'不应常驻的标题'}));
    const html=markup({rows});assert.match(html,/aria-label="关联对话"/);assert.match(html,new RegExp('<span>'+count+'</span>'));assert.doesNotMatch(html,/不应常驻的标题|hidden-id/);
  }
});
test('读取失败不能报告零条关联',()=>{const html=markup({error:'unavailable'});assert.match(html,/未确认/);assert.doesNotMatch(html,/<span>0<\/span>/);});
