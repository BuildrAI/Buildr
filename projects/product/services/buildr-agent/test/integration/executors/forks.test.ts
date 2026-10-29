import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createCodexExecutor } from '../../../build/executors/codex/index.js';
import { createQoderExecutor } from '../../../build/executors/qoder/index.js';
import { DshRuntime } from '../../../build/executors/dsh/index.js';
import { apply as transferPlugin } from '../../../build/executors/dsh/fork-transfer-plugin.js';
import type { AgentRuntime } from '../../../src/contracts.ts';

test('DSH fork titles use an independent tool-free gateway request and do not prompt the work session',async t=>{
  const requests:Array<{url:string;body:any}>=[];
  t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{
    requests.push({url:String(url),body:JSON.parse(init.body)});
    return Response.json({choices:[{message:{content:'{"title":"新的分支方向"}'},finish_reason:'stop'}]});
  });
  const runtime=Reflect.construct(DshRuntime,['binding',{close:async()=>{}},{remote:{},ctx:{}}]) as AgentRuntime;
  (runtime as any).gateway={identity:'fixture',baseUrl:'http://127.0.0.1:1234/v1',apiKey:'fixture-key',models:[{id:'gateway-model',label:'Model'}]};
  const contextRef=(runtime as any).context('work-context','/work');
  const input={contextRef,cwd:'/work',description:'用户新的分支要求',freshInstruction:true,signal:new AbortController().signal};
  try{
    assert.equal(await runtime.generateTitle!(input),'新的分支方向');
    assert.equal(requests.length,1);assert.equal(requests[0]!.url,'http://127.0.0.1:1234/v1/chat/completions');
    assert.equal(requests[0]!.body.model,'gateway-model');assert.deepEqual(requests[0]!.body.tools,[]);
    assert.ok(!JSON.stringify(requests[0]!.body).includes('work-context'));
    await assert.rejects(runtime.generateTitle!({...input,freshInstruction:false}),/title_unavailable/);
    assert.equal(requests.length,1,'ordinary DSH sessions keep their native title workflow without a duplicate model request');
  }finally{await runtime.close();}
});

test('DSH legacy fork titles use only the verified native DeepSeek model route, never another provider by name',async()=>{
  const runtime=Reflect.construct(DshRuntime,['binding',{close:async()=>{}},{remote:{},ctx:{}}]) as AgentRuntime;
  (runtime as any).modelBridge={key:'fixture',addressFile:'unused'};
  let requests=0;
  (runtime as any).requestModel=async(path:string,init:RequestInit)=>{
    requests++;assert.equal(path,'/anthropic/v1/messages');
    const body=JSON.parse(String(init.body));assert.equal(body.model,'native-model');assert.deepEqual(body.tools,[]);
    return Response.json({content:[{type:'text',text:'{"title":"原生来源的新方向"}'}],stop_reason:'end_turn'});
  };
  const input={contextRef:(runtime as any).context('work-context','/work'),cwd:'/work',description:'新的要求',freshInstruction:true,model:'deepseek::native-model',signal:new AbortController().signal};
  try{
    assert.equal(await runtime.generateTitle!(input),'原生来源的新方向');
    await assert.rejects(runtime.generateTitle!({...input,model:'other::native-model'}),/title_unavailable/);
    assert.equal(requests,1);
  }finally{(runtime as any).modelBridge=undefined;await runtime.close();}
});

