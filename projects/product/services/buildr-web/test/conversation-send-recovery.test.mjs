import assert from 'node:assert/strict';
import test from 'node:test';
import { sameConversationSendFacts, sameConversationSendPreview, withConversationSendRecovery, refreshedConversationConflictMessage } from '../src/features/agent-conversations/conversation-send-recovery.ts';

const chat = {
  id: 'chat', workspaceId: 'workspace', cwd: '/work', revision: 'r1', title: '旧标题', hidden: false, updatedAt: 'before',
  attachmentRevision: 'images-v1', participants: [{id:'p',connectionId:'codex',contextId:'native',deliveredThrough:2}],
  entries: [{id:'u',sequence:1,kind:'message',role:'user',text:'要求'}, {id:'a',sequence:2,kind:'message',role:'assistant',text:'结果'}],
  requests: [], run: {id:'run',participantId:'p',generation:'g',status:'completed',permissionMode:'full-access',model:'model',tools:[],updatedAt:'before',contextUsage:{usedTokens:1}},
};
const background = () => ({...structuredClone(chat), revision:'r2',title:'新标题',titleState:{status:'generated'},updatedAt:'after',activity:{version:2,seenThrough:2},run:{...structuredClone(chat.run),updatedAt:'after',contextUsage:{usedTokens:100}}});
const conflict = (code='agent_revision_conflict') => Object.assign(new Error('内容已变化，请刷新后重试。'), {status:409,code});

test('重新准备必须保留模型来源版本与实际发送设置，不能借后台版本变化更换配置',()=>{
  const preview={token:'old',revision:'r1',connectionId:'codex',modelAccountId:'source',modelAccountIdentity:'identity',modelAccountRevision:'account-r1',model:'m',permissionMode:'default',maxInputBytes:1024,history:[],fits:true,sourceThrough:2};
  assert.equal(sameConversationSendPreview(preview,{...preview,token:'new',revision:'r2',inputBytes:20,handoff:{body:'新标题的交接正文'}}),true);
  for(const changes of [{modelAccountRevision:'account-r2'},{modelAccountIdentity:'other'},{model:'other'},{serviceTier:'priority'},{reasoningEffort:'high'},{permissionMode:'full-access'},{maxInputBytes:2048},{sourceThrough:3}]){
    assert.equal(sameConversationSendPreview(preview,{...preview,...changes}),false);
  }
});

test('后台用量、标题、已读和时间变化允许恢复；比较不依赖对象键顺序',()=>{
  assert.equal(sameConversationSendFacts(chat,background()),true);
  // Key order within actual JSON views is not part of sending identity.
  assert.equal(sameConversationSendFacts(chat,{...chat,run:Object.fromEntries(Object.entries(chat.run).reverse())}),true);
  const expanded={...chat,entries:[{id:'older',sequence:0,text:'旧页'},...chat.entries]};
  assert.equal(sameConversationSendFacts(expanded,{...background(),nextEntryCursor:1}),true);
  assert.equal(sameConversationSendFacts(chat,{...background(),entries:chat.entries.slice(0,1)}),false);
});

test('工作范围、历史正文、附件、执行代次与配置等真实变化不得恢复',()=>{
  const changes=[
    value=>value.id='other',value=>value.workspaceId='other',value=>value.cwd='/other',value=>value.taskId='task',
    value=>value.entries[1].text='更改过的结果',value=>value.entries[0].attachments=['image'],
    value=>value.entries.push({id:'new',sequence:3,text:'新输入'}),value=>value.entries=[],
    value=>value.attachmentRevision='images-v2',value=>value.participants[0].contextId='new-native',
    value=>value.run.id='new-run',value=>value.run.generation='g2',value=>value.run.model='other',
    value=>value.run.permissionMode='default',value=>value.run.status='running',
    value=>value.run.tools=[{id:'tool',status:'running'}],value=>value.requests=[{id:'q'}],
    value=>value.pendingSend={id:'pending'},value=>value.forkState={status:'pending'},
  ];
  for(const change of changes){const next=background();change(next);assert.equal(sameConversationSendFacts(chat,next),false,String(change));}
});

test('准备与提交共享一次恢复预算，重读后沿用原请求身份',async()=>{
  const recovery={enabled:true,used:false},calls=[],id='one-explicit-send';
  let reads=0,applied=0;
  const options={
    isCurrent:()=>true,read:async()=>{reads++;return background();},apply:()=>applied++,
    perform:async value=>{calls.push([value.revision,id]);if(calls.length===1)throw conflict();return 'prepared';},
  };
  const result=await withConversationSendRecovery(chat,recovery,options);
  assert.equal(result.value,'prepared');assert.deepEqual(calls,[['r1',id],['r2',id]]);assert.equal(reads,1);assert.equal(applied,1);
  await assert.rejects(withConversationSendRecovery(result.conversation,recovery,{...options,perform:async()=>{throw conflict('agent_preview_stale');}}));
  assert.equal(reads,1,'提交冲突不能再消耗第二次恢复');
});

test('提交被明确拒绝可以恢复一次；二次冲突、真实变化和非明确拒绝不循环',async()=>{
  for(const code of ['agent_revision_conflict','agent_preview_stale']){
    let calls=0;
    const result=await withConversationSendRecovery(chat,{enabled:true,used:false},{
      isCurrent:()=>true,read:async()=>background(),apply:()=>{},
      perform:async()=>{if(++calls===1)throw conflict(code);return 'accepted';},
    });
    assert.equal(result.value,'accepted');assert.equal(calls,2);
  }
  for(const error of [new Error('response lost'),Object.assign(new Error('unknown'),{status:500}),conflict('agent_model_source_changed'),conflict('agent_request_conflict')]){
    let calls=0,reads=0;
    await assert.rejects(withConversationSendRecovery(chat,{enabled:true,used:false},{isCurrent:()=>true,read:async()=>{reads++;return background();},apply:()=>{},perform:async()=>{calls++;throw error;}}),value=>value===error);
    assert.equal(calls,1);assert.equal(reads,0);
  }
  for(const changed of [false,true]){
    let calls=0;
    await assert.rejects(withConversationSendRecovery(chat,{enabled:true,used:false},{isCurrent:()=>true,read:async()=>({...background(),...(changed?{taskId:'new-task'}:{})}),apply:()=>{},perform:async()=>{calls++;throw conflict();}}));
    assert.equal(calls,changed?1:2);
  }
});

test('取消、切换及显式预览不自动重发；重读失败也不提交',async()=>{
  let current=true,calls=0;
  const options={isCurrent:()=>current,read:async()=>{current=false;return background();},apply:()=>assert.fail('迟到读取不得应用'),perform:async()=>{calls++;throw conflict();}};
  assert.equal(await withConversationSendRecovery(chat,{enabled:true,used:false},options),undefined);assert.equal(calls,1);
  current=true;
  await assert.rejects(withConversationSendRecovery(chat,{enabled:false,used:false},{...options,read:async()=>assert.fail('显式预览不重读')}));assert.equal(calls,2);
  await assert.rejects(withConversationSendRecovery(chat,{enabled:true,used:false},{...options,read:async()=>{throw Error('read failed');}}),/read failed/);assert.equal(calls,3);
  assert.match(refreshedConversationConflictMessage(conflict()),/已更新.*核对.*草稿保留/);
  assert.doesNotMatch(refreshedConversationConflictMessage(conflict()),/刷新/);
  assert.match(refreshedConversationConflictMessage({code:'agent_model_source_changed',message:'套餐来源变化。'}),/套餐来源变化/);
});
