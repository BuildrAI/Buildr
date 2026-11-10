import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationModelLabel,conversationModelSourceLabel} from '../src/features/agent-conversations/conversation-model-label.ts';
import {executionAgentName,modelSourceName} from '../src/lib/model-picker.ts';
const connections=[{id:'codex',models:[{id:'qmodel_38max',label:'QMODEL 3.8 MAX'},{id:'swe-2',label:'SWE-2'}]}];
const catalog=[{accountId:'source-a',provider:'native-codex',modelId:'shared-id',label:'FULL MODEL NAME'},{accountId:'source-b',provider:'native-qoder',modelId:'shared-id',label:'OTHER MODEL NAME'},{accountId:'source-c',provider:'custom',modelId:'custom-id',label:'CUSTOM'},{accountId:'source-d',provider:'openai',modelId:'gpt-5',label:'GPT-5'},{accountId:'source-e',provider:'native-dsh',modelId:'deepseek-v4',label:'DeepSeek-V4'}];
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
test('来源名称来自已绑定账号的供应商；缺失时明示账号未记录，不从模型名称推断',()=>{
 assert.equal(conversationModelSourceLabel('source-a',catalog),'ChatGPT');
 assert.equal(conversationModelSourceLabel('source-b',catalog),'Qoder');
 assert.equal(conversationModelSourceLabel('source-d',catalog),'ChatGPT API');
 assert.equal(conversationModelSourceLabel('source-e',catalog),'DeepSeek');
 assert.equal(conversationModelSourceLabel('source-c',catalog),'custom');
 assert.equal(conversationModelSourceLabel('unknown:conversation',catalog),'账号未记录');
 assert.equal(conversationModelSourceLabel('',catalog),'账号未记录');
 assert.equal(modelSourceName('codex'),'ChatGPT','订阅来源在模型选择器中显示为 ChatGPT');
 assert.equal(modelSourceName('openai'),'ChatGPT API','API Key 来源在模型选择器中是独立分类');
 assert.equal(modelSourceName('dsh'),'DeepSeek','DSH 接入的模型来源显示为 DeepSeek');
 assert.equal(executionAgentName('codex'),'Codex','执行智能体名称与模型来源名称分开');
 assert.equal(executionAgentName('dsh'),'DSH','DSH 作为执行智能体名称保留');
});

test('Qoder 与 Qoder CN 各自只接受本产品原生模型，并给出对应提示',async()=>{
  const {qoderSourceNotice,qoderSourceUnsupported}=await import('../src/features/agent-conversations/conversation-options.ts');
  assert.equal(qoderSourceUnsupported('qoder','native-qoder'),false);
  assert.equal(qoderSourceUnsupported('qoder','native-qoder-cn'),true);
  assert.equal(qoderSourceUnsupported('qoder-cn','native-qoder-cn'),false);
  assert.equal(qoderSourceUnsupported('qoder-cn','native-qoder'),true);
  assert.equal(qoderSourceUnsupported('qoder-cn','native-codex'),true);
  assert.equal(qoderSourceUnsupported('codex','native-qoder-cn'),false);
  assert.match(qoderSourceNotice('qoder-cn')??'',/^Qoder CN Agent 暂不支持其他供应商的模型/);
  assert.match(qoderSourceNotice('qoder')??'',/^Qoder Agent 暂不支持其他供应商的模型/);
  assert.equal(qoderSourceNotice('dsh'),undefined);
});

test('执行方下拉只包含本机已准备的智能体',async()=>{
  const {preparedAgentConnections}=await import('../src/lib/model-picker.ts');
  const connections=[{id:'dsh',enabled:true,configPath:'/a'},{id:'qoder',enabled:true},{id:'qoder-cn',enabled:false,configPath:'/b'},{id:'codex',enabled:true,configPath:'/c'}];
  assert.deepEqual(preparedAgentConnections(connections).map(item=>item.id),['dsh','codex']);
});
