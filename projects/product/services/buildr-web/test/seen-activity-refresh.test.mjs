import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(context.parentURL?.endsWith('/seen-activity-refresh.ts')&&specifier==='./conversation-activity')return next(new URL('./conversation-activity.ts',context.parentURL).href,context);return next(specifier,context);}});
const {createStreamingSeenScheduler,refreshSeenActivity}=await import('../src/features/agent-conversations/seen-activity-refresh.ts');
const unseen={id:'chat',workspaceId:'one',run:{status:'completed'},activity:{version:4,seenThrough:3,pendingDecisionCount:0}};
test('查看确认立即读取新统计，不等待慢的旧观察且拒绝其迟到覆盖',async()=>{
 let generation=1,value='待查看',resolveOld;const oldGeneration=generation;
 const old=new Promise(r=>{resolveOld=r;}).then(()=>{if(generation===oldGeneration)value='旧统计';});
 let fresh=0;await refreshSeenActivity(unseen,unseen,()=>{generation++;},async()=>{fresh++;value='已查看';});
 assert.equal(fresh,1);assert.equal(value,'已查看');resolveOld();await old;assert.equal(value,'已查看');
});
test('正文已开始新执行但列表仍显示待查看时，也立即核对',async()=>{
 let calls=0;await refreshSeenActivity({...unseen,run:{status:'running'}},unseen,()=>{},async()=>{calls++;});assert.equal(calls,1);
});
test('连续流式查看确认不逐片段拉取全局摘要',async()=>{
 let calls=0;for(let version=5;version<1005;version++)await refreshSeenActivity({...unseen,run:{status:'running'},activity:{...unseen.activity,version}},undefined,()=>{throw Error('不应失效');},async()=>{calls++;});assert.equal(calls,0);
});
test('查看不清除待决策和未知执行；已查看状态不重复刷新',async()=>{
 let calls=0;for(const row of [{...unseen,activity:{...unseen.activity,seenThrough:4}},{...unseen,run:{status:'unknown'}},{...unseen,activity:{...unseen.activity,pendingDecisionCount:1}}])await refreshSeenActivity(row,row,()=>{},async()=>{calls++;});assert.equal(calls,0);
});

test('流式查看确认首帧立即发送、窗口内节流合并并在终态或 flush 时立即落盘',async()=>{
 let now=1000,nextTimerId=1,cancelled=0;
 const timers=new Map(),sent=[];
 const scheduler=createStreamingSeenScheduler({
  send:async value=>{sent.push(value.activity.version);},
  intervalMs:1500,
  now:()=>now,
  schedule:(cb)=>{const id=nextTimerId++;timers.set(id,cb);return id;},
  cancel:(id)=>{cancelled++;timers.delete(id);},
 });

 await scheduler.notify({...unseen,run:{status:'running'},activity:{version:4,seenThrough:3}});
 assert.deepEqual(sent,[4],'first streaming frame dispatches immediately');

 now=1100;
 await scheduler.notify({...unseen,run:{status:'running'},activity:{version:5,seenThrough:3}});
 now=1300;
 await scheduler.notify({...unseen,run:{status:'running'},activity:{version:6,seenThrough:3}});
 assert.deepEqual(sent,[4],'rapid streaming updates within 1500ms coalesce without extra POSTs');
 assert.equal(timers.size,1);

 now=2500;
 for(const [,cb] of timers.entries())cb();
 timers.clear();
 assert.deepEqual(sent,[4,6],'trailing timer flushes highest coalesced version');

 now=2600;
 await scheduler.notify({...unseen,run:{status:'running'},activity:{version:7,seenThrough:6}});
 assert.equal(timers.size,1);
 await scheduler.notify({...unseen,run:{status:'completed'},activity:{version:8,seenThrough:6}});
 assert.deepEqual(sent,[4,6,8],'terminal state cancels pending timer and flushes immediately');
 assert.equal(cancelled,1);

 now=2700;
 await scheduler.notify({...unseen,run:{status:'running'},activity:{version:9,seenThrough:8}});
 assert.deepEqual(sent,[4,6,8],'coalesced while in cooldown window');
 await scheduler.flush();
 assert.deepEqual(sent,[4,6,8,9],'explicit flush sends immediately');
});
