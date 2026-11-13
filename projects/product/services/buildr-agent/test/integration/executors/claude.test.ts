import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { nativeProgramPolicy } from '../../../src/executors/program-policy.ts';
import { createClaudeExecutor } from '../../../src/executors/claude/index.ts';
import { readClaudeTool } from '../../../src/executors/claude/content.ts';
import { bounded } from '../../../src/executors/native-process.ts';
import { createModelAccess } from '../../../src/model-access/application.ts';
import { createAgentService } from '../../../src/index.ts';
import type { ModelProtocol, ModelProvider } from '../../../src/model-access/contracts.ts';
import { ExecutorInputRejected } from '../../../src/contracts.ts';
import type { ExecutorEvent, ExecutorSendInput, LoginObservation } from '../../../src/contracts.ts';

function binary():string {
  const name=nativeProgramPolicy('claude-code').package.replace(/@[^@]+$/,'').replace('@anthropic-ai/claude-code-','@anthropic-ai/claude-agent-sdk-');
  const root=path.dirname(createRequire(import.meta.url).resolve(name+'/package.json'));
  return path.join(root,process.platform==='win32'?'claude.exe':'claude');
}
async function fixture(t:test.TestContext,scenario:'text'|'tool'|'question'|'child'|'background'|'background-followup'|'skill'|'compact'|'error'='text',usageIn:'start'|'delta'='start'){
  const root=await realpath(await mkdtemp(path.join(tmpdir(),'buildr-claude-'))),cwd=path.join(root,'workspace');
  await mkdir(cwd);
  await writeFile(path.join(cwd,'AGENTS.md'),'BUILDR_CLAUDE_RULE_FIXTURE：只执行已授权动作。\n');
  await writeFile(path.join(cwd,'CLAUDE.md'),'@AGENTS.md\n');
  await mkdir(path.join(cwd,'.claude/skills/buildr-fixture-skill'),{recursive:true});
  await writeFile(path.join(cwd,'.claude/skills/buildr-fixture-skill/SKILL.md'),'---\nname: buildr-fixture-skill\ndescription: BUILDR_CLAUDE_SKILL_FIXTURE\n---\nBUILDR_CLAUDE_SKILL_BODY：本机验证用技能。\n');
  const bodies:any[]=[],classes:string[]=[];
  const received=Promise.withResolvers<void>(),release=Promise.withResolvers<void>();
  const server=createServer(async(req,res)=>{
    if(new URL(req.url!,'http://local').pathname!=='/v1/messages'){res.writeHead(404).end();return;}
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);bodies.push(body);classes.push(String(req.headers['x-claude-code-request-class']??''));
    const messages=JSON.stringify(body.messages);
    const taskFollowup=scenario==='background-followup'&&body.stream&&messages.includes('<task-notification>');
    if((messages.includes('HOLD_FIXTURE')&&bodies.length===1)||taskFollowup){
      received.resolve();await release.promise;
      if(res.destroyed)return;
    }
    if(scenario==='error'){res.writeHead(401,{'content-type':'application/json'}).end(JSON.stringify({type:'error',error:{type:'authentication_error',message:'Fixture key rejected'}}));return;}
    const hasResult=body.messages.some((m:any)=>Array.isArray(m.content)&&m.content.some((p:any)=>p.type==='tool_result'));
    const child=Boolean(req.headers['x-claude-code-agent-id']);
    const tool=scenario==='skill'?'Skill':scenario==='child'?child?'Bash':'Agent':scenario.startsWith('background')||scenario==='tool'?'Bash':'AskUserQuestion';
    const input=tool==='Skill'?{skill:'buildr-fixture-skill'}:tool==='Agent'?{subagent_type:'general-purpose',description:'Read-only child fixture',prompt:'Run the read-only fixture command, then finish.',model:'haiku'}
      :tool==='Bash'?scenario.startsWith('background')?{command:scenario==='background-followup'?'sleep 2':'sleep 10',description:'Bounded background fixture',run_in_background:true}:{command:'printf buildr-claude-ok',description:'Read-only fixture command'}
      :{questions:[{question:'选择验收方式？',header:'验收',multiSelect:false,options:[{label:'自动测试',description:'使用测试'},{label:'手工',description:'人工检查'}]}]};
    const title=JSON.stringify(body.messages).includes('只为以下引用资料生成');
    const summary=String(body.system).includes('你只负责整理交接材料');
    const text=title?JSON.stringify({title:'夹具标题'}):summary?'fixture summary':taskFollowup?'fixture background complete':'fixture complete';
    const content=summary?[{type:'redacted_thinking',data:'fixture-private-reasoning'},{type:'text',text}]:!['text','compact'].includes(scenario)&&!hasResult?[{type:'tool_use',id:child?'call-child':'call-fixture',name:tool,input}]:[{type:'text',text}];
    const stop=content[0].type==='tool_use'?'tool_use':'end_turn';
    const inputTokens=scenario==='compact'&&bodies.length===1?31000:10;
    const message={id:'msg-fixture-'+bodies.length,type:'message',role:'assistant',model:body.model,content,stop_reason:stop,stop_sequence:null,usage:{input_tokens:inputTokens,output_tokens:8}};
    if(!body.stream){res.setHeader('content-type','application/json');res.end(JSON.stringify(message));return;}
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});
    const event=(type:string,data:unknown)=>res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    event('message_start',{type:'message_start',message:{...message,content:[],stop_reason:null,usage:{input_tokens:usageIn==='delta'?0:inputTokens,output_tokens:0}}});
    content.forEach((block:any,index:number)=>{
      event('content_block_start',{type:'content_block_start',index,content_block:block.type==='text'?{type:'text',text:''}:{...block,input:{}}});
      event('content_block_delta',{type:'content_block_delta',index,delta:block.type==='text'?{type:'text_delta',text:block.text}:{type:'input_json_delta',partial_json:JSON.stringify(block.input)}});
      event('content_block_stop',{type:'content_block_stop',index});
    });
    event('message_delta',{type:'message_delta',delta:{stop_reason:stop,stop_sequence:null},usage:{...(usageIn==='delta'?{input_tokens:inputTokens}:{}),output_tokens:8}});
    event('message_stop',{type:'message_stop'});res.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port,configRoot=path.join(root,'connections','claude-code');
  const options={connectionId:'claude-code',configRoot,executable:binary(),environment:{PATH:process.env.PATH??'',HOME:root},gateway:{identity:'fixture',baseUrl:`http://127.0.0.1:${port}/v1`,apiKey:'fixture-private-key',models:[{id:'fixture-model',label:'Fixture',contextWindow:32768,maxOutputTokens:4096,vision:true,tools:true}]}};
  const runtime=await createClaudeExecutor().open(options),runtimes=[runtime];
  t.after(async()=>{
    release.resolve();const results=await Promise.allSettled(runtimes.map(runtime=>runtime.close()));
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});
    const failures=results.filter((value):value is PromiseRejectedResult=>value.status==='rejected');
    if(failures.length)throw new AggregateError(failures.map(value=>value.reason),'Fixture runtime cleanup failed');
  });
  return {root,cwd,runtime,bodies,classes,configRoot,options,received:received.promise,release:()=>release.resolve(),async reopen(){const next=await createClaudeExecutor().open(options);runtimes.push(next);return next;}};
}
test('Claude real SDK and native CLI use only the selected local model and preserve history', {timeout:60000}, async t=>{
  const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
  await f.runtime.send({contextRef,cwd:f.cwd,text:'Read-only fixture input.',images:[],model:'fixture-model',permissionMode:'full-access',clientRequestId:'first',onEvent:event=>events.push(event)});
  assert.ok(events.some(event=>event.type==='accepted'),'native input receipt required');
  assert.ok(events.some(event=>event.type==='completed'&&event.status==='completed'));
  assert.ok(events.some(event=>event.type==='item'&&event.item.text==='fixture complete'));
  assert.ok(f.bodies.length>0);assert.ok(f.bodies.every(body=>body.model==='fixture-model'));
  assert.ok(f.bodies.every(body=>body.max_tokens<=4096));
  assert.ok(JSON.stringify(f.bodies[0]).includes('BUILDR_CLAUDE_RULE_FIXTURE'));
  assert.ok(JSON.stringify(f.bodies[0]).includes('buildr-fixture-skill'));
  const history=await f.runtime.readHistory({contextRef,cwd:f.cwd});
  assert.ok(history.some(item=>item.text==='fixture complete'));
  const executionRef=events.find(event=>event.type==='accepted')!.executionRef;
  const observed=await f.runtime.observe({contextRef,executionRef});
  assert.equal(observed.status,'idle');assert.equal(observed.backgroundWork,false);
});
test('Claude context usage reports the provider request total from the final stream frame', {timeout:60000}, async t=>{
  const f=await fixture(t,'text','delta'),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
  await f.runtime.send({contextRef,cwd:f.cwd,text:'Read-only fixture input.',images:[],model:'fixture-model',permissionMode:'full-access',clientRequestId:'context-usage',onEvent:event=>events.push(event)});
  const reports=events.filter(event=>event.type==='context-usage');
  assert.equal(reports.length,1,'one report per completed model request');
  assert.equal(reports[0]!.type==='context-usage'?reports[0]!.usedTokens:undefined,10);
  assert.equal(reports[0]!.type==='context-usage'?reports[0]!.windowTokens:undefined,32768);
  assert.equal(reports[0]!.type==='context-usage'?reports[0]!.usedRatio:undefined,10/32768);
});
for(const protocol of ['responses','chat-completions'] as ModelProtocol[])test(`Claude real CLI executes a tool through the shared ${protocol} model gateway`,{timeout:60000},async t=>{
  const f=await fixture(t),requests:any[]=[];
  const source:ModelProvider={id:'fixture',label:'Fixture',async open(){return{
    protocol,async inspect(){return{status:'ready',models:[{id:'remote-model',label:'Remote',images:true,tools:true,contextWindow:32768,maxOutputTokens:4096}]};},
    async beginLogin(){},async cancelLogin(){},async close(){},
    async infer(input){
      requests.push(input);assert.equal(input.modelId,'remote-model');assert.equal(input.body.model,'remote-model');
      const done=JSON.stringify(input.body).includes('buildr-claude-ok');
      if(protocol==='chat-completions')return Response.json({choices:[{message:done?{role:'assistant',content:'gateway complete'}:{role:'assistant',content:null,tool_calls:[{id:'gateway-call',type:'function',function:{name:'Bash',arguments:JSON.stringify({command:'printf buildr-claude-ok',description:'Read-only gateway fixture'})}}]},finish_reason:done?'stop':'tool_calls'}],usage:{prompt_tokens:10,completion_tokens:5}});
      return Response.json({id:'response-fixture',status:'completed',output:done?[{type:'message',role:'assistant',content:[{type:'output_text',text:'gateway complete'}]}]:[{type:'reasoning',id:'reason-fixture',encrypted_content:'upstream-sealed-reasoning',summary:[]},{type:'function_call',id:'item-fixture',call_id:'gateway-call',name:'Bash',arguments:JSON.stringify({command:'printf buildr-claude-ok',description:'Read-only gateway fixture'})}],usage:{input_tokens:10,output_tokens:5}});
    },
  };}};
  const access=createModelAccess({root:path.join(f.root,'model-access'),providers:[source]});
  let runtime:Awaited<ReturnType<ReturnType<typeof createClaudeExecutor>['open']>>|undefined;
  try{
    const added=await access.accounts.add({provider:'fixture'}),checked=await access.accounts.check(added.id);
    const account=await access.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'remote-model',enabled:true}]});
    const lease=await access.leases.create({accountId:account.id,modelId:'remote-model',agentId:'claude-code',conversationId:'gateway-conversation',runId:'gateway-run'});
    runtime=await createClaudeExecutor().open({...f.options,gateway:{identity:lease.identity,baseUrl:lease.baseUrl,apiKey:lease.apiKey,models:[{id:lease.model,label:'Fixture',contextWindow:32768,maxOutputTokens:4096,vision:true,tools:true}]}});
    const contextRef=await runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
    await runtime.send({contextRef,cwd:f.cwd,text:'Use the gateway tool fixture.',images:[],clientRequestId:'gateway',permissionMode:'full-access',onEvent:event=>events.push(event)});
    assert.ok(events.some(event=>event.type==='item'&&event.item.text==='gateway complete'));
    assert.ok(events.some(event=>event.type==='item'&&event.item.id==='gateway-call'&&event.item.status==='completed'));
    assert.equal(requests.length,2);assert.ok(requests.every(request=>request.context.agentId==='claude-code'));
    if(protocol==='responses'){
      assert.ok(requests[1].body.input.some((item:any)=>item.type==='reasoning'&&item.encrypted_content==='upstream-sealed-reasoning'));
      const targetLease=await access.leases.create({accountId:account.id,modelId:'remote-model',agentId:'claude-code',conversationId:'fork-conversation',runId:'fork-run'});
      const target=await createClaudeExecutor().open({...f.options,configRoot:path.join(f.configRoot,'model-bindings','b'.repeat(64)),gateway:{identity:targetLease.identity,baseUrl:targetLease.baseUrl,apiKey:targetLease.apiKey,models:[{id:targetLease.model,label:'Fixture',contextWindow:32768,maxOutputTokens:4096,vision:true,tools:true}]}});
      try{
        const before=await runtime.readHistory({contextRef,cwd:f.cwd});
        const final=events.filter(event=>event.type==='item'&&event.item.kind==='message'&&event.item.role==='assistant').at(-1)!;
        assert.equal(final.type,'item');if(final.type!=='item')throw Error('missing final item');
        let created=false;
        const fork=await target.forkContext!({source:runtime,contextRef,cwd:f.cwd,executionRef:events.find(event=>event.type==='accepted')!.executionRef,itemId:final.item.id,onCreated:()=>{created=true;},
          rebindReasoning:value=>access.leases.rebindReasoning(lease.identity,targetLease.identity,value)});
        assert.ok(created);assert.notEqual(fork.id,contextRef.id);
        assert.deepEqual(await runtime.readHistory({contextRef,cwd:f.cwd}),before);
        assert.ok((await target.readHistory({contextRef:fork,cwd:f.cwd})).length);
        const forkEvents:ExecutorEvent[]=[];
        await target.send({contextRef:fork,cwd:f.cwd,text:'Continue this fork only.',images:[],clientRequestId:'fork',permissionMode:'full-access',onEvent:event=>forkEvents.push(event)});
        assert.ok(forkEvents.some(event=>event.type==='completed'&&event.status==='completed'));
        assert.equal(requests.length,3);
        assert.ok(requests[2].body.input.some((item:any)=>item.type==='reasoning'&&item.encrypted_content==='upstream-sealed-reasoning'),JSON.stringify(requests[2].body.input));
        assert.deepEqual(await runtime.readHistory({contextRef,cwd:f.cwd}),before);
        const other=await access.leases.create({accountId:account.id,modelId:'remote-model',agentId:'other-agent',conversationId:'other',runId:'other'});
        await assert.rejects(access.leases.rebindReasoning(lease.identity,other.identity,'buildr-v1.invalid'),{code:'model_reasoning_binding_mismatch'});
        access.leases.release(targetLease.identity);
        await assert.rejects(access.leases.rebindReasoning(lease.identity,targetLease.identity,'buildr-v1.invalid'),{code:'model_binding_missing'});
      }finally{await target.close();}
    }
  }finally{await runtime?.close();await access.close();}
});
test('Claude product send-fork-send uses independent configs and reseals reasoning through the application bridge', {timeout:60000}, async t=>{
  const f=await fixture(t),requests:any[]=[];
  const source:ModelProvider={id:'product-fixture',label:'Product fixture',async open(){return{
    protocol:'responses',async inspect(){return{status:'ready',identity:'product-source',models:[{id:'remote',label:'Remote',images:false,tools:true,contextWindow:32768,maxOutputTokens:4096}]};},
    async beginLogin(){},async cancelLogin(){},async close(){},
    async infer(input){
      requests.push(input);
      const title=JSON.stringify(input.body).includes('只为以下引用资料生成');
      const text=title?'{"title":"产品分叉验收"}':'product complete';
      return Response.json({id:'response-'+requests.length,status:'completed',output:[
        {type:'reasoning',id:'reason-product-'+requests.length,encrypted_content:'product-upstream-reasoning',summary:[]},
        {type:'message',role:'assistant',content:[{type:'output_text',text}]}],usage:{input_tokens:10,output_tokens:5}});
    },
  };}};
  const service=createAgentService({dataRoot:path.join(f.root,'product-data'),environment:f.options.environment,executors:[createClaudeExecutor()],modelProviders:[source],
    resolveWorkspace(){return{rootPath:f.cwd};}});
  try{
    await service.connections.connect('claude-code',{expectedRevision:service.connections.read('claude-code').revision,executable:binary()});
    const added=await service.models.accounts.add({provider:source.id}),checked=await service.models.accounts.check(added.id,{expectedRevision:added.revision});
    await service.models.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'remote',enabled:true}]});
    const read=(id:string)=>service.conversations.read('product-workspace',id);
    const send=async(id:string,text:string)=>{
      const draft={expectedRevision:read(id).revision,connectionId:'claude-code',modelAccountId:added.id,model:'remote',text};
      const preview=service.conversations.prepareSend('product-workspace',id,draft);
      service.conversations.send('product-workspace',id,{...draft,previewToken:preview.token,clientRequestId:crypto.randomUUID()});
      for(let i=0;i<1000;i++){
        const view=read(id);
        if(view.run?.status==='failed')assert.fail(JSON.stringify(view.run));
        if(view.run?.status==='completed'&&view.titleState?.status!=='generating')return view;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      throw Error('Product conversation did not settle');
    };
    const original=await service.conversations.create('product-workspace',{});
    const done=await send(original.id,'Product source round.');
    const answer=done.entries.findLast(entry=>entry.role==='assistant'&&entry.kind==='message'&&!entry.thinking)!;
    const fork=await service.conversations.fork('product-workspace',original.id,{expectedRevision:done.revision,entryId:answer.id,clientRequestId:crypto.randomUUID()});
    assert.equal(fork.forkState?.status,'ready');
    const continued=await send(fork.id,'Product fork round only.');
    assert.ok(continued.entries.some(entry=>entry.text==='product complete'));
    const request=requests.findLast(value=>JSON.stringify(value.body).includes('Product fork round only.'));
    assert.ok(request);
    assert.ok(request.body.input.some((item:any)=>item.type==='reasoning'&&item.encrypted_content==='product-upstream-reasoning'));
    assert.notEqual(request.context.conversationId,original.id);
    assert.ok(!read(original.id).entries.some(entry=>entry.text.includes('Product fork round only.')));
  }finally{await service.close();}
});

