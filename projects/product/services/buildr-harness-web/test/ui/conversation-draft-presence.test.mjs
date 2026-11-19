import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conversationDraftIds,
  conversationDraftPresence,
  conversationDraftSnapshot,
  conversationDraftSubmittedSnapshot,
  notifyConversationDraft,
  notifyConversationDraftSubmitted,
  settleConversationDraftIds,
  shouldShowConversationDraft,
  subscribeConversationDrafts,
  workspaceConversationDraftIds,
} from '../../src/features/agent-conversations/conversation-draft-presence.ts';
import { draftKey } from '../../src/features/agent-conversations/conversation-state.ts';

const storage = entries => {const rows=new Map(entries);return {get length(){return rows.size;},key:i=>[...rows.keys()][i]??null,getItem:key=>rows.get(key)??null};};
test('derive text and attachment drafts, excluding whitespace, new slots, preferences and other profiles',()=>{
 const rows=storage([
  [draftKey('development','w1','old'),'unfinished'],
  [draftKey('development','w2','json'),JSON.stringify({text:'未发送',workspaceId:'w2'})],
  [draftKey('development','w1','blank'),'   \n '],
  [draftKey('development','w1','preference'),JSON.stringify({text:'',workspaceId:'w1'})],
  [draftKey('other','w1','foreign'),'private'],
  [draftKey('development','w1',null),'not listed'],
  [draftKey('development','w1',null)+':migrated','true'],
  ['buildr.agent-conversation.draft:development:w1:new','legacy new'],
  ['buildr.agent-conversation.attachments:development',JSON.stringify({image:[{id:'a'}],old:[{id:'b'}],removed:[]})],
 ]);
 assert.deepEqual(conversationDraftIds('development',rows),['image','json','old']);
 assert.deepEqual(conversationDraftPresence('development',rows),{
  ids:['image','json','old'],
  byWorkspace:{w1:['old'],w2:['json']},
  unscopedIds:['image','old'],
 });
 assert.deepEqual(conversationDraftIds('other',rows),['foreign']);
 const overrides=new Map([[draftKey('development','w1','old'),null],['buildr.agent-conversation.attachments:development','{}']]);
 assert.deepEqual(conversationDraftIds('development',rows,overrides),['json']);
});
test('unavailable or malformed storage does not prevent current-page membership updates',()=>{
 const denied={get length(){throw new Error('denied');},key:()=>null,getItem:()=>null};
 assert.deepEqual(conversationDraftIds('test',denied,new Map([[draftKey('test','w','current'),'next'] ])),['current']);
 assert.deepEqual(conversationDraftIds('test',storage([[draftKey('test','w','bad'),'{invalid'],['buildr.agent-conversation.attachments:test','null']])),[]);
});
test('notifications keep a stable membership snapshot through edits and clear after accepted send',()=>{
 let changes=0;const stop=subscribeConversationDrafts(()=>changes++),key=draftKey('presence-test','w','current');
 notifyConversationDraft(key,'one');assert.equal(conversationDraftSnapshot('presence-test'),'["current"]');
 notifyConversationDraft(key,'two');assert.equal(conversationDraftSnapshot('presence-test'),'["current"]');
 notifyConversationDraft(key,null);assert.equal(conversationDraftSnapshot('presence-test'),'[]');
 stop();notifyConversationDraft(key,null);assert.equal(changes,3);
});
test('shouldShowConversationDraft follows settledDraftIds and hides badge whenever any activity state is present',()=>{
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'},activity:{version:2,seenThrough:2,active:false,updatedAt:''}},['c1']),true);
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'}},['c2']),false);
 for (const status of ['starting','running','stopping']) {
  assert.equal(shouldShowConversationDraft({id:'c1',run:{status}},['c1']),false,`${status} (running) hides draft badge`);
 }
 for (const status of ['waiting-approval','waiting-question']) {
  assert.equal(shouldShowConversationDraft({id:'c1',run:{status}},['c1']),false,`${status} (waiting) hides draft badge`);
 }
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'},activity:{version:1,seenThrough:1,active:false,pendingDecisionCount:1,updatedAt:''}},['c1']),false,'pendingDecisionCount (waiting) hides draft badge');
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'},activity:{version:3,seenThrough:2,active:true,updatedAt:''}},['c1']),false,'unseen hides draft badge');
 assert.equal(shouldShowConversationDraft({id:'c1',pendingSend:{clientRequestId:'r1',state:'waiting',reason:'等待原执行结束后自动发送',updatedAt:''}},['c1']),false,'send-waiting hides draft badge');
 assert.equal(shouldShowConversationDraft({id:'c1',pendingSend:{clientRequestId:'r2',state:'failed',reason:'发送失败',updatedAt:''}},['c1']),false,'send-failed hides draft badge');
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'unknown'}},['c1']),false,'unknown run hides draft badge');
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'},activity:{version:2,seenThrough:2,active:true,updatedAt:''}},['c1']),false,'residual active unknown hides draft badge');
});
test('settleConversationDraftIds keeps side-by-side row frozen on re-entry and clearing until navigation away, send, or active status',()=>{
 const presence={byWorkspace:{w1:['c1'],w2:['c2']},unscopedIds:[]};
 // 原本无草稿：打开对话输入→清空→再输入，期间不提前上浮；离开后才进入结算集合。
 let settled=settleConversationDraftIds({liveIds:['c1'],previousIds:[],activeEditingId:'c1'});
 assert.deepEqual(settled,[]);
 settled=settleConversationDraftIds({liveIds:[],previousIds:settled,activeEditingId:'c1'});
 assert.deepEqual(settled,[]);
 settled=settleConversationDraftIds({liveIds:['c1'],previousIds:settled,activeEditingId:'c1'});
 assert.deepEqual(settled,[]);
 settled=settleConversationDraftIds({liveIds:['c1'],previousIds:settled,activeEditingId:'c2'});
 assert.deepEqual(settled,['c1']);
 assert.deepEqual(workspaceConversationDraftIds('w1',settled,presence),['c1']);
 assert.deepEqual(workspaceConversationDraftIds('w2',settled,presence),[]);

 // 点回已有草稿对话（c1）：徽标与排序席位均保持原样，不因重新选回而消失。
 settled=settleConversationDraftIds({liveIds:['c1'],previousIds:settled,activeEditingId:'c1'});
 assert.deepEqual(settled,['c1']);
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'}},settled),true);

 // 停留在已有草稿对话期间清空内容：左侧徽标与席位依然保持锁定，离开后再释放。
 settled=settleConversationDraftIds({liveIds:[],previousIds:settled,activeEditingId:'c1'});
 assert.deepEqual(settled,['c1']);
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'}},settled),true);
 assert.deepEqual(workspaceConversationDraftIds('w1',settled,{byWorkspace:{},unscopedIds:[]},{workspaceId:'w1',conversationId:'c1'}),['c1']);
 assert.deepEqual(workspaceConversationDraftIds('w2',settled,{byWorkspace:{},unscopedIds:[]},{workspaceId:'w1',conversationId:'c1'}),[]);
 settled=settleConversationDraftIds({liveIds:[],previousIds:settled,activeEditingId:null});
 assert.deepEqual(settled,[]);

 // 停留期间直接发送进入待发送（pendingSend）或已受理清空（submittedIds）且实时草稿已空时立即清除“有草稿”。
 settled=settleConversationDraftIds({liveIds:[],previousIds:['c1'],activeEditingId:'c1',pendingSendIds:new Set(['c1'])});
 assert.deepEqual(settled,[]);
 settled=settleConversationDraftIds({liveIds:[],previousIds:['c1'],activeEditingId:'c1',submittedIds:new Set(['c1'])});
 assert.deepEqual(settled,[]);

 // 验证 submittedClearedIds 通知与再次输入非空文本后的自动撤回。
 notifyConversationDraftSubmitted('submit-test');
 assert.equal(conversationDraftSubmittedSnapshot(),'["submit-test"]');
 notifyConversationDraft(draftKey('presence-test','w','submit-test'),JSON.stringify({text:'next'}));
 assert.equal(conversationDraftSubmittedSnapshot(),'[]');
 notifyConversationDraft(draftKey('presence-test','w','submit-test'),null);

 // 任何活动状态的对话绝不计入草稿结算，全部活动状态消除后非停留对话立即恢复识别。
 settled=settleConversationDraftIds({liveIds:['c1','c2'],previousIds:['c1'],activeEditingId:null,activeStatusIds:new Set(['c1'])});
 assert.deepEqual(settled,['c2']);
 settled=settleConversationDraftIds({liveIds:['c1','c2'],previousIds:settled,activeEditingId:null,activeStatusIds:new Set()});
 assert.deepEqual(settled,['c1','c2']);
 // 兼容仅传 executingIds 的旧调用。
 settled=settleConversationDraftIds({liveIds:['c1','c2'],previousIds:['c1'],activeEditingId:null,executingIds:new Set(['c1'])});
 assert.deepEqual(settled,['c2']);

 // 并排点开带草稿的“待查看”对话并标记已读离开 activeStatusIds：停留期间安静不弹出“有草稿”，离开后才显现。
 settled=settleConversationDraftIds({liveIds:['c1'],previousIds:[],activeEditingId:'c1',activeStatusIds:new Set(['c1'])});
 assert.deepEqual(settled,[]);
 settled=settleConversationDraftIds({liveIds:['c1'],previousIds:settled,activeEditingId:'c1',activeStatusIds:new Set()});
 assert.deepEqual(settled,[]);
 settled=settleConversationDraftIds({liveIds:['c1'],previousIds:settled,activeEditingId:'c2',activeStatusIds:new Set()});
 assert.deepEqual(settled,['c1']);
});
