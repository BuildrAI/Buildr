import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/hooks/useCodeExplorer.ts')) {
    const text = specifier === 'react' ? ['useCallback','useEffect','useMemo','useRef','useState'].map(name => `export const ${name}=(...args)=>globalThis.__explorerHooks.${name}(...args);`).join('\n')
      : specifier === '../api/code-api' ? 'export const codeApi=globalThis.__explorerApi;'
      : specifier === './useCodeSourceSelection' ? 'export const useCodeSourceSelection=()=>globalThis.__explorerSelection;'
      : specifier === './useSourceControl' ? 'export const useSourceControlSummary=()=>globalThis.__explorerSummary;' : null;
    if (text) return {url:'data:text/javascript,'+encodeURIComponent(text),shortCircuit:true};
  }
  if (specifier.endsWith('/api/code-api') && context.parentURL?.includes('/features/code/')) return {url:'data:text/javascript,'+encodeURIComponent('export const codeApi=globalThis.__explorerApi;'),shortCircuit:true};
  return next(specifier.startsWith('.') && context.parentURL?.includes('/features/code/') && !/\.[a-z]+$/u.test(specifier) ? specifier+'.ts' : specifier,context);
}});
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const member=(id,groupId,available=true)=>({id,repositoryId:'repo',groupId,path:groupId==='main'?'/repo':'/repo/.worktrees/t1',branch:groupId==='main'?'dev':'task/t1',kind:groupId==='main'?'main':'task',taskId:groupId==='main'?null:'t1',available});
const catalog=(worktrees,extra={})=>({repositories:[{id:'repo',code:'repo',name:'repo',location:'/repo'}],worktrees,worktreeGroups:[{id:'main'},{id:'task:t1'}],selectedRepositoryIds:['repo'],selectedWorktreeGroupIds:['task:t1'],scopeReason:'task',diagnostics:[],...extra});
const api={};globalThis.__explorerApi=api;
globalThis.__explorerSelection={selection:null,getSelection:()=>null,select:()=>{}};
globalThis.__explorerSummary={data:null,versions:{},check:()=>{}};
const {useCodeExplorer}=await import('../src/features/code/hooks/useCodeExplorer.ts');
function view() {
  const slots=[],effects=[];let cursor=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  globalThis.__explorerHooks={
    useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},
    useRef(initial){const index=cursor++;return slots[index]||=( {current:initial});},
    useMemo(fn,deps){const index=cursor++;if(!same(slots[index]?.deps,deps))slots[index]={value:fn(),deps};return slots[index].value;},
    useCallback(fn,deps){return this.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const index=cursor++;if(!same(slots[index]?.deps,deps)){const old=slots[index];slots[index]={deps};effects.push(()=>{old?.cleanup?.();slots[index].cleanup=fn();});}},
  };
  const render=()=>{cursor=0;const value=useCodeExplorer('workspace','/repo',false);effects.splice(0).forEach(fn=>fn());return value;};
  return {render,async ready(){render();await settle();render();await settle();return render();},dispose(){slots.forEach(slot=>slot?.cleanup?.());delete globalThis.__explorerHooks;}};
}
const entry=(file,taskId='t1')=>({origin:'task',taskId,taskTitle:'任务',file,from:{pathname:'/workspaces/w/tasks/'+taskId,search:'',hash:'',state:null}});
const fileEntry=(checkoutId='checkout-old')=>({repositoryId:'repo',checkoutId,path:'projects/a/readme.md'});
function mockReads(){
  api.repositories=async()=>catalog([member('checkout-main','main'),member('checkout-new','task:t1')]);
  api.editorFile=async(_workspace,selector)=>({kind:'markdown',content:'# 内容',revision:'rev-1',observedAt:'2026-11-20T00:00:00.000Z',sizeBytes:6,rootPath:selector.checkoutId==='checkout-new'?'/repo/.worktrees/t1':'/repo',versionLabel:'task/t1 · 当前文件'});
  api.explorerFile=async(_workspace,input)=>({source:{repositoryId:input.repositoryId,checkoutId:input.checkoutId,taskId:input.taskId||null,commitHash:null,worktreeId:input.checkoutId,worktreeGroupId:'task:t1',location:'/repo/.worktrees/t1',version:'v',kind:'task'},path:input.path,kind:'markdown',content:'# 内容',mediaType:'text/markdown',sizeBytes:6,limitBytes:1024,truncated:false,digest:'sha256-x',revision:'rev-1',page:null,observedAt:'2026-11-20T00:00:00.000Z',message:''});
  api.directory=async(_workspace,input)=>({source:{repositoryId:input.repositoryId,checkoutId:input.checkoutId,taskId:null,commitHash:null,worktreeId:input.checkoutId,worktreeGroupId:'task:t1',location:'/repo/.worktrees/t1',version:'v',kind:'task'},path:input.path,entries:[],truncated:false,readAt:'2026-11-20T00:00:00.000Z'});
}

