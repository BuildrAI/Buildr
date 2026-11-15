import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationDraftIds, conversationDraftSnapshot, notifyConversationDraft, subscribeConversationDrafts } from '../src/features/agent-conversations/conversation-draft-presence.ts';
import { draftKey } from '../src/features/agent-conversations/conversation-state.ts';

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