test('Claude reuses multiple turns, restores the exact session and forks without mutating its source', {timeout:60000}, async t=>{
  const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
  const send=async(runtime= f.runtime,id='first')=>runtime.send({contextRef,cwd:f.cwd,text:'Read-only '+id,images:[],model:'fixture-model',permissionMode:'full-access',clientRequestId:id,onEvent:event=>events.push(event)});
  await send();await send(f.runtime,'second');
  assert.equal(events.filter(event=>event.type==='accepted').length,2);
  const final=events.findLast(event=>event.type==='item'&&event.item.kind==='message'&&event.item.role==='assistant');
  assert.ok(final&&final.type==='item');
  const accepted=events.findLast(event=>event.type==='accepted')!;assert.equal(accepted.type,'accepted');
  const before=await f.runtime.readHistory({contextRef,cwd:f.cwd});
  const fork=await f.runtime.forkContext!({source:f.runtime,contextRef,cwd:f.cwd,executionRef:accepted.executionRef,itemId:final.item.id,onCreated:()=>{}});
  assert.notEqual(fork.id,contextRef.id);
  assert.equal((await f.runtime.readHistory({contextRef,cwd:f.cwd})).length,before.length);
  const restored=await f.reopen();
  await restored.resumeContext({contextRef,cwd:f.cwd});
  assert.equal((await restored.readHistory({contextRef,cwd:f.cwd})).length,before.length);
  await f.runtime.close();await send(restored,'third');
  assert.ok(f.bodies.at(-1).messages.some((message:any)=>JSON.stringify(message).includes('Read-only first')));
});
test('Claude logical release and physical control exit are separate proofs', {timeout:60000,skip:process.platform==='win32'?'Requires POSIX control-group proof':false}, async t=>{
  const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd});let executionRef:any;
  await f.runtime.send({contextRef,cwd:f.cwd,text:'Fixture',images:[],clientRequestId:'release',onEvent:event=>{if(event.type==='accepted')executionRef=event.executionRef;}});
  assert.equal(await f.runtime.prepareRelease!({contextRef,executionRef}),true);
  await f.runtime.close();
  assert.ok(await f.runtime.canRelease!({contextRef,executionRef}));
  assert.equal(await f.runtime.canReclaimStorage!(),true);
});
test('Claude native child tools retain their parent and cannot switch the selected model', {timeout:60000}, async t=>{
  const f=await fixture(t,'child'),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
  const ended=Promise.withResolvers<void>();let childStarted=false;
  await f.runtime.send({contextRef,cwd:f.cwd,text:'Run the child fixture.',images:[],clientRequestId:'child',permissionMode:'full-access',onEvent:event=>{
    events.push(event);
    if(event.type==='item'&&event.item.id==='call-child')childStarted=true;
    if(childStarted&&event.type==='observation'&&event.observation.backgroundWork===false&&event.observation.tools.every(tool=>tool.status==='completed'))ended.resolve();
  }});
  assert.ok(events.some(event=>event.type==='item'&&event.item.id==='call-child'&&event.item.parentToolId==='call-fixture'));
  assert.ok(f.bodies.length>=3);assert.ok(f.bodies.every(body=>body.model==='fixture-model'));
  await bounded(ended.promise,10000);
  const observed=await f.runtime.observe({contextRef});assert.equal(observed.backgroundWork,false);
  await f.runtime.close();
  const detail=readClaudeTool(f.root,{version:3,provider:'claude-code',contextId:contextRef.id,nativeId:'call-child',entry:{id:'child',sequence:1,kind:'tool',role:'assistant',text:''} as any,text:[],session:{config:'connections/claude-code',cwd:f.cwd,parentToolId:'call-fixture'}});
  assert.ok(detail?.text.includes('buildr-claude-ok'));
});
test('Claude supplementary input is acknowledged once and all its native results settle before completion', {timeout:60000}, async t=>{
  const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
  const accepted=Promise.withResolvers<any>();
  const work=f.runtime.send({contextRef,cwd:f.cwd,text:'HOLD_FIXTURE',images:[],clientRequestId:'base',onEvent:event=>{events.push(event);if(event.type==='accepted')accepted.resolve(event.executionRef);}});
  const executionRef=await bounded(accepted.promise,10000);await bounded(f.received,10000);
  const extra=f.runtime.supplement!({contextRef,executionRef,cwd:f.cwd,text:'Additional fixture input.',images:[],clientRequestId:'extra'});
  f.release();
  const receipt=await bounded(extra,10000);await bounded(work,10000);
  assert.equal(receipt.executionRef.id,executionRef.id);
  assert.ok(f.bodies.some(body=>JSON.stringify(body.messages).includes('Additional fixture input.')));
  assert.equal(events.filter(event=>event.type==='completed').length,1);
});
test('Claude proves a supplement refused by the exact settled round instead of leaving it uncertain', {timeout:60000}, async t=>{
  const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd});let executionRef:any;
  await f.runtime.send({contextRef,cwd:f.cwd,text:'Read-only fixture input.',images:[],permissionMode:'full-access',clientRequestId:'settled',onEvent:event=>{if(event.type==='accepted')executionRef=event.executionRef;}});
  await assert.rejects(f.runtime.supplement!({contextRef,executionRef,cwd:f.cwd,text:'Too late for the settled round.',images:[],clientRequestId:'late'}),ExecutorInputRejected);
});
test('Claude stop does not leave acknowledged supplementary input running behind the interrupted turn', {timeout:60000}, async t=>{
  const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd});
  const accepted=Promise.withResolvers<any>();
  const work=f.runtime.send({contextRef,cwd:f.cwd,text:'HOLD_FIXTURE',images:[],clientRequestId:'stop-base',onEvent:event=>{if(event.type==='accepted')accepted.resolve(event.executionRef);}}).catch(error=>error);
  const executionRef=await bounded(accepted.promise,10000);await bounded(f.received,10000);
  const supplement=f.runtime.supplement!({contextRef,executionRef,cwd:f.cwd,text:'This queued input must not execute.',images:[],clientRequestId:'stop-extra'}).catch(error=>error);
  const observed=await f.runtime.stop({contextRef,executionRef});
  f.release();await bounded(work,10000);await bounded(supplement,10000);
  assert.ok(['stopped','unknown','running'].includes(observed.status),`Unexpected stop state: ${observed.status}`);
  assert.equal(f.bodies.length,1,'interrupt alone must not let queued work reach the model');
});
test('Claude native background Bash remains controllable after its main answer', {timeout:60000}, async t=>{
  const f=await fixture(t,'background'),contextRef=await f.runtime.createContext({cwd:f.cwd});let executionRef:any;
  await f.runtime.send({contextRef,cwd:f.cwd,text:'Run the bounded background fixture.',images:[],clientRequestId:'background',permissionMode:'full-access',onEvent:event=>{if(event.type==='accepted')executionRef=event.executionRef;}});
  const observed=await f.runtime.observe({contextRef,executionRef});
  assert.equal(observed.backgroundWork,true);
  assert.equal(await f.runtime.prepareRelease!({contextRef,executionRef}),false);
  const tool=observed.tools.find(tool=>tool.canStop);assert.ok(tool);
  await f.runtime.stop({contextRef,executionRef,toolId:tool.id});
});
test('Claude keeps the execution active while handling a background task result', {timeout:60000}, async t=>{
  const f=await fixture(t,'background-followup'),contextRef=await f.runtime.createContext({cwd:f.cwd});
  const execution=Promise.withResolvers<Extract<ExecutorEvent,{type:'accepted'}>['executionRef']>();
  const finished=Promise.withResolvers<void>(), statuses:string[]=[], assistantItems=new Map<string,string>();
  let firstResult=false;
  await f.runtime.send({
    contextRef,cwd:f.cwd,text:'Run the bounded background fixture.',images:[],clientRequestId:'background-followup',permissionMode:'full-access',
    onEvent:event=>{
      if(event.type==='accepted')execution.resolve(event.executionRef);
      if(event.type==='item'&&event.item.kind==='message'&&event.item.role==='assistant')assistantItems.set(event.item.id,event.item.text);
      if(event.type==='completed')firstResult=true;
      if(event.type==='observation'&&firstResult){
        statuses.push(event.observation.status);
        if(event.observation.status==='idle')finished.resolve();
      }
    },
  });
  const executionRef=await execution.promise;
  await bounded(f.received,15000);
  assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'running');
  assert.equal(await f.runtime.prepareRelease!({contextRef,executionRef}),false);
  assert.ok(!statuses.includes('idle'),statuses.join(', '));
  f.release();
  await bounded(finished.promise,15000);
  assert.ok([...assistantItems.values()].includes('fixture complete'));
  assert.ok([...assistantItems.values()].includes('fixture background complete'));
  assert.equal(await f.runtime.prepareRelease!({contextRef,executionRef}),true);
});
test('Claude real Bash uses approval control and native tool detail', {timeout:60000}, async t=>{
  const f=await fixture(t,'tool'),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
  let executionRef:any;
  const onEvent:ExecutorSendInput['onEvent']=event=>{
    events.push(event);
    if(event.type==='accepted')executionRef=event.executionRef;
    if(event.type==='request')void f.runtime.reply({contextRef,executionRef,requestId:event.request.id,answer:'approve'});
  };
  await f.runtime.send({contextRef,cwd:f.cwd,text:'Run the fixture command.',images:[],model:'fixture-model',permissionMode:'default',clientRequestId:'tool',onEvent});
  assert.ok(events.some(event=>event.type==='item'&&event.item.kind==='tool'&&event.item.text.includes('buildr-claude-ok')));
  const detail=readClaudeTool(f.root,{version:3,provider:'claude-code',contextId:contextRef.id,nativeId:'call-fixture',entry:{id:'call-fixture',sequence:1,kind:'tool',role:'assistant',text:''} as any,text:[],session:{config:'connections/claude-code',cwd:f.cwd}});
  assert.ok(detail?.text.includes('buildr-claude-ok'));
});
test('Claude full access still asks the human and uses the original question response', {timeout:60000}, async t=>{
  const f=await fixture(t,'question'),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
  let executionRef:any;
  await f.runtime.send({contextRef,cwd:f.cwd,text:'Ask the fixture question.',images:[],model:'fixture-model',permissionMode:'full-access',clientRequestId:'question',onEvent:event=>{
    events.push(event);
    if(event.type==='accepted')executionRef=event.executionRef;
    if(event.type==='request'){
      assert.equal(event.request.kind,'question');
      void f.runtime.reply({contextRef,executionRef,requestId:event.request.id,answer:{'0':'自动测试'}});
    }
  }});
  assert.ok(events.some(event=>event.type==='request'&&event.request.kind==='question'));
  assert.ok(events.some(event=>event.type==='request-resolved'));
  assert.ok(f.bodies.some(body=>JSON.stringify(body.messages).includes('自动测试')));
});


