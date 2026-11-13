import test from 'node:test';import assert from 'node:assert/strict';
import {modelSourceViews,newModelSourceProvider} from '../src/features/agent-conversations/account-model-view.ts';
const group={id:'chatgpt',label:'ChatGPT'};
const subscription={id:'native-codex',identity:'subscription',provider:'native-codex',connectionId:'codex',label:'Codex / ChatGPT',authType:'oauth',group,modeLabel:'订阅',revision:'r1',enabled:true,status:'ready',accountLabel:'订阅账号',models:[{id:'gpt-sub',label:'GPT 订阅',images:false,tools:true,enabled:true}]};
const api={id:'api',identity:'api',provider:'openai',label:'ChatGPT',authType:'api-key',group,modeLabel:'API Key',revision:'r2',enabled:true,status:'ready',credentialConfigured:true,accountLabel:'ChatGPT API',models:[{id:'gpt-api',label:'GPT API',images:false,tools:true,enabled:true}]};

test('账号视图保留真实额度窗口和上下文覆盖，基础模型与组合模式分开',()=>{
 const source={id:'a',identity:'identity',provider:'devin',label:'Devin',revision:'r',enabled:true,status:'ready',models:[{id:'m',label:'Model',images:false,tools:true,enabled:false,contextWindow:128000,contextWindowOverride:128000,reportedContextWindow:258000},{id:'fusion',kind:'combination',label:'Fusion',images:false,tools:true,enabled:false}],quota:{available:true,observedAt:'2026-10-25T00:00:00Z',windows:[{id:'day',label:'每日窗口',remainingPercent:100},{id:'week',label:'每周窗口',remainingPercent:93}]}};
 const view=modelSourceViews([source],[]).find(view=>view.id===source.id);assert.equal(view.models.length,1);assert.equal(view.combinations.length,1);assert.equal(view.models[0].enabled,false);assert.equal(view.models[0].contextOverride,128000);assert.equal(view.models[0].reportedContextWindow,258000);assert.deepEqual(view.windows.map(window=>window.remainingPercent),[100,93]);
});

test('未知额度不填零，旧空重复账号不占主要界面且保留 Devin 与独立 ChatGPT API 入口',()=>{
 const account={id:'a',provider:'codex',label:'Codex',revision:'r',enabled:true,status:'not-authenticated',models:[],quota:{available:false,observedAt:'2026-10-25T00:00:00Z'}};
 const views=modelSourceViews([account,{...account,id:'native-qoder',provider:'native-qoder',connectionId:'qoder',status:'ready'}],[{id:'qoder',enabled:true}]);assert.equal(views.length,2);assert.deepEqual(views.map(view=>view.providerLabel),['Devin','Qoder']);assert.deepEqual(views.find(view=>view.id==='native-qoder').windows,[]);assert.equal(views.find(view=>view.id==='new-devin').status,'not-authenticated');assert.equal(views.some(view=>view.id==='new-openai'),false);assert.equal(views.some(view=>view.provider==='anthropic'),false);
});

test('Devin 已接入时只隐藏无账号资料的重复空项',()=>{
 const empty={id:'empty',provider:'devin',label:'Devin',status:'not-authenticated',enabled:true,models:[]};
 const connected={...empty,id:'connected',status:'ready',accountLabel:'已登录账号'};
 const pending={...empty,id:'pending',loginAttempt:{state:'waiting-browser'}};
 const listed=(accounts,includeDisabled)=>modelSourceViews(accounts,[],includeDisabled).filter(source=>source.provider==='devin').map(source=>source.id);
 assert.deepEqual(listed([connected,empty,pending],true).sort(),['connected','pending']);
 assert.deepEqual(listed([empty]),['empty']);
 assert.deepEqual(listed([{...connected,sourceEnabled:false},empty]),['empty']);
});

test('ChatGPT 订阅与 API Key 作为两个来源可同时启用并分别提供模型',()=>{
 const views=modelSourceViews([subscription,api],[]);
 const chatgpt=views.filter(view=>view.provider==='codex'||view.provider==='openai');
 assert.deepEqual(chatgpt.map(view=>[view.providerLabel,view.status,view.modeLabel]),[['ChatGPT','ready','订阅'],['ChatGPT API','ready','API Key']]);
 assert.deepEqual(chatgpt.map(view=>view.models.map(model=>model.id)),[['gpt-sub'],['gpt-api']]);
 assert.equal(chatgpt.every(view=>view.status==='ready'),true);
});

