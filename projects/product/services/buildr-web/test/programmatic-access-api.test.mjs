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
const {programmaticConnectionInfo}=await import('../src/features/agent-conversations/programmatic-connection-info.ts');
test('接入信息只包含必要入口与文件路径，旧凭据与撤销凭据不伪造可用信息',()=>{
 const view={apiUrl:'http://127.0.0.1:4458/api/v1/programmatic',documentationUrl:'http://127.0.0.1:4458/api/v1/programmatic/help',openapiUrl:'http://127.0.0.1:4458/api/v1/programmatic/openapi.json',workspaces:[{id:'workspace',name:'Buildr'}]};
 const credential={name:'千问办公',workspaceIds:['workspace'],scopes:['read','execute'],tokenFilePath:'/private/test.token',revokedAt:null,token:'must-not-appear'};
 const info=programmaticConnectionInfo(view,credential);
 for(const value of ['千问办公',view.apiUrl,view.documentationUrl,view.openapiUrl,'/private/test.token','workspace','read, execute'])assert.ok(info.includes(value));
 for(const value of [view.apiUrl+'/operations','contractVersion','无需每次读取完整 OpenAPI'])assert.ok(info.includes(value));
 for(const value of ['must-not-appear','clientRequestId','prepare-send','curl','brp_'])assert.ok(!info.includes(value));
 assert.equal(programmaticConnectionInfo(view,{...credential,tokenFilePath:undefined}),null);
 assert.equal(programmaticConnectionInfo(view,{...credential,revokedAt:'revoked'}),null);
});
