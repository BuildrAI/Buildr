import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationModelLabel} from '../src/features/agent-conversations/conversation-model-label.ts';
const connections=[{id:'codex',models:[{id:'qmodel_38max',label:'QMODEL 3.8 MAX'},{id:'swe-2',label:'SWE-2'}]}];
const catalog=[{accountId:'source-a',modelId:'shared-id',label:'FULL MODEL NAME'},{accountId:'source-b',modelId:'shared-id',label:'OTHER MODEL NAME'}];
test('展示精确复用选择器完整名称，查询仍可使用原始编号',()=>{
 assert.equal(conversationModelLabel('qmodel_38max',connections,catalog),'QMODEL 3.8 MAX');
 assert.equal(conversationModelLabel('swe-2',connections,catalog),'SWE-2');
 assert.equal(conversationModelLabel('shared-id',connections,catalog,{modelAccountId:'source-b'}),'OTHER MODEL NAME');
});
test('未知或同名编号歧义不伪造名称，缺失与未知明确区分',()=>{
 assert.equal(conversationModelLabel('shared-id',connections,catalog),'模型名称待确认');
 assert.equal(conversationModelLabel('unknown-id',connections,catalog),'模型名称待确认');
 assert.equal(conversationModelLabel(undefined,connections,catalog),'模型未记录');
});
