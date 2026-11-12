import assert from 'node:assert/strict';
import test from 'node:test';
import {CUSTOM_PROVIDER_PROTOCOLS,customProviderEndpoint,removeCustomModel,upsertCustomModel} from '../src/features/agent-conversations/custom-provider-model.ts';

test('四类 API 协议提供稳定选项与按协议的请求地址提示',()=>{
  assert.deepEqual(CUSTOM_PROVIDER_PROTOCOLS.map(item=>item.value),['chat-completions','responses','anthropic-messages','gemini']);
  assert.equal(customProviderEndpoint('chat-completions','https://gw.example.com/v1/'),'https://gw.example.com/v1/chat/completions');
  assert.equal(customProviderEndpoint('responses','https://gw.example.com/v1'),'https://gw.example.com/v1/responses');
  assert.equal(customProviderEndpoint('anthropic-messages',' https://api.anthropic.com/v1 '),'https://api.anthropic.com/v1/messages');
  assert.equal(customProviderEndpoint('gemini','https://generativelanguage.googleapis.com/v1beta'),'https://generativelanguage.googleapis.com/v1beta/models/<模型 ID>:generateContent');
  assert.equal(customProviderEndpoint('gemini','  '),'<Base URL>/models/<模型 ID>:generateContent');
});

test('手动添加与发现候选按模型 id 合并，不重复且保留既有显示名和上下文',()=>{
  const models=[{id:'gpt-4o',label:'主力模型',contextWindow:128000},{id:'deepseek-chat'}];
  assert.deepEqual(upsertCustomModel(models,{id:'gpt-4o',contextWindow:64000}),[{id:'gpt-4o',label:'主力模型',contextWindow:64000},{id:'deepseek-chat'}]);
  assert.deepEqual(upsertCustomModel(models,{id:'gpt-4o',label:'新名称'}),[{id:'gpt-4o',label:'新名称',contextWindow:128000},{id:'deepseek-chat'}]);
  assert.deepEqual(upsertCustomModel(models,{id:'deepseek-chat',label:'DeepSeek Chat'}),[{id:'gpt-4o',label:'主力模型',contextWindow:128000},{id:'deepseek-chat',label:'DeepSeek Chat'}]);
  assert.deepEqual(upsertCustomModel(models,{id:' qwen-max ',label:'Qwen Max'}).at(-1),{id:'qwen-max',label:'Qwen Max'});
});

test('已有模型只补充缺失信息，忽略空 id 并允许移除，模型 id 不变以保留启用偏好',()=>{
  const models=[{id:'one',label:'One',contextWindow:32000},{id:'two'}];
  const merged=upsertCustomModel(models,{id:'one'});
  assert.deepEqual(merged.map(model=>model.id),['one','two']);
  assert.deepEqual(merged[0],{id:'one',label:'One',contextWindow:32000});
  assert.equal(upsertCustomModel(models,{id:'   '}),models);
  assert.deepEqual(removeCustomModel(models,'one'),[{id:'two'}]);
  assert.deepEqual(models.map(model=>model.id),['one','two']);
});
