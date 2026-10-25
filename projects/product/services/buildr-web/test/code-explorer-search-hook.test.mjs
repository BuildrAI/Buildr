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
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const catalog={repositories:[{id:'repo',code:'repo',name:'repo',location:'/repo'}],worktrees:[{id:'checkout',repositoryId:'repo',groupId:'main',available:true,path:'/repo'}],worktreeGroups:[{id:'main'}],diagnostics:[]};
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

test('real explorer hook suppresses single-character requests and cancels pending searches in both modes',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const mode of ['name','content'])for(const [short,long] of [['m','ma'],['𠮷','𠮷𠮷']]){
    const calls=[];api.repositories=async()=>catalog;api.search=async(_workspace,input)=>{calls.push(input);return {matches:[{path:input.query}],truncated:false};};
    const h=view();try{
      let state=await h.ready();state.search(short,mode);h.render();t.mock.timers.tick(700);await settle();assert.equal(calls.length,0);
      state=h.render();state.search(long,mode);h.render();t.mock.timers.tick(300);await settle();state=h.render();assert.equal(calls.length,1);assert.equal(calls[0].query,long);assert.equal(state.searchResults[0].matches[0].path,long);
      state.search(short,mode);h.render();t.mock.timers.tick(700);await settle();assert.equal(calls.length,1);assert.deepEqual(h.render().searchResults,[]);
      h.render().search(long,mode);h.render();h.render().search(short,mode);h.render();t.mock.timers.tick(700);await settle();assert.equal(calls.length,1,'an invalid replacement cancels the pending debounce');
    }finally{h.dispose();}
  }
});

test('late success and failure cannot overwrite a newer explorer search',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const failure of [false,true]){
    const calls=[];api.repositories=async()=>catalog;api.search=(_workspace,input)=>new Promise((resolve,reject)=>calls.push({input,resolve,reject}));
    const h=view();try{
      await h.ready();h.render().search('old','content');h.render();t.mock.timers.tick(300);h.render().search('new','content');h.render();t.mock.timers.tick(300);assert.equal(calls.length,2);
      calls[1].resolve({matches:[{path:'new'}]});await settle();h.render();
      failure?calls[0].reject(Error('old failure')):calls[0].resolve({matches:[{path:'old'}]});await settle();const state=h.render();assert.equal(state.searchResults[0].matches[0].path,'new');assert.deepEqual(state.searchErrors,[]);
    }finally{h.dispose();}
  }
});
