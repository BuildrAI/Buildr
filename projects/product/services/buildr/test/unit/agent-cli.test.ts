import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAgentArgs, executeAgentCommand, connectLocalAgentHttp, createAgentCliContributions, formatAgentList } from '../../src/modules/agent-service/interfaces/cli/agent.ts';
const id = '12345678-1234-1234-1234-123456789abc';
const run = { id: 'run', participantId: 'participant', generation: 'generation', status: 'running' };
function mock(replies: any[]) {
  const calls: Array<{route: string; body?: any}> = [];
  return { calls, request: async (route: string, body?: any) => { calls.push({route, body}); const value = replies.shift(); if (value instanceof Error) throw value; return value; } };
}
test('agent exposes seven commands and strictly parses arguments before effects', () => {
  assert.deepEqual(createAgentCliContributions().map(item => item.key), ['agent send','agent read','agent stop','agent list','agent reply','agent continue','agent supplement']);
  for (const [action, args] of [['send', []], ['send', [' ']], ['read', ['bad']], ['stop', [id, '--connection', 'x']], ['send', ['hi', '--json', '--json']], ['read', [id, '--limit', '0']], ['send', ['hi', '--target', '.', '--workspace-id', id]], ['send', ['hi', 'extra']]] as Array<[string,string[]]>) assert.throws(() => parseAgentArgs(action,args));
  assert.equal(parseAgentArgs('send',['你好']).value,'你好');
  assert.throws(()=>parseAgentArgs('send',['你好','--connection','codex']));
});
test('send composes create, prepare, send with preview revision/token and request id; no task writes', async () => {
  const m = mock([{connections:[{id:'codex',enabled:true,status:'ready'}]}, {id,revision:'r1'}, {fits:true,revision:'r2',token:'preview'}, {conversation:{id}}]);
  assert.deepEqual(await executeAgentCommand(parseAgentArgs('send',['你好']),id,m.request), {conversation:{id}});
  assert.equal(m.calls.length,4);
  assert.deepEqual(m.calls[1].body,{});
  assert.equal(m.calls[2].route.endsWith('/prepare-send'),true);
  assert.deepEqual(m.calls[3].body, {expectedRevision:'r2',connectionId:'codex',text:'你好',previewToken:'preview',clientRequestId:m.calls[3].body.clientRequestId});
  assert.match(m.calls[3].body.clientRequestId,/^[a-f0-9-]{36}$/);
  assert.equal(m.calls.some(call=>call.route.includes('/tasks')),false);
});
test('ambiguous connection causes no create; failed send preserves conversation id without replay', async () => {
  const m = mock([{connections:['a','b'].map(id=>({id,enabled:true,status:'ready'}))}]);
  await assert.rejects(executeAgentCommand(parseAgentArgs('send',['hi']),id,m.request),/多个/);
  assert.equal(m.calls.length,1);
  const failed = mock([{connections:[{id:'a',enabled:true,status:'ready'}]},{id,revision:'r'},new Error('timeout')]);
  await assert.rejects(executeAgentCommand(parseAgentArgs('send',['hi']),id,failed.request), error => (error as any).conversationId === id && String(error).includes(id));
  assert.equal(failed.calls.length,3);
});
test('read observes then reads paged entries, never seen or reply', async () => {
  const m = mock([{id,run}, {id,entries:[{text:'progress'}]}]);
  const result = await executeAgentCommand(parseAgentArgs('read',[id,'--limit','10','--before','20']),id,m.request);
  assert.equal(result.entries[0].text,'progress');
  assert.equal(m.calls[0].route.endsWith('/observe'),true);
  assert.equal(m.calls[1].route.endsWith('/entries?before=20&limit=10'),true);
  assert.equal(m.calls[1].body,undefined);
});
test('stop uses observed identity and version; no run and already stopping are no-ops; conflicts are not retried', async () => {
  const m = mock([{id,revision:'r',run},{id}]);
  await executeAgentCommand(parseAgentArgs('stop',[id]),id,m.request);
  assert.deepEqual(m.calls[1].body,{expectedRevision:'r',runId:'run',participantId:'participant',generation:'generation'});
  for (const value of [{id},{id,run:{...run,stopRequested:true}},{id,run:{...run,status:'completed'}}]) {
    const idle = mock([value]); await executeAgentCommand(parseAgentArgs('stop',[id]),id,idle.request); assert.equal(idle.calls.length,1);
  }
  const conflict = mock([{id,revision:'r',run},new Error('conflict')]);
  await assert.rejects(executeAgentCommand(parseAgentArgs('stop',[id]),id,conflict.request),/conflict/);
  assert.equal(conflict.calls.length,2);
});
test('HTTP client rejects non-loopback instance before network access', async () => {
  let called = false;
  await assert.rejects(connectLocalAgentHttp({url:'http://example.com:80',pid:1,secret:'secret'},async()=>{called=true;throw Error();}));
  assert.equal(called,false);
});
test('HTTP client reuses session, refuses redirects, sets finite timeout and preserves HTTP error', async () => {
  const calls: Array<{url:string;init:RequestInit}> = [];
  const fetcher = async (url: any, init: any) => {
    calls.push({url:String(url),init});
    if (String(url).endsWith('/health')) return Response.json({schemaVersion:'buildr.local-app-health/v1',status:'ready',pid:1});
    if (String(url).endsWith('/')) return new Response('<meta name="buildr-session" content="session" />');
    return Response.json({error:{code:'revision_conflict',message:'changed'}},{status:409});
  };
  const request = await connectLocalAgentHttp({url:'http://127.0.0.1:1234',pid:1,secret:'secret'},fetcher as typeof fetch);
  await assert.rejects(request('/api/v1/test',{}), error => (error as any).code === 'revision_conflict');
  assert.equal(calls.every(call=>call.init.redirect==='error' && call.init.signal),true);
  assert.deepEqual(calls[2].init.headers,{'x-buildr-session':'session',origin:'http://127.0.0.1:1234','content-type':'application/json'});
});

