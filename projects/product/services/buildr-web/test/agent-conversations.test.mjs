import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationActionKey,createConversationActions} from '../src/features/agent-conversations/conversation-actions.ts';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/api/client.ts';
import { appendDraftAttachment, canGenerateConversationTitle, canStopConversationTool, conversationConflictNeedsRefresh, createdConversationVisibility, executionLocked, participantAgentIds, shouldSendOnKey, draftKey, readDraft, removeSubmittedAttachments, transferDraftText, writeDraft, applyConversationEvent, isCurrentConversationEvent, mergeConversationView, prependConversationEntries, parseEventFrame, sameConversationSelection, latestConversationParticipant } from '../src/features/agent-conversations/conversation-state.ts';
import {conversationPermissionKey,conversationPermissionStorageKey,conversationReasoningOptions,conversationRunIdentity,readConversationPermission,reasoningEffortLabel,selectedConversationModel,selectedConversationPermission,supportsConversationPermission,writeConversationPermission} from '../src/features/agent-conversations/conversation-options.ts';
registerHooks({resolve(specifier,context,next){
  if(specifier==='../../../api'&&context.parentURL?.endsWith('/agent-conversations-api.ts'))return next(new URL('../src/api/index.ts',import.meta.url).href,context);
  try{return next(specifier,context);}catch(cause){if(!specifier.startsWith('.')||!context.parentURL?.includes('/src/'))throw cause;for(const suffix of ['.ts','/index.ts']){const url=new URL(specifier+suffix,context.parentURL);if(existsSync(fileURLToPath(url)))return next(url.href,context);}throw cause;}
}});
const {createAgentConversationsClient}=await import('../src/features/agent-conversations/api/agent-conversations-api.ts');
const session={writeHeaders:()=>({'x-buildr-session':'native-test-session','content-type':'application/json'})};
const conversation={id:'chat/id',workspaceId:'saved/ws',revision:'r1',cwd:'/saved/root',title:'Work',hidden:false,updatedAt:'2026-10-23',participants:[],entries:[],requests:[{id:'approval/id',runId:'run/1',participantId:'original-codex',generation:'generation-1',kind:'approval',title:'Allow?'}],run:{id:'run/1',participantId:'original-codex',generation:'generation-1',provider:'codex',status:'running'}};

test('读取/历史/登录状态以本机令牌访问，执行始终使用对话保存身份而非当前浏览空间',async t=>{
  const requests=[];t.mock.method(globalThis,'fetch',async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({connections:[],conversations:[]}));});
  const api=createAgentConversationsClient(createApiClient({getWorkspaceId:()=> 'browsing-other-ws',sessionAdapter:session}),session);
  await api.connections();await api.read(conversation.workspaceId,conversation.id);await api.list(conversation.workspaceId,{taskId:'task/id',hidden:true});await api.connect('qoder','connection-r1');
  assert.equal(requests[0].url,'/api/v1/app/agent-service/connections');assert.equal(requests[1].url,'/api/v1/workspaces/saved%2Fws/agent-conversations/chat%2Fid');
  assert.ok(requests.every(item=>item.init.headers.get('x-buildr-session')==='native-test-session'));
  const query=new URL(requests[2].url,'http://local').searchParams;assert.equal(query.get('taskId'),'task/id');assert.equal(query.get('hidden'),'true');
  assert.equal(requests[3].url,'/api/v1/app/agent-service/connections/qoder/connect');assert.deepEqual(JSON.parse(requests[3].init.body),{expectedRevision:'connection-r1'});
});

test('发送未结束仍能独立停止和回复，控制请求绑定原参与者与代次',async()=>{
  const calls=[];let release;
  const client=async(url,init)=>{calls.push({url,body:init?.body&&JSON.parse(init.body)});if(url.endsWith('/send'))return new Promise(resolve=>{release=resolve;});return conversation;};
  const api=createAgentConversationsClient(client,session);
  const send=api.send(conversation,{expectedRevision:'r1',connectionId:'selected-dsh',text:'Continue',previewToken:'preview-1',clientRequestId:'retry-stable'});
  await api.stop(conversation,'tool-1');await api.reply(conversation,'approval/id',{answer:'deny'});
  assert.equal(calls.length,3);assert.equal(calls[1].body.participantId,'original-codex');assert.equal(calls[1].body.generation,'generation-1');assert.equal(calls[1].body.toolId,'tool-1');
  assert.equal(calls[2].body.participantId,'original-codex');assert.equal(calls[2].body.answer,'deny');assert.equal(calls[2].body.runId,'run/1');assert.equal(calls[0].body.clientRequestId,'retry-stable');
  release({conversation});await send;
});

