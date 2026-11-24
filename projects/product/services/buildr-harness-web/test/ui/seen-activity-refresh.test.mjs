import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
    const sourceSpecifier=specifier.replace(/\.(?:tsx?|jsx?)$/,'').replace(/\/index$/,'');if(context.parentURL?.endsWith('/seen-activity-refresh.ts')&&sourceSpecifier === './conversation-activity')return next(new URL('./conversation-activity.ts',context.parentURL).href,context);return next(specifier,context);}});
const {createStreamingSeenScheduler,findDisplayedUnseenConversation,findSeenFallbackTarget,isConversationViewVisible,refreshSeenActivity,resolveSeenRefreshTarget,seenAttemptKey}=await import('../../src/features/agent-conversations/seen-activity-refresh.ts');
const {latestVisibleConversationMessage}=await import('../../src/features/agent-conversations/conversation-notices.ts');
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

test('专注分屏展开对话列表时右侧对话区仍判定为可见，普通单栏历史与悬停预览不误标已读',()=>{
  assert.equal(isConversationViewVisible(true,'conversation',false),true);
  assert.equal(isConversationViewVisible(true,'history',true),true);
  assert.equal(isConversationViewVisible(true,'history',false),false);
  assert.equal(isConversationViewVisible(false,'conversation',true),false);
  assert.equal(isConversationViewVisible(false,'history',true),false);
});

test('折叠过程块与分段合并场景按可见 DOM 定位，长最终答复不误退回轮次头部',()=>{
  const at='2026-11-17T06:00:00.000Z';
  const normalEntries=[
    {id:'u1',sequence:1,runId:'r1',kind:'message',role:'user',text:'提问',createdAt:at},
    {id:'t1',sequence:2,runId:'r1',kind:'tool',role:'system',text:'read',status:'completed',createdAt:at},
    {id:'a1',sequence:3,runId:'r1',kind:'message',role:'assistant',text:'最终答复',status:'completed',createdAt:at},
  ];
  const normalLatest=latestVisibleConversationMessage(normalEntries);
  assert.equal(normalLatest?.id,'a1');
  assert.deepEqual(findSeenFallbackTarget(normalLatest,normalEntries,{id:'r1',status:'completed',tools:[]},[],{}),{kind:'entry',id:'a1'});

  const stoppedEntries=[
    {id:'u2',sequence:1,runId:'r2',kind:'message',role:'user',text:'提问',createdAt:at},
    {id:'a2',sequence:2,runId:'r2',kind:'message',role:'assistant',text:'停止前中间内容',status:'running',createdAt:at},
  ];
  const stoppedLatest=latestVisibleConversationMessage(stoppedEntries);
  assert.equal(stoppedLatest?.id,'a2');
  assert.deepEqual(findSeenFallbackTarget(stoppedLatest,stoppedEntries,{id:'r2',status:'stopped',tools:[]},[],{}),{kind:'turn',id:'u2'});

  const supplementEntries=[
    {id:'u3',sequence:1,runId:'r3',kind:'message',role:'user',text:'首条',createdAt:at},
    {id:'a3',sequence:2,runId:'r3',kind:'message',role:'assistant',text:'首段答复',status:'completed',createdAt:at},
    {id:'u3-sup',sequence:3,runId:'r3',kind:'message',role:'user',text:'追加消息',createdAt:at},
  ];
  const supplementLatest=latestVisibleConversationMessage(supplementEntries);
  assert.equal(supplementLatest?.id,'u3-sup');
  assert.deepEqual(findSeenFallbackTarget(supplementLatest,supplementEntries,{id:'r3',status:'completed',tools:[]},[],{}),{kind:'turn',id:'u3'});

  const splitEntries=[
    {id:'u4',sequence:1,runId:'r4',kind:'message',role:'user',text:'继续',createdAt:at},
    {id:'a4-1',sequence:2,runId:'r4',kind:'message',role:'assistant',text:'第一段',status:'completed',createdAt:at},
    {id:'th4',sequence:3,runId:'r4',kind:'thinking',role:'assistant',thinking:true,text:'思考',status:'completed',createdAt:at},
    {id:'a4-2',sequence:4,runId:'r4',kind:'message',role:'assistant',text:'第二段',status:'running',createdAt:at},
  ];
  const splitLatest=latestVisibleConversationMessage(splitEntries);
  assert.equal(splitLatest?.id,'a4-2');
  assert.deepEqual(findSeenFallbackTarget(splitLatest,splitEntries,{id:'r4',status:'running',tools:[]},[],{}),{kind:'entry',id:'a4-1'});
});

