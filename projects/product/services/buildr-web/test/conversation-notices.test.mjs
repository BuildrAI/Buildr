import assert from 'node:assert/strict';
import test from 'node:test';
import {visibleConversationEntries, latestVisibleConversationMessage, conversationModelWarning, conversationActionError, conversationHandoffReceipt, conversationSystemNoticeText} from '../src/features/agent-conversations/conversation-notices.ts';

const receipt=(id, extra={})=>({id,kind:'notice',role:'system',text:'已请求重试上次未送达的要求。',participantId:'codex',...extra});
test('连续重试仅显示最后一条，保留原始记录与后续回复',()=>{
  const entries=[receipt('one'),receipt('two'),receipt('three'),{id:'reply',kind:'message',role:'assistant',text:'继续执行'}];
  const original=structuredClone(entries);
  assert.deepEqual(visibleConversationEntries(entries).map(e=>e.id),['three','reply']);
  assert.deepEqual(entries,original);
  assert.deepEqual(visibleConversationEntries([receipt('one',{text:'已请求继续上次执行。'}),receipt('two',{text:'已请求继续上次执行。'})]).map(e=>e.id),['two']);
});
test('参与者、内容和其他工作记录形成合并边界，普通用户内容不会去重',()=>{
  for(const middle of [receipt('middle',{participantId:'dsh'}),receipt('middle',{text:'已请求继续上次执行。'}),{id:'middle',kind:'tool',role:'system',text:'检查失败'},{id:'middle',kind:'message',role:'assistant',text:'说明'}]){
    assert.deepEqual(visibleConversationEntries([receipt('one'),middle,receipt('two')]).map(e=>e.id),['one','middle','two']);
  }
  const users=[receipt('one',{kind:'message',role:'user'}),receipt('two',{kind:'message',role:'user'})];
  assert.deepEqual(visibleConversationEntries(users),users);
});
test('目录未就绪不误报模型停用，真实停用与来源不可用分别说明',()=>{
  assert.equal(conversationModelWarning(false,'account',undefined),undefined);
  assert.equal(conversationModelWarning(true,undefined,undefined),undefined);
  assert.equal(conversationModelWarning(true,'account',{available:true,enabled:true}),undefined);
  assert.match(conversationModelWarning(true,'account',{available:false,enabled:false}),/已停用/);
  assert.match(conversationModelWarning(true,'account',{available:false,enabled:true}),/账号.*登录状态/);
  assert.match(conversationModelWarning(true,'account',undefined),/账号/);
});
test('重试后的模型警告只取当前状态，恢复后去除旧错误，其他失败仍可见',()=>{
  const warning=conversationModelWarning(true,'account',{available:false});
  assert.equal(conversationActionError('所选模型暂不可用，请重新选择。',warning),undefined);
  assert.equal(conversationActionError(warning,warning),undefined);
  assert.equal(conversationActionError('所选模型暂不可用，请重新选择。',undefined),undefined);
  assert.equal(conversationActionError('图片上传失败',warning),'图片上传失败');
  assert.equal(conversationActionError('输入内容超出容量',undefined),'输入内容超出容量');
});

test('未回答问题的系统存档静默保留，用户回答和真实错误不隐藏',()=>{
 const archived=['retired-question-','waiting-question-','waiting-handoff-'].map(prefix=>receipt(prefix+'id',{text:'{"请求标识":"id","问题":"继续吗？","状态":"未回答"}'}));
 const answered=receipt('waiting-handoff-answered',{role:'user',text:'我选择继续'});
 const error=receipt('failure',{text:'原生执行失败'});
 const userText=receipt('retired-question-user',{role:'user',kind:'message',text:'retired-question- 是我的内容'});
 const entries=[...archived,answered,error,userText],snapshot=structuredClone(entries);
 assert.deepEqual(visibleConversationEntries(entries).map(entry=>entry.id),[answered.id,error.id,userText.id]);
 assert.deepEqual(entries,snapshot,'隐藏展示不删除、改写或代答历史问题');
});

test('子任务消息只按可靠父工具来源隐藏，真实用户输入、父工具和主助手正文保持可见',()=>{
 const child={id:'child',kind:'message',role:'assistant',text:'完全相同的报告',parentToolId:'agent-tool'};
 const childInput={...child,id:'child-input',role:'user',text:'子任务内部输入'};
 const parent={id:'agent-tool',kind:'tool',role:'system',text:'完全相同的报告'};
 const main={id:'main',kind:'message',role:'assistant',text:'完全相同的报告'};
 const user={id:'user',kind:'message',role:'user',text:'子任务内部输入'};
 assert.deepEqual(visibleConversationEntries([childInput,child,parent,user,main]),[parent,user,main]);
 assert.deepEqual(visibleConversationEntries([{...child,parentToolId:undefined},main]).map(entry=>entry.id),['child','main']);
});

test('同组合内部接续不产生交接提示，真实换家和接收失败仍准确显示',()=>{
 for(const agent of ['Qoder','DSH','Codex']){
  const entry={text:'旧文案',status:'accepted',handoff:{agent,changes:[]}};
  assert.equal(conversationHandoffReceipt(entry),'');
  assert.equal(conversationHandoffReceipt({...entry,status:'failed'}),'新要求未接收');
  assert.equal(conversationHandoffReceipt({...entry,status:'unknown'}),'新要求接收待确认');
 }
 assert.equal(conversationHandoffReceipt({text:'交给 DSH',status:'accepted',handoff:{agent:'DSH',changes:[{after:'DSH'},{after:'GPT'}]}}),'DSH · GPT 已接手');
 assert.equal(conversationHandoffReceipt({text:'兼容旧历史'}),'兼容旧历史');
});

test('已读定位只选可见主消息，隐藏子消息和存档不遮蔽主答复或明确用户回答',()=>{
 const main={id:'main',kind:'message',role:'assistant',text:'可见主答复'};
 const archive={id:'retired-question-id',kind:'notice',role:'system',text:'内部问题存档'};
 const child={id:'child',kind:'message',role:'assistant',text:'子报告',parentToolId:'agent-tool'};
 const childUser={...child,id:'child-user',role:'user',text:'内部输入'};
 assert.equal(latestVisibleConversationMessage([main,archive,childUser,child]),main);
 const reply={id:'reply-explicit',kind:'notice',role:'user',text:'我明确回答继续'};
 assert.equal(latestVisibleConversationMessage([main,reply,archive,child]),reply);
 assert.equal(latestVisibleConversationMessage([archive,childUser,child]),undefined);
});

test('系统恢复指令只呈现准确接收状态，原始记录与普通消息保持原样',()=>{
  const raw=receipt('system',{text:'系统自动恢复：原控制资源已释放，先核对未知工具引用和当前成果。',status:'accepted'});
  assert.equal(conversationSystemNoticeText(raw),'已自动接续上次工作。');
  assert.equal(conversationSystemNoticeText({...raw,status:'sending'}),'正在自动核对并接续上次工作。');
  assert.equal(conversationSystemNoticeText({...raw,status:'failed'}),'自动恢复未能接续。');
  assert.equal(conversationSystemNoticeText({...raw,status:'unknown'}),'自动恢复是否接续仍待确认。');
  assert.equal(conversationSystemNoticeText({...raw,kind:'message',role:'user'}),raw.text);
  assert.equal(conversationSystemNoticeText({...raw,kind:'message',role:'assistant'}),raw.text);
  assert.match(raw.text,/未知工具引用/);
});
