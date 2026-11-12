import test from 'node:test';
import assert from 'node:assert/strict';
import { qoderForm } from '../../src/executors/qoder-cn/forms.ts';

test('ACP form schema preserves native field ids, enum labels and typed answers',()=>{
  const form=qoderForm({message:'选择',requestedSchema:{type:'object',additionalProperties:false,properties:{
    q0:{type:'string',oneOf:[{const:'A',title:'甲'},{const:'B',title:'乙'}]},
    q1:{type:'array',items:{type:'string',anyOf:[{const:'x'},{const:'y'}]},minItems:1},
    note:{type:'string',minLength:1},n:{type:'integer',minimum:1},ok:{type:'boolean'},
  },required:['q0','q1','note','n','ok']}},'exact-request');
  assert.equal(form.request.questions?.[0]?.options?.[0]?.label,'甲');
  assert.equal(form.request.questions?.[0]?.allowOther,false);
  assert.equal(form.request.questions?.[1]?.multiple,true);
  const answer={q0:'A',q1:['x','y'],note:'说明',n:'2',ok:'true'};
  assert.deepEqual(form.answer(answer),{action:'accept',content:{...answer,n:2,ok:true}});
  for(const invalid of [{...answer,q0:'unknown'},{...answer,q1:['z']},{...answer,n:'0'},{...answer,extra:'x'},{},null]){
    assert.throws(()=>form.answer(invalid),/answer_invalid/);
  }
});

test('Qoder CN AskUserQuestion forms preserve the native implicit Other answer',()=>{
  const form=qoderForm({mode:'form',message:'Answer Questions',_meta:{qoder:{toolName:'AskUserQuestion'}},requestedSchema:{type:'object',additionalProperties:false,properties:{
    q0:{type:'string',title:'节点',oneOf:[{const:'香港',title:'香港'},{const:'新加坡',title:'新加坡'}]},
    q1:{type:'array',title:'功能',items:{type:'string',anyOf:[{const:'问答'},{const:'追加'}]},minItems:1},
    note:{type:'string',minLength:1},
  },required:['q0','q1','note']}},'ask-user-question');
  assert.equal(form.request.questions?.[0]?.allowOther,true);
  assert.equal(form.request.questions?.[1]?.allowOther,true);
  assert.equal(form.request.questions?.[2]?.allowOther,true);
  assert.deepEqual(form.answer({q0:'台湾',q1:['问答','自定义'],note:'说明'}),{action:'accept',content:{q0:'台湾',q1:['问答','自定义'],note:'说明'}});
  for(const invalid of [{q0:'台湾',q1:'问答',note:'说明'},{q0:'台湾',q1:['问答'],note:'说明',extra:'x'},{q0:'台湾',q1:[],note:'说明'}]){
    assert.throws(()=>form.answer(invalid),/answer_invalid/);
  }
});

test('unsupported URL and complex forms are never silently approved',()=>{
  assert.throws(()=>qoderForm({mode:'url'},'id'),/unsupported/);
  assert.throws(()=>qoderForm({requestedSchema:{type:'object',properties:{email:{type:'string',format:'email'}}}},'id'),/unsupported/);
  assert.throws(()=>qoderForm({requestedSchema:{type:'object',properties:{nested:{type:'object'}}}},'id'),/unsupported/);
});