test('activityRows 漏掉待查看条目时从当前有效列表缓存补查并触发刷新',async()=>{
  const valid=new Set(['global:2','workspace:3']);
  const cached=[
    {version:'workspace:2',page:{conversations:[{...unseen,id:'stale-chat'}]}},
    {version:'workspace:3',page:{conversations:[unseen]}},
  ];
  assert.equal(findDisplayedUnseenConversation('one','chat',[],cached,valid),unseen);
  assert.equal(findDisplayedUnseenConversation('one','stale-chat',[],cached,valid),undefined);

  let refreshed=0;
  const triggered=await refreshSeenActivity(
    {...unseen,run:{status:'running'},activity:{...unseen.activity,seenThrough:4}},
    findDisplayedUnseenConversation('one','chat',[],cached,valid),
    ()=>{},
    async()=>{refreshed++;},
  );
  assert.equal(triggered,true);
  assert.equal(refreshed,1);
});

test('seenAttemptKey 区分流式与终态并忽略已读或无版本对话',()=>{
  assert.equal(seenAttemptKey({workspaceId:'one',id:'chat',run:{status:'completed'},activity:{version:4,seenThrough:4}}),null);
  assert.equal(seenAttemptKey({workspaceId:'one',id:'chat',run:{status:'completed'}}),null);
  const runningKey=seenAttemptKey({workspaceId:'one',id:'chat',run:{status:'running'},activity:{version:4,seenThrough:3}});
  const settledKey=seenAttemptKey({workspaceId:'one',id:'chat',run:{status:'completed'},activity:{version:4,seenThrough:3}});
  assert.ok(runningKey);
  assert.ok(settledKey);
  assert.notEqual(runningKey,settledKey);
});

test('flushMatching 仅对已验证同版本流式挂起项立即冲刷终态，不抢标未验证新版本',async()=>{
  let nextTimerId=1,cancelled=0;
  const timers=new Map(),sent=[];
  const scheduler=createStreamingSeenScheduler({
    send:async value=>{sent.push({version:value.activity.version,status:value.run?.status});return true;},
    intervalMs:1500,
    now:()=>1000,
    schedule:cb=>{const id=nextTimerId++;timers.set(id,cb);return id;},
    cancel:id=>{cancelled++;timers.delete(id);},
  });

  await scheduler.notify({...unseen,run:{status:'running'},activity:{version:4,seenThrough:3}});
  await scheduler.notify({...unseen,run:{status:'running'},activity:{version:5,seenThrough:3}});
  assert.deepEqual(sent,[{version:4,status:'running'}]);
  assert.equal(timers.size,1);

  assert.equal(scheduler.flushMatching({...unseen,run:{status:'completed'},activity:{version:6,seenThrough:3}}),null);
  assert.equal(timers.size,1,'newer unverified terminal version must wait for visibility check');

  const pending=scheduler.flushMatching({...unseen,run:{status:'completed'},activity:{version:5,seenThrough:3}});
  assert.ok(pending);
  assert.equal(await pending,true);
  assert.equal(cancelled,1);
  assert.deepEqual(sent,[{version:4,status:'running'},{version:5,status:'completed'}]);
  assert.equal(scheduler.flushMatching({...unseen,run:{status:'completed'},activity:{version:5,seenThrough:3}}),null);
});