test('账号来源按显示名称稳定排序，同名账号保持确定顺序',()=>{
 const qoder={...subscription,id:'qoder',provider:'qoder',connectionId:undefined,label:'Qoder',accountLabel:'Qoder 账号',modeLabel:undefined,group:undefined};
 const views=modelSourceViews([qoder,api,subscription],[]);
 assert.deepEqual(views.map(view=>view.providerLabel),['ChatGPT','ChatGPT API','Devin','Qoder']);
 const sameName=modelSourceViews([{...api,id:'api-b',accountLabel:'B 账号'},{...api,id:'api-a',accountLabel:'A 账号'}],[]);
 assert.deepEqual(sameName.filter(view=>view.provider==='openai').map(view=>view.id),['api-a','api-b']);
});

test('ChatGPT API 首次校验失败后保留同一账号，不重复创建占位来源',()=>{
 const failed={...api,status:'not-authenticated',credentialConfigured:false,models:[]};
 const views=modelSourceViews([failed],[]);
 assert.deepEqual(views.filter(view=>view.provider==='openai').map(view=>view.id),['api']);assert.equal(views.find(view=>view.provider==='openai').providerLabel,'ChatGPT API');
});

test('ChatGPT API 模型已观察但余额不可读时显示模型观察时间与平台账单说明',()=>{
 const observed={...api,observedAt:'2026-11-08T03:04:05.000Z',quota:{available:false}};
 const view=modelSourceViews([observed],[]).find(view=>view.id===observed.id);
 assert.equal(view.observedLabel,new Date(observed.observedAt).toLocaleString());
 assert.match(view.quotaNote,/OpenAI 平台查看用量与账单/);
 assert.deepEqual(view.windows,[]);
 assert.equal(view.observedLabel.includes('尚未读取'),false);
});

test('仅 ChatGPT API 来源提供 OpenAI 平台账单入口',()=>{
 const apiView=modelSourceViews([api],[]).find(view=>view.id===api.id);
 assert.equal(apiView.billingUrl,'https://platform.openai.com/settings/organization/billing/overview');
 const subscriptionView=modelSourceViews([subscription],[]).find(view=>view.id===subscription.id);
 assert.equal(subscriptionView.billingUrl,undefined);
});

test('DSH 接入的 DeepSeek 模型来源显示 DeepSeek，不显示执行智能体名称',()=>{
 const dsh={id:'native-dsh',identity:'deepseek',provider:'native-dsh',connectionId:'dsh',label:'DeepSeek',authType:'oauth',revision:'r3',enabled:true,status:'ready',accountLabel:'DeepSeek',models:[{id:'deepseek-v4',label:'DeepSeek-V4',images:false,tools:true,enabled:true}]};
 const view=modelSourceViews([dsh],[]).find(view=>view.id===dsh.id);
 assert.equal(view.providerLabel,'DeepSeek Harness');
 assert.equal(view.models[0].label,'DeepSeek-V4');
});

test('官方登录后的核对阶段不再提示继续等待浏览器登录',()=>{
 const account={id:'native-qoder',provider:'native-qoder',connectionId:'qoder',label:'Qoder',revision:'r',enabled:true,status:'not-authenticated',models:[]};
 const connection={id:'qoder',enabled:true,loginAttempt:{id:'login',state:'checking'}};
 const checking=modelSourceViews([account],[connection]).find(view=>view.id===account.id);
 assert.equal(checking.loginPending,true);assert.equal(checking.loginChecking,true);
 assert.match(checking.loginMessage,/核对登录结果/);
 const completed=modelSourceViews([{...account,status:'ready'}],[{...connection,loginAttempt:{id:'login',state:'completed'}}]).find(view=>view.id===account.id);
 assert.equal(completed.loginPending,false);assert.equal(completed.loginChecking,false);
 assert.equal(completed.loginMessage,undefined);
});