test('a stale task checkout does not open a dead tab and offers the current task checkout',async t=>{
  mockReads();const h=view();
  try{
    const state=await h.ready();
    await state.applyEntry(entry(fileEntry()));
    let rendered=h.render();
    assert.equal(rendered.tabs.length,0,'the missing identity is not opened as a tab');
    assert.equal(rendered.entryRecovery?.reason,'replaced');
    assert.deepEqual(rendered.entryRecovery?.successor,{repositoryId:'repo',checkoutId:'checkout-new'});
    rendered.recoverEntry();await settle();rendered=h.render();
    assert.equal(rendered.entryRecovery,null,'recovery clears the notice');
    assert.equal(rendered.tabs.length,1);
    assert.equal(rendered.tabs[0].checkoutId,'checkout-new');
    assert.equal(rendered.worktreeScope,'checkout:checkout-new');
    assert.equal(rendered.active?.path,'projects/a/readme.md');
  }finally{h.dispose();}
});

test('a stale checkout opens a historical commit through the task checkout immediately',async t=>{
  mockReads();const h=view();const commitHash='a'.repeat(40);
  try{
    const state=await h.ready();
    await state.applyEntry(entry({...fileEntry(),commitHash}));
    let rendered=h.render();
    assert.equal(rendered.tabs.length,1,'a historical read does not depend on the replaced checkout');
    assert.equal(rendered.tabs[0].checkoutId,'checkout-new');
    assert.equal(rendered.tabs[0].commitHash,commitHash);
    assert.equal(rendered.entryRecovery?.reason,'recovered');
    assert.equal(rendered.entryRecovery?.successor,null);
  }finally{h.dispose();}
});

test('a historical entry without task identity reads through the main checkout',async t=>{
  mockReads();const h=view();const commitHash='b'.repeat(40);
  try{
    const state=await h.ready();
    await state.applyEntry({...entry({...fileEntry(),commitHash}),taskId:undefined});
    const rendered=h.render();
    assert.equal(rendered.tabs.length,1);
    assert.equal(rendered.tabs[0].checkoutId,'checkout-main');
    assert.equal(rendered.tabs[0].commitHash,commitHash);
    assert.equal(rendered.entryRecovery?.reason,'recovered');
  }finally{h.dispose();}
});

test('without task identity a stale checkout reports ambiguity instead of substituting',async t=>{
  mockReads();const h=view();
  try{
    const state=await h.ready();
    await state.applyEntry({...entry(fileEntry()),taskId:undefined});
    const rendered=h.render();
    assert.equal(rendered.tabs.length,0);
    assert.equal(rendered.entryRecovery?.reason,'ambiguous');
    assert.equal(rendered.entryRecovery?.successor,null);
  }finally{h.dispose();}
});

test('an entry whose task checkout disappeared entirely reports no recoverable source',async t=>{
  mockReads();api.repositories=async()=>catalog([member('checkout-main','main')]);const h=view();
  try{
    const state=await h.ready();
    await state.applyEntry(entry(fileEntry()));
    const rendered=h.render();
    assert.equal(rendered.tabs.length,0);
    assert.equal(rendered.entryRecovery?.reason,'missing');
    assert.equal(rendered.entryRecovery?.successor,null);
  }finally{h.dispose();}
});

test('an exact checkout identity keeps restoring normally',async t=>{
  mockReads();const h=view();
  try{
    const state=await h.ready();
    await state.applyEntry(entry(fileEntry('checkout-new')));
    const rendered=h.render();
    assert.equal(rendered.entryRecovery,null);
    assert.equal(rendered.tabs.length,1);
    assert.equal(rendered.tabs[0].checkoutId,'checkout-new');
  }finally{h.dispose();}
});

test('leaving the entry clears its recovery diagnostic and action',async t=>{
  mockReads();const h=view();
  try{
    const state=await h.ready();
    await state.applyEntry(entry(fileEntry()));
    assert.equal(h.render().entryRecovery?.reason,'replaced');
    state.clearEntry();
    const rendered=h.render();
    assert.equal(rendered.entryRecovery,null);
    assert.equal(rendered.entry,null);
  }finally{h.dispose();}
});

test('an incomplete catalog is retryable and never substitutes or auto-opens',async t=>{
  const diagnostics=[{code:'code_worktrees_truncated',message:'目录读取达到上限',repositoryId:null}];
  const h=view();
  try{
    api.repositories=async()=>catalog([member('checkout-main','main')],{diagnostics});
    const state=await h.ready();
    await state.applyEntry(entry(fileEntry()));
    let rendered=h.render();
    assert.equal(rendered.tabs.length,0);
    assert.equal(rendered.entryRecovery?.reason,'unconfirmed');
    assert.equal(rendered.entryRecovery?.successor,null);
    await state.applyEntry(entry({...fileEntry(),commitHash:'c'.repeat(40)}));
    rendered=h.render();
    assert.equal(rendered.tabs.length,0,'historical reads wait for a complete inventory instead of switching silently');
    assert.equal(rendered.entryRecovery?.reason,'unconfirmed');
  }finally{h.dispose();}
});

test('a successor removed before the action is not opened as a dead tab',async t=>{
  mockReads();const h=view();
  try{
    const state=await h.ready();
    await state.applyEntry(entry(fileEntry()));
    assert.equal(h.render().entryRecovery?.reason,'replaced');
    api.repositories=async()=>catalog([member('checkout-main','main')]);
    await state.refreshCatalog();
    h.render().recoverEntry();
    const rendered=h.render();
    assert.equal(rendered.tabs.length,0);
    assert.equal(rendered.entryRecovery?.reason,'missing');
    assert.equal(rendered.entryRecovery?.successor,null);
  }finally{h.dispose();}
});