test('调度器在失败后按退避自动重试并受 shouldRetry 与主动 notify 控制',async()=>{
  let nextTimerId=1,cancelled=0,allowRetry=true,shouldFail=true;
  const timers=new Map(),delays=[],attempts=[];
  const scheduler=createStreamingSeenScheduler({
    send:async value=>{
      attempts.push(value.activity.version);
      if(shouldFail)return false;
      return true;
    },
    intervalMs:1500,
    retryDelayMs:3000,
    maxRetries:3,
    shouldRetry:()=>allowRetry,
    now:()=>1000,
    schedule:(cb,ms)=>{const id=nextTimerId++;timers.set(id,cb);delays.push(ms);return id;},
    cancel:id=>{cancelled++;timers.delete(id);},
  });

  const ok1=await scheduler.notify({...unseen,run:{status:'completed'},activity:{version:4,seenThrough:3}});
  assert.equal(ok1,false);
  assert.deepEqual(attempts,[4]);
  assert.deepEqual(delays,[3000]);

  const firstRetry=timers.get(1);timers.delete(1);firstRetry();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(attempts,[4,4]);
  assert.deepEqual(delays,[3000,6000]);

  const secondRetry=timers.get(2);timers.delete(2);secondRetry();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(attempts,[4,4,4]);
  assert.deepEqual(delays,[3000,6000,12000]);

  const thirdRetry=timers.get(3);timers.delete(3);thirdRetry();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(attempts,[4,4,4,4]);
  assert.equal(timers.size,0,'stops scheduling after maxRetries');

  // 主动 notify 重置失败计数；若 shouldRetry 为 false 则不再调度重试
  allowRetry=false;
  await scheduler.notify({...unseen,run:{status:'completed'},activity:{version:4,seenThrough:3}});
  assert.deepEqual(attempts,[4,4,4,4,4]);
  assert.equal(timers.size,0);

  // 抛错也触发重试并在成功后清零退避
  allowRetry=true;
  const throwing=createStreamingSeenScheduler({
    send:async value=>{
      attempts.push(value.activity.version);
      if(attempts.length===6)throw new Error('network');
    },
    retryDelayMs:3000,
    maxRetries:3,
    schedule:(cb,ms)=>{const id=nextTimerId++;timers.set(id,cb);delays.push(ms);return id;},
    cancel:id=>{cancelled++;timers.delete(id);},
  });
  const okThrow=await throwing.notify({...unseen,run:{status:'completed'},activity:{version:5,seenThrough:4}});
  assert.equal(okThrow,false);
  const retryThrow=timers.get(nextTimerId-1);timers.delete(nextTimerId-1);retryThrow();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(timers.size,0);
  assert.equal(cancelled>=0,true);
});

test('resolveSeenRefreshTarget 使用当前终态补齐状态判断是否刷新，流式阶段仍零额外读取',async()=>{
  const sentStreaming={...unseen,run:{status:'running'},activity:{version:4,seenThrough:3}};
  const currentCompleted={...unseen,run:{status:'completed'},activity:{version:4,seenThrough:4}};
  const target=resolveSeenRefreshTarget(sentStreaming,currentCompleted);
  assert.equal(target.run?.status,'completed');
  assert.equal(target.activity?.seenThrough,3);

  let refreshed=0;
  const triggered=await refreshSeenActivity(target,undefined,()=>{},async()=>{refreshed++;});
  assert.equal(triggered,true);
  assert.equal(refreshed,1);

  const stillRunning=resolveSeenRefreshTarget(sentStreaming,{...sentStreaming,activity:{version:4,seenThrough:4}});
  let runningRefreshed=0;
  const runningTriggered=await refreshSeenActivity(stillRunning,undefined,()=>{},async()=>{runningRefreshed++;});
  assert.equal(runningTriggered,false);
  assert.equal(runningRefreshed,0);
});