test('认证轮换后以新令牌重试同一发送编号，不产生另一条指令',async()=>{
  let token='old',calls=[];const refreshing={writeHeaders:()=>({'x-buildr-session':token}),refreshSession:async()=>{token='new';return true;}};
  const api=createAgentConversationsClient(async(url,init)=>{calls.push({url,headers:init.headers,body:JSON.parse(init.body)});if(calls.length===1)throw Object.assign(new Error('expired'),{code:'session_forbidden'});return{conversation};},refreshing);
  await api.send(conversation,{expectedRevision:'r1',connectionId:'codex',text:'one',previewToken:'p',clientRequestId:'only-once'});
  assert.equal(calls[0].headers['x-buildr-session'],'old');assert.equal(calls[1].headers['x-buildr-session'],'new');assert.deepEqual(calls[0].body,calls[1].body);
});

test('服务端事件流携带header游标，正确解析跨块中文/CRLF，不在URL泄露令牌',async()=>{
  const event={cursor:19,generation:'g1',type:'snapshot',conversationId:conversation.id,workspaceId:conversation.workspaceId,revision:'r2',payload:{conversation:{...conversation,title:'中文'}}};
  const text=`: heartbeat\r\n\r\nid: 19\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;const bytes=new TextEncoder().encode(text);let request;
  const response=new Response(new ReadableStream({start(controller){for(let index=0;index<bytes.length;index+=3)controller.enqueue(bytes.slice(index,index+3));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
  const api=createAgentConversationsClient(async()=>({}),session,async(url,init)=>{request={url,init};return response;});const events=[];
  await assert.rejects(api.subscribe(conversation.workspaceId,conversation.id,new AbortController().signal,event=>events.push(event),18),/连接已中断/);
  assert.deepEqual(events,[event]);assert.equal(request.init.headers['last-event-id'],'18');assert.equal(request.init.headers['x-buildr-session'],'native-test-session');assert.ok(!request.url.includes('native-test-session'));assert.ok(!request.url.includes('?'));
  assert.equal(parseEventFrame('data: first\ndata: second').data,'first\nsecond');
});

test('参与过此对话按智能体去重，同一执行者的多个参与者只展示一次',()=>{
  assert.deepEqual(participantAgentIds([{id:'p1',provider:'codex'},{id:'p2',provider:'dsh'},{id:'p3',provider:'dsh'}]),['codex','dsh']);
  assert.deepEqual(participantAgentIds([]),[]);
});

test('执行状态行只表达智能体与模型，不把模型来源账号标签当作状态',()=>{
  const catalog=[{accountId:'account-devin',accountIdentity:'identity-devin',modelId:'grok-4.7',accountLabel:'someone@example.com · Pro',accountRevision:'account-r1',provider:'devin',label:'Grok 4.7',available:true,enabled:true}];
  const shared={...conversation.run,provider:'dsh',modelAccountId:'account-devin',modelAccountIdentity:'identity-devin',model:'grok-4.7',modelSourceLabel:'someone@example.com · Pro'};
  assert.equal(conversationRunIdentity(shared,undefined,catalog),'DSH · Devin / Grok 4.7');
  assert.ok(!conversationRunIdentity(shared,undefined,catalog).includes('@'));
  const native={id:'codex',provider:'codex',models:[{id:'gpt-5-codex',label:'GPT-5 Codex'}]};
  assert.equal(conversationRunIdentity({...conversation.run,provider:'codex',model:'gpt-5-codex'},native,[]),'Codex · GPT-5 Codex');
  assert.equal(conversationRunIdentity({...conversation.run,provider:'codex',model:'custom-model'},undefined,[]),'Codex · custom-model');
});

test('输入法组合和Shift+Enter不发送，执行与未知状态保留新内容为草稿',()=>{
  assert.equal(shouldSendOnKey({key:'Enter',shiftKey:false,isComposing:true}),false);assert.equal(shouldSendOnKey({key:'Enter',shiftKey:false,keyCode:229}),false);assert.equal(shouldSendOnKey({key:'Enter',shiftKey:true}),false);assert.equal(shouldSendOnKey({key:'Enter',shiftKey:false}),true);
  for(const status of ['starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown'])assert.equal(executionLocked({...conversation.run,status}),true,status);
  for(const status of ['completed','stopped','failed'])assert.equal(executionLocked({...conversation.run,status}),false,status);
});

test('草稿按配置域/工作空间/对话隔离，存储拒绝不会假称保存或自动发送',()=>{
  const rows=new Map(),storage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
  const first=draftKey('dev','ws','first'),second=draftKey('dev','ws','second');assert.equal(writeDraft(first,'unsent',storage),true);assert.deepEqual(readDraft(first,storage),{text:'unsent',taskId:undefined,available:true});assert.equal(readDraft(second,storage).text,'');assert.notEqual(first,draftKey('released','ws','first'));
  assert.equal(writeDraft(first,'same input',{setItem(){throw Error('denied');}}),false);assert.deepEqual(readDraft(first,{getItem(){throw Error('denied');}}),{text:'',taskId:undefined,available:false});assert.equal(writeDraft(first,'',storage),true);assert.equal(readDraft(first,storage).text,'');
});

test('草稿任务绑定跟随唯一新草稿记录，纯文本旧草稿不破坏兼容，清空文本不留绑定',()=>{
  const rows=new Map(),storage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
  const key=draftKey('dev','ws-a','new');
  assert.equal(writeDraft(key,'从任务进入的草稿',storage,'task-one'),true);
  assert.deepEqual(readDraft(key,storage),{text:'从任务进入的草稿',taskId:'task-one',available:true},'有绑定随文本一同持久化');
  assert.equal(writeDraft(key,'改写的草稿',storage),true);
  assert.deepEqual(readDraft(key,storage),{text:'改写的草稿',taskId:undefined,available:true},'解除绑定后只保留文本');
  assert.equal(writeDraft(key,'',storage,'task-one'),true);
  assert.deepEqual(readDraft(key,storage),{text:'',taskId:undefined,available:true},'空草稿不留绑定痕迹');
  const transferred=transferDraftText(key,draftKey('dev','ws-a','created'),k=>readDraft(k,storage),(k,text,taskId)=>writeDraft(k,text,storage,taskId));
  assert.equal(transferred.taskId,undefined);
  assert.equal(writeDraft(key,'绑定草稿',storage,'task-two'),true);
  const moved=transferDraftText(key,draftKey('dev','ws-a','created'),k=>readDraft(k,storage),(k,text,taskId)=>writeDraft(k,text,storage,taskId));
  assert.deepEqual(moved,{text:'绑定草稿',taskId:'task-two',available:true},'真实会话建立后草稿连同绑定一起迁移');
});

test('迟到、重复及其他对话事件不能覆盖当前对话，重启快照可恢复新代次',()=>{
  const scope={workspaceId:conversation.workspaceId,conversationId:conversation.id};const next={...conversation,title:'latest'};const event={cursor:12,generation:'new-generation',type:'conversation',workspaceId:conversation.workspaceId,conversationId:conversation.id,revision:'r2',payload:{conversation:next}};
  assert.equal(applyConversationEvent(conversation,event,scope,'old-generation',11),conversation);assert.equal(applyConversationEvent(conversation,{...event,generation:'old-generation',cursor:10},scope,'old-generation',11),conversation);assert.equal(applyConversationEvent(conversation,{...event,conversationId:'other'},scope),conversation);
  assert.equal(applyConversationEvent(conversation,{...event,type:'snapshot'},scope,'old-generation',20),next);
});


test('历史分页遇到流式更新保留较新的执行事实，更新当前页时保留已载入的早期记录',()=>{
  const earlier={id:'early',sequence:1,text:'old history'},latest={id:'latest',sequence:100,text:'streamed text'};
  const current={...conversation,revision:'new-revision',entries:[latest],run:{...conversation.run,status:'running'}};
  const page={...conversation,revision:'older-revision',entries:[earlier,{...latest,text:'stale streamed text'}],run:{...conversation.run,status:'stopped'},nextEntryCursor:1};
  const paged=prependConversationEntries(current,page);assert.equal(paged.revision,'new-revision');assert.equal(paged.run.status,'running');assert.equal(paged.entries.at(-1).text,'streamed text');
  const updated=mergeConversationView(paged,{...current,entries:[{...latest,text:'new chunk'}],nextEntryCursor:100});assert.deepEqual(updated.entries.map(item=>item.text),['old history','new chunk']);assert.equal(updated.nextEntryCursor,1);
});


test('二进制图片上传携带会话认证和准确修订，不编码为JSON或在URL传秘密',async()=>{
  let request;const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  const api=createAgentConversationsClient(async()=>({}),session,async(url,init)=>{request={url,init};return new Response(JSON.stringify({id:'attachment-1',mimeType:'image/png',size:bytes.length,revision:'r2'}));});
  const result=await api.upload(conversation,new File([bytes],'image.png',{type:'image/png'}));assert.equal(result.revision,'r2');assert.equal(request.init.headers['content-type'],'image/png');assert.equal(request.init.headers['x-buildr-session'],'native-test-session');assert.equal(request.init.headers['x-buildr-conversation-revision'],'r1');assert.deepEqual(new Uint8Array(request.init.body),bytes);assert.ok(request.url.endsWith('/attachments'));
});

test('较早HTTP回应不能覆盖期间已收到的较新服务端执行事实',()=>{
  const current={...conversation,revision:'event-new',run:{...conversation.run,status:'completed'}};
  const late={...conversation,revision:'response-old',run:{...conversation.run,status:'running'}};
  assert.equal(mergeConversationView(current,late,'r1'),current);
  assert.equal(mergeConversationView({...conversation,revision:'r1'},late,'r1').revision,'response-old');
});


test('异步发送预览绑定工作空间、对话和新草稿代次，切离再返回也不能复用旧结果',()=>{
  const original={generation:10,scope:{workspaceId:'first-workspace',conversationId:'same-id'}};
  assert.equal(sameConversationSelection({...original},original),true);
  assert.equal(sameConversationSelection({generation:10,scope:{workspaceId:'other-workspace',conversationId:'same-id'}},original),false);
  assert.equal(sameConversationSelection({generation:10,scope:{workspaceId:'first-workspace',conversationId:'other-id'}},original),false);
  assert.equal(sameConversationSelection({generation:12,scope:original.scope},original),false);
  assert.equal(sameConversationSelection({generation:12,scope:null},{generation:11,scope:null}),false);
});


test('四段接续换回Codex后以最近执行方作为默认，参与者首次加入顺序不改变结论',()=>{
  const participants=[{id:'p-codex',connectionId:'codex'},{id:'p-dsh',connectionId:'dsh'},{id:'p-qoder',connectionId:'qoder'}];
  const returned={...conversation,participants,run:{...conversation.run,participantId:'p-codex'}};
  assert.equal(latestConversationParticipant(returned).connectionId,'codex');
  assert.equal(latestConversationParticipant({...returned,run:undefined}).connectionId,'qoder');
});


test('A控制等待不阻断B，同编号执行仍按准确工作空间/对话隔离，旧回执只释放自身',()=>{
  const actions=createConversationActions();const first=conversationActionKey({workspaceId:'ws',conversationId:'a'},'stop','same-run'),second=conversationActionKey({workspaceId:'ws',conversationId:'b'},'stop','same-run');
  assert.equal(actions.begin(first),true);assert.equal(actions.begin(first),false);assert.equal(actions.begin(second),true);actions.finish(first);assert.equal(actions.has(first),false);assert.equal(actions.has(second),true);
  assert.notEqual(second,conversationActionKey({workspaceId:'other',conversationId:'b'},'stop','same-run'));actions.finish(second);assert.equal(actions.has(second),false);
});

test('思考深度来自确切模型能力，默认模型、换模型与未知模型不借用其他模型的档位',()=>{
  const efforts=[{id:'medium',label:'标准'},{id:'high',label:'深入'}];
  const connection={provider:'codex',models:[{id:'reasoning',label:'Reasoning',isDefault:true,reasoningEfforts:efforts,defaultReasoningEffort:'medium'},{id:'plain',label:'Plain'}]};
  assert.equal(selectedConversationModel(connection).id,'reasoning');
  assert.deepEqual(conversationReasoningOptions(connection),efforts);
  assert.deepEqual(conversationReasoningOptions(connection,'plain'),[]);
  assert.deepEqual(conversationReasoningOptions(connection,'removed-model'),[]);
  assert.deepEqual(conversationReasoningOptions({...connection,models:connection.models.map(({isDefault,...model})=>model)}),[]);
});

test('没有模型能力广告时不按厂商名称猜测思考深度',()=>{
  for(const provider of ['codex','dsh','qoder','future-provider'])assert.deepEqual(conversationReasoningOptions({provider,models:[{id:'native-default',label:'原生默认',isDefault:true}]}),[]);
  assert.deepEqual(conversationReasoningOptions(undefined),[]);
});

test('深度胶囊使用短中文标签，未知档位保留原生描述，不改发送标识',()=>{
  const effort={id:'high',label:'Long native explanation of this reasoning budget'};
  assert.equal(reasoningEffortLabel(effort),'高');assert.equal(effort.id,'high');
  assert.equal(reasoningEffortLabel({id:'vendor-balanced',label:'厂商平衡档'}),'厂商平衡档');
});

test('真实目录中的极高、最高、极致与关闭档位保持可区分名称和原始标识',()=>{
  const efforts=['high','xhigh','max','ultra','off'].map(id=>({id,label:'Native description '+id}));
  assert.deepEqual(efforts.map(reasoningEffortLabel),['高','极高','最高','极致','关闭']);
  assert.deepEqual(efforts.map(effort=>effort.id),['high','xhigh','max','ultra','off']);
});

test('生成短标题仅允许已结束且有真实问答的对话，工具或接续记录不能冒充问答',()=>{
  const complete={...conversation,run:{...conversation.run,status:'completed'},entries:[{kind:'message',role:'user',text:'Explain this system',status:'accepted'},{kind:'message',role:'assistant',text:'This system has three parts.',status:'completed'}]};
  assert.equal(canGenerateConversationTitle(complete),true);
  assert.equal(canGenerateConversationTitle({...complete,run:{...complete.run,status:'running'}}),false);
  assert.equal(canGenerateConversationTitle({...complete,entries:complete.entries.map(entry=>({...entry,kind:'tool'}))}),false);
  assert.equal(canGenerateConversationTitle({...complete,entries:complete.entries.map(entry=>entry.role==='user'?{...entry,status:'unknown'}:entry)}),false);
  assert.equal(canGenerateConversationTitle({...complete,entries:[]}),false);assert.equal(canGenerateConversationTitle(null),false);
});

test('主动生成短标题绑定已选对话身份和观察版本，不从当前浏览空间取目标',async()=>{
  let request;const api=createAgentConversationsClient(async(url,init)=>{request={url,body:JSON.parse(init.body)};return {...conversation,title:'系统组成'};},session);
  const result=await api.generateTitle(conversation);
  assert.equal(request.url,'/api/v1/workspaces/saved%2Fws/agent-conversations/chat%2Fid/generate-title');
  assert.deepEqual(request.body,{expectedRevision:'r1'});assert.equal(result.title,'系统组成');
});

test('模型连接事件必须通过当前会话、代次和新游标检查，不能用连接快照改写对话',()=>{
  const scope={workspaceId:conversation.workspaceId,conversationId:conversation.id};
  const event={type:'connection',...scope,cursor:12,generation:'current-generation',revision:'opaque-connection-revision',payload:{connection:{id:'dsh',models:[{id:'new-default',isDefault:true}]}}};
  assert.equal(isCurrentConversationEvent(event,scope,'current-generation',11),true);
  assert.equal(isCurrentConversationEvent({...event,cursor:11},scope,'current-generation',11),false);
  assert.equal(isCurrentConversationEvent({...event,generation:'old-generation'},scope,'current-generation',11),false);
  assert.equal(isCurrentConversationEvent({...event,workspaceId:'other-workspace'},scope,'current-generation',11),false);
  assert.equal(isCurrentConversationEvent({...event,conversationId:'other-conversation'},scope,'current-generation',11),false);
  assert.equal(applyConversationEvent(conversation,event,scope,'current-generation',11),conversation);
});

test('创建回执区分任务入口与悬停面板，期间的显隐新意图优先',()=>{
  const hidden={open:false,version:1},shown={open:true,version:1};
  assert.equal(createdConversationVisibility(hidden,hidden,true),true,'任务入口初次创建应打开');
  assert.equal(createdConversationVisibility(hidden,hidden,false),false,'悬停面板创建不应自动固定');
  assert.equal(createdConversationVisibility(shown,shown,false),true,'已展开面板创建仍保持展开');
  assert.equal(createdConversationVisibility(shown,{open:false,version:2},true),false,'等待期间收起后不能被任务创建回执覆盖');
  assert.equal(createdConversationVisibility(hidden,{open:true,version:2},false),true,'悬停期间明确固定应保留');
  assert.equal(createdConversationVisibility(hidden,{open:false,version:3},true),false,'再次收起仍以最后意图为准');
});

test('首次创建等待期间继续输入，迁移读取最新草稿，保留最初已发快照',()=>{
  const rows=new Map([['new','first instruction']]);const submitted=rows.get('new');
  const read=key=>({text:rows.get(key)||''}),save=(key,text)=>{rows.set(key,text);return true;};
  rows.set('new','next draft written while creating');
  const transferred=transferDraftText('new','created',read,save);
  assert.equal(submitted,'first instruction');assert.equal(transferred.text,'next draft written while creating');assert.equal(rows.get('created'),transferred.text);assert.equal(rows.get('new'),'');
});

test('第二图上传返回时只追加新图，不复活用户已移除的第一图',()=>{
  let rows=appendDraftAttachment([],{id:'first',name:'first.png'});
  rows=rows.filter(item=>item.id!=='first');
  rows=appendDraftAttachment(rows,{id:'second',name:'second.png'});
  assert.deepEqual(rows.map(item=>item.id),['second']);
  assert.equal(appendDraftAttachment(rows,{id:'second',name:'duplicate.png'}),rows);
});

test('切离再返回后的旧发送回执仅移除已提交图片，后来新增图片仍是草稿',()=>{
  const submitted=['already-sent'];
  const latest=[{id:'already-sent',name:'first.png'},{id:'added-after-return',name:'next.png'}];
  assert.deepEqual(removeSubmittedAttachments(latest,submitted),[{id:'added-after-return',name:'next.png'}]);
  assert.deepEqual(removeSubmittedAttachments(latest,[]),latest);
});

test('权限模式按准确对话隔离，新草稿权限按工作空间共享，旧轮次缺失模式仍按原生默认解释',()=>{
  const first=conversationPermissionKey(null,'ws-a'),next=conversationPermissionKey(null,'ws-b');assert.notEqual(first,next);
  assert.equal(conversationPermissionKey(null,'ws-a'),conversationPermissionKey(null,'ws-a'),'同一工作空间的新对话共享一份权限选择');
  assert.notEqual(conversationPermissionKey({workspaceId:'a',conversationId:'same'},'x'),conversationPermissionKey({workspaceId:'b',conversationId:'same'},'x'));
  assert.equal(selectedConversationPermission(undefined,undefined),'default');
  assert.equal(selectedConversationPermission(undefined,conversation.run),'default');
  assert.equal(selectedConversationPermission(undefined,{...conversation.run,permissionMode:'full-access'}),'full-access');
  assert.equal(selectedConversationPermission('default',{...conversation.run,permissionMode:'full-access'}),'default');
});

test('未声明权限能力只支持默认，换不支持的执行者不会静默降级已选完全访问',()=>{
  const selected=selectedConversationPermission('full-access',undefined);
  assert.equal(supportsConversationPermission({capabilities:{}},selected),false);
  assert.equal(supportsConversationPermission({capabilities:{}},'default'),true);
  assert.equal(supportsConversationPermission({capabilities:{permissionModes:['default','full-access']}},selected),true);
  assert.equal(selected,'full-access');
});

test('同标签页显式切回默认后刷新优先保留默认，不从旧完全访问执行扩大授权',()=>{
  const scope={workspaceId:'a/b',conversationId:'same/id'},rows=new Map();
  const storage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value)};
  const key=conversationPermissionStorageKey('development',scope);
  assert.equal(writeConversationPermission(key,'full-access',storage),true);
  assert.equal(writeConversationPermission(key,'default',storage),true);
  assert.equal(selectedConversationPermission(readConversationPermission(key,storage),{...conversation.run,permissionMode:'full-access'}),'default');
  assert.notEqual(key,conversationPermissionStorageKey('released',scope));
  assert.notEqual(key,conversationPermissionStorageKey('development',{...scope,workspaceId:'b'}));
  assert.equal(conversationPermissionStorageKey('development',null),null,'未创建草稿不保存完全访问选择，刷新从默认开始');
  assert.equal(writeConversationPermission(null,'full-access',storage),false);
  rows.set(key,'unknown-mode');assert.equal(readConversationPermission(key,storage),undefined);
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  assert.equal(readConversationPermission(key,denied),undefined);assert.equal(writeConversationPermission(key,'default',denied),false);
  assert.equal(selectedConversationPermission('default',{...conversation.run,permissionMode:'full-access'}),'default','存储失败仍保留内存明确选择');
});

test('完全访问与切回默认都显式带入预览和发送，不以缺省保留前轮权限',async()=>{
  const modes=[];const api=createAgentConversationsClient(async(_url,init)=>{modes.push(JSON.parse(init.body).permissionMode);return conversation;},session);
  for(const permissionMode of ['full-access','default']){const input={expectedRevision:'r1',connectionId:'codex',text:'continue',permissionMode};await api.prepare(conversation,input);await api.send(conversation,{...input,previewToken:'prepared',clientRequestId:permissionMode});}
  assert.deepEqual(modes,['full-access','full-access','default','default']);
});

test('工具只在明确声明可单独停止且未结束时提供单项停止，旧记录不伪造能力',()=>{
  const tool={id:'exact-command',label:'command',status:'running'};
  assert.equal(canStopConversationTool({...tool,canStop:true}),true);
  assert.equal(canStopConversationTool({...tool,canStop:false}),false);
  assert.equal(canStopConversationTool(tool),false);
  assert.equal(canStopConversationTool({...tool,status:'completed',canStop:true}),false);
});

test('409只刷新真实过期观察，忙碌与权限问题保留准确原因',()=>{
  for(const code of ['agent_revision_conflict','agent_preview_stale','agent_model_source_changed','agent_model_source_unavailable','agent_model_unavailable','agent_model_disabled'])assert.equal(conversationConflictNeedsRefresh({status:409,code}),true,code);
  for(const code of ['agent_conversation_busy','agent_permission_unavailable','agent_model_incompatible','qoder_platform_login_required'])assert.equal(conversationConflictNeedsRefresh({status:409,code}),false,code);
  assert.equal(conversationConflictNeedsRefresh({status:400,code:'agent_revision_conflict'}),false);
  assert.equal(conversationConflictNeedsRefresh({status:409}),false);
  assert.equal(conversationConflictNeedsRefresh(undefined),false);
});

test('历史图片按原对话身份携带认证头读取，认证轮换重试不暴露令牌且保留取消信号',async()=>{
  let token='old';const calls=[];const bytes=new Uint8Array([137,80,78,71]);const signal=new AbortController().signal;
  const api=createAgentConversationsClient(async()=>({}),{writeHeaders:()=>({'x-buildr-session':token}),refreshSession:async()=>{token='new';return true;}},async(url,init)=>{calls.push({url,init});return calls.length===1?new Response(JSON.stringify({error:{code:'session_forbidden'}}),{status:403,headers:{'content-type':'application/json'}}):new Response(bytes,{headers:{'content-type':'image/png'}});});
  const blob=await api.readImage(conversation,'image/id',signal);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);assert.equal(blob.type,'image/png');
  assert.equal(calls.length,2);assert.equal(calls[0].url,'/api/v1/workspaces/saved%2Fws/agent-conversations/chat%2Fid/attachments/image%2Fid');
  assert.equal(calls[0].init.headers['x-buildr-session'],'old');assert.equal(calls[1].init.headers['x-buildr-session'],'new');assert.equal(calls[1].init.signal,signal);assert.equal(calls[1].init.cache,'no-store');
  assert.ok(calls.every(call=>!call.url.includes('old')&&!call.url.includes('new')));
});

test('模型套餐客户端携带观察版本且发送来源固定，不把凭据放入网址',async()=>{
  const calls=[];const api=createAgentConversationsClient(async(url,init)=>{calls.push({url,init});return {};},session);
  await api.modelAccounts();await api.modelCatalog();await api.addModelAccount('devin');
  const account={id:'account-id',revision:'account-r1',loginAttempt:{id:'attempt-id'}};
  await api.modelAccountAction(account,'login-attempts');await api.cancelModelLogin(account);
  await api.prepare(conversation,{expectedRevision:'r1',connectionId:'dsh',modelAccountId:'account-id',modelAccountRevision:'account-r1',model:'same-name',text:'work'});
  assert.equal(calls[0].url,'/api/v1/app/agent-service/model-accounts');assert.equal(calls[1].url,'/api/v1/app/agent-service/model-catalog');
  assert.deepEqual(JSON.parse(calls[3].init.body),{expectedRevision:'account-r1'});assert.equal(JSON.parse(calls[5].init.body).modelAccountId,'account-id');assert.equal(JSON.parse(calls[5].init.body).connectionId,'dsh');
  assert.ok(calls.every(call=>!call.url.includes('native-test-session')));
});

test('default conversations use application routes independently from the browsing workspace', async()=>{
 const calls=[];
 const client=async(url,options)=>{calls.push({url,options});return {id:'default-chat',workspaceId:'@default'};};
 const api=createAgentConversationsClient(client,session);
 await api.create({workspaceId:'@default'});
 await api.list('@default');
 await api.read('@default','default-chat');
 assert.deepEqual(calls.map(call=>call.url),[
  '/api/v1/app/agent-service/conversations',
  '/api/v1/app/agent-service/conversations',
  '/api/v1/app/agent-service/conversations/default-chat',
 ]);
 assert.deepEqual(JSON.parse(calls[0].options.body),{});
 await api.create({workspaceId:'chosen-workspace',cwd:'/chosen'});
 assert.equal(calls.at(-1).url,'/api/v1/workspaces/chosen-workspace/agent-conversations');
 assert.equal(JSON.parse(calls.at(-1).options.body).cwd,'/chosen');
});


test('default workspace directory is read from the host without creating a conversation',async()=>{
 const calls=[];
 const api=createAgentConversationsClient(async(url,options)=>{calls.push({url,options});return {rootPath:'/app/default'};},session);
 assert.deepEqual(await api.defaultWorkspace(),{rootPath:'/app/default'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/api/v1/app/agent-service/default-workspace');
 assert.equal(calls[0].options.method,undefined);
});

test('活动主状态只显示一个静态结果，完成未查看仍属于活动',async()=>{
  const {activityState,isActiveConversation}=await import('../src/features/agent-conversations/conversation-activity.ts');
  const row={...conversation,activity:{version:3,seenThrough:1,active:true,updatedAt:'2026-10-27'}};
  assert.equal(activityState(row),'running');
  assert.equal(activityState({...row,run:{...row.run,status:'waiting-question'}}),'waiting');
  assert.equal(activityState({...row,run:{...row.run,status:'unknown'}}),'unknown');
  assert.equal(activityState({...row,run:{...row.run,status:'completed'}}),'unseen');
  assert.equal(isActiveConversation({...row,run:{...row.run,status:'completed'}}),true);
  const seen={...row,run:{...row.run,status:'completed'},activity:{...row.activity,active:false,seenThrough:3}};
  assert.equal(activityState(seen),null);assert.equal(isActiveConversation(seen),false);
});
test('全空间查询不继承浏览空间，查看确认携带准确身份与已呈现位置',async t=>{
  const requests=[];t.mock.method(globalThis,'fetch',async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({conversations:[],activity:{version:4,seenThrough:3}}));});
  const api=createAgentConversationsClient(createApiClient({getWorkspaceId:()=> 'browsing-ws',sessionAdapter:session}),session);
  await api.listAll({activeOnly:true,workspaceId:'saved/ws',agent:'codex',limit:10});await api.seen(conversation,3);
  const url=new URL(requests[0].url,'http://local');assert.equal(url.pathname,'/api/v1/app/agent-service/conversations');assert.equal(url.searchParams.get('workspaceId'),'saved/ws');assert.equal(url.searchParams.get('activeOnly'),'true');
  assert.equal(requests[1].url,'/api/v1/workspaces/saved%2Fws/agent-conversations/chat%2Fid/seen');assert.deepEqual(JSON.parse(requests[1].init.body),{through:3});
});

test('双入口按自己的视图打开、切换或收起，不把历史当作当前对话',async()=>{
  const {nextConversationPanel}=await import('../src/features/agent-conversations/conversation-state.ts');
  for(const view of ['conversation','history'])for(const target of ['conversation','history']){
    assert.deepEqual(nextConversationPanel(false,view,target),{open:true,view:target});
    assert.deepEqual(nextConversationPanel(true,view,target),{open:view!==target,view:target});
  }
});


test('新草稿只有一份，归属可切换或清除，已创建对话与配置域仍隔离',()=>{
  const rows=new Map(),storage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
  const key=draftKey('dev','ws-a',null);
  assert.equal(key,draftKey('dev','ws-b',null));assert.equal(key,draftKey('dev',null,'new'));
  assert.notEqual(key,draftKey('release','ws-a',null));assert.notEqual(key,draftKey('dev','ws-a','existing'));
  writeDraft(key,'未发送输入',storage,'task-a','ws-a');
  assert.equal(readDraft(draftKey('dev','ws-b',null),storage).text,'未发送输入');
  writeDraft(key,readDraft(key,storage).text,storage,undefined,'ws-b');
  assert.deepEqual(readDraft(key,storage),{text:'未发送输入',taskId:undefined,workspaceId:'ws-b',available:true});
  writeDraft(key,readDraft(key,storage).text,storage,undefined,'@default');
  assert.equal(readDraft(key,storage).workspaceId,'@default');assert.equal(readDraft(key,storage).text,'未发送输入');
  writeDraft(key,'',storage,undefined,'@default');assert.equal(readDraft(key,storage).workspaceId,'@default','空文本也保留明确清除后的选择');
});

test('并发模型目录请求合并，完成或失败后允许重新读取，取消保持独立',async()=>{
  let resolve,reject,calls=0;
  const api=createAgentConversationsClient(()=>{calls++;return new Promise((yes,no)=>{resolve=yes;reject=no;});},session);
  const first=api.modelCatalog(),second=api.modelCatalog();assert.equal(calls,1);
  resolve({models:[]});assert.deepEqual(await Promise.all([first,second]),[{models:[]},{models:[]}]);
  const failing=api.modelCatalog();assert.equal(calls,2);reject(new Error('offline'));await assert.rejects(failing,/offline/);
  const fresh=api.modelCatalog();assert.equal(calls,3);const finishShared=resolve;
  const cancelled=api.modelCatalog(new AbortController().signal);assert.equal(calls,4);resolve({models:[]});finishShared({models:[]});await Promise.all([fresh,cancelled]);
});


test('模型写入使旧目录读取失效，旧完成不能解除新读取的合并',async()=>{
  const reads=[];let posts=0;
  const api=createAgentConversationsClient((url,init)=>init?.method==='POST'?(posts++,Promise.resolve({id:'account'})):new Promise(resolve=>reads.push(resolve)),session);
  const old=api.modelCatalog();await api.addModelAccount('devin');assert.equal(posts,1);
  const fresh=api.modelCatalog();assert.equal(reads.length,2);
  reads[0]({models:[{id:'old'}]});await old;
  const shared=api.modelCatalog();assert.equal(reads.length,2,'旧读取完成不清除新的合并槽位');
  reads[1]({models:[{id:'fresh'}]});assert.equal((await fresh).models[0].id,'fresh');assert.equal((await shared).models[0].id,'fresh');
});
