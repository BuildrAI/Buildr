import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conversationDraftIds,
  conversationDraftPresence,
  conversationDraftSnapshot,
  notifyConversationDraft,
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
test('shouldShowConversationDraft hides badge while executing or side-by-side editing',()=>{
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'}},['c1'],null),true);
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'}},['c1'],'c1'),false);
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'completed'}},['c1'],'c2'),true);
 for (const status of ['starting','running','stopping']) {
  assert.equal(shouldShowConversationDraft({id:'c1',run:{status}},['c1'],null),false,`${status} hides draft badge`);
 }
 assert.equal(shouldShowConversationDraft({id:'c1',run:{status:'waiting-question'}},['c1'],null),true);
});
test('settleConversationDraftIds keeps side-by-side row stable until navigation away and excludes executing rows',()=>{
 const presence={byWorkspace:{w1:['c1'],w2:['c2']},unscopedIds:[]};
 // 打开普通对话输入→清空→再输入，期间不提前上浮；离开后才进入结算集合。
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

 // 打开已有草稿对话清空内容期间保持席位锁定（含当前工作空间可见参数），离开后再释放。
 settled=settleConversationDraftIds({liveIds:[],previousIds:settled,activeEditingId:'c1'});
 assert.deepEqual(settled,['c1']);
 assert.deepEqual(workspaceConversationDraftIds('w1',settled,{byWorkspace:{},unscopedIds:[]},{workspaceId:'w1',conversationId:'c1'}),['c1']);
 assert.deepEqual(workspaceConversationDraftIds('w2',settled,{byWorkspace:{},unscopedIds:[]},{workspaceId:'w1',conversationId:'c1'}),[]);
 settled=settleConversationDraftIds({liveIds:[],previousIds:settled,activeEditingId:null});
 assert.deepEqual(settled,[]);

 // 执行中的对话绝不计入草稿结算，执行结束后恢复正常识别。
 settled=settleConversationDraftIds({liveIds:['c1','c2'],previousIds:['c1'],activeEditingId:null,executingIds:new Set(['c1'])});
 assert.deepEqual(settled,['c2']);
 settled=settleConversationDraftIds({liveIds:['c1','c2'],previousIds:settled,activeEditingId:null,executingIds:new Set()});
 assert.deepEqual(settled,['c1','c2']);
});
