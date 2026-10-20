import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.endsWith('/hooks/useWorkbench.ts')) {
    if(specifier==='react') return {url:'data:text/javascript,'+encodeURIComponent(['useCallback','useContext','useEffect','useMemo','useRef','useState'].map(name=>`export const ${name}=(...args)=>globalThis.__workbenchHooks.${name}(...args);`).join('\n')),shortCircuit:true};
    if(specifier.endsWith('/pageTabs')) return {url:'data:text/javascript,export const WorkspaceViewActiveContext={};',shortCircuit:true};
    if(specifier==='./useWorkbenchPreferences') return {url:'data:text/javascript,export const useWorkbenchPreferences=()=>({revision:globalThis.__workbenchRevision});',shortCircuit:true};
    if(specifier.endsWith('/workbench-api')) return next(new URL(specifier+'.ts',context.parentURL).href,context);
  }
  if(specifier==='../../../api' && context.parentURL?.includes('/workbench/')) return {url:'data:text/javascript,export const api=(...args)=>globalThis.__workbenchRequest(...args);',shortCircuit:true};
  return next(specifier,context);
}});
const {useWorkbench}=await import('../src/features/workbench/hooks/useWorkbench.ts');
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function harness(hook) {
  const slots=[],effects=[],requests=[];let cursor=0,active=true;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const memo=(fn,deps)=>{const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={deps,value:fn()};return slots[i].value;};
  globalThis.window=new EventTarget();globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});globalThis.__workbenchRevision=0;
  globalThis.__workbenchRequest=(url,options)=>new Promise((resolve,reject)=>requests.push({url,...options,resolve,reject}));
  globalThis.__workbenchHooks={
    useContext(){cursor++;return active;},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),
    useRef(value){const i=cursor++;return slots[i]||=( {current:value} );},
    useState(value){const i=cursor++;slots[i]||={value};return [slots[i].value,value=>{slots[i].value=value;}];},
    useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const previous=slots[i];slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  return {requests,render(visible=true,workspace='A',project=''){active=visible;cursor=0;const result=hook(workspace,project);effects.splice(0).forEach(fn=>fn());return result;},dispose(){slots.forEach(slot=>slot?.cleanup?.());delete globalThis.window;delete globalThis.document;delete globalThis.__workbenchHooks;delete globalThis.__workbenchRequest;delete globalThis.__workbenchRevision;}};
}

test('隐藏的工作台保留页面不响应聚焦或偏好变化，重新可见才读取当前范围',async()=>{
  const h=harness(useWorkbench);
  try {
    h.render();assert.equal(h.requests.length,1);h.requests[0].resolve({observedAt:'first'});await settle();
    h.render(false);window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.requests.length,1);
    globalThis.__workbenchRevision++;h.render(false);assert.equal(h.requests.length,1);
    h.render(true);assert.equal(h.requests.length,2);h.requests[1].resolve({observedAt:'current'});await settle();
    const view=h.render();assert.equal(view.data.observedAt,'current');
    const a=view.refresh(),b=view.refresh();assert.equal(a,b);assert.equal(h.requests.length,3);h.requests[2].resolve({observedAt:'manual'});await a;
  } finally {h.dispose();}
});

test('概览真实客户端只访问概览接口，范围切换取消旧读取并拒绝晚回复',async()=>{
  const h=harness(useWorkbench);
  try {
    h.render();assert.match(h.requests[0].url,/\/workbench$/);
    h.render(true,'B','project-b');assert.equal(h.requests[0].signal.aborted,true);assert.match(h.requests[1].url,/workspaces\/B\/workbench\?project=project-b$/);
    h.requests[1].resolve({observedAt:'B'});await settle();h.requests[0].resolve({observedAt:'late A'});await settle();
    assert.equal(h.render(true,'B','project-b').data.observedAt,'B');
  } finally {h.dispose();}
});