test('登录准备显示实际进度，失败原因优先于旧账号检查提示，取消后仍可重试',()=>{
 const row={id:'native-qoder-cn',provider:'native-qoder-cn',label:'Qoder CN',revision:'r',enabled:true,status:'not-authenticated',models:[],diagnostic:'旧的账号检查提示'};
 const view=(state,diagnostic)=>modelSourceViews([{...row,loginAttempt:{id:'attempt',state,diagnostic}}],[]).find(source=>source.id===row.id);
 const pending=view('initializing','正在下载官方登录程序');assert.equal(pending.diagnostic,undefined);assert.equal(pending.loginMessage,'正在下载官方登录程序');assert.equal(pending.loginPending,true);
 const failed=view('failed','程序下载失败，请重试');assert.equal(failed.diagnostic,'程序下载失败，请重试');assert.equal(failed.loginPending,false);
 assert.equal(view('cancelled').loginPending,false);
});

test('自定义供应商按用户名称显示，未就绪时仍保留已接入的卡片',()=>{
 const custom={id:'custom',provider:'custom',label:'我的网关',revision:'r9',enabled:true,status:'not-authenticated',modeLabel:'OpenAI 兼容',credentialConfigured:false,observedAt:'2026-11-12T07:10:00.000Z',models:[{id:'m',label:'M',images:false,tools:true,enabled:true}],custom:{protocol:'chat-completions',baseUrl:'https://models.example.com/v1',useApiKey:false,models:[{id:'m'}]}};
 const view=modelSourceViews([custom],[]).find(item=>item.id==='custom');
 assert.ok(view);
 assert.equal(view.providerLabel,'我的网关');
 assert.equal(view.modeLabel,'OpenAI 兼容');
 assert.equal(view.planLabel,'OpenAI 兼容');
 assert.deepEqual(view.windows,[]);
 assert.equal(view.observedLabel,new Date(custom.observedAt).toLocaleString());
 assert.equal(view.observedLabel.includes('尚未读取'),false);
 assert.match(view.quotaNote,/自定义供应商没有额度接口/);
 assert.equal(view.custom?.baseUrl,'https://models.example.com/v1');
 assert.equal(view.custom?.protocol,'chat-completions');
 assert.equal(view.custom?.useApiKey,false);
 assert.deepEqual(view.custom?.models,[{id:'m'}]);
 assert.equal(modelSourceViews([{...custom,sourceEnabled:false}],[]).some(item=>item.id==='custom'),false);
 assert.equal(modelSourceViews([{...custom,sourceEnabled:false}],[],true).find(item=>item.id==='custom').sourceEnabled,false);
});

test('disabled sources stay hidden without synthesizing a logged-out replacement',()=>{
 const account={id:'native-dsh',provider:'native-dsh',connectionId:'dsh',label:'DeepSeek',status:'ready',enabled:true,sourceEnabled:false,models:[]};
 assert.equal(modelSourceViews([account],[]).some(source=>source.id===account.id),false);
 assert.equal(modelSourceViews([account],[],true).find(source=>source.id===account.id).sourceEnabled,false);
 for(const provider of ['devin','openai','anthropic']){
  const off={...account,id:'account-'+provider,provider,connectionId:undefined};
  assert.equal(modelSourceViews([off],[]).some(source=>source.provider===provider),false);
 }
});


test('Claude API preserves an existing account without synthesizing a new placeholder entry',()=>{
 const row={...api,id:'anthropic-account',provider:'anthropic',label:'Claude API',status:'not-authenticated',models:[]};
 const views=modelSourceViews([row],[]);
 const claude=views.filter(view=>view.provider==='anthropic');
 assert.equal(claude[0].providerLabel,'Claude API');
 assert.equal(claude.length,1);assert.equal(claude[0].id,'anthropic-account');
 assert.match(claude[0].quotaNote,/Anthropic/);assert.ok(!claude[0].quotaNote.includes('OpenAI'));
 assert.equal(views.some(view=>view.id==='new-anthropic'),false);
 assert.equal(newModelSourceProvider('new-anthropic'),undefined);
 assert.equal(newModelSourceProvider('stale-unknown'),undefined);
});