test('Claude native Skill tool loads a projected project skill from its actual directory', {timeout:60000}, async t=>{
 const f=await fixture(t,'skill'),contextRef=await f.runtime.createContext({cwd:f.cwd});
 await f.runtime.send({contextRef,cwd:f.cwd,text:'Use the buildr-fixture-skill skill.',images:[],clientRequestId:'skill',permissionMode:'full-access',onEvent:()=>{}});
 assert.ok(f.bodies.some(body=>JSON.stringify(body.messages).includes('BUILDR_CLAUDE_SKILL_BODY')));
});


test('Claude native auto-compaction keeps its summary and next turn on the selected model', {timeout:60000}, async t=>{
 const f=await fixture(t,'compact'),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
 const send=(id:string)=>f.runtime.send({contextRef,cwd:f.cwd,text:'Compaction fixture '+id,images:[],clientRequestId:id,permissionMode:'full-access',onEvent:event=>events.push(event)});
 await send('compact-one');await send('compact-two');
 assert.ok(f.classes.includes('compaction'));
 assert.ok(f.bodies.every(body=>body.model==='fixture-model'));
 assert.ok(events.some(event=>event.type==='observation'&&event.observation.contextCompaction));
});


test('Claude program readiness performs a tool-free handshake without model or subscription login', {timeout:60000}, async t=>{
 const f=await fixture(t),bare=await createClaudeExecutor().open({...f.options,gateway:undefined});
 try{const account=await bare.inspectAccount();assert.equal(account.status,'not-authenticated');assert.equal(account.label,undefined);assert.deepEqual(await bare.models(),[]);const login:LoginObservation[]=[];await bare.beginLogin(value=>login.push(value));assert.equal(login.at(-1)?.state,'failed');assert.equal(f.bodies.length,0);}finally{await bare.close();if(process.platform!=='win32')assert.equal(await bare.canReclaimStorage!(),true);}
});