test('local HTTP transport composes all three commands without external executors', async () => {
  const { createServer } = await import('node:http');
  const calls: string[] = [];
  let revision = 'r1';
  const server = createServer(async (req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url === '/api/v1/health') {
      assert.equal(req.headers['x-buildr-instance'],'secret');
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({schemaVersion:'buildr.local-app-health/v1',status:'ready',pid:process.pid})); return;
    }
    if (req.url === '/') {res.end('<meta name="buildr-session" content="session" />');return;}
    assert.equal(req.headers['x-buildr-session'],'session');
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    let result: any;
    if (req.url?.endsWith('/connections')) result = {connections:[{id:'codex',enabled:true,status:'ready'}]};
    else if (req.url?.endsWith('/agent-conversations')) {assert.deepEqual(body,{});result={id,revision};}
    else if (req.url?.endsWith('/prepare-send')) {assert.equal(body.expectedRevision,revision);result={fits:true,token:'preview',revision};}
    else if (req.url?.endsWith('/send')) {assert.equal(body.previewToken,'preview');revision='r2';result={conversation:{id,revision,run}};}
    else if (req.url?.endsWith('/observe')) result={id,revision,run};
    else if (req.url?.endsWith('/entries')) result={id,revision,entries:[{text:'progress'}],run};
    else if (req.url?.endsWith('/stop')) {assert.deepEqual(body,{expectedRevision:revision,runId:run.id,participantId:run.participantId,generation:run.generation});result={id,revision:'r3',run:{...run,stopRequested:true}};}
    else {res.statusCode=404;result={error:{message:'unexpected route'}};}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(result));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const port = (server.address() as import('node:net').AddressInfo).port;
    const request = await connectLocalAgentHttp({url:`http://127.0.0.1:${port}`,pid:process.pid,secret:'secret'});
    const sent = await executeAgentCommand(parseAgentArgs('send',['hi']),id,request);
    assert.equal(sent.conversation.id,id);
    assert.equal((await executeAgentCommand(parseAgentArgs('read',[id]),id,request)).entries[0].text,'progress');
    assert.equal((await executeAgentCommand(parseAgentArgs('stop',[id]),id,request)).run.stopRequested,true);
    assert.equal(calls.length,10);
    assert.equal(calls.some(call=>call.includes('/tasks')),false);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});