test('新模型来源直接消费服务端 presentation 与独占原因，无需硬编码品牌映射',()=>{
 const antigravity={
  id:'native-antigravity',
  identity:'user@example.com',
  provider:'native-antigravity',
  connectionId:'antigravity',
  label:'Google 账号',
  accountLabel:'user@example.com',
  authType:'oauth',
  modeLabel:'订阅',
  revision:'r10',
  enabled:true,
  status:'ready',
  sharing:{kind:'executor-exclusive',executors:['antigravity'],reason:'仅支持 Antigravity CLI 原生使用'},
  presentation:{
   vendorLabel:'Google',
   sourceLabel:'Google 账号',
   quotaLabel:'Google',
   quotaUnavailableNote:'Google 暂未在 CLI 公开剩余百分比，请在 Google AI 订阅页核对。',
   billing:{label:'Google One / AI 订阅',url:'https://one.google.com/about/google-ai-plans/'},
  },
  quota:{available:false,planLabel:'Google AI Pro'},
  models:[{id:'gemini-2.5-pro',label:'Gemini 2.5 Pro',images:true,tools:true,enabled:true}],
 };
 const view=modelSourceViews([antigravity],[{id:'antigravity',label:'Antigravity',enabled:true,configPath:'/managed/antigravity'}]).find(item=>item.id==='native-antigravity');
 assert.ok(view);
 assert.equal(view.providerLabel,'Google 账号');
 assert.equal(view.vendorLabel,'Google');
 assert.equal(view.planLabel,'Google AI Pro');
 assert.equal(view.exclusiveReason,'仅支持 Antigravity CLI 原生使用');
 assert.equal(view.billingLabel,'Google One / AI 订阅');
 assert.equal(view.billingUrl,'https://one.google.com/about/google-ai-plans/');
 assert.match(view.quotaNote,/Google 暂未在 CLI 公开剩余百分比/);
 assert.equal(view.program,'ready');
});

test('Google 个人账号覆盖免费、Pro、Ultra、档位不可读、身份不可确认及系统密钥环发送闸门',()=>{
 const baseConn={id:'antigravity',label:'Antigravity',hostKeyringAuth:true,enabled:true,executable:'/managed/antigravity',configPath:'/managed/home'};
 const baseAcc={
  id:'native-antigravity',identity:'agy-epoch:1',provider:'native-antigravity',connectionId:'antigravity',
  label:'Google',accountLabel:'Google 个人账号（本机已登录）',authType:'oauth',modeLabel:'个人账号',revision:'r1',enabled:true,status:'ready',
  sharing:{kind:'executor-exclusive',executors:['antigravity'],reason:'受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。'},
  presentation:{vendorLabel:'Google',sourceLabel:'Google 个人账号',quotaLabel:'Google AI',quotaUnavailableNote:'Antigravity CLI 当前未公开订阅剩余额度与登录邮箱。',billing:{label:'查看 Google AI 订阅',url:'https://one.google.com/about/ai-plans'}},
  models:[{id:'gemini-2.5-pro',label:'Gemini 2.5 Pro',images:true,tools:true,enabled:true}],
 };
 for(const plan of ['免费账号','Google AI Pro','Google AI Ultra','档位不可读']){
  const view=modelSourceViews([{...baseAcc,quota:{available:false,planLabel:plan}}],[baseConn]).find(item=>item.id==='native-antigravity');
  assert.equal(view.planLabel,plan);
  assert.equal(view.hostKeyringAuth,true);
  assert.equal(view.agentLabel,'Antigravity');
 }
 const unconfirmed=modelSourceViews([{...baseAcc,status:'failed',accountLabel:'身份不可确认',quota:{available:false,planLabel:'身份不可确认'},models:[],diagnostic:'无法确认当前 Google 个人账号身份'}],[{...baseConn,sendGate:{state:'paused',reason:'account-unconfirmed',diagnostic:'退出未能确认完成'}}]).find(item=>item.id==='native-antigravity');
 assert.equal(unconfirmed.status,'failed');
 assert.equal(unconfirmed.accountLabel,'身份不可确认');
 assert.equal(unconfirmed.sendGate?.state,'paused');
 assert.equal(unconfirmed.sendGate?.reason,'account-unconfirmed');
 const loggedOutPrepared=modelSourceViews([{...baseAcc,status:'not-authenticated',models:[]}],[{...baseConn,enabled:false,status:'disconnected'}]).find(item=>item.id==='native-antigravity');
 assert.equal(loggedOutPrepared.program,'ready');
});
