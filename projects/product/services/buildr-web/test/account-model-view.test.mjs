import test from 'node:test';import assert from 'node:assert/strict';
import {modelSourceViews} from '../src/features/agent-conversations/account-model-view.ts';
test('账号视图保留真实额度窗口和上下文覆盖，基础模型与组合模式分开',()=>{
 const source={id:'a',identity:'identity',provider:'devin',label:'Devin',revision:'r',enabled:true,status:'ready',models:[{id:'m',label:'Model',images:false,tools:true,enabled:false,contextWindow:128000,contextWindowOverride:128000,reportedContextWindow:258000},{id:'fusion',kind:'combination',label:'Fusion',images:false,tools:true,enabled:false}],quota:{available:true,observedAt:'2026-10-25T00:00:00Z',windows:[{id:'day',label:'每日窗口',remainingPercent:100},{id:'week',label:'每周窗口',remainingPercent:93}]}};
 const [view]=modelSourceViews([source],[]);assert.equal(view.models.length,1);assert.equal(view.combinations.length,1);assert.equal(view.models[0].enabled,false);assert.equal(view.models[0].contextOverride,128000);assert.equal(view.models[0].reportedContextWindow,258000);assert.deepEqual(view.windows.map(window=>window.remainingPercent),[100,93]);
});
test('未知额度不填零，旧空重复账号不占主要界面且保留 Devin 登录入口',()=>{
 const account={id:'a',provider:'codex',label:'Codex',revision:'r',enabled:true,status:'not-authenticated',models:[],quota:{available:false,observedAt:'2026-10-25T00:00:00Z'}};
 const views=modelSourceViews([account,{...account,id:'native-qoder',provider:'native-qoder',connectionId:'qoder',status:'ready'}],[{id:'qoder',enabled:true}]);assert.equal(views.length,2);assert.equal(views[0].providerLabel,'Qoder');assert.deepEqual(views[0].windows,[]);assert.equal(views[1].id,'new-devin');
});
test('官方登录后的核对阶段不再提示继续等待浏览器登录',()=>{
 const account={id:'native-qoder',provider:'native-qoder',connectionId:'qoder',label:'Qoder',revision:'r',enabled:true,status:'not-authenticated',models:[]};
 const connection={id:'qoder',enabled:true,loginAttempt:{id:'login',state:'checking'}};
 const [checking]=modelSourceViews([account],[connection]);
 assert.equal(checking.loginPending,true);assert.equal(checking.loginChecking,true);
 assert.match(checking.loginMessage,/核对登录结果/);
 const [completed]=modelSourceViews([{...account,status:'ready'}],[{...connection,loginAttempt:{id:'login',state:'completed'}}]);
 assert.equal(completed.loginPending,false);assert.equal(completed.loginChecking,false);
 assert.equal(completed.loginMessage,undefined);
});
