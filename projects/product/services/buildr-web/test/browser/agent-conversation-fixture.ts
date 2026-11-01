import assert from 'node:assert/strict';
import {resolveQuestionAnswer,questionAnswerDisplay} from '../../../buildr-agent/src/domain/question-answer.ts';
import type {ConnectionView} from '../../src/features/agent-conversations/types.ts';

/** Actual hosted UI; only the new HTTP transport is replaced with explicit fixtures. */
export async function createAgentConversationFixture({t,page,workspaceUrl,workspaceRoot,capture:capturePage,expectedBrowserErrors}:any){
  const capture=async(target:any,name:string)=>{if(!process.env.BUILDR_AGENT_CAPTURE_FAILURE_ONLY||name.includes('failure'))await capturePage(target,name);};
  let reminderPaging=false,reminderReadFailure=false;
  const taskRequests:Array<Record<string,unknown>>=[];
  const selectTrace:Array<Record<string,unknown>>=[];
  const taskRequest=(request:any)=>/\/api\/v1\/workspaces\/[^/]+\/(?:tasks|workspace|agent-conversations)|\/api\/v1\/workspaces\/[^/]+$/.test(request.url());
  page.on('request',(request:any)=>{if(taskRequest(request))taskRequests.push({at:Date.now(),event:'request',method:request.method(),url:request.url()});});
  page.on('response',(response:any)=>{if(taskRequest(response.request()))taskRequests.push({at:Date.now(),event:'response',status:response.status(),url:response.url()});});
  page.on('requestfailed',(request:any)=>{if(taskRequest(request))taskRequests.push({at:Date.now(),event:'failed',failure:request.failure(),url:request.url()});});
  const workspaceId=decodeURIComponent(new URL(workspaceUrl).pathname.split('/').filter(Boolean).at(-1)!);
  const capabilities:ConnectionView['capabilities']={supplement:true,text:true,images:true,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536,permissionModes:['default','full-access']};
  const connections=(['codex','dsh','qoder'] as const).map((provider):ConnectionView=>({id:provider,provider,label:provider==='dsh'?'DSH':provider==='codex'?'Codex':'Qoder',revision:'connection-1',status:'ready',enabled:true,configPath:'/isolated/'+provider,account:{label:'fixture account'},models:[{id:'fixture-model',label:'Fixture model',isDefault:true,...(provider==='codex'?{reasoningEfforts:[{id:'medium',label:'标准'},{id:'high',label:'深入'}],defaultReasoningEffort:'medium'}:{})},{id:'fixture-fast',label:'Fast model'}],capabilities:{...capabilities,images:provider==='codex'}}));
  const disconnectedAccounts=new Set<string>();let nativeLoginPosts=0;
  const preferenceOverrides=new Map<string,Map<string,{enabled?:boolean;contextWindow?:number|null}>>();
  const quotaOverrides=new Map<string,any>();
  const nativeAccounts=()=>connections.map(connection=>({id:'native-'+connection.id,identity:'identity-'+connection.id,connectionId:connection.id,provider:connection.provider,label:connection.label,accountLabel:'fixture account',revision:'model-account-'+connection.id,enabled:connection.enabled,status:disconnectedAccounts.has(connection.id)?'not-authenticated':connection.status,models:connection.models.map(model=>{const patch=preferenceOverrides.get('native-'+connection.id)?.get(model.id);const override=patch?.contextWindow===undefined?undefined:patch.contextWindow===null?undefined:patch.contextWindow;return {...model,enabled:patch?.enabled??true,contextWindow:override??32000,contextWindowOverride:override,images:connection.capabilities.images,tools:true};}),quota:quotaOverrides.get(connection.id)??{available:false,planLabel:'Fixture套餐',observedAt:'2026-10-25T00:00:00Z'}}));
  let catalogDiagnostic:string|undefined;
  let sharedModels:any[]=[];let latestPreview:any;let forceCapacity=false,prepareError:{code:string;message:string}|undefined;
  let loseFirstResponse=false;let draftImageRevision=0;const draftImages:any[]=[];const firstResponses=new Map<string,any>();
  let conversation:any=null,revision=0,sends=0,prepares=0,stops=0,replies=0,cursor=0,creations=0;
  let additionalConversations:any[]=[];
  const historyPages=new Map<number,any>();let entryReads=0,failEntryRead=false,holdEntryRead=false,releaseEntryRead:(()=>void)|undefined,entryReadStarted:(()=>void)|undefined;
  let additionalPending:any[]=[];
  let holdSend=false,releaseSend:(()=>void)|undefined,sendStarted:(()=>void)|undefined;
  let holdPrepare=false,releasePrepare:(()=>void)|undefined,prepareStarted:(()=>void)|undefined;
  let holdCreate=false,releaseCreate:(()=>void)|undefined,createStarted:(()=>void)|undefined;
  let holdConnections=false,releaseConnections:(()=>void)|undefined,connectionsStarted:(()=>void)|undefined;
  let unknownStop=false;
  let holdStop=false,releaseStop:(()=>void)|undefined,stopStarted:(()=>void)|undefined;
  let holdTaskList=false,releaseTaskList:(()=>void)|undefined,taskListStarted:(()=>void)|undefined;
  let holdTitle=false,releaseTitle:(()=>void)|undefined,titleStarted:(()=>void)|undefined,titleGenerations=0;
  let supplementaryCalls=0,holdSupplement=false,releaseSupplement:(()=>void)|undefined,supplementStarted:(()=>void)|undefined;let supplementaryDelivery:'accepted'|'rejected'|'unknown'='accepted';
  const supplementaryInputs:any[]=[];
  const uploadedMedia=new Map<string,{mimeType:string;bytes:Buffer;video?:any}>();
  let attachmentUploads=0,holdUploadAt=0,releaseUpload:(()=>void)|undefined,uploadStarted:(()=>void)|undefined;
  let preferencePosts=0,holdPreferences=false,releasePreferences:(()=>void)|undefined,preferencesStarted:(()=>void)|undefined;
  const preferenceBodies:any[]=[];
  let connectionProbeBarrier:Promise<void>|undefined,releaseConnectionProbe:(()=>void)|undefined;
  let connectionReads=0,conversationReads=0,connectionEventProbe=false,dropEventStreams=0,eventStreams=0,observes=0,recoverNextObserve=false;
  let eventStreamHook:(()=>void|Promise<void>)|undefined;
  let programScenario='ready';
  const programAttempts:Record<string,any>={};
  const preparedInputs:any[]=[],sentInputs:any[]=[];
  const update=(input:any={})=>conversation={...conversation,...input,revision:'r'+(++revision),updatedAt:new Date().toISOString()};
  const run=(status:string,provider='codex',options:any={})=>({id:'run-fixture',participantId:'participant-'+provider,provider,generation:'generation-fixture',status,accepted:true,permissionMode:'default',tools:[],startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...options});
  const route=async(route:any)=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    if(url.pathname.endsWith('/warmup'))return route.fulfill({json:{prepared:true}});
    if(url.pathname.startsWith('/api/v1/app/agent-service/program-updates'))return route.fulfill({json:{programs:connections.map(connection=>({connectionId:connection.id,provider:connection.provider,label:connection.label,revision:connection.revision,executable:connection.enabled?'/isolated/'+connection.id:undefined,status:connection.enabled?'unchecked':'not-connected',managed:true,versionKind:'program',packageName:connection.id,updateUrl:'https://fixture.invalid'}))}});
    if(url.pathname==='/api/v1/app/agent-service/model-catalog'){return route.fulfill({json:{models:sharedModels,hasSnapshot:sharedModels.length>0,...(catalogDiagnostic?{diagnostic:catalogDiagnostic}:{})}});}
    if(url.pathname==='/api/v1/app/agent-service/model-accounts')return route.fulfill({json:{accounts:nativeAccounts(),providers:[]}});
    if(url.pathname.startsWith('/api/v1/app/agent-service/model-accounts/')){
      const parts=url.pathname.split('/'),account=nativeAccounts().find(item=>item.id===parts[6]);assert.ok(account,'model action targets an observed native account');
      if(method==='POST'){const body=request.postDataJSON();assert.equal(body.expectedRevision,account.revision);
        if(parts[7]==='preferences'){preferencePosts++;preferenceBodies.push(body);const store=preferenceOverrides.get(account.id)??new Map();preferenceOverrides.set(account.id,store);for(const row of body.models??[])store.set(row.id,{enabled:row.enabled,contextWindow:row.contextWindow});if(holdPreferences){holdPreferences=false;await new Promise<void>(resolve=>{releasePreferences=resolve;preferencesStarted?.();});}}
        if(parts[7]==='disconnect'){const connection=connections.find(item=>item.id===account.connectionId)!;disconnectedAccounts.add(connection.id);}}
      return route.fulfill({json:nativeAccounts().find(item=>item.id===account.id)});
    }
    if(url.pathname==='/api/v1/app/agent-service/connections'){connectionReads++;const observed=JSON.parse(JSON.stringify(connections));if(holdConnections){holdConnections=false;await new Promise<void>(resolve=>{releaseConnections=resolve;connectionsStarted?.();});}return route.fulfill({json:{connections:observed}});}
    if(url.pathname==='/api/v1/app/agent-service/pending-requests')return route.fulfill({json:{conversations:[...(conversation&&['waiting-approval','waiting-question','unknown','tools-active'].includes(conversation.run?.status)?[conversation]:[]),...additionalPending]}});
    if(url.pathname==='/api/v1/app/agent-service/conversations'&&method==='GET'){
      // 全空间列表夹具按服务端语义过滤：活动判断与 conversation-activity 的 activityState 一致。
      const active=(item:any)=>Boolean(item.activity?.active||(item.activity&&item.activity.version>item.activity.seenThrough)||['starting','running','stopping','tools-active','waiting-approval','waiting-question','unknown'].includes(item.run?.status));
      let rows=[...(conversation&&(conversation.entries.length||conversation.run)?[conversation]:[]),...additionalConversations,...additionalPending];
      const workspaceIdFilter=url.searchParams.get('workspaceId'),scoped=workspaceIdFilter?rows.filter(item=>item.workspaceId===workspaceIdFilter):rows;
      const statGroup=(field:string)=>{const counts=new Map<string,number>();for(const row of scoped){if(!['starting','running','stopping','tools-active'].includes(row.run?.status))continue;const key=row.run?.[field]||'未指定';counts.set(key,(counts.get(key)||0)+1);}return [...counts].map(([label,count])=>({label,count}));};
      const state=(item:any)=>item.run?.status==='unknown'?'unknown':['waiting-approval','waiting-question'].includes(item.run?.status)?'waiting':['starting','running','stopping','tools-active'].includes(item.run?.status)?'running':item.activity&&item.activity.version>item.activity.seenThrough?'unseen':null;
      const activityCounts={active:0,running:0,waiting:0,unseen:0,unknown:0,attention:0};
      for(const row of scoped){const key=state(row) as 'running'|'waiting'|'unseen'|'unknown'|null;if(key){activityCounts[key]++;activityCounts.active++;if(key!=='running')activityCounts.attention++;}}
      const executions=[...new Set(scoped.filter(row=>state(row)==='running').map(row=>JSON.stringify([row.run?.provider||'未指定',row.run?.model||'未指定'])))].map(key=>{const [provider,model]=JSON.parse(key);return {provider,model,count:scoped.filter(row=>state(row)==='running'&&(row.run?.provider||'未指定')===provider&&(row.run?.model||'未指定')===model).length};});
      const modelExecutions=[...new Set(scoped.filter(row=>state(row)==='running').map(row=>JSON.stringify([row.run?.modelAccountId||'fixture-account',row.run?.model||'未指定'])))].map(key=>{const [accountId,model]=JSON.parse(key);return {accountId,accountLabel:'测试账号',model,count:scoped.filter(row=>state(row)==='running'&&(row.run?.modelAccountId||'fixture-account')===accountId&&(row.run?.model||'未指定')===model).length};});
      const category=url.searchParams.get('activityState');if(category)rows=rows.filter(row=>category==='attention'?['waiting','unseen','unknown'].includes(state(row)??''):state(row)===category);
      if(url.searchParams.get('activeOnly'))rows=rows.filter(active);
      else {const hidden=url.searchParams.get('hidden')==='true';rows=rows.filter(item=>active(item)||Boolean(item.hidden)===hidden);}
      if(url.searchParams.get('workspaceId'))rows=rows.filter(item=>item.workspaceId===url.searchParams.get('workspaceId'));
      if(url.searchParams.get('query')){const query=url.searchParams.get('query')!.toLowerCase();rows=rows.filter(item=>String(item.title||'').toLowerCase().includes(query)||(item.entries||[]).some((entry:any)=>String(entry.text||'').toLowerCase().includes(query)));}
      if(reminderReadFailure&&category)return route.fulfill({status:503,json:{error:{code:'fixture_unavailable',message:'模拟分组读取失败'}}});
      const priority=(row:any)=>['waiting','unseen'].includes(state(row)??'')?2:active(row)?1:0;
      rows.sort((a:any,b:any)=>priority(b)-priority(a)||(b.activity?.userInputAt||b.updatedAt||'').localeCompare(a.activity?.userInputAt||a.updatedAt||'')||b.id.localeCompare(a.id));
      const total=rows.length,offset=Number(url.searchParams.get('cursor')||0),limit=Number(url.searchParams.get('limit')||(reminderPaging?100:30));
      const nextCursor=offset+limit<rows.length?String(offset+limit):undefined;
      return route.fulfill({json:{conversations:rows.slice(offset,offset+limit),nextCursor,total,activityCounts,stats:{agents:statGroup('provider'),models:statGroup('model'),executions,modelExecutions}}});
    }
    if(url.pathname.startsWith('/api/v1/app/agent-service/connections/')){
      const parts=url.pathname.split('/'),connection=connections.find(item=>item.id===parts[6]) as any;assert.ok(connection);
      const action=parts[7];
      if(action==='preparation-attempts'){
        if(method==='GET')return route.fulfill({json:parts[8]?{...programAttempts[connection.id],connection}:{attempt:programAttempts[connection.id]?{...programAttempts[connection.id],connection}:null}});
        if(parts.at(-1)==='cancel'){programAttempts[connection.id].state='cancelled';programAttempts[connection.id].message='已取消本次准备；已有程序、账号和对话均保留。';return route.fulfill({json:{...programAttempts[connection.id],connection}});}
        const body=request.postDataJSON();assert.equal(body.expectedRevision,connection.revision);
        if(['discovering','installing','connecting','waiting-login'].includes(programAttempts[connection.id]?.state))return route.fulfill({status:409,json:{error:{code:'agent_preparation_busy',message:'当前准备尚未结束，请先取消本次准备。'}}});
        const state=body.install?'installing':programScenario==='missing'?'installation-required':programScenario==='multiple'&&!body.executable?'selection-required':programScenario==='login'?'waiting-login':'ready';
        const candidates=programScenario==='multiple'||programScenario==='login'?[{executable:'/isolated/codex-a',source:'path',label:'本机命令行',version:'0.163.0',compatible:true},{executable:'/isolated/codex-b',source:'application',label:'ChatGPT 内的 Codex',version:'0.163.0-alpha.11.2',compatible:true}]:[];
        if(state==='ready'){connection.enabled=true;connection.status='ready';if(connection.loginAttempt)connection.loginAttempt.state='completed';connection.revision='connection-'+(++revision);}
        if(state==='waiting-login'){connection.enabled=true;connection.status='not-authenticated';connection.loginAttempt={id:'login-fixture',generation:'login-generation',state:'waiting-browser',updatedAt:new Date().toISOString(),url:'https://auth.openai.com/fixture-login'};connection.revision='connection-'+(++revision);}
        const result={id:'prepare-fixture-'+(++revision),connectionId:connection.id,generation:'fixture-generation',state,message:state==='installation-required'?'尚未发现兼容程序，请安装后重新检查。':state==='selection-required'?'发现多个兼容程序，请选择来源。':state==='waiting-login'?'程序已就绪，请完成官方登录。':state==='installing'?'正在下载并准备独立程序。':'程序已就绪。',updatedAt:new Date().toISOString(),catalog:{candidates,installation:{label:'ChatGPT App',version:'0.163.0',url:'https://learn.chatgpt.com/docs/quickstart?setup=app',canInstall:true}},connection};
        programAttempts[connection.id]=result;return route.fulfill({status:202,json:result});
      }
      if(method==='GET')return route.fulfill({json:connection});
      if(action==='login-attempts'&&!parts[8]){nativeLoginPosts++;disconnectedAccounts.delete(connection.id);connection.status='not-authenticated';connection.loginAttempt={id:'login-fixture',generation:'login-generation',state:'waiting-browser',updatedAt:new Date().toISOString(),url:'https://auth.openai.com/fixture-login'};}
      else if(action==='login-attempts'&&parts.at(-1)==='cancel'){assert.equal(request.postDataJSON().expectedRevision,connection.revision);connection.loginAttempt.state='cancelled';}
      else if(action==='check'||action==='connect'){connection.enabled=true;connection.status='ready';if(connection.loginAttempt)connection.loginAttempt.state='completed';}
      else if(action==='disconnect'){connection.enabled=false;connection.status='disconnected';}
      connection.revision='connection-'+(++revision);return route.fulfill({json:connection});
    }
    // 默认工作空间的会话端点与工作空间前缀同构，走同一套夹具。
    const prefix=`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agent-conversations`,appPrefix='/api/v1/app/agent-service/conversations';
    const scoped=url.pathname.startsWith(prefix)?prefix:(url.pathname===appPrefix||url.pathname.startsWith(appPrefix+'/'))?appPrefix:'';
    if(!scoped)return route.fallback();
    const draftRoute=url.pathname.slice(scoped.length).match(/^\/drafts\/([^/]+)(?:\/(attachments|send|submissions)(?:\/([^/]+))?)?$/);
    if(draftRoute){
      const [,draftId,action,childId]=draftRoute;
      const snapshot=()=>({revision:'draft-images-'+draftImageRevision,images:[...draftImages]});
      if(method==='GET'&&!action)return route.fulfill({json:snapshot()});
      if(method==='GET'&&action==='submissions'){const value=firstResponses.get(draftId+':'+childId);return route.fulfill({json:value?{found:true,conversation:value.conversation}:{found:false}});}
      if(action==='attachments'&&method==='GET'){const stored=uploadedMedia.get(childId!);return route.fulfill(stored?{contentType:stored.mimeType,body:stored.bytes}:{status:404});}
      if(action==='attachments'&&method==='DELETE'){assert.equal(request.postDataJSON().expectedRevision,snapshot().revision);const index=draftImages.findIndex(image=>image.id===childId);if(index>=0){const removed=draftImages.splice(index,1)[0];for(const frame of removed.video?.frames??[]){const at=draftImages.findIndex(image=>image.id===frame.id);if(at>=0)draftImages.splice(at,1);}}draftImageRevision++;return route.fulfill({json:snapshot()});}
      if(action==='attachments'&&method==='POST'){
        assert.equal(request.headers()['x-buildr-draft-revision'],snapshot().revision);attachmentUploads++;
        const mimeType=request.headers()['content-type'],bytes=request.postDataBuffer()!,video=request.headers()['x-buildr-video']?JSON.parse(request.headers()['x-buildr-video']):undefined,frame=request.headers()['x-buildr-frame']==='true';
        const image={id:'image-fixture-'+attachmentUploads,name:decodeURIComponent(request.headers()['x-buildr-image-name']),mimeType,size:bytes.length,...(frame?{frame:true}:{}),...(video?{video}:{})};draftImages.push(image);uploadedMedia.set(image.id,{mimeType,bytes,video});draftImageRevision++;
        if(holdUploadAt===attachmentUploads){holdUploadAt=0;await new Promise<void>(resolve=>{releaseUpload=resolve;uploadStarted?.();});}
        return route.fulfill({json:snapshot()});
      }
      if(action==='send'&&method==='POST'){
        const body=request.postDataJSON(),previous=firstResponses.get(draftId+':'+body.clientRequestId);if(previous)return route.fulfill({json:previous});
        if(prepareError){const error=prepareError;prepareError=undefined;expectedBrowserErrors?.add(request.url());return route.fulfill({status:409,json:{error}});}
        assert.equal(body.expectedDraftRevision,snapshot().revision);creations++;
        conversation={id:'internal-fixture-'+creations,workspaceId:scoped===appPrefix?'@default':workspaceId,cwd:body.cwd||'/isolated/default',taskId:body.taskId,title:'浏览器验证对话',revision:'r'+(++revision),hidden:false,updatedAt:new Date().toISOString(),participants:[],entries:[],requests:[]};latestPreview=undefined;
        if(holdCreate){holdCreate=false;await new Promise<void>(resolve=>{releaseCreate=resolve;createStarted?.();});}
        // Continue through the shared send fixture below; there is no separate create HTTP call.
      }else return route.fulfill({status:404,json:{error:{code:'fixture_missing',message:'draft route missing'}}});
    }
    if(url.pathname===scoped){
      if(method==='GET'){if(holdTaskList&&url.searchParams.get('taskId')){holdTaskList=false;await new Promise<void>(resolve=>{releaseTaskList=resolve;taskListStarted?.();});}const rows=[...(conversation&&(conversation.entries.length||conversation.run)?[conversation]:[]),...additionalConversations];return route.fulfill({json:{conversations:rows.filter(item=>(scoped===appPrefix||item.workspaceId===workspaceId)&&(!url.searchParams.get('taskId')||item.taskId===url.searchParams.get('taskId')))}});}
      const body=request.postDataJSON();creations++;conversation={id:'internal-fixture-'+creations,workspaceId:scoped===appPrefix?'@default':workspaceId,cwd:body.cwd||'/isolated/default',taskId:body.taskId,title:'浏览器验证对话',revision:'r'+(++revision),hidden:false,updatedAt:new Date().toISOString(),participants:[],entries:[],requests:[]};const created=conversation;if(holdCreate){holdCreate=false;await new Promise<void>(resolve=>{releaseCreate=resolve;createStarted?.();});}return route.fulfill({json:created});
    }
    if(url.pathname.endsWith('/children')&&method==='GET')return route.fulfill({json:{conversations:[]}});
    if(url.pathname.endsWith('/entries')){entryReads++;assert.equal(url.searchParams.has('limit'),false,'历史请求使用服务端按轮默认分页');const value=historyPages.get(Number(url.searchParams.get('before')));assert.ok(value,'observed cursor resolves one fixture page');if(failEntryRead){failEntryRead=false;expectedBrowserErrors?.add(request.url());return route.fulfill({status:503,json:{error:{code:'history_fixture_unavailable',message:'更早记录暂时不可用'}}});}if(holdEntryRead){holdEntryRead=false;await new Promise<void>(resolve=>{releaseEntryRead=resolve;entryReadStarted?.();});}return route.fulfill({json:value});}
    if(url.pathname.endsWith('/events')){eventStreams++;await eventStreamHook?.();if(dropEventStreams>0){dropEventStreams--;return route.fulfill({contentType:'text/event-stream',body:''});}const target=[...additionalConversations,...additionalPending].find(item=>url.pathname.includes('/'+item.id+'/'))||conversation;if(!target)return route.fulfill({status:404,json:{error:'对话不存在或已移除'}});const events:Array<Record<string,unknown>>=[{cursor:++cursor,generation:'stream-fixture',type:'snapshot',workspaceId:target.workspaceId,conversationId:target.id,revision:target.revision,payload:{conversation:target}}];if(connectionEventProbe){await connectionProbeBarrier;connectionEventProbe=false;const stale={...connections[1],models:connections[1].models.map(item=>({...item,isDefault:item.id==='fixture-model'}))};const changed={cursor:++cursor,generation:'stream-fixture',type:'connection',workspaceId,conversationId:target.id,revision:target.revision,payload:{connection:stale}};events.push(changed as any,{...changed},{...changed,cursor:++cursor,generation:'stale-generation'},{...changed,cursor:++cursor,conversationId:'other-conversation'});}return route.fulfill({contentType:'text/event-stream',body:events.map(event=>`id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`).join('')});}
    if(url.pathname.endsWith('/attachments')&&method==='POST'){
      attachmentUploads++;
      if(conversation.attachmentRevision)assert.equal(request.headers()['x-buildr-attachment-revision'],conversation.attachmentRevision);else assert.equal(request.headers()['x-buildr-conversation-revision'],conversation.revision);
      const mimeType=request.headers()['content-type'];assert.ok(['image/png','image/jpeg','video/mp4','video/webm','video/quicktime'].includes(mimeType));
      const bytes=request.postDataBuffer(),video=request.headers()['x-buildr-video']?JSON.parse(request.headers()['x-buildr-video']):undefined;
      if(mimeType.startsWith('video/')){assert.ok(video?.frames.length>0&&video.frames.length<=8);for(const frame of video.frames)assert.equal(uploadedMedia.get(frame.id)?.mimeType,'image/jpeg');}
      update({attachmentRevision:'materials-'+attachmentUploads});
      const image={id:'image-fixture-'+attachmentUploads,mimeType,size:bytes.length,revision:conversation.revision,attachmentRevision:conversation.attachmentRevision};uploadedMedia.set(image.id,{mimeType,bytes,video});
      if(holdUploadAt===attachmentUploads){holdUploadAt=0;await new Promise<void>(resolve=>{releaseUpload=resolve;uploadStarted?.();});}return route.fulfill({json:image});
    }
    if(url.pathname.endsWith('/pending-send')){
      const body=request.postDataJSON(),previous=conversation.pendingSend;
      if(body.expectedPendingRevision&&previous?.revision!==body.expectedPendingRevision)return route.fulfill({status:409,json:{error:{code:'agent_pending_conflict',message:'待发送内容已经变化。'}}});
      const {clientRequestId,expectedPendingRevision,previousRunId,...draft}=body;
      conversation.pendingSend={id:clientRequestId,revision:'pending-'+(++revision),state:'waiting',draft,...(draft.waitingHandoff?{waitingQuestions:structuredClone(conversation.requests)}:{}),reason:draft.waitingHandoff?'正在结束原轮等待，确认后交给新模型。':'等待上一轮停止，新版就绪后将自动执行。',createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
      return route.fulfill({status:202,json:conversation});
    }
    if(url.pathname.endsWith('/cancel-pending-send')){
      const body=request.postDataJSON();if(conversation.pendingSend?.revision!==body.expectedPendingRevision)return route.fulfill({status:409,json:{error:{code:'agent_pending_conflict',message:'待发送内容已经变化。'}}});
      conversation.pendingSend=undefined;return route.fulfill({json:conversation});
    }
    if(url.pathname.endsWith('/prepare-send')){prepares++;const body=request.postDataJSON();preparedInputs.push(structuredClone(body));if(body.continueRunId)body.text='继续上次未完成的目标，核对已有成果后继续。';if(prepareError){const error=prepareError;prepareError=undefined;expectedBrowserErrors?.add(request.url());return route.fulfill({status:409,json:{error}});}const target=additionalConversations.find(item=>url.pathname.includes('/'+item.id+'/'))||conversation;const model=connections.find(item=>item.id===body.connectionId)?.models.find(item=>body.model?item.id===body.model:item.isDefault);const preview:any={modelAccountId:body.modelAccountId,modelAccountRevision:body.modelAccountRevision,modelAccountIdentity:body.modelAccountIdentity,serviceTier:body.serviceTier,token:'preview-fixture',conversationId:target.id,revision:target.revision,connectionId:body.connectionId,permissionMode:body.permissionMode||'default',model:model?.id,reasoningEffort:body.reasoningEffort||model?.defaultReasoningEffort,participantId:target.participants.find((item:any)=>item.connectionId===body.connectionId)?.id,cwd:target.cwd,text:body.text,history:target.entries.map((item:any)=>({sequence:item.sequence,role:item.role,provider:item.provider,text:item.text})),sourceThrough:target.entries.length,inputBytes:body.text.length,maxInputBytes:65536,fits:!forceCapacity,diagnostic:forceCapacity?'必要交接资料仍超出接收容量，请选择容量更大的模型；草稿与本地资料保留。':undefined,switching:target.participants.length>0&&(target.participants.at(-1).connectionId!==body.connectionId||target.run?.model!==(model?.id??body.model))};preview.handoff={agent:connections.find(item=>item.id===body.connectionId)?.label,model:model?.label||body.model||'默认模型',changes:[...(target.participants.length&&target.participants.at(-1).connectionId!==body.connectionId?[{kind:'agent',label:'智能体',before:target.participants.at(-1).label,after:connections.find(item=>item.id===body.connectionId)?.label}]:[]),...(target.run&&target.run.model!==(model?.id??body.model)?[{kind:'model',label:'模型',before:target.run.model||'默认模型',after:model?.label||body.model||'默认模型'}]:[])],rounds:target.entries.filter((e:any)=>e.role==='user'&&e.kind!=='handoff').map((e:any,i:number)=>({id:e.id,title:'第 '+(i+1)+' 轮',from:e.sequence,through:e.sequence,userInputs:[e.text],assistantNotes:[],execution:[],artifacts:[],finalReply:'已完成本轮'})),body:'你正在接手同一项工作。\n'+target.entries.filter((e:any)=>e.kind!=='handoff').map((e:any)=>e.text).join('\n')+'\n本次用户要求：'+body.text,sourceThrough:target.entries.length,mode:'records'};latestPreview=preview;if(holdPrepare){holdPrepare=false;await new Promise<void>(resolve=>{releasePrepare=resolve;prepareStarted?.();});}return route.fulfill({json:preview});}
    if(url.pathname.includes('/attachments/')&&method==='GET'){const stored=uploadedMedia.get(url.pathname.split('/').at(-1)!);return route.fulfill(stored?{contentType:stored.mimeType,body:stored.bytes}:{contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64')});}
    if(url.pathname.endsWith('/supplement')){
      supplementaryCalls++;const body=request.postDataJSON();supplementaryInputs.push(body);assert.equal(body.runId,conversation.run.id);assert.equal(body.participantId,conversation.run.participantId);assert.equal(body.generation,conversation.run.generation);
      const entry={id:body.clientRequestId,sequence:conversation.entries.length+1,kind:'message',role:'user',text:body.text,attachments:body.attachmentIds,participantId:body.participantId,provider:conversation.run.provider,runId:body.runId,status:supplementaryDelivery==='accepted'?'accepted':supplementaryDelivery==='rejected'?'failed':'unknown',deliveryDiagnostic:supplementaryDelivery==='unknown'?'消息已保存，是否送达仍待确认，请勿重复发送。':supplementaryDelivery==='rejected'?'这条消息未发送成功，文字与图片仍保留在输入框。':undefined,createdAt:new Date().toISOString()};
      if(holdSupplement){holdSupplement=false;await new Promise<void>(resolve=>{releaseSupplement=resolve;supplementStarted?.();});}
      update({entries:[...conversation.entries,entry]});return route.fulfill({json:{conversation,delivery:supplementaryDelivery}});
    }
    if(url.pathname.endsWith('/send')){sends++;const body=request.postDataJSON();sentInputs.push(body);const provider=body.connectionId;const model=connections.find(item=>item.id===provider)?.models.find(item=>body.model?item.id===body.model:item.isDefault);if(latestPreview?.switching)conversation.entries.push({id:'handoff-'+sends,sequence:conversation.entries.length+1,kind:'handoff',role:'system',text:'交接已接收',status:'accepted',handoff:latestPreview.handoff,createdAt:new Date().toISOString()});if(!conversation.participants.some((item:any)=>item.connectionId===provider))conversation.participants.push({id:'participant-'+provider,connectionId:provider,provider,label:provider,deliveredThrough:0,contextId:'native-'+provider});update({entries:[...conversation.entries,{id:'user-'+sends,sequence:conversation.entries.length+1,kind:body.continueRunId?'notice':'message',role:body.continueRunId?'system':'user',text:body.continueRunId?'已请求继续上次执行。':body.text,attachments:body.attachmentIds,provider,createdAt:new Date().toISOString()}],run:run('running',provider,{modelAccountId:body.modelAccountId,modelAccountRevision:body.modelAccountRevision,modelAccountIdentity:body.modelAccountIdentity,serviceTier:body.serviceTier,model:body.model||model?.id,reasoningEffort:body.reasoningEffort||model?.defaultReasoningEffort,permissionMode:body.permissionMode||'default'})});const response=JSON.parse(JSON.stringify({conversation,run:conversation.run}));if(draftRoute){firstResponses.set(draftRoute[1]+':'+body.clientRequestId,response);for(const id of body.attachmentIds??[]){const index=draftImages.findIndex(image=>image.id===id);if(index>=0)draftImages.splice(index,1);}draftImageRevision++;}if(holdSend){holdSend=false;await new Promise<void>(resolve=>{releaseSend=resolve;sendStarted?.();});}if(draftRoute&&loseFirstResponse){loseFirstResponse=false;expectedBrowserErrors?.add(request.url());return route.abort('failed');}return route.fulfill({json:response});}
    if(url.pathname.endsWith('/stop')){stops++;let target=additionalConversations.find(item=>url.pathname.includes('/'+item.id+'/'))||conversation;const stopped=run(unknownStop?'unknown':'stopped',target.run.provider,{modelAccountId:target.run.modelAccountId,modelAccountRevision:target.run.modelAccountRevision,modelAccountIdentity:target.run.modelAccountIdentity,serviceTier:target.run.serviceTier,model:target.run.model,reasoningEffort:target.run.reasoningEffort,permissionMode:target.run.permissionMode||'default'});if(target===conversation)target=update({run:stopped,requests:unknownStop?target.requests:[]});else{target.run=stopped;if(!unknownStop)target.requests=[];target.revision='r'+(++revision);}const response=JSON.parse(JSON.stringify(target));if(holdStop){holdStop=false;await new Promise<void>(resolve=>{releaseStop=resolve;stopStarted?.();});}return route.fulfill({json:response});}
    if(url.pathname.includes('/requests/')&&url.pathname.endsWith('/reply')){replies++;const body=request.postDataJSON();assert.equal(body.participantId,conversation.requests[0].participantId);assert.equal(body.runId,conversation.requests[0].runId);const question=conversation.requests[0];const resolved=resolveQuestionAnswer(question,body.answer,ids=>({images:ids.map(id=>({id,path:'/fixture/attachments/'+id,mimeType:'image/png'})),description:''}));conversation.entries.push({id:'reply-'+question.id,sequence:conversation.entries.length+1,kind:'notice',role:'user',runId:body.runId,attachments:resolved.attachmentIds,text:JSON.stringify({请求标识:question.id,问题:question.title,问题列表:question.questions,选项:question.options,回答:resolved.answer,...(resolved.attachmentIds.length?{显示回答:questionAnswerDisplay(body.answer)}:{}),授权性质:'原请求范围'}),createdAt:new Date().toISOString()});update({run:run('running',conversation.run.provider,{permissionMode:conversation.run.permissionMode||'default'}),requests:[]});return route.fulfill({json:conversation});}
    if(url.pathname.endsWith('/observe')){observes++;if(recoverNextObserve){recoverNextObserve=false;update({run:run('completed',conversation.run.provider)});}return route.fulfill({json:conversation});}
    if(url.pathname.endsWith('/fork')){
      const source=additionalConversations.find(item=>url.pathname.includes('/'+item.id+'/'))||conversation;
      const body=request.postDataJSON();assert.equal(body.expectedRevision,source.revision);
      const entry=source.entries.find((item:any)=>item.id===body.entryId);assert.ok(entry?.runId);
      const child={...structuredClone(source),id:'fork-'+(++revision),title:'新对话',revision:'fork-r'+revision,run:undefined,requests:[],pendingSend:undefined,entries:source.entries.filter((item:any)=>item.sequence<=entry.sequence),forkState:{status:'ready'},forkedFrom:{conversationId:source.id,workspaceId:source.workspaceId,entryId:entry.id,runId:entry.runId,throughSequence:entry.sequence,title:source.title,forkedAt:new Date().toISOString()}};
      additionalConversations.push(child);return route.fulfill({status:201,json:child});
    }
    if(url.pathname.endsWith('/generate-title')){assert.equal(request.postDataJSON().expectedRevision,conversation.revision);titleGenerations++;if(holdTitle){holdTitle=false;await new Promise<void>(resolve=>{releaseTitle=resolve;titleStarted?.();});}return route.fulfill({json:update({title:'服务停止与重试'})});}
    if(method==='PATCH'){const body=request.postDataJSON();update({...('title'in body?{title:body.title}:{}),...('hidden'in body?{hidden:body.hidden}:{})});return route.fulfill({json:conversation});}
    if(method==='POST'&&url.pathname.endsWith('/seen')){const body=request.postDataJSON();const target=[...additionalConversations,...additionalPending].find(item=>url.pathname.includes('/'+item.id+'/'))||conversation;const activity={version:Math.max(body.through,target?.activity?.version??body.through),seenThrough:body.through,updatedAt:new Date().toISOString(),active:target?.activity?.active??true};if(target)target.activity=activity;return route.fulfill({json:{activity}});}
    if(method==='GET'){conversationReads++;return route.fulfill({json:[...additionalConversations,...additionalPending].find(item=>url.pathname.endsWith('/'+item.id))||conversation});}
    return route.fallback();
  };
  await page.route('**/api/v1/app/agent-service/**',route);
  await page.route('**/api/v1/workspaces/*/agent-conversations**',route);
  const panel=()=>page.locator('#agent-conversation-panel');
  const input=()=>page.getByRole('textbox',{name:'对话输入',exact:true});
  const openDesktopConversation=()=>page.getByRole('complementary',{name:'当前对话与所有对话',exact:true}).getByRole('button',{name:'展开当前对话',exact:true}).click();
  // 双入口下收起点是当前展开的入口：对话视图为当前对话按钮，历史视图为所有对话按钮，手机为顶部全局入口。
  const closeConversation=async()=>{const scope=await page.locator('.ac-collapsed-rail').isVisible()?page.locator('.ac-collapsed-rail'):page.locator('.global-conversations-control');const button=scope.locator('button[aria-expanded="true"],button[aria-pressed="true"]').first();await button.focus();await button.press('Enter');await page.locator('.topbar').hover();};
  const assertFixed=async(expected:boolean,reason?:string)=>{assert.equal(await page.locator('.ac-collapsed-rail').count(),1,'独立对话导航始终保留');assert.equal(await panel().evaluate((node:HTMLElement)=>!node.hidden&&!node.classList.contains('is-peeking')),expected,reason);};
  const assertNavigationHighlight=async(area?:string)=>{
    await page.waitForFunction((expected:string|null)=>{
      const items=[...document.querySelectorAll<HTMLElement>('.primary-navigation-rail button[data-nav]')];
      return items.length===3&&items.every(node=>{
        const selected=node.dataset.nav===expected,bg=getComputedStyle(node).backgroundColor,marker=getComputedStyle(node,'::before').content;
        const hovered=node.matches(':hover'),fixed=node.hasAttribute('data-fixed');
        const expectedBg=fixed?(hovered?'rgba(0, 0, 0, 0)':'rgb(237, 244, 240)'):hovered?'rgb(237, 244, 240)':selected?'rgb(231, 239, 236)':'rgba(0, 0, 0, 0)';
        return node.hasAttribute('data-highlighted')===selected&&bg===expectedBg&&['none','normal'].includes(marker);
      });
    },area||null);
  };
  const chooseOption=async(name:string,label:string,root:any=panel())=>{const combo=root.getByRole('combobox',{name,exact:true});await combo.focus();await combo.press('ArrowDown');const popup=page.locator('.ant-select-dropdown:visible'),option=popup.getByText(label,{exact:true});await option.waitFor();selectTrace.push({name,label,...await page.evaluate(()=>({at:Date.now(),focus:(document.activeElement as HTMLElement)?.outerHTML,combos:[...document.querySelectorAll('.ac-choice')].map(node=>({className:node.className,rect:node.getBoundingClientRect().toJSON()})),popups:[...document.querySelectorAll('.ant-select-dropdown')].filter(node=>node.getClientRects().length).map(node=>({className:node.className,style:node.getAttribute('style'),rect:node.getBoundingClientRect().toJSON(),text:node.textContent}))}))});await option.click();await popup.waitFor({state:'hidden'});};
  const chooseAgent=(label:string)=>chooseOption('下一位智能体',label);
  const modelTrigger=()=>panel().getByRole('button',{name:'模型与推理强度',exact:true});
  const modelSettings=()=>page.getByRole('dialog',{name:'模型与推理强度设置',exact:true});
  const openModelSettings=async()=>{if(await modelTrigger().getAttribute('aria-expanded')!=='true')await modelTrigger().click();await modelSettings().waitFor();return modelSettings();};
  const closeModelSettings=async()=>{await modelSettings().getByRole('combobox',{name:'执行模型',exact:true}).focus();await page.keyboard.press('Escape');await modelSettings().waitFor({state:'hidden'});assert.equal(await modelTrigger().getAttribute('aria-expanded'),'false');assert.equal(await modelTrigger().evaluate((node:HTMLElement)=>node===document.activeElement),true,'关闭设置后焦点回到模型入口');};
  const chooseModel=async(label:string)=>chooseOption('执行模型',label,await openModelSettings());
  const setHighEffort=async()=>{const dialog=await openModelSettings(),slider=dialog.getByRole('slider',{name:'思考深度',exact:true});await slider.press('End');assert.equal(await slider.getAttribute('aria-valuenow'),await slider.getAttribute('aria-valuemax'));assert.equal(await slider.getAttribute('aria-valuetext'),'高');};
  const assertModelSummary=async(model:string,effort?:string)=>{const label=modelTrigger().locator('.ac-model-label');await label.filter({hasText:model}).waitFor();assert.equal(await label.innerText(),model);const depth=modelTrigger().locator('.ac-model-effort');if(effort){await depth.filter({hasText:effort}).waitFor();assert.equal(await depth.innerText(),effort);}else assert.equal(await depth.count(),0);};
  const reset=async()=>{await page.goto(workspaceUrl+'/overview');await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.locator('#workbench-overview').waitFor();};
  const reopen=async()=>{await page.getByRole('button',{name:'查看对话列表',exact:true}).click();await page.locator('.ac-history-list button').first().click();await input().waitFor();};
  const assertReminderGap=async()=>{
    const rail=page.locator('.ac-collapsed-rail'),entry=rail.getByRole('button',{name:/^所有对话，/}),menu=page.locator('.ac-activity-menu:visible');
    await entry.hover();await menu.waitFor();
    await menu.evaluate((node:HTMLElement)=>Promise.all(node.closest('.ant-popover')!.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{}))));
    const popup=await page.locator('.ac-activity-popover:visible').boundingBox(),trigger=await entry.boundingBox();assert.ok(popup&&trigger);
    const left=await rail.getAttribute('data-dock')==='left';
    await page.mouse.move(left?popup.x-2:popup.x+popup.width+2,trigger.y+trigger.height/2);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await entry.getAttribute('aria-expanded'),'true','经过浮窗与图标间的面板空隙不立即关闭');
    await menu.getByRole('button',{name:'全部对话',exact:true}).hover();assert.equal(await entry.getAttribute('aria-expanded'),'true');
  };
  const scenarioFocus=(process.env.BUILDR_AGENT_SCENARIO_FOCUS||'').split('|').map(value=>value.trim()).filter(Boolean);
  let stepIndex=0;const step=async(name:string,operation:()=>Promise<void>)=>{if(scenarioFocus.length&&!scenarioFocus.some(value=>name.includes(value))){process.stderr.write('[agent-conversation-ui] not-selected '+name+'\n');return;}stepIndex++;const stepStart=Date.now();process.stderr.write('[agent-conversation-ui] '+name+'\n');try{await operation();process.stderr.write('[agent-conversation-ui]   ...'+((Date.now()-stepStart)/1000).toFixed(1)+'s '+name+'\n');}catch(failure){
    const taskDom=await page.evaluate(()=>{const inspect=(node:Element)=>({tag:node.tagName,id:node.id,className:node.className,hidden:node.hasAttribute('hidden'),ariaHidden:node.getAttribute('aria-hidden'),inert:node.hasAttribute('inert'),rect:node.getBoundingClientRect().toJSON(),display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility});return{url:location.href,title:document.querySelector('#task-detail-title')?.textContent,loading:[...document.querySelectorAll('.task-content-loading')].map(node=>({text:node.textContent,...inspect(node)})),entries:[...document.querySelectorAll('[data-task-internal-conversations]')].map(node=>({taskId:node.getAttribute('data-task-internal-conversations'),text:node.textContent,html:node.innerHTML,ancestors:(()=>{const ancestors=[];for(let ancestor:Element|null=node;ancestor;ancestor=ancestor.parentElement)ancestors.push(inspect(ancestor));return ancestors;})()})),resources:[...document.querySelectorAll('[data-workspace-resource-kind]')].map(node=>({kind:node.getAttribute('data-workspace-resource-kind'),...inspect(node)})),body:document.body.innerText.slice(-12000)};}).catch((error:unknown)=>({diagnosticError:String(error)}));
    process.stderr.write('[agent-conversation-failure-diagnostic] '+JSON.stringify({step:stepIndex,name,taskDom,taskRequests:taskRequests.slice(-80),selectTrace})+'\n');
    await capture(page,'agent-conversation-failure-step-'+stepIndex+'.png');throw failure;}};
  const initialize=async(part:string)=>{
    if(part==='all'||part==='setup')return;
    if(part==='selection')additionalConversations.push({id:'selection-history',workspaceId,cwd:'/isolated/selection',title:'已有对话',revision:'selection-r1',hidden:false,updatedAt:new Date().toISOString(),participants:[],entries:[{id:'selection-entry',sequence:1,kind:'message',role:'user',text:'已有内容',createdAt:new Date().toISOString()}],requests:[]});
    if(part==='models')connections[1].models=connections[1].models.map(item=>({...item,isDefault:item.id==='fixture-fast'}));
    await page.setViewportSize({width:1600,height:1000});await reset();await openDesktopConversation();await input().waitFor();
    if(['history','handoff','tasks','models','recovery'].includes(part)){
      await chooseOption('新对话工作空间',await page.locator('.workspace-switcher strong').innerText());
      await chooseModel('Fixture model');await setHighEffort();await closeModelSettings();await chooseOption('执行权限','完全访问');
      await input().fill('第一轮');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();await input().fill('下一轮仍是草稿');
    }
  };
  const dispose=async()=>{releaseEntryRead?.();releaseSend?.();releasePrepare?.();releaseCreate?.();releaseUpload?.();releaseConnections?.();releaseStop?.();releaseTaskList?.();releaseTitle?.();releaseSupplement?.();releaseConnectionProbe?.();await page.evaluate(()=>{(window as any).__releaseTaskSpinnerMotion?.();sessionStorage.removeItem('__buildrHoldTaskSpinnerMotion');}).catch(()=>{});await page.unroute('**/api/v1/app/agent-service/**',route);await page.unroute('**/api/v1/workspaces/*/agent-conversations**',route);await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>sessionStorage.clear()).catch(()=>{});if(scenarioFocus.length)assert.ok(stepIndex>0,'BUILDR_AGENT_SCENARIO_FOCUS 没有匹配任何场景');};
  return {
    quotaOverrides,
    get additionalConversations(){return additionalConversations;}, set additionalConversations(value){additionalConversations=value;},
    get additionalPending(){return additionalPending;}, set additionalPending(value){additionalPending=value;},
    assertFixed,
    assertModelSummary,
    assertNavigationHighlight,
    assertReminderGap,
    get attachmentUploads(){return attachmentUploads;}, set attachmentUploads(value){attachmentUploads=value;},
    capture,
    get catalogDiagnostic(){return catalogDiagnostic;}, set catalogDiagnostic(value){catalogDiagnostic=value;},
    chooseAgent,
    chooseModel,
    chooseOption,
    closeConversation,
    closeModelSettings,
    get connectionEventProbe(){return connectionEventProbe;}, set connectionEventProbe(value){connectionEventProbe=value;},
    get connectionProbeBarrier(){return connectionProbeBarrier;}, set connectionProbeBarrier(value){connectionProbeBarrier=value;},
    get connectionReads(){return connectionReads;}, set connectionReads(value){connectionReads=value;},
    connections,
    get connectionsStarted(){return connectionsStarted;}, set connectionsStarted(value){connectionsStarted=value;},
    get conversation(){return conversation;}, set conversation(value){conversation=value;},
    get createStarted(){return createStarted;}, set createStarted(value){createStarted=value;},
    get creations(){return creations;}, set creations(value){creations=value;},
    get dropEventStreams(){return dropEventStreams;}, set dropEventStreams(value){dropEventStreams=value;},
    get entryReads(){return entryReads;}, set entryReads(value){entryReads=value;},
    get entryReadStarted(){return entryReadStarted;}, set entryReadStarted(value){entryReadStarted=value;},
    get conversationReads(){return conversationReads;},
    get eventStreamHook(){return eventStreamHook;}, set eventStreamHook(value){eventStreamHook=value;},
    get eventStreams(){return eventStreams;}, set eventStreams(value){eventStreams=value;},
    expectedBrowserErrors,
    get failEntryRead(){return failEntryRead;}, set failEntryRead(value){failEntryRead=value;},
    get forceCapacity(){return forceCapacity;}, set forceCapacity(value){forceCapacity=value;},
    historyPages,
    get holdConnections(){return holdConnections;}, set holdConnections(value){holdConnections=value;},
    get holdCreate(){return holdCreate;}, set holdCreate(value){holdCreate=value;},
    get holdEntryRead(){return holdEntryRead;}, set holdEntryRead(value){holdEntryRead=value;},
    get holdPreferences(){return holdPreferences;}, set holdPreferences(value){holdPreferences=value;},
    get holdPrepare(){return holdPrepare;}, set holdPrepare(value){holdPrepare=value;},
    get holdSend(){return holdSend;}, set holdSend(value){holdSend=value;},
    get holdStop(){return holdStop;}, set holdStop(value){holdStop=value;},
    get holdSupplement(){return holdSupplement;}, set holdSupplement(value){holdSupplement=value;},
    get holdTaskList(){return holdTaskList;}, set holdTaskList(value){holdTaskList=value;},
    get holdTitle(){return holdTitle;}, set holdTitle(value){holdTitle=value;},
    get holdUploadAt(){return holdUploadAt;}, set holdUploadAt(value){holdUploadAt=value;},
    get loseFirstResponse(){return loseFirstResponse;}, set loseFirstResponse(value){loseFirstResponse=value;},
    input,
    modelSettings,
    modelTrigger,
    get nativeLoginPosts(){return nativeLoginPosts;}, set nativeLoginPosts(value){nativeLoginPosts=value;},
    get observes(){return observes;}, set observes(value){observes=value;},
    openDesktopConversation,
    openModelSettings,
    page,
    panel,
    preferenceBodies,
    get preferencePosts(){return preferencePosts;}, set preferencePosts(value){preferencePosts=value;},
    get preferencesStarted(){return preferencesStarted;}, set preferencesStarted(value){preferencesStarted=value;},
    preparedInputs,
    get prepareError(){return prepareError;}, set prepareError(value){prepareError=value;},
    get prepares(){return prepares;}, set prepares(value){prepares=value;},
    get prepareStarted(){return prepareStarted;}, set prepareStarted(value){prepareStarted=value;},
    programAttempts,
    get programScenario(){return programScenario;}, set programScenario(value){programScenario=value;},
    get recoverNextObserve(){return recoverNextObserve;}, set recoverNextObserve(value){recoverNextObserve=value;},
    get releaseConnectionProbe(){return releaseConnectionProbe;}, set releaseConnectionProbe(value){releaseConnectionProbe=value;},
    get releaseConnections(){return releaseConnections;}, set releaseConnections(value){releaseConnections=value;},
    get releaseCreate(){return releaseCreate;}, set releaseCreate(value){releaseCreate=value;},
    get releaseEntryRead(){return releaseEntryRead;}, set releaseEntryRead(value){releaseEntryRead=value;},
    get releasePreferences(){return releasePreferences;}, set releasePreferences(value){releasePreferences=value;},
    get releasePrepare(){return releasePrepare;}, set releasePrepare(value){releasePrepare=value;},
    get releaseSend(){return releaseSend;}, set releaseSend(value){releaseSend=value;},
    get releaseStop(){return releaseStop;}, set releaseStop(value){releaseStop=value;},
    get releaseSupplement(){return releaseSupplement;}, set releaseSupplement(value){releaseSupplement=value;},
    get releaseTaskList(){return releaseTaskList;}, set releaseTaskList(value){releaseTaskList=value;},
    get releaseTitle(){return releaseTitle;}, set releaseTitle(value){releaseTitle=value;},
    get releaseUpload(){return releaseUpload;}, set releaseUpload(value){releaseUpload=value;},
    get reminderPaging(){return reminderPaging;}, set reminderPaging(value){reminderPaging=value;},
    get reminderReadFailure(){return reminderReadFailure;}, set reminderReadFailure(value){reminderReadFailure=value;},
    reopen,
    get replies(){return replies;}, set replies(value){replies=value;},
    reset,
    get revision(){return revision;}, set revision(value){revision=value;},
    run,
    get sends(){return sends;}, set sends(value){sends=value;},
    get sendStarted(){return sendStarted;}, set sendStarted(value){sendStarted=value;},
    sentInputs,
    setHighEffort,
    get sharedModels(){return sharedModels;}, set sharedModels(value){sharedModels=value;},
    step,
    get unknownStop(){return unknownStop;},set unknownStop(value){unknownStop=value;},
    get stops(){return stops;}, set stops(value){stops=value;},
    get stopStarted(){return stopStarted;}, set stopStarted(value){stopStarted=value;},
    get supplementaryCalls(){return supplementaryCalls;}, set supplementaryCalls(value){supplementaryCalls=value;},
    get supplementaryDelivery(){return supplementaryDelivery;}, set supplementaryDelivery(value){supplementaryDelivery=value;},
    supplementaryInputs,
    get supplementStarted(){return supplementStarted;}, set supplementStarted(value){supplementStarted=value;},
    get taskListStarted(){return taskListStarted;}, set taskListStarted(value){taskListStarted=value;},
    get titleGenerations(){return titleGenerations;}, set titleGenerations(value){titleGenerations=value;},
    get titleStarted(){return titleStarted;}, set titleStarted(value){titleStarted=value;},
    update,
    uploadedMedia,
    get uploadStarted(){return uploadStarted;}, set uploadStarted(value){uploadStarted=value;},
    workspaceId,
    workspaceRoot,
    workspaceUrl,
    initialize,dispose,
  };
}

export type AgentConversationFixture=Awaited<ReturnType<typeof createAgentConversationFixture>>;