const pending = { id, runId: 'original-run', participantId: 'original-participant', generation: 'original-generation' };
const idle = { id, revision:'r1',participants:[{id:'participant',connectionId:'codex',model:'model'}],requests:[],run:{...run,status:'completed'} };
test('new arguments and workspace identities fail before requests',async()=>{
  for(const [action,args] of [['list',['extra']],['reply',[id,id]],['reply',[id,'bad','回答']],['continue',[id,' ']],['continue',[id,'消息','--connection','other']]] as Array<[string,string[]]>) assert.throws(()=>parseAgentArgs(action,args));
  for(const workspace of ['','bad']) for(const [action,args] of [['list',[]],['reply',[id,id,'拒绝']],['continue',[id,'继续']]] as Array<[string,string[]]>) {const m=mock([]);await assert.rejects(executeAgentCommand(parseAgentArgs(action,args),workspace,m.request));assert.equal(m.calls.length,0);}
});
test('list traverses pages including hidden conversations with filters',async()=>{
  const m=mock([{conversations:[{id}],nextCursor:'a/b?c'},{conversations:[{id:'other'}]}]);
  assert.equal((await executeAgentCommand(parseAgentArgs('list',['--query','中文','--limit','2']),id,m.request)).conversations.length,2);
  const q=new URL('http://localhost'+m.calls[1].route).searchParams;
  assert.equal(q.get('cursor'),'a/b?c');assert.equal(q.get('query'),'中文');assert.equal(q.get('hidden'),'true');assert.equal(q.get('limit'),'2');assert.ok(m.calls.every(c=>c.body===undefined));
  assert.match(formatAgentList([{id,title:'标题',updatedAt:'时间',run}]),/标题\t运行中\t时间/);
  const repeated=mock([{conversations:[],nextCursor:'x'},{conversations:[],nextCursor:'x'}]);await assert.rejects(executeAgentCommand(parseAgentArgs('list',[]),id,repeated.request),/游标重复/);
});
test('reply preserves explicit text and request identity; missing, processed and failed requests never retry',async()=>{
  const answer='  拒绝本次操作  ';const m=mock([{revision:'r',run,requests:[pending]},{id}]);
  await executeAgentCommand(parseAgentArgs('reply',[id,id,answer]),id,m.request);
  assert.ok(m.calls[0].route.endsWith('/observe'));assert.ok(m.calls[1].route.endsWith(`/requests/${id}/reply`));
  assert.deepEqual(m.calls[1].body,{expectedRevision:'r',runId:pending.runId,participantId:pending.participantId,generation:pending.generation,answer});
  const missing=mock([{revision:'r',requests:[]}]);await assert.rejects(executeAgentCommand(parseAgentArgs('reply',[id,id,'回答']),id,missing.request),/不存在/);assert.equal(missing.calls.length,1);
  const failed=mock([{revision:'r',requests:[pending]},new Error('已处理')]);await assert.rejects(executeAgentCommand(parseAgentArgs('reply',[id,id,'回答']),id,failed.request),/已处理/);assert.equal(failed.calls.length,2);
});
test('continue reuses context and refuses active, retained, pending or uncertain execution',async()=>{
  const m=mock([idle,{fits:true,revision:'r2',token:'preview'},{id}]);await executeAgentCommand(parseAgentArgs('continue',[id,'继续检查']),id,m.request);
  assert.equal(m.calls.length,3);assert.ok(m.calls[0].route.endsWith('/observe'));assert.deepEqual(m.calls[1].body,{expectedRevision:'r1',connectionId:'codex',model:'model',text:'继续检查'});assert.equal(m.calls[2].body.expectedRevision,'r2');assert.equal(m.calls[2].body.previewToken,'preview');assert.ok(m.calls.every(c=>c.route.includes('/'+id+'/')));
  for(const state of [{run},{run:{...run,status:'unknown'}},{retainedRuns:[run]},{requests:[pending]},{pendingSend:{state:'waiting'}}]){const m=mock([{...idle,...state}]);await assert.rejects(executeAgentCommand(parseAgentArgs('continue',[id,'消息']),id,m.request),/仅支持空闲/);assert.equal(m.calls.length,1);}
  const failed=mock([idle,{fits:true,revision:'r2',token:'preview'},new Error('冲突')]);await assert.rejects(executeAgentCommand(parseAgentArgs('continue',[id,'消息']),id,failed.request),/冲突/);assert.equal(failed.calls.length,3);
});
test('local HTTP server executes list reply and continue',async()=>{
  const {createServer}=await import('node:http');const calls:Array<{url:string;body:any}>=[];
  const server=createServer(async(req,res)=>{
    if(req.url==='/api/v1/health'){res.end(JSON.stringify({schemaVersion:'buildr.local-app-health/v1',status:'ready',pid:process.pid}));return;}
    if(req.url==='/'){res.end('<meta name="buildr-session" content="session" />');return;}
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
    calls.push({url:req.url!,body});assert.equal(req.headers['x-buildr-session'],'session');const url=req.url!;
    let result:any=url.includes('?hidden=')?{conversations:[{id,title:'本机对话',updatedAt:'时间'}]}:url.endsWith('/observe')?{...idle,requests:calls.some(c=>c.url.endsWith('/reply'))?[]:[pending]}:url.endsWith('/prepare-send')?{fits:true,revision:'r2',token:'preview'}:{id};
    res.setHeader('content-type','application/json');res.end(JSON.stringify(result));
  });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const port=(server.address() as import('node:net').AddressInfo).port;const request=await connectLocalAgentHttp({url:`http://127.0.0.1:${port}`,pid:process.pid,secret:'secret'});
    assert.equal((await executeAgentCommand(parseAgentArgs('list',[]),id,request)).conversations[0].title,'本机对话');await executeAgentCommand(parseAgentArgs('reply',[id,id,'拒绝']),id,request);await executeAgentCommand(parseAgentArgs('continue',[id,'继续']),id,request);
    assert.equal(calls.length,6);assert.equal(calls[2].body.answer,'拒绝');assert.equal(calls[5].body.previewToken,'preview');assert.ok(calls.every(c=>!/supplement|pending-send|tasks/.test(c.url)));
  }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('send forwards explicit permission overrides and rejects invalid mode before effects', async () => {
  assert.throws(() => parseAgentArgs('send', ['hi', '--permission-mode', 'invalid']));
  for (const mode of ['default', 'full-access']) {
    const m = mock([{connections:[{id:'codex',enabled:true,status:'ready'}]}, {id,revision:'r1'}, {fits:true,revision:'r2',token:'preview'}, {conversation:{id}}]);
    await executeAgentCommand(parseAgentArgs('send', ['hi', '--permission-mode', mode]), id, m.request);
    assert.equal(m.calls[2].body.permissionMode, mode);
    assert.equal(m.calls[3].body.permissionMode, mode);
  }
});

const card = { id, kind: 'question', runId: run.id, participantId: run.participantId, generation: run.generation,
  questions: [{id:'plan',label:'方案',options:[{id:'a',label:'甲'},{id:'b',label:'乙'}]}, {id:'notes',label:'补充',allowOther:true,options:[{id:'later',label:'稍后'}]}] };
test('reply submits explicit option IDs and other text as the native card answer', async () => {
  for (const args of [ ['--option','plan=a','--other','notes=x=y'], ['--answer-json','{"plan":["a"],"notes":["x=y"]}'] ]) {
    const m = mock([{revision:'r',requests:[card]}, {ok:true}]);
    await executeAgentCommand(parseAgentArgs('reply',[id,id,...args]),id,m.request);
    assert.deepEqual(m.calls[1].body,{expectedRevision:'r',runId:'run',participantId:'participant',generation:'generation',answer:{plan:['a'],notes:['x=y']}});
  }
});
test('reply rejects mixed inputs and malformed JSON before HTTP', () => {
  for (const args of [[],['text','--option','q=a'],['--answer-json','{'],['--answer-json','[]'],['--answer-json','null'],['--answer-json','{}','--other','q=x'],['--option','=a'],['--other','q= '],['--answer-json','{}','--answer-json','{}']]) assert.throws(()=>parseAgentArgs('reply',[id,id,...args]));
});
test('invalid card answers never call reply; text resembling JSON stays text for plain requests', async () => {
  for (const args of [ ['text'], ['--option','plan=甲','--other','notes=x'], ['--option','plan=a'], ['--option','plan=a','--option','plan=b','--other','notes=x'], ['--other','plan=x','--other','notes=x'], ['--option','plan=a','--option','plan=a','--other','notes=x'], ['--answer-json','{"plan":"a","notes":"x","unknown":"x"}'], ['--answer-json','{"plan":"a","notes":[]}'] ]) {
    const m=mock([{revision:'r',requests:[card]}]);
    await assert.rejects(executeAgentCommand(parseAgentArgs('reply',[id,id,...args]),id,m.request));
    assert.equal(m.calls.length,1);
  }
  const m=mock([{revision:'r',requests:[{...card,questions:undefined}]},{}]);
  await executeAgentCommand(parseAgentArgs('reply',[id,id,'{"q":"a"}']),id,m.request);
  assert.equal(m.calls[1].body.answer,'{"q":"a"}');
});
test('multiple selections and prototype-like question IDs remain explicit own values', async () => {
  const m=mock([{revision:'r',requests:[{...card,questions:[{id:'__proto__',multiple:true,options:[{id:'a'},{id:'b'}]}]}]},{}]);
  await executeAgentCommand(parseAgentArgs('reply',[id,id,'--option','__proto__=a','--option','__proto__=b']),id,m.request);
  assert.deepEqual(m.calls[1].body.answer,JSON.parse('{"__proto__":["a","b"]}'));
});
test('send explicitly skips current cards in the same conversation with observed identities and original configuration', async () => {
  const prior={...run,status:'waiting-question',model:'model',modelAccountId:'account',modelAccountIdentity:'identity',reasoningEffort:'high',serviceTier:'fast',permissionMode:'default'};
  const m=mock([{revision:'r',run:prior,requests:[card],participants:[{id:run.participantId,connectionId:'codex',model:'model',modelAccountId:'account'}]}, {fits:true,revision:'preview-r',token:'token'}, {id,pendingSend:{state:'waiting'}}]);
  const result=await executeAgentCommand(parseAgentArgs('send',['新内容','--conversation',id,'--skip-questions']),id,m.request);
  assert.equal(result.id,id);
  assert.deepEqual(m.calls.map(call=>call.route.split('/').at(-1)),['observe','prepare-send','pending-send']);
  const draft=m.calls[1].body;
  assert.deepEqual(draft.waitingHandoff,{intent:'new-turn',runId:'run',participantId:'participant',generation:'generation',requestIds:[id]});
  assert.equal(draft.text,'新内容');assert.equal(draft.modelAccountIdentity,'identity');assert.equal(draft.permissionMode,'default');assert.equal(draft.reasoningEffort,'high');
  assert.equal(m.calls[2].body.expectedRevision,'preview-r');
  assert.equal(m.calls.some(call=>call.route.includes('/tasks')||call.route.includes('/reply')||call.route.endsWith('/stop')),false);
});
test('skip requires paired flags and refuses approvals, stale identities, idle runs and pending sends without writes', async () => {
  for (const args of [['--skip-questions'],['--conversation',id],['--conversation','bad','--skip-questions'],['--conversation',id,'--skip-questions','--model','a']]) assert.throws(()=>parseAgentArgs('send',['hi',...args]));
  for(const chat of [{run,requests:[card]}, {run:{...run,status:'waiting-question'},requests:[]}, {run:{...run,status:'waiting-question'},requests:[{...card,kind:'approval'}]}, {run:{...run,status:'waiting-question'},requests:[{...card,generation:'old'}]}, {run:{...run,status:'waiting-question'},requests:[card],pendingSend:{}}]) {
    const m=mock([{revision:'r',...chat}]);
    await assert.rejects(executeAgentCommand(parseAgentArgs('send',['hi','--conversation',id,'--skip-questions']),id,m.request));assert.equal(m.calls.length,1);
  }
});

test('send selects only enabled ready connections and refuses zero usable connections before create', async () => {
  const connections=[{id:'off',enabled:false,status:'ready'},{id:'waiting',enabled:true,status:'unconfigured'},{id:'only',enabled:true,status:'ready'}];
  const m=mock([{connections},{id,revision:'r'},{fits:true,revision:'p',token:'t'},{}]);
  await executeAgentCommand(parseAgentArgs('send',['hi']),id,m.request);
  assert.equal(m.calls[2].body.connectionId,'only');
  const empty=mock([{connections:connections.slice(0,2)}]);
  await assert.rejects(executeAgentCommand(parseAgentArgs('send',['hi']),id,empty.request),/没有已启用且就绪/);
  assert.equal(empty.calls.length,1);
});
test('skip reports preview failure and queue conflicts without retry or creating another conversation', async () => {
  const observed={revision:'r',run:{...run,status:'waiting-question'},requests:[card],participants:[{id:run.participantId,connectionId:'codex'}]};
  for(const replies of [[observed,{fits:false,diagnostic:'too large'}],[observed,{fits:true,revision:'p'},new Error('conflict')]]) {
    const expectedCalls=replies.length;
    const m=mock(replies);
    await assert.rejects(executeAgentCommand(parseAgentArgs('send',['hi','--conversation',id,'--skip-questions']),id,m.request));
    assert.equal(m.calls.length,expectedCalls);
    assert.equal(m.calls[0].route.endsWith('/observe'),true);
  }
});

test('supplement inserts into the observed running execution without creating a conversation or answering cards',async()=>{
  const m=mock([{run:{...run,accepted:true}}, {delivery:'accepted'}]);
  await executeAgentCommand(parseAgentArgs('supplement',[id,'补充内容']),id,m.request);
  assert.equal(m.calls.length,2);assert.equal(m.calls[1].route.endsWith('/supplement'),true);
  assert.deepEqual(m.calls[1].body,{sameRunOnly:true,runId:run.id,participantId:run.participantId,generation:run.generation,text:'补充内容',clientRequestId:m.calls[1].body.clientRequestId});
  assert.equal(m.calls.some(call=>call.route.includes('/reply')||call.route.endsWith('/send')),false);
  for(const current of [{...run,accepted:false},{...run,accepted:true,status:'unknown'},{...run,accepted:true,status:'completed'},{...run,accepted:true,status:'waiting-question'}]){
    const blocked=mock([{run:current}]);await assert.rejects(executeAgentCommand(parseAgentArgs('supplement',[id,'hi']),id,blocked.request));assert.equal(blocked.calls.length,1);
  }
});
test('replay is retired and send still rejects model overrides',()=>{
  assert.throws(()=>parseAgentArgs('replay',[id,'a'.repeat(64)]));
  assert.throws(()=>parseAgentArgs('send',['hi','--model','model']));
});
