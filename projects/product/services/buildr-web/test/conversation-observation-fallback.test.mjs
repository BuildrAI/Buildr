import assert from 'node:assert/strict';
import test from 'node:test';
import { startConversationRecoveryRead } from '../src/features/agent-conversations/conversation-observation-fallback.ts';
import { conversationRecoveryAction, executionLocked, needsConversationObservation } from '../src/features/agent-conversations/conversation-state.ts';
import { conversationStopControlState } from '../src/features/agent-conversations/conversation-stop.ts';
import { conversationSendRoute } from '../src/features/agent-conversations/conversation-send-route.ts';

const base=(status='running')=>({
  id:'chat',workspaceId:'ws',revision:'r1',requests:[],entries:[
    {id:'user',sequence:1,kind:'message',role:'user',text:'修复交互',status:'accepted',runId:'run'},
    {id:'answer',sequence:2,kind:'message',role:'assistant',text:'已经完成',status:'completed',runId:'run'},
  ],
  run:{id:'run',participantId:'participant',generation:'generation',status,accepted:true,tools:[]},
});
const running=base();
const completed={...base('completed'),run:{...base('completed').run,executionState:'ended',resourcesReleased:true}};

test('a quiet live view converges through the bounded authoritative read',async()=>{
  let applied, scheduled;
  const reader=startConversationRecoveryRead({
    current:()=>running,
    visible:()=>true,
    read:async()=>completed,
    apply:(next,observedRevision)=>{applied={next,observedRevision};},
    isCurrent:()=>true,
    schedule:(callback,milliseconds)=>{scheduled={callback,milliseconds};return 1;},
    cancel:()=>{},
  });
  assert.equal(scheduled.milliseconds,5000);
  assert.equal(needsConversationObservation(running),true);
  await reader.run();
  assert.equal(applied.next,completed);
  assert.equal(applied.observedRevision,'r1');
  assert.equal(executionLocked(applied.next.run),false);
  assert.equal(conversationStopControlState(applied.next),'hidden');
  assert.equal(conversationSendRoute(applied.next,false),'send');
  assert.equal(conversationRecoveryAction(applied.next,applied.next.entries),null);
  reader.stop();
});

test('recovery reads never overlap and hidden or idle views do not read',async()=>{
  let release,reads=0;
  const reader=startConversationRecoveryRead({
    current:()=>running,
    visible:()=>true,
    read:()=>{reads++;return new Promise(resolve=>{release=resolve;});},
    apply:()=>{assert.fail('stopped read must not apply');},
    isCurrent:()=>true,
    schedule:()=>1,
    cancel:()=>{},
  });
  const first=reader.run();
  await reader.run();
  assert.equal(reads,1,'a pending read is not duplicated');
  reader.stop();
  release(completed);
  await first;

  let hiddenReads=0;
  startConversationRecoveryRead({
    current:()=>running,visible:()=>false,read:async()=>{hiddenReads++;return completed;},apply:()=>{},isCurrent:()=>true,schedule:()=>1,cancel:()=>{},
  }).run();
  assert.equal(hiddenReads,0);

  let settledReads=0;
  const settledReader=startConversationRecoveryRead({
    current:()=>completed,visible:()=>true,read:async()=>{settledReads++;return completed;},apply:()=>{},isCurrent:()=>true,schedule:()=>1,cancel:()=>{},
  });
  await settledReader.run();
  assert.equal(settledReads,0,'a view that no longer needs observation stops reading');
  settledReader.stop();
});

test('selection changes and stop requests discard late recovery results',async()=>{
  let reads=0,live=true;
  const liveReader=startConversationRecoveryRead({
    current:()=>running,visible:()=>true,live:()=>live,
    read:async()=>{reads++;return completed;},apply:()=>{},isCurrent:()=>true,schedule:()=>1,cancel:()=>{},
  });
  await liveReader.run();
  assert.equal(reads,0,'a live stream already applies every change; the reread is skipped');
  live=false;
  await liveReader.run();
  assert.equal(reads,1,'a quiet or half-open stream still converges through the authoritative read');
  liveReader.stop();
});

test('selection changes and stop requests discard late recovery results',async()=>{
  let release,current=true,applied=0;
  const selectionReader=startConversationRecoveryRead({
    current:()=>running,visible:()=>true,read:()=>new Promise(resolve=>{release=resolve;}),apply:()=>{applied++;},isCurrent:()=>current,schedule:()=>1,cancel:()=>{},
  });
  const pending=selectionReader.run();
  current=false;
  release(completed);
  await pending;
  assert.equal(applied,0);
  selectionReader.stop();

  let releaseStopped,stoppedApplied=0;
  const stoppedReader=startConversationRecoveryRead({
    current:()=>running,visible:()=>true,read:()=>new Promise(resolve=>{releaseStopped=resolve;}),apply:()=>{stoppedApplied++;},isCurrent:()=>true,schedule:()=>1,cancel:()=>{},
  });
  const stoppedPending=stoppedReader.run();
  stoppedReader.stop();
  releaseStopped(completed);
  await stoppedPending;
  assert.equal(stoppedApplied,0);
});

test('lightweight probe skips full read when revision matches and reads full view when revision advances',async()=>{
  let probed=0,reads=0,applied=0,serverRevision='r1';
  const reader=startConversationRecoveryRead({
    current:()=>running,
    visible:()=>true,
    probe:async()=>{probed++;return {revision:serverRevision};},
    read:async()=>{reads++;return {...completed,revision:serverRevision};},
    apply:()=>{applied++;},
    isCurrent:()=>true,
    schedule:()=>1,
    cancel:()=>{},
  });
  await reader.run();
  assert.equal(probed,1);
  assert.equal(reads,0);
  assert.equal(applied,0);

  serverRevision='r2';
  await reader.run();
  assert.equal(probed,2);
  assert.equal(reads,1);
  assert.equal(applied,1);
  reader.stop();
});