test('Claude source authentication errors terminate the round without replay or model fallback', {timeout:60000}, async t=>{
 const f=await fixture(t,'error'),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
 await bounded(f.runtime.send({contextRef,cwd:f.cwd,text:'Failure fixture',images:[],clientRequestId:'failure',onEvent:event=>events.push(event)}),10000);
 assert.ok(events.some(event=>event.type==='completed'&&event.status==='failed'));assert.equal(f.bodies.length,1);
 assert.equal((await f.runtime.observe({contextRef})).canContinue,false);
});

test('Claude title and handoff summary are isolated tool-free requests on the selected lease', {timeout:60000}, async t=>{
 const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd});
 await f.runtime.send({contextRef,cwd:f.cwd,text:'Original fixture',images:[],clientRequestId:'original',onEvent:()=>{}});
 const before=await f.runtime.readHistory({contextRef,cwd:f.cwd});
 const input={contextRef,cwd:f.cwd,description:'用户要求与真实结果的引用材料',signal:new AbortController().signal};
 assert.equal(await f.runtime.generateTitle!(input),'夹具标题');
 assert.equal(await f.runtime.summarizeHandoff!(input),'fixture summary');
 assert.equal((await f.runtime.readHistory({contextRef,cwd:f.cwd})).length,before.length);
 assert.ok(f.bodies.slice(-2).every(body=>body.tools.length===0&&body.model==='fixture-model'));
});

