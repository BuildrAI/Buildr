import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationReasoningSelection} from '../src/features/agent-conversations/conversation-options.ts';
const connection={models:[
  {id:'first',label:'First',isDefault:true,defaultReasoningEffort:'high',reasoningEfforts:[{id:'low',label:'Low'},{id:'high',label:'High'}]},
  {id:'second',label:'Second',defaultReasoningEffort:'medium',reasoningEfforts:[{id:'medium',label:'Medium'}]},
  {id:'plain',label:'Plain'}
]};
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