// Explicit opt-in exercises a real local program, but never an account or paid model.
if (process.env.BUILDR_CODEX_FORK_EXECUTABLE) test('real Codex forks across private stores and resumes with a local synthetic model only', {timeout:30_000}, async()=>{
  const root=await realpath(await mkdtemp('/tmp/buildr-real-codex-fork-'));
  let calls=0,source:AgentRuntime|undefined,target:AgentRuntime|undefined;
  const server=createServer(async(request,response)=>{
    for await(const _chunk of request) { /* drain optional compressed input without inspecting it */ }
    calls++;
    const id='response-'+calls,item={id:'message-'+calls,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Synthetic answer '+calls,annotations:[]}]};
    response.writeHead(200,{'content-type':'text/event-stream'});
    for(const event of [
      {type:'response.created',response:{id,status:'in_progress',output:[]}},
      {type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},
      {type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:'Synthetic answer '+calls},
      {type:'response.output_item.done',output_index:0,item},
      {type:'response.completed',response:{id,status:'completed',output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15}}},
    ]) response.write('event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n');
    response.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const open=(name:string)=>createCodexExecutor().open({connectionId:'codex',configRoot:join(root,name),executable:process.env.BUILDR_CODEX_FORK_EXECUTABLE,environment:{PATH:process.env.PATH??''},
    gateway:{identity:'synthetic-'+name,baseUrl:'http://127.0.0.1:'+address.port,apiKey:'synthetic-key',models:[{id:'synthetic-model',label:'Synthetic model',isDefault:true,tools:false}]}});
  try{
    source=await open('source');const ref=await source.createContext({cwd:root});
    let executionRef:{id:string}|undefined,itemId:string|undefined;
    for(let turn=1;turn<=2;turn++)await source.send({contextRef:ref,cwd:root,text:'Synthetic question '+turn,images:[],clientRequestId:randomUUID(),onEvent:event=>{
      if(turn===1&&event.type==='accepted')executionRef=event.executionRef;
      if(turn===1&&event.type==='item'&&event.item.role==='assistant')itemId=event.item.id;
    }});
    assert.ok(executionRef&&itemId);
    target=await open('target');
    const child=await target.forkContext!({source,contextRef:ref,cwd:root,executionRef,itemId,onCreated(){}});
    assert.notEqual(child.id,ref.id);assert.equal(calls,2,'forking makes no model request');
    assert.deepEqual((await target.readHistory({contextRef:child,cwd:root})).map(item=>item.text),['Synthetic question 1','Synthetic answer 1']);
    await target.close();target=await open('target');
    await target.resumeContext({contextRef:child,cwd:root});
    await target.send({contextRef:child,cwd:root,text:'Synthetic branch direction',images:[],clientRequestId:randomUUID(),onEvent(){}});
    assert.equal(calls,3);assert.equal((await source.readHistory({contextRef:ref,cwd:root})).filter(item=>item.role==='assistant').length,2);
    const history=await target.readHistory({contextRef:child,cwd:root});
    assert.equal(history.filter(item=>item.role==='assistant').length,2);
    assert.ok(history.every(item=>!item.text.includes('question 2')&&!item.text.includes('answer 2')));
  }finally{
    await source?.close();await target?.close();
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(root,{recursive:true,force:true});
  }
});

test('Codex imports an exact source rollout into the destination profile and rejects ignored boundaries',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-codex-fork-'));
  let source:AgentRuntime|undefined,target:AgentRuntime|undefined;
  try{
    const executable=join(root,'codex.mjs');
    await writeFile(executable,await readFile(new URL('./fixtures/codex-cli.mjs',import.meta.url)));
    const open=(configRoot:string)=>createCodexExecutor().open({connectionId:'codex',configRoot,executable,environment:{PATH:process.env.PATH??''}});
    const config=join(root,'source');await mkdir(join(config,'codex-home'),{recursive:true});
    const parent={id:'parent',cwd:root,turns:['one','two'].map(id=>({id,status:'completed',items:[{id:'answer-'+id,type:'agentMessage',text:id}]}))};
    await writeFile(join(config,'codex-home/state.json'),JSON.stringify({parent}));
    source=await open(config);
    // The fixture's native save materializes exact rollout locations.
    await source.createContext({cwd:root});
    const native=source as any,ref=native.context('parent',root);
    target=await open(join(root,'target'));let known='';
    const child=await target.forkContext!({source,contextRef:ref,cwd:root,executionRef:{id:'one'},itemId:'answer-one',onCreated:value=>{known=value.id;}});
    assert.equal(known,child.id);assert.notEqual(child.id,ref.id);
    assert.deepEqual((await target.readHistory({contextRef:child,cwd:root})).map(item=>item.text),['one']);
    assert.equal((await source.readHistory({contextRef:ref,cwd:root})).length,2);
    // Simulate an older native server silently ignoring lastTurnId.
    const rpc=(target as any).rpc,call=rpc.call.bind(rpc);
    rpc.call=async(method:string,params:any,...rest:any[])=>{
      const result=await call(method,params,...rest);
      if(method==='thread/read')result.thread.turns.push({id:'unexpected-later',items:[]});
      return result;
    };
    await assert.rejects(target.forkContext!({source:target,contextRef:child,cwd:root,executionRef:{id:'one'},itemId:'answer-one',onCreated:value=>{known=value.id;}}),/boundary/);
    assert.ok(known.startsWith('fork-'));
  }finally{await source?.close();await target?.close();await rm(root,{recursive:true,force:true});}
});

test('Qoder uses SDK UUID boundaries in the shared native account store, including remapped child messages',async()=>{
  const root=await mkdtemp('/tmp/buildr-qoder-fork-');
  let source:AgentRuntime|undefined,target:AgentRuntime|undefined;
  try{
    const executable=join(root,'qoder.mjs');await writeFile(executable,await readFile(new URL('./fixtures/qoder-cli.mjs',import.meta.url)));
    const config=join(root,'source'),workspace=join(root,'workspace');await mkdir(workspace);
    const open=(configRoot:string)=>createQoderExecutor().open({connectionId:'qoder',configRoot,nativeAccountConfigRoot:config,executable,environment:{PATH:process.env.PATH??''}});
    source=await open(config);target=await open(join(root,'target'));
    const ref=await source.createContext({cwd:workspace}),prompt=randomUUID(),supplement=randomUUID(),answer=randomUUID(),interruption=randomUUID(),later=randomUUID(),end=randomUUID();
    const base={sessionId:ref.id,cwd:workspace,isSidechain:false,timestamp:new Date().toISOString(),userType:'external',entrypoint:'cli',version:'1.1.75'};
    const records=[
      {...base,type:'user',uuid:prompt,parentUuid:null,origin:{kind:'human'},humanInput:{text:'first'},promptId:prompt,message:{role:'user',content:[{type:'text',text:'first'}]}},
      {...base,type:'user',uuid:supplement,parentUuid:prompt,origin:{kind:'human'},humanInput:{text:'supplement'},promptId:prompt,message:{role:'user',content:[{type:'text',text:'supplement'}]}},
      {...base,type:'assistant',uuid:answer,parentUuid:supplement,message:{role:'assistant',id:'native-answer',content:[{type:'text',text:'kept answer'}]}},
      {...base,type:'user',uuid:interruption,parentUuid:answer,message:{role:'user',content:[{type:'text',text:'[Request interrupted by user]'}]}},
      {...base,type:'user',uuid:later,parentUuid:interruption,origin:{kind:'human'},humanInput:{text:'later'},promptId:later,message:{role:'user',content:[{type:'text',text:'later'}]}},
      {...base,type:'assistant',uuid:end,parentUuid:later,message:{role:'assistant',id:'later-answer',content:[{type:'text',text:'not kept'}]}},
    ];
    const directory=join(config,'qoder-config','projects',(await realpath(workspace)).replace(/[^a-zA-Z0-9]/g,'-'));await mkdir(directory,{recursive:true});
    await writeFile(join(directory,ref.id+'.jsonl'),records.map(value=>JSON.stringify(value)).join('\n')+'\n');
    const child=await target.forkContext!({source,contextRef:ref,cwd:workspace,executionRef:{id:prompt},inputItemIds:[prompt,supplement],itemId:'message:native-answer',onCreated(){}});
    assert.notEqual(child.id,ref.id);
    const history=await target.readHistory({contextRef:child,cwd:workspace});
    assert.deepEqual(history.map(item=>item.text),['first','supplement','kept answer']);
    assert.ok((await readFile(join(directory,child.id+'.jsonl'),'utf8')).includes('[Request interrupted by user]'),'native closure after the selected answer is preserved');
    assert.notEqual(history.find(item=>item.role==='user')?.id,prompt);
    assert.equal((await source.readHistory({contextRef:ref,cwd:workspace})).length,5);
  }finally{await source?.close();await target?.close();await rm(root,{recursive:true,force:true});}
});

test('DSH selects exact completed-turn events and transfers only the native fork into independent persistence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-dsh-fork-')),cwd='/synthetic/workspace';
  const parent='session-'+randomUUID(),child='session-'+randomUUID(),calls:any[]=[],disposers:Array<()=>Promise<void>>=[];
  const logs=new Map<string,{header:any;events:any[];inheritedEventCount:number}>();
  const events=[
    {seq:0,type:'turn/start',data:{turn:1}},
    {seq:1,type:'user/message',data:{id:'u1',source:{kind:'user',rpcId:'request-one'},content:[{type:'text',text:'first'}]}},
    {seq:2,type:'turn/end',data:{turn:1}},
    {seq:3,type:'turn/start',data:{turn:2}},
    {seq:4,type:'user/message',data:{id:'u2',source:{kind:'user',rpcId:'supplement'},content:[{type:'text',text:'supplement'}]}},
    {seq:5,type:'assistant/message',data:{turn:2,step:1,message:{content:[{type:'text',text:'answer'}]}}},
    {seq:6,type:'turn/end',data:{turn:2}},
    {seq:7,type:'turn/start',data:{turn:3}},
  ];
  logs.set(parent,{header:{id:parent,cwd},events,inheritedEventCount:0});
  const destination=new Map<string,any>();
  const bridge=async(store:Map<string,any>,name:string)=>{
    const addressFile=join(root,name+'.json');
    const ctx={sessionPersistence:{
      async open(id:string){const data=store.get(id);assert.ok(data);return {header:data.header,inheritedEventCount:data.inheritedEventCount,async read(){return {events:data.events};},async [Symbol.asyncDispose](){}};},
      async create(header:any,options:any){assert.ok(!store.has(header.id));const data={header,inheritedEventCount:options.inheritedEventCount,events:[]};store.set(header.id,data);return {async append(events:any[]){data.events=events as never[];},async flush(){},async [Symbol.asyncDispose](){}};},
    },on(_event:string,dispose:()=>Promise<void>){disposers.push(dispose);}};
    const previous=process.env.BUILDR_DSH_FORK_KEY;process.env.BUILDR_DSH_FORK_KEY='private-test-key';
    try{await transferPlugin(ctx,{addressFile});}finally{if(previous===undefined)delete process.env.BUILDR_DSH_FORK_KEY;else process.env.BUILDR_DSH_FORK_KEY=previous;}
    return {key:'private-test-key',addressFile,patch:join(root,name+'-unused.json')};
  };
  const remote=(store:Map<string,any>)=>({session:{
    follow({address}:any){const record=store.get(address.sessionId);return {async *[Symbol.asyncIterator](){yield {type:'snapshot',header:record.header,cursor:record.events.at(-1).seq};},dispose(){}};},
    async page({address}:any){return {ok:true,value:{records:store.get(address.sessionId).events.map((event:any)=>({event})),hasMore:false}};},
    async fork(input:any){calls.push(input);const record=store.get(input.sessionId),prefix=record.events.filter((event:any)=>event.seq<=input.atSeq);store.set(child,{header:{id:child,cwd,parentSession:parent,isSeeded:true},events:prefix,inheritedEventCount:prefix.length});return {ok:true,value:{sessionId:child}};},
  }});
  const make=(store:Map<string,any>,binding:string)=>Reflect.construct(DshRuntime,[binding,{close:async()=>{}},{remote:remote(store),ctx:{}}]) as AgentRuntime;
  const source=make(logs,'source'),target=make(destination,'target');
  try{
    (source as any).forkBridge=await bridge(logs,'source');(target as any).forkBridge=await bridge(destination,'target');
    const ref=(source as any).context(parent,cwd);let known='';
    const fork=await target.forkContext!({source,contextRef:ref,cwd,executionRef:{id:'request-one'},inputItemIds:['request-one','supplement'],itemId:'assistant:2:1',onCreated:value=>{known=value.id;}});
    assert.equal(known,child);assert.equal(fork.id,child);assert.equal(calls[0].atSeq,6);
    assert.equal(destination.get(child).events.length,7);assert.equal(logs.get(parent)!.events.length,8);
    assert.deepEqual((await target.readHistory({contextRef:fork,cwd})).map(item=>item.text),['first','supplement','answer']);
  }finally{for(const dispose of disposers)await dispose();await source.close();await target.close();await rm(root,{recursive:true,force:true});}
});
