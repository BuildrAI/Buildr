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
