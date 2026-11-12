import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier==='../../../api'&&context.parentURL?.endsWith('/programmatic-access-api.ts'))return{url:'data:text/javascript,export const api=()=>{throw Error("unexpected real API")}',shortCircuit:true};
 return next(specifier,context);
}});
const {createProgrammaticAccessClient}=await import('../src/features/agent-conversations/api/programmatic-access-api.ts');
test('凭据管理读取显式启用网页会话，创建和撤销携带精确输入',async()=>{
 const calls=[],client=createProgrammaticAccessClient(async(...args)=>{calls.push(args);return {};});
 await client.read();await client.create({name:'GrokBot',workspaceIds:['workspace'],scopes:['read','execute']});await client.revoke({id:'credential',revision:'observed'});
 assert.deepEqual(calls[0],['/api/v1/app/programmatic-access',{headers:{'x-buildr-session':''}}]);
 assert.equal(calls[1][1].method,'POST');assert.deepEqual(JSON.parse(calls[1][1].body),{name:'GrokBot',workspaceIds:['workspace'],scopes:['read','execute']});
 assert.equal(calls[2][0],'/api/v1/app/programmatic-access/credential/revoke');assert.deepEqual(JSON.parse(calls[2][1].body),{expectedRevision:'observed'});
});
test('创建可携带全部授权开关，切换开关提交已观察修订与布尔值',async()=>{
 const calls=[],client=createProgrammaticAccessClient(async(...args)=>{calls.push(args);return {};});
 await client.create({name:'GrokBot',workspaceIds:['workspace'],scopes:['read','execute'],allowFullAccess:false});
 assert.deepEqual(JSON.parse(calls[0][1].body),{name:'GrokBot',workspaceIds:['workspace'],scopes:['read','execute'],allowFullAccess:false});
 await client.updateFullAccess({id:'credential',revision:'observed'},true);
 assert.equal(calls[1][0],'/api/v1/app/programmatic-access/credential/full-access');assert.equal(calls[1][1].method,'POST');
 assert.deepEqual(JSON.parse(calls[1][1].body),{expectedRevision:'observed',allowFullAccess:true});
 await client.updateFullAccess({id:'credential',revision:'next'},false);
 assert.deepEqual(JSON.parse(calls[2][1].body),{expectedRevision:'next',allowFullAccess:false});
});
test('网页文档显式启用会话，重新生成携带当前修订',async()=>{
 const calls=[],client=createProgrammaticAccessClient(async(...args)=>{calls.push(args);return {};});
 await client.document('help');await client.document('openapi.json');await client.regenerate({id:'credential',revision:'observed'});
 assert.deepEqual(calls[0],['/api/v1/app/programmatic-access/documents/help',{headers:{'x-buildr-session':''}}]);
 assert.deepEqual(calls[1],['/api/v1/app/programmatic-access/documents/openapi.json',{headers:{'x-buildr-session':''}}]);
 assert.equal(calls[2][0],'/api/v1/app/programmatic-access/credential/regenerate');
 assert.deepEqual(JSON.parse(calls[2][1].body),{expectedRevision:'observed'});
 await client.document('operations');await client.document('operations/start');
 assert.deepEqual(calls[3],['/api/v1/app/programmatic-access/documents/operations',{headers:{'x-buildr-session':''}}]);
 assert.deepEqual(calls[4],['/api/v1/app/programmatic-access/documents/operations/start',{headers:{'x-buildr-session':''}}]);
});
test('编辑凭据提交已观察修订与完整参数',async()=>{
 const calls=[],client=createProgrammaticAccessClient(async(...args)=>{calls.push(args);return {};});
 await client.update({id:'credential',revision:'observed'},{name:'新名称',workspaceIds:['workspace'],scopes:['read','answer'],allowFullAccess:false});
 assert.equal(calls[0][0],'/api/v1/app/programmatic-access/credential/update');assert.equal(calls[0][1].method,'POST');
 assert.deepEqual(JSON.parse(calls[0][1].body),{expectedRevision:'observed',name:'新名称',workspaceIds:['workspace'],scopes:['read','answer'],allowFullAccess:false});
});
test('凭据回推读取启用网页会话，保存/查看/测试携带精确版本化输入且默认不带密钥',async()=>{
 const calls=[],client=createProgrammaticAccessClient(async(...args)=>{calls.push(args);return {};});
 const controller=new AbortController();
 await client.pushback('credential',controller.signal);
 assert.deepEqual(calls[0],['/api/v1/app/programmatic-access/credential/pushback',{headers:{'x-buildr-session':''},signal:controller.signal}]);
 await client.savePushback('credential',{expectedRevision:'v1',enabled:true,url:'https://receiver.test/hook',rateLimitHour:180,rateLimitMinute:20});
 assert.equal(calls[1][0],'/api/v1/app/programmatic-access/credential/pushback');assert.equal(calls[1][1].method,'POST');
 assert.deepEqual(JSON.parse(calls[1][1].body),{expectedRevision:'v1',enabled:true,url:'https://receiver.test/hook',rateLimitHour:180,rateLimitMinute:20});
 assert.equal('secret' in JSON.parse(calls[1][1].body),false);
 await client.savePushback('credential',{expectedRevision:'v2',enabled:false,url:'https://receiver.test/hook',secret:'private-key'});
 assert.equal(JSON.parse(calls[2][1].body).secret,'private-key');
 await client.revealPushback('credential','v3');
 assert.equal(calls[3][0],'/api/v1/app/programmatic-access/credential/pushback/reveal');assert.deepEqual(JSON.parse(calls[3][1].body),{expectedRevision:'v3'});
 await client.testPushback('credential','v4');
 assert.equal(calls[4][0],'/api/v1/app/programmatic-access/credential/pushback/test');assert.deepEqual(JSON.parse(calls[4][1].body),{expectedRevision:'v4'});
});
const {programmaticConnectionInfo}=await import('../src/features/agent-conversations/programmatic-connection-info.ts');
test('接入信息只包含必要入口与文件路径，旧凭据与撤销凭据不伪造可用信息',()=>{
 const view={apiUrl:'http://127.0.0.1:4458/api/v1/programmatic',documentationUrl:'http://127.0.0.1:4458/api/v1/programmatic/help',openapiUrl:'http://127.0.0.1:4458/api/v1/programmatic/openapi.json',workspaces:[{id:'workspace',name:'Buildr'}]};
 const credential={name:'千问办公',workspaceIds:['workspace'],scopes:['read','execute'],allowFullAccess:true,tokenFilePath:'/private/test.token',revokedAt:null,token:'must-not-appear'};
 const info=programmaticConnectionInfo(view,credential);
 for(const value of ['千问办公',view.apiUrl,view.documentationUrl,view.openapiUrl,'/private/test.token','workspace','read, execute'])assert.ok(info.includes(value));
 for(const value of [view.apiUrl+'/operations','contractVersion','无需每次读取完整 OpenAPI'])assert.ok(info.includes(value));
 assert.ok(info.includes('全部授权执行：已开启，start/send/续聊可请求 permissionMode=full-access'));
 assert.ok(programmaticConnectionInfo(view,{...credential,allowFullAccess:false}).includes('全部授权执行：已关闭，请求 full-access 将返回 403'));
 for(const value of ['must-not-appear','clientRequestId','prepare-send','curl','brp_'])assert.ok(!info.includes(value));
 assert.equal(programmaticConnectionInfo(view,{...credential,tokenFilePath:undefined}),null);
 assert.equal(programmaticConnectionInfo(view,{...credential,revokedAt:'revoked'}),null);
});
