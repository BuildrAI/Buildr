import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/agent-conversations-api.ts')&&specifier==='../../../api')return {url:'data:text/javascript,export const createApiClient=()=>()=>{}; export class LocalSessionAdapter {}',shortCircuit:true};
 if(context.parentURL?.endsWith('/agent-conversations-api.ts')&&specifier==='../conversation-state')return {url:'data:text/javascript,export const parseEventFrame=frame=>({data:frame.split("data: ")[1]});',shortCircuit:true};
 return next(specifier,context);
}});
const {createAgentConversationsClient}=await import('../src/features/agent-conversations/api/agent-conversations-api.ts');
test('event authentication refreshes only an explicitly expired session and preserves cursor',async()=>{
 const controller=new AbortController(),calls=[],events=[];let token='old',refreshes=0;
 const client=createAgentConversationsClient(()=>assert.fail('no mutation'),{writeHeaders:()=>({'x-buildr-session':token}),refreshSession:async signal=>{assert.equal(signal,controller.signal);refreshes++;token='new';return true;}},async(url,init)=>{
  calls.push({url,...init});
  if(calls.length===1)return new Response(JSON.stringify({error:{code:'session_forbidden'}}),{status:403});
  return new Response('data: '+JSON.stringify({cursor:8,type:'snapshot',generation:'g',revision:'r',workspaceId:'space',conversationId:'chat',payload:{}})+'\n\n',{headers:{'content-type':'text/event-stream'}});
 });
 await client.subscribe('space','chat',controller.signal,event=>{events.push(event);controller.abort();},7);
 assert.equal(refreshes,1);assert.equal(calls.length,2);assert.equal(calls[0].headers['x-buildr-session'],'old');assert.equal(calls[1].headers['x-buildr-session'],'new');assert.equal(calls[1].headers['last-event-id'],'7');assert.equal(events.length,1);
});
test('other denials do not refresh; repeated expired-session rejection is bounded',async()=>{
 for(const code of ['permission_denied','session_forbidden']){
  let calls=0,refreshes=0;
  const client=createAgentConversationsClient(()=>assert.fail('no mutation'),{writeHeaders:()=>({}),refreshSession:async()=>{refreshes++;return true;}},async()=>{calls++;return new Response(JSON.stringify({error:{code,message:'准确拒绝原因'}}),{status:403});});
  await assert.rejects(client.subscribe('space','chat',new AbortController().signal,()=>{}),error=>error.code===code&&error.message==='准确拒绝原因');
  assert.equal(refreshes,code==='session_forbidden'?1:0);assert.equal(calls,code==='session_forbidden'?2:1);
 }
});

test('联合活动观察复用相同版本，失败保留摘要，写后重新取完整观察',async()=>{
  const calls=[],snapshot={revision:'a'.repeat(64),conversations:[],pending:[],total:0};let fail=false;
  const client=createAgentConversationsClient(async(url,init)=>{
    calls.push(url);if(init.method)return {};
    if(fail){fail=false;throw Error('offline');}
    return url.includes('?revision=')?{revision:snapshot.revision,unchanged:true}:snapshot;
  },{writeHeaders:()=>({})});
  assert.equal(await client.activitySummary(),snapshot);assert.equal(await client.activitySummary(),snapshot);
  fail=true;await assert.rejects(client.activitySummary(),/offline/);assert.equal(await client.activitySummary(),snapshot);
  await client.connect('codex');assert.equal(await client.activitySummary(),snapshot);
  assert.equal(calls.at(-1),'/api/v1/app/agent-service/activity-summary');assert.ok(calls[1].endsWith('?revision='+snapshot.revision));
});
