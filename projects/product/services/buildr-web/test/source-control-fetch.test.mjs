import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/hooks/useSourceControlFetch.ts')) {
    if (specifier === 'react') return {url:'data:text/javascript,' + encodeURIComponent(['useCallback','useEffect','useRef','useState'].map(name => `export const ${name} = (...args) => globalThis.__fetchHarness.${name}(...args);`).join('\n')),shortCircuit:true};
    if (specifier === '../api/code-api') return {url:'data:text/javascript,export const codeApi={fetch:(...args)=>globalThis.__fetchApi(...args)};',shortCircuit:true};
    if (specifier === '../source-control-events') return next(specifier + '.ts',context);
  }
  return next(specifier,context);
}});
const {useSourceControlFetch} = await import('../src/features/code/hooks/useSourceControlFetch.ts');
const {beginSourceControlFetch,notifySourceControlChange} = await import('../src/features/code/source-control-events.ts');
function harness() {
  const slots=[],effects=[];let cursor=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((item,index)=>Object.is(item,b[index]));
  globalThis.__fetchHarness={
    useState(initial){const index=cursor++;slots[index]||={value:initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},
    useRef(initial){const index=cursor++;return slots[index]||={current:initial};},
    useCallback(fn,deps){const index=cursor++;if(!same(slots[index]?.deps,deps))slots[index]={fn,deps};return slots[index].fn;},
    useEffect(fn,deps){const index=cursor++;if(!same(slots[index]?.deps,deps)){const previous=slots[index];slots[index]={deps};effects.push(()=>{previous?.cleanup?.();slots[index].cleanup=fn();});}},
  };
  return {render(workspace='w'){cursor=0;const result=useSourceControlFetch(workspace);effects.splice(0).forEach(fn=>fn());return result;},dispose(){slots.forEach(slot=>slot?.cleanup?.());delete globalThis.__fetchHarness;delete globalThis.__fetchApi;}};
}
const result=(status='succeeded',gitId='git')=>({repositoryId:'repo',gitId,status,message:status,remotes:[]});
const notice=(workspaceId,readAt,entry,sequences=beginSourceControlFetch(workspaceId,['repo']))=>notifySourceControlChange({workspaceId,repositoryId:'repo',fetchReadAt:readAt,fetchResults:[entry],fetchSequences:sequences});

test('成功时间只接受当前获取成功，失败、部分失败和迟到结果保留最近成功时间并隔离Git身份',()=>{
  const view=harness(),key=JSON.stringify(['repo','git']);
  try {
    view.render();notice('w','first',result());assert.equal(view.render().successfulAt[key],'first');
    for(const status of ['failed','unavailable','unknown']){notice('w','failure-time',result(status));assert.equal(view.render().successfulAt[key],'first');assert.equal(view.render().results.repo.status,status);}
    const stale=beginSourceControlFetch('w',['repo']);notice('w','newest',result());notice('w','stale',result(),stale);assert.equal(view.render().successfulAt[key],'newest');
    notice('w','replacement',result('succeeded','other-git'));assert.equal(view.render().successfulAt[key],'newest');assert.equal(view.render().successfulAt[JSON.stringify(['repo','other-git'])],'replacement');
    view.render('other');notice('w','late',result());assert.deepEqual(view.render('other').successfulAt,{});
  } finally {view.dispose();}
});

test('显式单库获取固定已观察身份、重复点击去重且读取动作不联网',async()=>{
  const view=harness(),calls=[];let release;
  globalThis.__fetchApi=(workspace,input)=>{calls.push({workspace,input});return new Promise(resolve=>{release=()=>{const entry=result();notice(workspace,'completed',entry);resolve({readAt:'completed',repositories:[entry]});};});};
  try {
    const initial=view.render();assert.equal(calls.length,0);
    const repo={id:'repo',gitId:'git',checkoutId:'checkout'};
    const pending=initial.run([repo]);await initial.run([repo]);assert.equal(calls.length,1);assert.equal(view.render().pending.repo,true);
    assert.deepEqual(calls[0],{workspace:'w',input:{repositories:[{repositoryId:'repo',expectedGitId:'git',expectedCheckoutId:'checkout'}]}});
    release();await pending;assert.equal(view.render().pending.repo,undefined);assert.equal(view.render().successfulAt[JSON.stringify(['repo','git'])],'completed');
  } finally {view.dispose();}
});