test('Claude transport loss preserves exact execution identity and enters shared fault recovery', {timeout:60000,skip:process.platform==='win32'?'Requires POSIX control-group proof':false}, async t=>{
 const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd}),events:ExecutorEvent[]=[];
 const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'HOLD_FIXTURE',images:[],clientRequestId:'transport',onEvent:event=>events.push(event)});
 // Attach rejection handling before terminating the exact fixture-owned worker.
 const rejected=assert.rejects(sending,(error:unknown)=>error instanceof Error&&['agent_native_process_closed','agent_claude_observation_lost'].includes(error.message));
 await bounded(f.received,10000);
 const accepted=events.find(event=>event.type==='accepted');assert.ok(accepted&&accepted.type==='accepted');
 process.kill(Number(accepted.executionRef.data!.resourceGroup),'SIGTERM');
 await rejected;
 const unknown=events.filter(event=>event.type==='observation'&&event.observation.status==='unknown');
 assert.ok(unknown.some(event=>event.type==='observation'&&event.observation.fault?.kind==='transport'&&event.observation.executionRef?.id===accepted.executionRef.id));
 assert.equal(f.bodies.length,1);
 await f.runtime.close();assert.equal(await f.runtime.canReclaimStorage!(),true);
});

test('Claude real CLI receives image bytes without leaking a host path into the model payload', {timeout:60000}, async t=>{
 const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd});
 const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';
 const image=path.join(f.cwd,'fixture.png');await writeFile(image,Buffer.from(data,'base64'));
 await f.runtime.send({contextRef,cwd:f.cwd,text:'Inspect the attached fixture image.',images:[{id:'image',path:image,mimeType:'image/png'}],clientRequestId:'image',onEvent:()=>{}});
 const blocks=f.bodies.flatMap(body=>body.messages.flatMap((message:any)=>Array.isArray(message.content)?message.content:[]));
 const native=blocks.find(block=>block.type==='image');assert.ok(native);assert.equal(native.source.type,'base64');assert.equal(native.source.media_type,'image/png');
 assert.ok(Buffer.from(native.source.data,'base64').length>0);assert.ok(!JSON.stringify(f.bodies).includes(image));
});

