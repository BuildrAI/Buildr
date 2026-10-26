import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Empty, Input, Modal, Popover, Select, Spin, Tag } from 'antd';
import { ArrowUpOutlined, CommentOutlined, CopyOutlined, EllipsisOutlined, FolderOpenOutlined, MenuOutlined, PlusOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons';
import { MarkdownHost } from '../../components/MarkdownHost';
import type { ApiError } from '../../api';
import { copyText } from '../../lib/copyText';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationHistory, type ConversationWorkspace } from './ConversationHistory';
import { ConversationAttention } from './ConversationAttention';
import { ConversationRequest } from './ConversationRequest';
import { ConversationAgentSelect, ConversationOptions } from './ConversationOptions';
import { ConversationDock } from './ConversationDock';
import { ConversationMessageImages } from './ConversationMessageImages';
import { ConversationImageInput, type DraftImage } from './ConversationImageInput';
import { imageSelectionError, conversationImageTypes } from './conversation-images';
import {officialConversationChoice,conversationPermissionKey,conversationPermissionStorageKey,permissionModeLabels,readConversationPermission,reasoningEffortLabel,selectedConversationModel,selectedConversationPermission,supportsConversationPermission,writeConversationPermission,type ConversationChoice,type PermissionMode} from './conversation-options';
import { appendDraftAttachment, canGenerateConversationTitle, canStopConversationTool, executionLocked, groupConversationStream, removeSubmittedAttachments, shouldSendOnKey, latestConversationParticipant, processBlockKey, type ConversationSelection } from './conversation-state';
import { conversationActionKey, createConversationActions } from './conversation-actions';
import { useConversationDraft } from './useConversationDraft';
import { providerNames, type ConversationEntry, type ConversationView, type SendDraft, type SendPreview } from './types';
import { useLocation, useNavigate } from 'react-router-dom';
import { codeApi } from '../code/api/code-api';
import { conversationFileTarget } from './conversation-process';
import { ConversationProcessBlock } from './ConversationProcessBlock';
import './agent-conversations.css';
const statusLabels = {starting:'正在准备执行',running:'正在执行','waiting-approval':'等待授权','waiting-question':'等待你的回复',stopping:'正在停止',stopped:'已确认停止','tools-active':'模型已中断，仍有命令运行',unknown:'执行状态待确认',completed:'本轮已结束',failed:'本轮执行失败'};
type Prepared = {conversation:ConversationView;input:SendDraft;preview:SendPreview;clientRequestId:string;selection:ConversationSelection};
type SendOperation={selection:ConversationSelection};
type Props={workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null;portalTarget?:HTMLElement|null};
export function ConversationPanel({workspaces,defaultWorkspaceId,portalTarget}:Props){
  const context=useAgentConversations(),chat=context.conversation;
  const navigate=useNavigate(),location=useLocation();
  const [newWorkspaceId,setNewWorkspaceId]=useState(defaultWorkspaceId||'');
  const draftWorkspaceId=context.draftScope?.workspaceId||newWorkspaceId;
  const newCwd=workspaces.find(item=>item.id===draftWorkspaceId)?.rootPath||'';
  // 新对话是同工作空间一份草稿：文本、模型/权限、附件与任务绑定按 workspace 共享；入口只提出绑定，有内容的草稿才留住绑定。
  const draftSlot=context.scope?.conversationId||'new:'+draftWorkspaceId;
  const draft=useConversationDraft(context.scope?.workspaceId||draftWorkspaceId||null,context.scope?.conversationId||null);
  // 明确的入口意图优先；没有入口意图时跟随草稿自身已保存的绑定。
  const boundTaskId=context.draftScope?(context.draftScope.taskId||''):(draft.taskId||'');
  useEffect(()=>{
    if(context.scope||!context.draftScope||context.draftScope.workspaceId!==draftWorkspaceId)return;
    if(draft.taskId===context.draftScope.taskId)return;
    draft.setTaskId(context.draftScope.taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[context.scope,context.draftScope,draftWorkspaceId,draft.taskId]);
  const [choices,setChoices]=useState<Record<string,ConversationChoice>>({});
  const choiceKey=draftSlot;
  const lastParticipant=latestConversationParticipant(chat);
  const defaultConnection=context.connections.find(item=>item.id===lastParticipant?.connectionId)||context.connections.find(item=>item.status==='ready')||context.connections[0];
  const choice=choices[choiceKey]||{connectionId:defaultConnection?.id||'',model:chat?.run?.model,modelAccountId:chat?.run?.modelAccountId,modelAccountIdentity:chat?.run?.modelAccountIdentity,serviceTier:chat?.run?.serviceTier,reasoningEffort:chat?.run?.reasoningEffort};
  const connection=context.connections.find(item=>item.id===choice.connectionId);
  const [permissionChoices,setPermissionChoices]=useState<Record<string,PermissionMode>>({});
  const permissionKey=conversationPermissionKey(context.scope,draftWorkspaceId);
  const permissionProfile=document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content')||'local';
  const permissionStorageKey=conversationPermissionStorageKey(permissionProfile,context.scope,draftWorkspaceId);
  const savedPermission=(()=>{try{return readConversationPermission(permissionStorageKey,sessionStorage);}catch{return;}})();
  const permissionMode=selectedConversationPermission(permissionChoices[permissionKey]??savedPermission,chat?.run);
  const permissionAvailable=supportsConversationPermission(connection,permissionMode);
  const [attachments,setAttachments]=useState<Record<string,DraftImage[]>>({});
  const attachmentKey=draftSlot;
  const images=attachments[attachmentKey]||[];
  const [sending,setSending]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const [,setActionVersion]=useState(0);
  const [actions]=useState(()=>createConversationActions(()=>setActionVersion(value=>value+1)));
  const actionKey=(value:ConversationView,action:string,identity=value.run?.id||'')=>conversationActionKey({workspaceId:value.workspaceId,conversationId:value.id},action,identity);
  const uploadKey=chat?actionKey(chat,'upload',''):conversationActionKey({workspaceId:draftWorkspaceId,conversationId:'new'},'upload');
  const stopping=Boolean(chat&&actions.has(actionKey(chat,'stop'))),observing=Boolean(chat&&actions.has(actionKey(chat,'observe'))),uploading=actions.has(uploadKey);
  const generatingTitle=Boolean(chat&&actions.has(actionKey(chat,'generate-title','')));
  const [prepared,setPrepared]=useState<Prepared|null>(null),[summary,setSummary]=useState(''),[previewOpen,setPreviewOpen]=useState(false),[rename,setRename]=useState(false),[title,setTitle]=useState('');
  const [moreOpen,setMoreOpen]=useState(false),[locationOpen,setLocationOpen]=useState(false);
  const [expandedToolGroups,setExpandedToolGroups]=useState<Record<string,boolean>>({});
  const stream=useRef<HTMLDivElement>(null),readPosition=useRef(0),bottom=useRef(true),fileInput=useRef<HTMLInputElement>(null),composing=useRef(false);
  const selectedSourceModel=context.modelCatalog.find(model=>model.accountId===choice.modelAccountId&&model.modelId===choice.model);
  const activeSend=useRef<SendOperation|null>(null),locked=executionLocked(chat?.run),canSend=!context.loading&&(!context.scope||Boolean(chat))&&!locked&&!sending&&!uploading&&(choice.modelAccountId?connection?.enabled&&selectedSourceModel?.available:connection?.status==='ready')&&permissionAvailable&&(!images.length||connection?.capabilities.images);
  const select=(value:ConversationChoice)=>{setChoices(previous=>({...previous,[choiceKey]:value}));setPrepared(null);setSummary('');setPreviewOpen(false);};
  useEffect(()=>{
    if(choiceKey.startsWith('new:')&&defaultConnection?.status==='ready')setChoices(previous=>previous[choiceKey]?previous:{...previous,[choiceKey]:officialConversationChoice(defaultConnection,context.modelCatalog)});
  },[choiceKey,defaultConnection?.id,defaultConnection?.status]);
  const selectPermission=(value:PermissionMode)=>{setPermissionChoices(previous=>({...previous,[permissionKey]:value}));try{writeConversationPermission(permissionStorageKey,value,sessionStorage);}catch{/* Same-page selection remains usable. */}setPrepared(null);setSummary('');setPreviewOpen(false);};
  useEffect(()=>{if(!newWorkspaceId&&defaultWorkspaceId)setNewWorkspaceId(defaultWorkspaceId);},[newWorkspaceId,defaultWorkspaceId]);
  useEffect(()=>{if(context.draftScope?.workspaceId)setNewWorkspaceId(context.draftScope.workspaceId);},[context.draftScope]);
  useEffect(()=>{setError('');setFeedback('');setExpandedToolGroups({});const active=activeSend.current;if(!active||!context.isSelectionCurrent(active.selection)){activeSend.current=null;setSending(false);setPrepared(null);setSummary('');setPreviewOpen(false);}bottom.current=true;},[context.selectionGeneration,context.scope?.workspaceId,context.scope?.conversationId,context.isSelectionCurrent]);
  useEffect(()=>{setMoreOpen(false);setLocationOpen(false);},[context.selectionGeneration,context.open,context.side,context.full,context.view]);
  useEffect(()=>{if(bottom.current)stream.current?.scrollTo({top:stream.current.scrollHeight});},[chat?.id,chat?.entries.length,chat?.entries.at(-1)?.text,chat?.requests.length,chat?.run?.status]);
  useLayoutEffect(()=>{if(stream.current?.getClientRects().length)stream.current.scrollTop=bottom.current?stream.current.scrollHeight:readPosition.current;},[portalTarget,context.view,context.open]);
  const fail=(failure:unknown)=>{setError(failure instanceof Error?failure.message:'操作未完成。');};
  const openProcessFile=async(path:string)=>{
    if(!chat)return;
    const selection=context.getSelection();
    try{
      const catalog=await codeApi.repositories(chat.workspaceId,chat.taskId);
      if(!context.isSelectionCurrent(selection))return;
      const file=conversationFileTarget(chat.cwd,path,catalog);
      if(!file)throw new Error('无法确认这个文件的原工作目录，请从代码目录选择实际位置。调用记录已保留。');
      navigate(`/workspaces/${encodeURIComponent(chat.workspaceId)}/code/explorer`,{state:{codeEntry:{file,from:{pathname:location.pathname,search:location.search,hash:location.hash,state:location.state}}}});
    }catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}
  };
  const recoverConflict=async(failure:unknown)=>{
    if((failure as ApiError)?.status!==409)return false;
    setPrepared(null);setPreviewOpen(false);
    try{await context.refresh();await context.refreshConnections().catch(()=>{});await context.refreshModelCatalog().catch(()=>{});setError('对话或套餐状态已变化，已重新读取；套餐登录来源变化时请重新选择模型。草稿保留。');}catch{fail(failure);}
    return true;
  };
  const ensureConversation=async(selection=context.getSelection())=>{
    if(chat)return chat;
    if(!draftWorkspaceId||!newCwd.trim())throw new Error('请先选择工作空间。');
    const created=await context.create({workspaceId:draftWorkspaceId,cwd:newCwd.trim(),...(boundTaskId?{taskId:boundTaskId}:{})},selection);
    if(!context.isSelectionCurrent({...selection,scope:{workspaceId:created.workspaceId,conversationId:created.id}}))return created;
    draft.transferTo(created.workspaceId,created.id);
    if(images.length)setAttachments(previous=>({...previous,[attachmentKey]:removeSubmittedAttachments(previous[attachmentKey]||[],images.map(image=>image.id)),[created.id]:images}));
    const createdScope={workspaceId:created.workspaceId,conversationId:created.id};
    setPermissionChoices(previous=>({...previous,[conversationPermissionKey(createdScope,'')]:permissionMode}));
    try{writeConversationPermission(conversationPermissionStorageKey(permissionProfile,createdScope),permissionMode,sessionStorage);}catch{/* Same-page selection remains usable. */}
    setChoices(previous=>({...previous,[created.id]:choice}));return created;
  };
  const commit=async(value:Prepared,continuing?:SendOperation)=>{
    if(!value.preview.fits||!context.isSelectionCurrent(value.selection)||(!continuing&&activeSend.current))return;
    const operation=continuing??{selection:value.selection};activeSend.current=operation;
    setSending(true);setError('');
    try{
      const result=await context.api.send(value.conversation,{...value.input,previewToken:value.preview.token,clientRequestId:value.clientRequestId});
      context.apply(result.conversation,value.conversation.revision);
      draft.clearSubmitted(value.conversation.workspaceId,value.conversation.id,value.input.text);
      setAttachments(previous=>({...previous,[value.conversation.id]:removeSubmittedAttachments(previous[value.conversation.id]||[],value.input.attachmentIds||[])}));
      if(context.isSelectionCurrent(value.selection)){setPrepared(null);setSummary('');setPreviewOpen(false);}
      void context.refreshPending().catch(()=>{});
    }catch(failure){if(context.isSelectionCurrent(value.selection)&&!await recoverConflict(failure)){fail(failure);setPreviewOpen(true);}}finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);}}
  };
  const prepare=async(show=true)=>{
    if(activeSend.current||!canSend||(!draft.text.trim()&&!images.length))return;
    const operation:SendOperation={selection:context.getSelection()};activeSend.current=operation;setSending(true);setError('');
    try{
      const current=await ensureConversation(operation.selection);
      operation.selection={...operation.selection,scope:{workspaceId:current.workspaceId,conversationId:current.id}};
      if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
      const input:SendDraft={expectedRevision:current.revision,connectionId:choice.connectionId,modelAccountId:choice.modelAccountId,modelAccountRevision:choice.modelAccountRevision,modelAccountIdentity:choice.modelAccountIdentity,model:choice.model,serviceTier:choice.serviceTier,reasoningEffort:choice.reasoningEffort,permissionMode,text:draft.text,attachmentIds:images.map(item=>item.id) as NonNullable<SendDraft['attachmentIds']>,...(summary.trim()?{handoffSummary:summary.trim()}: {})};
      const preview=await context.api.prepare(current,input);
      if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
      const next:Prepared={conversation:current,input,preview,clientRequestId:crypto.randomUUID(),selection:operation.selection};setPrepared(next);
      if(show||preview.switching||!preview.fits)setPreviewOpen(true);else await commit(next,operation);
    }catch(failure){if(context.isSelectionCurrent(operation.selection)&&!await recoverConflict(failure))fail(failure);}finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);}}
  };
  const observe=async()=>{
    if(!chat)return;const key=actionKey(chat,'observe');if(!actions.begin(key))return;const selection=context.getSelection();setError('');
    try{context.apply(await context.api.observe(chat),chat.revision);if(context.isSelectionCurrent(selection))await context.refresh();}catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}finally{actions.finish(key);}
  };
  const stop=async(toolId?:string)=>{
    if(!chat)return;const key=actionKey(chat,'stop');if(!actions.begin(key))return;const selection=context.getSelection();setError('');
    try{context.apply(await context.api.stop(chat,toolId),chat.revision);void context.refreshPending().catch(()=>{});}catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}finally{actions.finish(key);}
  };
  const reply=async(requestId:string,answer:unknown)=>{
    if(!chat)return;const key=actionKey(chat,'reply',requestId);if(!actions.begin(key))return;const selection=context.getSelection();setError('');
    try{context.apply(await context.api.reply(chat,requestId,{answer}),chat.revision);void context.refreshPending().catch(()=>{});}catch(failure){if(context.isSelectionCurrent(selection)){fail(failure);void context.refresh().catch(()=>{});}}finally{actions.finish(key);}
  };
  const upload=async(files:FileList|File[]|null)=>{
    if(!files?.length||uploading||locked||sending||context.loading||Boolean(context.scope&&!chat))return;setError('');
    const selected=Array.from(files);if(fileInput.current)fileInput.current.value='';const validation=imageSelectionError(selected,images.length,connection?.capabilities.maxImageBytes);
    if(validation){setError(validation);return;}
    let key=uploadKey;if(!actions.begin(key))return;let selection=context.getSelection();
    try{let current=await ensureConversation(selection);selection={...selection,scope:{workspaceId:current.workspaceId,conversationId:current.id}};if(!context.isSelectionCurrent(selection))return;const boundKey=actionKey(current,'upload','');actions.move(key,boundKey);key=boundKey;for(const file of selected){const image=await context.api.upload(current,file);const observedRevision=current.revision;current={...current,revision:image.revision};context.apply(current,observedRevision);setAttachments(previous=>({...previous,[current.id]:appendDraftAttachment(previous[current.id]||[],{...image,name:file.name,file})}));}if(context.isSelectionCurrent(selection))await context.refresh();}catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}finally{actions.finish(key);if(fileInput.current)fileInput.current.value='';}
  };
  const updateMetadata=async(input:{title?:string;hidden?:boolean})=>{if(!chat)return;const selection=context.getSelection();try{context.apply(await context.api.update(chat,input),chat.revision);if(context.isSelectionCurrent(selection)){setRename(false);if(input.hidden!==undefined)context.setView('history');}}catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}};
  const generateTitle=async()=>{
    if(!chat||!canGenerateConversationTitle(chat))return;
    const key=actionKey(chat,'generate-title','');if(!actions.begin(key))return;
    const selection=context.getSelection();setError('');setFeedback('正在生成简短标题…');
    try{context.apply(await context.api.generateTitle(chat),chat.revision);if(context.isSelectionCurrent(selection))setFeedback('对话标题已更新。');}
    catch(failure){if(context.isSelectionCurrent(selection)){setFeedback('');fail(failure);}}
    finally{actions.finish(key);}
  };
  const workspace=workspaces.find(item=>item.id===chat?.workspaceId);
  const preparedShared=context.modelCatalog.find(model=>model.accountId===prepared?.preview.modelAccountId&&model.modelId===prepared?.preview.model);
  const preparedModel=preparedShared??selectedConversationModel(connection,prepared?.preview.model);
  const preparedTier=preparedShared?.serviceTiers?.find(tier=>tier.id===prepared?.preview.serviceTier);
  const preparedEffort=(preparedTier??preparedModel)?.reasoningEfforts?.find(item=>item.id===prepared?.preview.reasoningEffort);
  const settings=<div className="ac-location-settings"><strong>工作空间</strong>{chat?<><span>{workspace?.name||chat.workspaceId}</span><code>{chat.cwd}</code>{chat.taskId&&<small>关联任务：{chat.taskId}</small>}</>:<><Select classNames={{popup:{root:'ac-panel-popup'}}} aria-label="新对话工作空间" value={draftWorkspaceId||undefined} placeholder="选择工作空间" options={workspaces.map(item=>({value:item.id,label:item.name}))} onChange={value=>{context.newConversation({preserveVisibility:true});setNewWorkspaceId(value);}}/>{newCwd&&<code className="ac-workspace-directory">{newCwd}</code>}</>}</div>;
  const transcript=chat?groupConversationStream(chat.entries,chat.run):[];
  const replyFollowsProcess=(index:number)=>{
    const previous=transcript[index-1],item=transcript[index];
    return previous?.type==='process-block'&&item?.type==='entry'&&item.entry.kind==='message'&&item.entry.role==='assistant'&&previous.entries[0].runId===item.entry.runId;
  };
  const renderEntry=(entry:ConversationEntry)=>entry.kind==='handoff'?<details className="ac-handoff" key={entry.id}><summary>接续记录 · {entry.provider?providerNames[entry.provider]||entry.provider:'已保存'}</summary><p>{entry.text}</p></details>:<article key={entry.id} className={'ac-message is-'+entry.role} data-entry-id={entry.id} data-message-provider={entry.provider}>{entry.role==='assistant'?<MarkdownHost markdown={entry.text} className="markdown-body"/>:<p>{entry.text}</p>}{entry.attachments?.length?<ConversationMessageImages conversation={chat!} ids={entry.attachments} read={context.api.readImage}/>:null}{entry.status==='unknown'&&<Tag color="warning">是否送达待确认</Tag>}{entry.role==='assistant'&&<Button type="text" size="small" icon={<CopyOutlined/>} aria-label="复制回复" onClick={()=>void copyText(entry.text).then(ok=>setFeedback(ok?'回复已复制。':'复制失败，请手动选择文字。'))}/>}</article>;
  const panel=<section id="agent-conversation-panel" className={'ac-panel'+(context.full?' is-full':'')} aria-label="内部对话" data-dock={context.side} data-conversation-id={chat?.id}>
    {context.view==='history'?<ConversationHistory workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId}/>:<>
      <header className="ac-thread-header">
        <Button type="text" icon={<MenuOutlined/>} aria-label="查看对话历史" title="对话历史" onClick={()=>context.setView('history')}/>
        {context.open&&<ConversationAttention className="ac-dock-attention"/>}
        <Popover rootClassName="ac-panel-popup" title="工作空间" trigger="click" open={locationOpen} onOpenChange={setLocationOpen} content={settings}>
          <button type="button" className="ac-thread-title" aria-label="对话信息" title={chat?.title||'新对话'}>{chat?.title||'新对话'}</button>
        </Popover>
        <div className="ac-thread-actions">
          <Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" title="新建对话" onClick={()=>context.newConversation({preserveVisibility:true})}/>
          <Dropdown overlayClassName="ac-panel-popup" trigger={['click']} open={moreOpen} onOpenChange={setMoreOpen} menu={{items:[
            {key:'settings',label:'智能体与模型'},
            {type:'divider'},
            {key:'full',label:context.full?'恢复分屏':'专注对话'},
            {key:'side',label:context.side==='right'?'对话移到最左侧':'对话移到右侧'},
            {type:'divider'},
            {key:'generate-title',label:generatingTitle?'正在生成标题…':'生成简短标题',disabled:generatingTitle||!canGenerateConversationTitle(chat)},
            {key:'rename',label:'重命名',disabled:!chat},
            {key:'hide',label:chat?.hidden?'恢复到最近对话':'从最近对话隐藏',disabled:!chat}
          ],onClick:({key})=>{
            setMoreOpen(false);
            if(key==='side')context.move();
            else if(key==='full'){context.setOpen(true);context.setFull(!context.full);}
            else if(key==='settings')context.setSettings(true);
            else if(key==='generate-title')void generateTitle();
            else if(key==='rename'&&chat){setTitle(chat.title);setRename(true);}
            else if(key==='hide'&&chat)void updateMetadata({hidden:!chat.hidden});
          }}}><Button type="text" icon={<EllipsisOutlined/>} aria-label="更多对话操作" title="更多"/></Dropdown>
        </div>
      </header>
      {chat?.participants.length?<div className="ac-participants">参与过此对话 {chat.participants.map(item=><span key={item.id}>{providerNames[item.provider]||item.provider}</span>)}</div>:null}
      <div className="ac-stream" ref={stream} onScroll={()=>{if(stream.current?.getClientRects().length){readPosition.current=stream.current.scrollTop;bottom.current=stream.current.scrollHeight-stream.current.scrollTop-stream.current.clientHeight<80;}}}>
        {context.loading?<Spin/>:context.error?<Alert type="error" showIcon message={context.error} action={<Button onClick={()=>void context.refresh().catch(fail)}>重新读取</Button>}/>:!chat?.entries.length?<div className="ac-welcome"><CommentOutlined/><h1>{chat?.taskId||boundTaskId?'从这项任务继续':'今天想做什么？'}</h1><p>了解一个问题，或者交办一件事。</p>{!chat&&settings}</div>:<div className="ac-message-list">
          {chat.nextEntryCursor!==undefined&&<Button size="small" onClick={()=>{void context.api.entries(chat.workspaceId,chat.id,chat.nextEntryCursor!).then(result=>{context.prependEntries(result);}).catch(fail);}}>加载更早记录</Button>}
          {transcript.map((item,index)=>{
            if(item.type==='process-block'){
              const key=processBlockKey(item.entries),next=transcript[index+1];
              const result=replyFollowsProcess(index+1)&&next?.type==='entry'?next.entry:undefined;
              const provider=result?.provider||item.entries[0].provider;
              return <section className="ac-assistant-reply" key={key} data-run-id={item.entries[0].runId}>
                <small className="ac-message-identity">{provider?providerNames[provider]||provider:'智能体'}</small>
                <ConversationProcessBlock blockKey={key} entries={item.entries} active={item.active} finishedAt={item.finishedAt} onOpenFile={path=>void openProcessFile(path)} open={expandedToolGroups[key]===true} onToggle={(name,open)=>setExpandedToolGroups(previous=>({...previous,[name]:open}))}/>
                {result&&renderEntry(result)}
              </section>;
            }
            if(replyFollowsProcess(index))return null;
            const entry=item.entry;
            return entry.kind==='message'&&entry.role==='assistant'?<section className="ac-assistant-reply" key={'reply:'+entry.id} data-run-id={entry.runId}>
              <small className="ac-message-identity">{entry.provider?providerNames[entry.provider]||entry.provider:'智能体'}</small>
              {renderEntry(entry)}
            </section>:renderEntry(entry);
          })}
        </div>}
        {chat?.run&&<div className="ac-run-status" role="status" data-run-status={chat.run.status}>{statusLabels[chat.run.status]}{chat.run.modelSourceLabel&&` · ${chat.run.modelSourceLabel}`} · {permissionModeLabels[chat.run.permissionMode||'default']}{chat.run.diagnostic&&<p>{chat.run.diagnostic}</p>}</div>}
        {context.streamError&&<Alert type="warning" showIcon message="对话连接已中断" description={context.streamError} action={<Button loading={observing} onClick={()=>void observe()}>重新连接并核对</Button>}/>}
        {chat?.run?.status==='unknown'&&<Alert type="warning" showIcon message="执行状态待确认" description="核对原执行后再发送；重新连接不会重发原指令。" action={<Button loading={observing} onClick={()=>void observe()}>核对执行状态</Button>}/>}
        {chat?.run?.status==='tools-active'&&<Alert type="warning" showIcon message="模型已中断，仍有命令运行" description={<div>{chat.run.tools.filter(tool=>tool.status!=='completed').map(tool=><p key={tool.id}>{tool.label}{canStopConversationTool(tool)?<Button size="small" loading={stopping} onClick={()=>void stop(tool.id)}>停止此命令</Button>:<small> · 不支持单独停止</small>}</p>)}<Button type="link" size="small" loading={observing} onClick={()=>void observe()}>核对执行状态</Button></div>} action={<Button loading={stopping} onClick={()=>void stop()}>停止剩余执行</Button>}/>}
        {chat?.requests.map(request=><ConversationRequest key={request.id} request={request} provider={chat.run?.provider||chat.participants.find(item=>item.id===request.participantId)?.provider||'codex'} busy={actions.has(actionKey(chat,'reply',request.id))} onReply={answer=>void reply(request.id,answer)}/>)}
      </div>
      <div className="ac-compose-wrap">{choice.modelAccountId&&!selectedSourceModel?.available&&<Alert type="warning" showIcon message="所选模型已停用或来源不可用，请重新选择。"/>}{error&&<Alert type="warning" showIcon message={error} closable onClose={()=>setError('')}/>} {feedback&&<small role="status">{feedback}</small>}{!draft.available&&<Alert type="warning" message="浏览器存储不可用，刷新后无法恢复未发送草稿。"/>}
        {!connection?.enabled&&<div className="ac-connect-notice"><span>{connection?`${providerNames[connection.provider]} 尚未就绪`:'请先接入智能体'}</span><Button type="link" size="small" onClick={()=>context.setSettings(true)}>智能体与模型</Button></div>}
        {choice.connectionId&&chat?.participants.length&&lastParticipant?.connectionId!==choice.connectionId?<div className="ac-transfer-notice">下一条由 {connection?providerNames[connection.provider]:''} 接续；原记录保留。<Button type="link" size="small" onClick={()=>void prepare(true)}>查看接续内容</Button></div>:null}
        {!permissionAvailable&&<Alert type="warning" showIcon message={"当前执行者不支持"+permissionModeLabels[permissionMode]} description="已保留所选权限。请选择可用权限或切换执行者后再发送，草稿保留。"/>}{images.length>0&&!connection?.capabilities.images&&<Alert type="warning" message="当前执行者不支持图片。请移除图片或选择支持图片的执行者。"/>}
        <ConversationImageInput images={images} disabled={locked||sending||uploading||context.loading||Boolean(context.scope&&!chat)} onAdd={upload} onBlocked={()=>setError('当前正在发送、执行或准备对话，请稍后再添加图片。')} onRemove={id=>{setAttachments(previous=>({...previous,[attachmentKey]:(previous[attachmentKey]||[]).filter(item=>item.id!==id)}));setPrepared(null);setPreviewOpen(false);}}>
          <Input.TextArea id="agent-conversation-input" aria-label="对话输入" disabled={context.loading||Boolean(context.scope&&!chat)} placeholder={locked?'可以先写草稿，当前执行结束后再发送…':'提出问题，或描述想完成的工作…（可粘贴截图）'} value={draft.text} onChange={event=>{draft.setText(event.target.value);setPrepared(null);}} autoSize={{minRows:2,maxRows:8}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(shouldSendOnKey({key:event.key,shiftKey:event.shiftKey,isComposing:composing.current||event.nativeEvent.isComposing,keyCode:event.nativeEvent.keyCode})){event.preventDefault();if(canSend)void prepare(false);}}}/>

          <div className="ac-compose-toolbar"><div className="ac-compose-access"><input ref={fileInput} type="file" accept={conversationImageTypes.join(',')} multiple hidden onChange={event=>void upload(event.target.files)}/><Button type="text" icon={<PlusOutlined/>} aria-label="添加图片" title="添加图片，也可粘贴截图或拖入图片" loading={uploading} disabled={locked||sending||context.loading||Boolean(context.scope&&!chat)} onClick={()=>fileInput.current?.click()}/><ConversationAgentSelect connections={context.connections} value={choice} disabled={locked||sending} onChange={select}/><Select<PermissionMode> className="ac-choice ac-permission-select" aria-label="执行权限" placement="topLeft" variant="borderless" size="small" suffixIcon={null} labelRender={({label})=><span className="ac-permission-label"><SafetyCertificateOutlined/>{label}</span>} value={permissionMode} disabled={locked||sending||uploading||context.loading||Boolean(context.scope&&!chat)} popupMatchSelectWidth={false} classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}} title="权限更改用于本对话下一轮。完全访问会跳过逐次工具审批；业务问题仍需回复，系统与厂家限制继续有效。" options={[{value:'default',label:'默认权限',disabled:!supportsConversationPermission(connection,'default')},{value:'full-access',label:'完全访问',disabled:!supportsConversationPermission(connection,'full-access')}]} onChange={selectPermission}/></div><div className="ac-compose-execution"><ConversationOptions showAgent={false} key={choiceKey+':'+context.side+':'+context.open} connections={context.connections} value={choice} disabled={locked||sending} onChange={value=>{select(value);if(connection?.provider==='dsh'&&value.connectionId===choice.connectionId&&value.model!==choice.model)setFeedback('发送时将应用所选模型，并更新 DSH 独立配置后续默认模型。');}}/>
            {locked&&chat?.run?<Button shape="circle" icon={<StopOutlined/>} aria-label="停止本次执行" title="停止本次执行" loading={stopping} disabled={chat.run.status==='stopping'} onClick={()=>void stop()}/>:<Button type="primary" shape="circle" icon={<ArrowUpOutlined/>} aria-label="发送对话" disabled={!canSend||(!draft.text.trim()&&!images.length)} loading={sending} onClick={()=>void prepare(false)}/>}</div></div>
        </ConversationImageInput>
        <div className="ac-compose-foot"><Popover rootClassName="ac-panel-popup" content={settings} trigger="click"><button type="button"><FolderOpenOutlined/><span>{chat?.cwd||newCwd||'选择工作空间'}</span></button></Popover><Button type="link" size="small" disabled={!canSend||(!draft.text.trim()&&!images.length)} onClick={()=>void prepare(true)}>查看发送内容</Button><small>Enter 发送 · Shift+Enter 换行</small></div><div className="ac-location-meta">所属工作空间：{chat?(workspace?.name||chat.workspaceId):(workspaces.find(item=>item.id===draftWorkspaceId)?.name||'未选择')}{chat?(chat.taskId?' · 关联任务：'+chat.taskId:''):(boundTaskId?<> · 关联任务：{boundTaskId}<button type="button" className="ac-task-detach" aria-label="移除任务关联" onClick={()=>{draft.setTaskId(undefined);setPrepared(null);context.newConversation({preserveVisibility:true,scope:{workspaceId:draftWorkspaceId}});}}>移除</button></>:'')}{locked?' · 输入仅保留为草稿':''}</div>
      </div>
    </>}
    <Modal open={previewOpen} title="确认发送与接续范围" okText="发送给此执行者" cancelText="返回草稿" confirmLoading={sending} okButtonProps={{disabled:!prepared?.preview.fits||locked||!prepared}} onCancel={()=>setPreviewOpen(false)} onOk={()=>{if(prepared)void commit(prepared);}}><div className="ac-context-preview">{prepared?<><strong>{connection?providerNames[connection.provider]:''} · {prepared.preview.participantId?'恢复已有原生上下文':'首次参与'}</strong>{prepared.preview.model&&<p>模型：{preparedModel?.label||prepared.preview.model}{prepared.preview.reasoningEffort?' · 思考深度：'+(preparedEffort?reasoningEffortLabel(preparedEffort):prepared.preview.reasoningEffort):''}</p>}<p>服务档位：{preparedTier?.label||prepared.preview.serviceTier||'模型默认'}</p><p>执行权限：{permissionModeLabels[prepared.preview.permissionMode||'default']}</p><p>起始目录：{prepared.preview.cwd}</p>{prepared.preview.taskId&&<p>关联任务：{prepared.preview.taskId}</p>}<p>{prepared.preview.inputBytes} / {prepared.preview.maxInputBytes} 字节</p>{prepared.preview.diagnostic&&<Alert type="warning" message={prepared.preview.diagnostic}/>}<h4>实际交付的记录 · {prepared.preview.history.length} 条</h4>{prepared.preview.history.map((entry,index)=><details key={entry.sequence+':'+index}><summary>#{entry.sequence} · {entry.provider||entry.role}</summary><p>{entry.text}</p></details>)}<p>模型来源：{prepared.preview.modelSourceLabel||'原生账号'}</p><h4>本次新指令</h4><p>{prepared.preview.text}</p>{Boolean(prepared.input.attachmentIds?.length)&&<p>同时发送 {prepared.input.attachmentIds!.length} 张图片。</p>}{!prepared.preview.fits&&<><Alert type="warning" message="接续内容超出容量" description="可以返回并继续原参与者，或明确提供一份精简接续说明；原历史完整保留。"/><Input.TextArea aria-label="精简接续说明" placeholder="写明目标、已确认结论、约束及需要继续的内容…" value={summary} onChange={event=>setSummary(event.target.value)} autoSize={{minRows:4,maxRows:10}}/><Button disabled={!summary.trim()} loading={sending} onClick={()=>void prepare(true)}>使用这份说明重新检查</Button></>}{prepared.input.handoffSummary&&<><h4>你确认的精简接续说明</h4><p>{prepared.input.handoffSummary}</p></>}<small>历史作为参考，不自动重放工具操作。执行者继续工作时仍需核对当前文件。</small></>:<Empty description="输入已变化，请返回草稿重新检查。"/>}</div></Modal>
    <Modal open={rename} title="重命名对话" onCancel={()=>setRename(false)} onOk={()=>void updateMetadata({title:title.trim()})} okButtonProps={{disabled:!title.trim()}} okText="保存" cancelText="取消"><Input aria-label="对话名称" value={title} onChange={event=>setTitle(event.target.value)}/></Modal>
  </section>;
  return <ConversationDock panel={panel} portalTarget={portalTarget}/>;
}
