import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationModelLabel,conversationModelSourceLabel} from '../src/features/agent-conversations/conversation-model-label.ts';
import {executionAgentName,modelSourceName} from '../src/lib/model-picker.ts';
const connections=[{id:'codex',models:[{id:'qmodel_38max',label:'QMODEL 3.8 MAX'},{id:'swe-2',label:'SWE-2'}]}];
const catalog=[{accountId:'source-a',provider:'native-codex',modelId:'shared-id',label:'FULL MODEL NAME'},{accountId:'source-b',provider:'native-qoder',modelId:'shared-id',label:'OTHER MODEL NAME'},{accountId:'source-c',provider:'custom',modelId:'custom-id',label:'CUSTOM',accountLabel:'我的网关'},{accountId:'source-d',provider:'openai',modelId:'gpt-5',label:'GPT-5'},{accountId:'source-e',provider:'native-dsh',modelId:'deepseek-v4',label:'DeepSeek-V4'}];
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
test('供应商名称来自已绑定账号的供应商；自定义供应商显示用户名称，缺失时明示供应商未记录',()=>{
 assert.equal(conversationModelSourceLabel('source-a',catalog),'ChatGPT');
 assert.equal(conversationModelSourceLabel('source-b',catalog),'Qoder');
 assert.equal(conversationModelSourceLabel('source-d',catalog),'ChatGPT API');
 assert.equal(conversationModelSourceLabel('source-e',catalog),'DeepSeek');
 assert.equal(conversationModelSourceLabel('source-c',catalog),'我的网关','自定义供应商显示用户填写的名称');
 assert.equal(conversationModelSourceLabel('unknown:conversation',catalog),'供应商未记录');
 assert.equal(conversationModelSourceLabel('',catalog),'供应商未记录');
 assert.equal(modelSourceName('codex'),'ChatGPT','订阅供应商在模型选择器中显示为 ChatGPT');
 assert.equal(modelSourceName('openai'),'ChatGPT API','API Key 供应商在模型选择器中是独立分类');
 assert.equal(modelSourceName('dsh'),'DeepSeek','DSH 接入的模型供应商显示为 DeepSeek');
 assert.equal(modelSourceName('custom'),'自定义供应商','自定义供应商在缺少名称时使用通用名称');
 assert.equal(executionAgentName('codex'),'Codex','执行智能体名称与模型供应商名称分开');
 assert.equal(executionAgentName('dsh'),'DSH','DSH 作为执行智能体名称保留');
});

test('执行器与模型来源兼容性优先采用服务端声明，缺失时回退策略或交由发送端校验',async()=>{
  const {catalogConversationOption,catalogModelCompatibility,executorCompatibilityNotice}=await import('../src/features/agent-conversations/conversation-options.ts');
  const qoder={id:'qoder',label:'Qoder',modelPolicy:{native:{sourceProviders:['native-qoder'],delivery:'runtime-selected',exclusive:true}}};
  const qoderCn={id:'qoder-cn',label:'Qoder CN',modelPolicy:{native:{sourceProviders:['native-qoder-cn'],delivery:'runtime-selected',exclusive:true}}};
  const codex={id:'codex',label:'Codex',modelPolicy:{native:{sourceProviders:['native-codex'],delivery:'runtime-selected',exclusive:false},gateway:{wireProtocols:['openai-responses','openai-chat-completions','anthropic-messages']}}};
  const exclusiveSource={accountId:'native-antigravity',provider:'native-antigravity',modelId:'gemini-2.5-pro',label:'Gemini 2.5 Pro',available:true,inference:'none',sharing:{kind:'executor-exclusive',executors:['antigravity'],reason:'Google 个人账号凭据仅限 Antigravity CLI 原生使用。'},executorCompatibility:[
    {connectionId:'antigravity',compatible:true},
    {connectionId:'codex',compatible:false,reasonCode:'agent_model_source_unsupported',reason:'Google 个人账号凭据仅限 Antigravity CLI 原生使用。'},
    {connectionId:'qoder',compatible:false,reasonCode:'agent_model_source_unsupported',reason:'Google 个人账号凭据仅限 Antigravity CLI 原生使用。'},
  ]};
  const qoderNative={accountId:'native-qoder',provider:'native-qoder',modelId:'q1',label:'Q1',available:true};
  const qoderCnNative={accountId:'native-qoder-cn',provider:'native-qoder-cn',modelId:'qcn1',label:'QCN1',available:true};
  const codexNative={accountId:'native-codex',provider:'native-codex',modelId:'gpt-5',label:'GPT-5',available:true,inference:'gateway'};
  assert.equal(catalogModelCompatibility(qoder,qoderNative).compatible,true);
  assert.equal(catalogModelCompatibility(qoder,qoderCnNative).compatible,false);
  assert.equal(catalogModelCompatibility(qoderCn,qoderCnNative).compatible,true);
  assert.equal(catalogModelCompatibility(qoderCn,qoderNative).compatible,false);
  assert.equal(catalogModelCompatibility(qoderCn,codexNative).compatible,false);
  assert.equal(catalogModelCompatibility(codex,qoderCnNative).compatible,true);
  assert.equal(catalogModelCompatibility(codex,exclusiveSource).compatible,false);
  assert.equal(catalogModelCompatibility('antigravity',exclusiveSource).compatible,true);
  assert.equal(catalogModelCompatibility({id:'legacy-agent'},codexNative).compatible,true,'缺少兼容性字段时不提前误拒');
  assert.match(executorCompatibilityNotice(qoder,[exclusiveSource,codexNative])??'',/^Qoder Agent 暂不支持选择其他供应商的模型/);
  assert.match(executorCompatibilityNotice(qoderCn,[codexNative])??'',/^Qoder CN Agent 暂不支持选择其他供应商的模型/);
  assert.equal(executorCompatibilityNotice(codex,[codexNative]),undefined);
  const disabledOption=catalogConversationOption(codex,exclusiveSource);
  assert.equal(disabledOption.label,'Gemini 2.5 Pro');
  assert.equal(disabledOption.disabled,true);
  assert.equal(disabledOption.title,'Google 个人账号凭据仅限 Antigravity CLI 原生使用。');
});