test('Claude new turns clear old tool observations while retaining native history', {timeout:60000}, async t=>{
 const f=await fixture(t,'tool'),contextRef=await f.runtime.createContext({cwd:f.cwd});
 await f.runtime.send({contextRef,cwd:f.cwd,text:'First tool fixture.',images:[],clientRequestId:'tools-first',permissionMode:'full-access',onEvent:()=>{}});
 assert.equal((await f.runtime.observe({contextRef})).tools.length,1);
 await f.runtime.send({contextRef,cwd:f.cwd,text:'A new text-only turn.',images:[],clientRequestId:'tools-next',permissionMode:'full-access',onEvent:()=>{}});
 assert.deepEqual((await f.runtime.observe({contextRef})).tools,[]);
 assert.ok((await f.runtime.readHistory({contextRef,cwd:f.cwd})).some(item=>item.id==='call-fixture'&&item.status==='completed'));
});

test('Claude failed new input never reports the previous execution identity', {timeout:60000}, async t=>{
 const f=await fixture(t),contextRef=await f.runtime.createContext({cwd:f.cwd}),first:ExecutorEvent[]=[],failed:ExecutorEvent[]=[];
 await f.runtime.send({contextRef,cwd:f.cwd,text:'Completed first turn.',images:[],clientRequestId:'identity-first',onEvent:event=>first.push(event)});
 const accepted=first.find(event=>event.type==='accepted');assert.ok(accepted?.type==='accepted');
 await assert.rejects(f.runtime.send({contextRef,cwd:f.cwd,text:'Missing image fixture.',images:[{id:'missing',path:path.join(f.cwd,'missing.png'),mimeType:'image/png'}],clientRequestId:'identity-failed',onEvent:event=>failed.push(event)}));
 assert.ok(failed.some(event=>event.type==='observation'&&event.observation.status==='unknown'));
 assert.ok(failed.every(event=>event.type!=='observation'||event.observation.executionRef?.id!==accepted.executionRef.id));
 assert.equal(f.bodies.length,1);
});
