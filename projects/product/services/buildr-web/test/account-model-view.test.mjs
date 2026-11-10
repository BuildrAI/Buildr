import test from 'node:test';import assert from 'node:assert/strict';
import {modelSourceViews} from '../src/features/agent-conversations/account-model-view.ts';
const group={id:'chatgpt',label:'ChatGPT'};
const subscription={id:'native-codex',identity:'subscription',provider:'native-codex',connectionId:'codex',label:'Codex / ChatGPT',authType:'oauth',group,modeLabel:'订阅',revision:'r1',enabled:true,status:'ready',accountLabel:'订阅账号',models:[{id:'gpt-sub',label:'GPT 订阅',images:false,tools:true,enabled:true}]};
const api={id:'api',identity:'api',provider:'openai',label:'ChatGPT',authType:'api-key',group,modeLabel:'API Key',revision:'r2',enabled:true,status:'ready',credentialConfigured:true,accountLabel:'ChatGPT API',models:[{id:'gpt-api',label:'GPT API',images:false,tools:true,enabled:true}]};

test('账号视图保留真实额度窗口和上下文覆盖，基础模型与组合模式分开',()=>{
 const source={id:'a',identity:'identity',provider:'devin',label:'Devin',revision:'r',enabled:true,status:'ready',models:[{id:'m',label:'Model',images:false,tools:true,enabled:false,contextWindow:128000,contextWindowOverride:128000,reportedContextWindow:258000},{id:'fusion',kind:'combination',label:'Fusion',images:false,tools:true,enabled:false}],quota:{available:true,observedAt:'2026-10-25T00:00:00Z',windows:[{id:'day',label:'每日窗口',remainingPercent:100},{id:'week',label:'每周窗口',remainingPercent:93}]}};
 const view=modelSourceViews([source],[]).find(view=>view.id===source.id);assert.equal(view.models.length,1);assert.equal(view.combinations.length,1);assert.equal(view.models[0].enabled,false);assert.equal(view.models[0].contextOverride,128000);assert.equal(view.models[0].reportedContextWindow,258000);assert.deepEqual(view.windows.map(window=>window.remainingPercent),[100,93]);
});

test('未知额度不填零，旧空重复账号不占主要界面且保留 Devin 与独立 ChatGPT API 入口',()=>{
 const account={id:'a',provider:'codex',label:'Codex',revision:'r',enabled:true,status:'not-authenticated',models:[],quota:{available:false,observedAt:'2026-10-25T00:00:00Z'}};
 const views=modelSourceViews([account,{...account,id:'native-qoder',provider:'native-qoder',connectionId:'qoder',status:'ready'}],[{id:'qoder',enabled:true}]);assert.equal(views.length,3);assert.deepEqual(views.map(view=>view.providerLabel),['ChatGPT API','Devin','Qoder']);assert.deepEqual(views.find(view=>view.id==='native-qoder').windows,[]);assert.equal(views.find(view=>view.id==='new-devin').status,'not-authenticated');assert.equal(views.find(view=>view.id==='new-openai').providerLabel,'ChatGPT API');
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

test('DSH 接入的 DeepSeek 模型来源显示 DeepSeek，不显示执行智能体名称',()=>{
 const dsh={id:'native-dsh',identity:'deepseek',provider:'native-dsh',connectionId:'dsh',label:'DeepSeek',authType:'oauth',revision:'r3',enabled:true,status:'ready',accountLabel:'DeepSeek',models:[{id:'deepseek-v4',label:'DeepSeek-V4',images:false,tools:true,enabled:true}]};
 const view=modelSourceViews([dsh],[]).find(view=>view.id===dsh.id);
 assert.equal(view.providerLabel,'DeepSeek');
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