test('执行方下拉只包含本机已准备的智能体',async()=>{
  const {preparedAgentConnections}=await import('../src/lib/model-picker.ts');
  const connections=[{id:'dsh',enabled:true,configPath:'/a'},{id:'qoder',enabled:true},{id:'qoder-cn',enabled:false,configPath:'/b'},{id:'codex',enabled:true,configPath:'/c'}];
  assert.deepEqual(preparedAgentConnections(connections).map(item=>item.id),['dsh','codex']);
});

test('自持源账号在未登录时仍显示，且按产品名标注',async()=>{
  const {modelSourceViews}=await import('../src/features/agent-conversations/account-model-view.ts');
  const accounts=[
    {id:'native-qoder-cn',provider:'native-qoder-cn',label:'Qoder CN',revision:'r1',enabled:true,status:'not-authenticated',models:[]},
    {id:'native-qoder',provider:'native-qoder',label:'Qoder',revision:'r2',enabled:true,status:'not-authenticated',models:[]},
    {id:'2bb3d2b7-c228-477b-b86f-ba806e91647d',provider:'codex',label:'旧账号',revision:'r3',enabled:true,status:'not-authenticated',models:[]},
  ];
  const sources=modelSourceViews(accounts,[]);
  const cn=sources.find(source=>source.id==='native-qoder-cn');
  assert.ok(cn,'自带登录的来源必须可见');
  assert.equal(cn.providerLabel,'Qoder CN');
  assert.equal(cn.provider,'qoder-cn');
  assert.equal(cn.status,'not-authenticated');
  const qoder=sources.find(source=>source.id==='native-qoder');
  assert.ok(qoder);
  assert.equal(qoder.providerLabel,'Qoder');
  assert.equal(qoder.provider,'qoder');
  assert.equal(qoder.status,'not-authenticated');
  assert.equal(sources.some(source=>source.id.startsWith('2bb3d2b7')),false,'无归属的旧行仍隐藏');
});

test('服务端展示元数据优先于历史兜底名称，离线历史仍保持稳定显示',async()=>{
 const {conversationRunIdentity}=await import('../src/features/agent-conversations/conversation-options.ts');
 assert.equal(executionAgentName('claude-code'),'Claude Code');
 assert.equal(executionAgentName('native-claude-code'),'Claude Code');
 assert.equal(modelSourceName('anthropic'),'Claude API');
 const customCatalog=[{accountId:'native-antigravity',provider:'native-antigravity',modelId:'gemini-2.5-pro',label:'Gemini 2.5 Pro',presentation:{vendorLabel:'Google',sourceLabel:'Google 账号',quotaLabel:'Google'}}];
 assert.equal(conversationModelSourceLabel('native-antigravity',customCatalog),'Google');
 assert.equal(conversationRunIdentity({provider:'antigravity',model:'gemini-2.5-pro',modelAccountId:'native-antigravity'},{id:'antigravity',provider:'antigravity',label:'Antigravity',models:[]},customCatalog),'Antigravity · Google / Gemini 2.5 Pro');
 assert.equal(conversationRunIdentity({provider:'claude-code',model:'claude-sonnet-4-6'},undefined,[]),'Claude Code · claude-sonnet-4-6');
});
