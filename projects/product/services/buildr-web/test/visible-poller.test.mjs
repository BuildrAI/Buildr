import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisiblePoller } from '../src/lib/visible-poller.ts';
import { activityPollMs } from '../src/features/agent-conversations/activity-polling.ts';
import { serviceRuntimePollMs } from '../src/features/service-runtime/runtime-polling.ts';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(t,extra={}) {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
  const doc=new EventTarget(),win=new EventTarget();doc.visibilityState='visible';
  let calls=0,delay=30000;
  const poller=createVisiblePoller({document:doc,window:win,read:async()=>{calls++;},interval:()=>delay,...extra});
  t.after(()=>poller.dispose());
  return {doc,win,poller,calls:()=>calls,delay:value=>{delay=value;poller.reschedule();},tick:async ms=>{t.mock.timers.tick(ms);await flush();}};
}
test('稳定读取三十秒；活动变化可立即缩短已安排的等待',async t=>{
 const f=fixture(t);await f.tick(5000);assert.equal(f.calls(),0);f.delay(5000);await f.tick(0);assert.equal(f.calls(),1);
 f.delay(30000);await f.tick(29999);assert.equal(f.calls(),1);await f.tick(1);assert.equal(f.calls(),2);
});
test('隐藏不轮询；恢复只核对一次；短期焦点不叠加',async t=>{
 const f=fixture(t);f.doc.visibilityState='hidden';f.doc.dispatchEvent(new Event('visibilitychange'));await f.tick(120000);assert.equal(f.calls(),0);
 f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));f.win.dispatchEvent(new Event('focus'));await flush();assert.equal(f.calls(),1);
 f.win.dispatchEvent(new Event('focus'));await flush();assert.equal(f.calls(),1);
});
test('慢请求期间自动和聚焦共用在途读取，完成后才继续',async t=>{
 let calls=0,finish;
 const f=fixture(t,{read:()=>{calls++;return new Promise(r=>{finish=r;});},interval:()=>5000});
 await f.tick(5000);await f.tick(60000);f.win.dispatchEvent(new Event('focus'));await flush();assert.equal(calls,1);
 finish();await flush();await f.tick(4999);assert.equal(calls,1);await f.tick(1);assert.equal(calls,2);
 f.poller.dispose();finish();await flush();await f.tick(60000);assert.equal(calls,2);
});
test('失败继续补偿；销毁后恢复和焦点都不读取',async t=>{
 let calls=0;const f=fixture(t,{read:async()=>{calls++;throw Error('offline');},interval:()=>5000});
 await f.tick(5000);await f.tick(5000);assert.equal(calls,2);f.poller.dispose();f.win.dispatchEvent(new Event('focus'));f.doc.dispatchEvent(new Event('visibilitychange'));await f.tick(60000);assert.equal(calls,2);
});
test('版本十分钟内聚焦和恢复不重复，手动完成重新计时',async t=>{
 const f=fixture(t,{interval:()=>600000,focusFreshMs:600000,resumeWhenFresh:false});
 await f.tick(60000);f.win.dispatchEvent(new Event('focus'));f.doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(f.calls(),0);
 f.poller.observed();await f.tick(599999);assert.equal(f.calls(),0);await f.tick(1);assert.equal(f.calls(),1);
});
test('版本隐藏跨过期后恢复及时补偿',async t=>{
 const f=fixture(t,{interval:()=>600000,focusFreshMs:600000,resumeWhenFresh:false});f.doc.visibilityState='hidden';f.doc.dispatchEvent(new Event('visibilitychange'));await f.tick(700000);assert.equal(f.calls(),0);
 f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(f.calls(),1);
});
test('活动与服务策略不把首次未知和错误当空闲',()=>{
 const idle={running:0,unknown:0,waiting:0};assert.equal(activityPollMs(idle),30000);assert.equal(activityPollMs(undefined),5000);assert.equal(activityPollMs(idle,'offline'),5000);
 for(const k of ['running','unknown','waiting'])assert.equal(activityPollMs({...idle,[k]:1}),5000);
 assert.equal(serviceRuntimePollMs(null),5000);assert.equal(serviceRuntimePollMs({runs:[]}),30000);assert.equal(serviceRuntimePollMs({runs:[{status:'running'}]}),30000);
 assert.equal(serviceRuntimePollMs({runs:[{status:'starting'}]}),5000);assert.equal(serviceRuntimePollMs({service:{runs:[{status:'starting'}]}}),5000);assert.equal(serviceRuntimePollMs({runs:[]},'offline'),5000);
});
