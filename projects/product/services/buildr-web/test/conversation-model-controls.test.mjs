import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationModelCompatibility,conversationReasoningSelection,officialConversationChoice} from '../src/features/agent-conversations/conversation-options.ts';
const connection={models:[
  {id:'first',label:'First',isDefault:true,defaultReasoningEffort:'high',reasoningEfforts:[{id:'low',label:'Low'},{id:'high',label:'High'}]},
  {id:'second',label:'Second',defaultReasoningEffort:'medium',reasoningEfforts:[{id:'medium',label:'Medium'}]},
  {id:'plain',label:'Plain'}
]};
test('Devin兼容限制按执行方和来源判断，不改变账号或选择',()=>{
 const source={provider:'devin',accountId:'renamed-account',modelId:'any-model',available:true,enabled:true};
 const original=structuredClone(source);
 for(const provider of ['codex','qoder'])assert.ok(conversationModelCompatibility({id:'custom-'+provider,provider},source)?.includes(provider==='codex'?'Codex':'Qoder'));
 assert.equal(conversationModelCompatibility({provider:'dsh'},source),undefined);
 assert.equal(conversationModelCompatibility(undefined,source),undefined);
 assert.equal(conversationModelCompatibility({provider:'codex'},undefined),undefined);
 assert.deepEqual(source,original);
});
test('六种已测交叉来源保持可选，不以来源显示名猜测Devin',()=>{
 for(const [provider,source] of [['codex','native-qoder'],['codex','native-dsh'],['qoder','native-codex'],['qoder','native-dsh'],['dsh','native-codex'],['dsh','native-qoder']])assert.equal(conversationModelCompatibility({provider},{provider:source,label:'Devin'}),undefined);
});
test('Codex的Devin SWE-2支持默认与完全访问，其他未验证组合仍限制且不修改选择',()=>{
 const source={provider:'devin',modelId:'swe-2',label:'改名模型'},original=structuredClone(source);
 assert.equal(conversationModelCompatibility({provider:'codex'},source),undefined);
 assert.equal(conversationModelCompatibility({provider:'codex'},source,'full-access'),undefined);
 assert.equal(conversationModelCompatibility({provider:'codex'},source,'default'),undefined);
 assert.ok(conversationModelCompatibility({provider:'codex'},{...source,modelId:'gpt-6-1-sol'},'full-access'));
 assert.ok(conversationModelCompatibility({provider:'qoder'},source,'full-access'));
 assert.equal(conversationModelCompatibility({provider:'dsh'},source,'default'),undefined);
 assert.deepEqual(source,original);
});
test('紧凑控件仅使用模型原生档位，区分默认继承和显式覆盖',()=>{
 const inherited=conversationReasoningSelection(connection,{connectionId:'qoder'});
 assert.deepEqual(inherited.options.map(option=>option.id),['low','high']);assert.equal(inherited.index,1);assert.equal(inherited.label,'高');assert.equal(inherited.inherited,true);
 const selected=conversationReasoningSelection(connection,{connectionId:'qoder',model:'first',reasoningEffort:'low'});
 assert.equal(selected.index,0);assert.equal(selected.label,'低');assert.equal(selected.inherited,false);
 const reset=conversationReasoningSelection(connection,{connectionId:'qoder',model:'first',reasoningEffort:undefined});assert.equal(reset.index,1);assert.equal(reset.inherited,true);
});
test('换模型、无强度与缺失默认信息时不虚构可用档位',()=>{
 const second=conversationReasoningSelection(connection,{connectionId:'qoder',model:'second'});assert.deepEqual(second.options.map(option=>option.id),['medium']);assert.equal(second.index,0);assert.equal(second.label,'中');
 const stale=conversationReasoningSelection(connection,{connectionId:'qoder',model:'second',reasoningEffort:'high'});assert.equal(stale.index,-1);assert.equal(stale.inherited,false);
 const plain=conversationReasoningSelection(connection,{connectionId:'qoder',model:'plain'});assert.deepEqual(plain.options,[]);assert.equal(plain.index,-1);
 const unknown=conversationReasoningSelection({models:[{...connection.models[0],isDefault:false}]},{connectionId:'qoder'});assert.deepEqual(unknown.options,[]);assert.equal(unknown.label,'默认');
 const noDefault=conversationReasoningSelection({models:[{...connection.models[0],defaultReasoningEffort:undefined}]},{connectionId:'qoder'});assert.equal(noDefault.index,-1);assert.equal(noDefault.label,'默认');
});

test('乱序档位按低到高展示，默认值和显式选择始终按标识匹配',()=>{
 const efforts=[{id:'high',label:'High'},{id:'medium',label:'Medium'},{id:'none',label:'None'},{id:'max',label:'Max'},{id:'low',label:'Low'}];
 const source={models:[{id:'ordered',label:'Ordered',isDefault:true,defaultReasoningEffort:'high',reasoningEfforts:efforts}]};
 const result=conversationReasoningSelection(source,{connectionId:'codex'});
 assert.deepEqual(result.options.map(item=>item.id),['none','low','medium','high','max']);
 assert.equal(result.index,3);assert.equal(result.label,'高');assert.equal(result.ordered,true);
 const selected=conversationReasoningSelection(source,{connectionId:'codex',reasoningEffort:'low'});
 assert.equal(selected.index,1);assert.equal(selected.label,'低');
 assert.deepEqual(efforts.map(item=>item.id),['high','medium','none','max','low']);
});
test('自动、未知或同义档位不强制放入有序滑杆，单档位保持原能力',()=>{
 for(const ids of [['high','auto','low'],['high','future-mode','low'],['none','off','high'],['medium']]){
  const result=conversationReasoningSelection({models:[{id:'m',isDefault:true,defaultReasoningEffort:ids[0],reasoningEfforts:ids.map(id=>({id,label:id}))}]},{connectionId:'qoder'});
  assert.equal(result.ordered,false);assert.equal(result.options[result.index].id,ids[0]);
 }
});

test('切换智能体优先采用官方来源，不自动消费其他套餐',()=>{
 const own={accountId:'native-codex',modelId:'m',available:true,enabled:true,accountIdentity:'own',accountRevision:'r'};
 const other={...own,accountId:'devin',accountIdentity:'other'};
 assert.equal(officialConversationChoice({id:'codex',models:[]},[other,own]).modelAccountId,'native-codex');
 assert.deepEqual(officialConversationChoice({id:'codex',models:[]},[other]),{connectionId:'codex'});
 assert.deepEqual(officialConversationChoice({id:'codex',models:[]},[{...own,enabled:false},other]),{connectionId:'codex'});
});
