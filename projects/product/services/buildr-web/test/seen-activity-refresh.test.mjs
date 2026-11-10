import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(context.parentURL?.endsWith('/seen-activity-refresh.ts')&&specifier==='./conversation-activity')return next(new URL('./conversation-activity.ts',context.parentURL).href,context);return next(specifier,context);}});
const {refreshSeenActivity}=await import('../src/features/agent-conversations/seen-activity-refresh.ts');
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
