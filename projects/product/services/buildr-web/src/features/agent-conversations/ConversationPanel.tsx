import { conversationModelLabel } from './conversation-model-label';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Input, Modal, Popover, Select, Spin, Tag } from 'antd';
import { ArrowUpOutlined, CommentOutlined, EllipsisOutlined, MenuOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons';
import { MarkdownHost } from '../../components/MarkdownHost';
import type { MarkdownRenderOptions } from '../../markdown';
import type { ApiError } from '../../api';
import { CopyButton } from '../../components/CopyButton';
import { useAgentConversations } from './AgentConversationsContext';
import {useEarlierConversationEntries} from './useEarlierConversationEntries';
import {carryExpandedProcessBlocks, conversationContinuationText, conversationRecoveryAction} from './conversation-state';
import { ConversationHistory, type ConversationWorkspace } from './ConversationHistory';
import { ConversationRequest } from './ConversationRequest';
import { ConversationPendingSend } from './ConversationPendingSend';
import { pendingSubmission, clearPendingSubmission } from './conversation-pending';
import { ConversationAgentSelect, ConversationOptions } from './ConversationOptions';
import { ConversationDock } from './ConversationDock';
import { ConversationMessageImages } from './ConversationMessageImages';
import { ConversationComposer } from './ConversationComposer';
import { ConversationTurn } from './ConversationTurn';
import { attachmentMimeType, imageSelectionError } from './conversation-images';
import { extractVideoFrames } from './conversation-video';
import {conversationPermissionKey,conversationPermissionStorageKey,conversationRunIdentity,permissionModeLabels,readConversationPermission,selectedConversationModel,selectedConversationPermission,supportsConversationPermission,writeConversationPermission,type ConversationChoice,type PermissionMode} from './conversation-options';
import { appendDraftAttachment, canGenerateConversationTitle, canStopConversationTool, conversationConflictNeedsRefresh, conversationTurnBinding, executionLocked, groupConversationStream, conversationStreamTurns, participantExecutionPairs, removeSubmittedAttachments, shouldSendOnKey, latestConversationParticipant, processBlockKey, type ConversationSelection } from './conversation-state';
import { conversationActionKey, createConversationActions, createConversationInputAttempts } from './conversation-actions';
import { useNewConversationImages } from './useNewConversationImages';
import { useConversationAttachments } from './useConversationAttachments';
import { draftMaterialIds, firstConversationSubmissions, type FirstSubmission } from './conversation-first-submission';
import { ConversationExecutionIndicator } from './ConversationExecutionIndicator';
import { useConversationDraft } from './useConversationDraft';
import { providerNames, type ConversationEntry, type ConversationView, type SendDraft, type SendPreview } from './types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { codeApi } from '../code/api/code-api';
import { conversationFileReference, conversationFileTarget } from './conversation-process';
import {conversationReplyText} from './conversation-reply';
import {ConversationHandoffDrawer} from './ConversationHandoffDrawer';
import { ConversationProcessBlock } from './ConversationProcessBlock';
import { ConversationTaskLink } from './ConversationTaskLink';
import {modelPreferenceFromChoice,preferredConversationChoice,readConversationModelPreference,readConversationModulePreference,rememberConversationAgent,rememberConversationPermission,rememberedConversationPermission,writeConversationModelPreference,writeConversationModulePreference} from './conversation-preferences';
import {visibleConversationEntries,conversationModelWarning,conversationActionError} from './conversation-notices';
import './agent-conversations.css';
import './conversation-flow.css';
const statusLabels = {starting:'正在准备执行',running:'正在执行','waiting-approval':'等待授权','waiting-question':'等待你的回复',stopping:'正在停止',stopped:'已确认停止','tools-active':'模型已中断，仍有命令运行',unknown:'执行状态待确认',completed:'本轮已结束',failed:'本轮执行失败'};
type Prepared = {conversation:ConversationView;input:SendDraft;preview:SendPreview;clientRequestId:string;selection:ConversationSelection};
type SendOperation={selection:ConversationSelection;continueRunId?:string};
type Props={workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null;portalTarget?:HTMLElement|null};
export function ConversationPanel({workspaces,defaultWorkspaceId,portalTarget}:Props){
  const context=useAgentConversations(),chat=context.conversation;
  const navigate=useNavigate(),location=useLocation();
  const [modulePreference,setModulePreference]=useState(readConversationModulePreference);
  const [modelPreference,setModelPreference]=useState(readConversationModelPreference);
  const draft=useConversationDraft(context.scope?.workspaceId||defaultWorkspaceId||'@default',context.scope?.conversationId||null);
  const draftWorkspaceId=context.draftScope?.workspaceId||draft.workspaceId;
  const [defaultRoot,setDefaultRoot]=useState('');
  useEffect(()=>{const controller=new AbortController();void context.api.defaultWorkspace(controller.signal).then(value=>setDefaultRoot(value.rootPath)).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'无法读取默认工作空间目录。');});return()=>controller.abort();},[context.api]);
  const newCwd=draftWorkspaceId==='@default'?defaultRoot:workspaces.find(item=>item.id===draftWorkspaceId)?.rootPath||'';
  // 新建入口始终恢复同一份草稿；权限继续按工作空间保存。
  const draftSlot=context.scope?.conversationId||'new';
  // 明确的入口意图优先；没有入口意图时跟随草稿自身已保存的绑定。
  const boundTaskId=context.draftScope?(context.draftScope.taskId||''):(draft.taskId||'');
  useEffect(()=>{
    if(context.scope||!context.draftScope||context.draftScope.workspaceId!==draftWorkspaceId)return;
    if(draft.workspaceId===context.draftScope.workspaceId&&draft.taskId===context.draftScope.taskId)return;
    draft.setWorkspace(context.draftScope.workspaceId,context.draftScope.taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[context.scope,context.draftScope,draftWorkspaceId,draft.workspaceId,draft.taskId]);
  const [choices,setChoices]=useState<Record<string,ConversationChoice>>({});
  const choiceKey=draftSlot;
  const lastParticipant=latestConversationParticipant(chat);
  const newConversationChoice=useMemo(()=>context.scope?undefined:preferredConversationChoice(modulePreference,modelPreference,context.connections,context.modelCatalog),[context.scope,modulePreference,modelPreference,context.connections,context.modelCatalog]);
  const seededChoice=choices[choiceKey];
  const defaultConnection=context.scope
    ?context.connections.find(item=>item.id===lastParticipant?.connectionId)||context.connections.find(item=>item.status==='ready')||context.connections[0]
    :context.connections.find(item=>item.id===newConversationChoice?.connectionId)||context.connections.find(item=>item.status==='ready')||context.connections[0];
  const choice=seededChoice||(context.scope?{connectionId:defaultConnection?.id||'',model:chat?.run?.model,modelAccountId:chat?.run?.modelAccountId,modelAccountIdentity:chat?.run?.modelAccountIdentity,serviceTier:chat?.run?.serviceTier,reasoningEffort:chat?.run?.reasoningEffort}:newConversationChoice)||{connectionId:defaultConnection?.id||''};
  const connection=context.connections.find(item=>item.id===choice.connectionId);
  const [permissionChoices,setPermissionChoices]=useState<Record<string,PermissionMode>>({});
  const permissionKey=conversationPermissionKey(context.scope,draftWorkspaceId);
  const permissionProfile=document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content')||'local';
  const permissionStorageKey=conversationPermissionStorageKey(permissionProfile,context.scope,draftWorkspaceId);
  const savedPermission=(()=>{try{return readConversationPermission(permissionStorageKey,sessionStorage);}catch{return;}})();
  const rememberedPermission=context.scope?undefined:modulePreference.permission?rememberedConversationPermission(modulePreference,draftWorkspaceId):savedPermission??rememberedConversationPermission(modulePreference,draftWorkspaceId);
  const permissionMode=selectedConversationPermission(permissionChoices[permissionKey]??(context.scope?savedPermission:rememberedPermission),chat?.run);
  const permissionAvailable=supportsConversationPermission(connection,permissionMode);
  const {attachments,setAttachments,available:attachmentsAvailable}=useConversationAttachments(context.api,chat,permissionProfile);
  const attachmentKey=draftSlot;
  const newImages=useNewConversationImages(context.api,!context.scope);
  const images=context.scope?(attachments[attachmentKey]||[]):newImages.images;
  const [preparing,setPreparing]=useState(false);
  const [sending,setSending]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const [,setActionVersion]=useState(0);
  const [actions]=useState(()=>createConversationActions(()=>setActionVersion(value=>value+1)));
  const actionKey=(value:ConversationView,action:string,identity=value.run?.id||'')=>conversationActionKey({workspaceId:value.workspaceId,conversationId:value.id},action,identity);
  const uploadKey=chat?actionKey(chat,'upload',''):conversationActionKey({workspaceId:draftWorkspaceId,conversationId:'new'},'upload');
  const stopping=Boolean(chat&&actions.has(actionKey(chat,'stop'))),observing=Boolean(chat&&actions.has(actionKey(chat,'observe'))),uploading=actions.has(uploadKey);
  const generatingTitle=Boolean(chat&&actions.has(actionKey(chat,'generate-title','')));
  const [selectedHandoff,setSelectedHandoff]=useState<ConversationEntry|null>(null),[prepared,setPrepared]=useState<Prepared|null>(null),[previewOpen,setPreviewOpen]=useState(false),[rename,setRename]=useState(false),[title,setTitle]=useState('');
  const viewedHandoff=selectedHandoff?(chat?.entries.find(entry=>entry.id===selectedHandoff.id)??selectedHandoff):null;
  const [moreOpen,setMoreOpen]=useState(false),[locationOpen,setLocationOpen]=useState(false);
  const [fileLinkFailure,setFileLinkFailure]=useState<{reference:string;message:string}|null>(null);
  const [expandedToolGroups,setExpandedToolGroups]=useState<Record<string,boolean>>({});
  const stream=useRef<HTMLDivElement>(null),readPosition=useRef(0),bottom=useRef(true),composing=useRef(false);
  const selectedSourceModel=context.modelCatalog.find(model=>model.accountId===choice.modelAccountId&&model.modelId===choice.model&&(!choice.modelAccountIdentity||model.accountIdentity===choice.modelAccountIdentity));
  const effectiveModel=choice.model??selectedConversationModel(connection,undefined)?.id;
  const effectiveModelLabel=selectedSourceModel?.label||selectedConversationModel(connection,effectiveModel)?.label||effectiveModel||'默认模型';
  const executionChanged=Boolean(chat?.run&&(lastParticipant?.connectionId!==choice.connectionId||chat.run.model!==effectiveModel||chat.run.modelAccountId!==choice.modelAccountId||chat.run.serviceTier!==choice.serviceTier));
  const sendText=conversationContinuationText(chat,executionChanged,draft.text,images.length);
  const recovery=conversationRecoveryAction(chat);
  const pendingAttempt=useRef<{workspaceId:string;conversationId:string;value:ReturnType<typeof pendingSubmission>}|undefined>(undefined);
  const activeSend=useRef<SendOperation|null>(null),locked=executionLocked(chat?.run);
  const canSend=(Boolean(context.scope)||newImages.ready)&&!context.loading&&(!context.scope||Boolean(chat))&&!sending&&!uploading;
  const supplementing=Boolean(chat?.run?.accepted&&['running','waiting-approval','waiting-question'].includes(chat.run.status)&&lastParticipant?.connectionId===choice.connectionId&&chat.run.model===effectiveModel&&chat.run.modelAccountId===choice.modelAccountId);
  const [inputAttempts]=useState(()=>{try{return createConversationInputAttempts(sessionStorage,permissionProfile+':conversation-input:');}catch{return createConversationInputAttempts();}});
  useEffect(()=>{
    if(!chat)return;const pending=inputAttempts.read(chat);
    if(!pending||pending.runId!==chat.run?.id||pending.text!==draft.text)return;
    setAttachments(previous=>Object.hasOwn(previous,chat.id)?previous:{...previous,[chat.id]:pending.images});
    const controller=new AbortController(),selection=context.getSelection();
    void Promise.allSettled(pending.images.map(async image=>{
      const blob=await context.api.readImage(chat,image.id,controller.signal);
      if(controller.signal.aborted||!context.isSelectionCurrent(selection))return;
      const file=new File([blob],image.name,{type:blob.type||image.mimeType});
      setAttachments(previous=>({...previous,[chat.id]:(previous[chat.id]||[]).map(item=>item.id===image.id&&!item.file?{...item,file}:item)}));
    }));
    return()=>controller.abort();
  },[chat?.id,chat?.run?.id,draft.text,inputAttempts,context.api,context.getSelection,context.isSelectionCurrent]);
  useEffect(()=>{if(context.scope||seededChoice||!newConversationChoice)return;setChoices(previous=>previous[choiceKey]?previous:{...previous,[choiceKey]:newConversationChoice});},[choiceKey,context.scope,seededChoice,newConversationChoice]);
  const select=(value:ConversationChoice,remember=true)=>{
    setChoices(previous=>({...previous,[choiceKey]:value}));
    if(remember){
      setModulePreference(current=>{const next=rememberConversationAgent(current,value.connectionId);writeConversationModulePreference(next);return next;});
      const nextModel=modelPreferenceFromChoice(value);setModelPreference(nextModel);writeConversationModelPreference(nextModel);
    }
    setPrepared(null);setSelectedHandoff(null);setPreviewOpen(false);
  };
  const selectPermission=(value:PermissionMode)=>{
    const workspaceId=context.scope?.workspaceId||draftWorkspaceId;
    setPermissionChoices(previous=>({...previous,[permissionKey]:value,[conversationPermissionKey(null,workspaceId)]:value}));
    setModulePreference(current=>{const next=rememberConversationPermission(current,value,context.scope?.workspaceId||draftWorkspaceId);writeConversationModulePreference(next);return next;});
    try{writeConversationPermission(permissionStorageKey,value,sessionStorage);writeConversationPermission(conversationPermissionStorageKey(permissionProfile,null,workspaceId),value,sessionStorage);}catch{/* Same-page selection remains usable. */}
    setPrepared(null);setSelectedHandoff(null);setPreviewOpen(false);
  };
  useEffect(()=>{setError('');setFeedback('');setExpandedToolGroups({});const active=activeSend.current;if(!active||!context.isSelectionCurrent(active.selection)){activeSend.current=null;setSending(false);setPreparing(false);setPrepared(null);setSelectedHandoff(null);setPreviewOpen(false);}bottom.current=true;},[context.selectionGeneration,context.scope?.workspaceId,context.scope?.conversationId,context.isSelectionCurrent]);
  useEffect(()=>{setMoreOpen(false);setLocationOpen(false);},[context.selectionGeneration,context.open,context.side,context.full,context.view]);
  useEffect(()=>{if(bottom.current)stream.current?.scrollTo({top:stream.current.scrollHeight});},[chat?.id,chat?.entries.length,chat?.entries.at(-1)?.text,chat?.requests.length,chat?.run?.status]);
  useLayoutEffect(()=>{if(stream.current?.getClientRects().length)stream.current.scrollTop=bottom.current?stream.current.scrollHeight:readPosition.current;},[portalTarget,context.view,context.open]);
  const fail=(failure:unknown)=>{setError(failure instanceof Error?failure.message:'操作未完成。');};
  const openProcessFile=async(path:string)=>{
    if(!chat)return;
    const selection=context.getSelection();
    try{
      const reference=conversationFileReference(path);
      if(!reference)throw new Error('来源路径或行号无效，请复制原路径核对。');
      const catalog=await codeApi.repositories(chat.workspaceId,chat.taskId);
      if(!context.isSelectionCurrent(selection))return;
      const file=conversationFileTarget(chat.cwd,reference.path,catalog);
      if(!file)throw new Error('无法确认这个文件的原工作目录，请从代码目录选择实际位置。调用记录已保留。');
      context.setFull(false);
      navigate(`/workspaces/${encodeURIComponent(chat.workspaceId)}/code/explorer`,{state:{codeEntry:{file:{...file,...(reference.line?{line:reference.line}:{})},from:{pathname:location.pathname,search:location.search,hash:location.hash,state:location.state}}}});
      setFileLinkFailure(null);
    }catch(failure){if(context.isSelectionCurrent(selection))setFileLinkFailure({reference:path,message:failure instanceof Error?failure.message:'无法打开来源文件。'});}
  };
  const recoverConflict=async(failure:unknown)=>{
    const api=failure as ApiError;if(api?.status!==409)return false;
    setPrepared(null);setPreviewOpen(false);
    if(!conversationConflictNeedsRefresh(api)){fail(failure);return true;}
    try{await context.refresh();await Promise.allSettled([context.refreshConnections(),context.refreshModelCatalog()]);const message=api.message.trim()||'请求未完成。';setError(/[。！？]$/.test(message)?message+' 草稿保留。':message+'。草稿保留。');}catch{fail(failure);}
    return true;
  };
  const [firstSubmissions]=useState(()=>{try{return firstConversationSubmissions(sessionStorage,'buildr.conversation-first:'+permissionProfile);}catch{return firstConversationSubmissions();}});
  const [unconfirmedFirst,setUnconfirmedFirst]=useState(()=>firstSubmissions.read());
  const acceptFirst=async(submitted:FirstSubmission,result:ConversationView,selection:ConversationSelection,transferRemainder=false)=>{
    draft.acceptNewSubmitted(result.workspaceId,result.id,submitted.input.text,transferRemainder&&context.isSelectionCurrent(selection));
    firstSubmissions.clear(submitted.input.clientRequestId);setUnconfirmedFirst(undefined);
    const createdScope={workspaceId:result.workspaceId,conversationId:result.id};
    setPermissionChoices(previous=>({...previous,[conversationPermissionKey(createdScope,'')]:submitted.input.permissionMode||'default'}));
    setChoices(previous=>({...previous,[result.id]:{connectionId:submitted.input.connectionId,model:submitted.input.model,modelAccountId:submitted.input.modelAccountId,modelAccountIdentity:submitted.input.modelAccountIdentity,serviceTier:submitted.input.serviceTier,reasoningEffort:submitted.input.reasoningEffort}}));
    await newImages.refresh().catch(fail);
    if(context.isSelectionCurrent(selection))await context.openConversation(result.workspaceId,result.id,{preserveVisibility:true});
    void context.refreshPending().catch(()=>{});
  };
  useEffect(()=>{if(!context.scope)setUnconfirmedFirst(firstSubmissions.read());},[context.selectionGeneration,context.scope,firstSubmissions]);
  useEffect(()=>{
    const pending=firstSubmissions.read();if(context.scope||!pending)return;
    const selection=context.getSelection();let active=true;
    void context.api.lookupDraft(pending.workspaceId,pending.draftId,pending.input.clientRequestId).then(async result=>{
      if(active&&result.found&&result.conversation)await acceptFirst(pending,result.conversation,selection);
    }).catch(failure=>{if(active)fail(failure);});
    return()=>{active=false;};
  },[context.api,firstSubmissions]);
  const sendFirst=async(operation:SendOperation)=>{
    let submitted=firstSubmissions.read();
    const fresh=!submitted;
    if(submitted){
      const result=await context.api.lookupDraft(submitted.workspaceId,submitted.draftId,submitted.input.clientRequestId);
      if(result.found&&result.conversation){await acceptFirst(submitted,result.conversation,operation.selection);return;}
      // An explicit retry uses the original payload and identity, never today's edited draft.
    }else{
      if(draftWorkspaceId!=='@default'&&!newCwd.trim())throw new Error('工作空间目录不可用，请重新选择。');
      const snapshot=await newImages.refresh();
      if(!context.isSelectionCurrent(operation.selection))return;
      const expectedIds=images.map(image=>image.id);
      if(JSON.stringify(draftMaterialIds(snapshot.images))!==JSON.stringify(expectedIds))throw new Error('草稿图片已变化，请核对后重新发送。');
      submitted=firstSubmissions.save({draftId:newImages.id,workspaceId:draftWorkspaceId,input:{connectionId:choice.connectionId,modelAccountId:choice.modelAccountId,modelAccountRevision:choice.modelAccountRevision,modelAccountIdentity:choice.modelAccountIdentity,model:choice.model,serviceTier:choice.serviceTier,reasoningEffort:choice.reasoningEffort,permissionMode,text:draft.text,attachmentIds:expectedIds as NonNullable<SendDraft['attachmentIds']>,expectedDraftRevision:snapshot.revision,clientRequestId:crypto.randomUUID(),...(draftWorkspaceId!=='@default'&&newCwd?{cwd:newCwd.trim()}:{}),...(boundTaskId?{taskId:boundTaskId}:{})}});
    }
    try{
      const result=await context.api.startDraft(submitted.workspaceId,submitted.draftId,submitted.input);
      await acceptFirst(submitted,result.conversation,operation.selection,fresh);
    }catch(failure){
      const error=failure as ApiError;
      setUnconfirmedFirst(submitted);
      // Explicit validation errors prove non-acceptance. Server/transport failures require observation.
      if(error.status&&error.status<500&&error.code!=='agent_request_conflict'){
        firstSubmissions.clear(submitted.input.clientRequestId);setUnconfirmedFirst(undefined);
      }
      throw failure;
    }
  };
  const queue=async(current:ConversationView,input:SendDraft)=>{
    const selection=context.getSelection();
    let storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
    try{storage=sessionStorage;}catch{/* Keep a stable same-page identity. */}
    const prior=pendingAttempt.current;
    const submission=pendingSubmission(permissionProfile+':'+current.workspaceId,current.id,input,storage,prior?.workspaceId===current.workspaceId&&prior.conversationId===current.id?prior.value:undefined);
    pendingAttempt.current={workspaceId:current.workspaceId,conversationId:current.id,value:submission};
    try {
      const result=await context.api.queueSend(current,{...submission.input,clientRequestId:submission.clientRequestId,previousRunId:current.run?.id});
      context.apply(result,current.revision);
      draft.clearSubmitted(current.workspaceId,current.id,input.text);
      setAttachments(previous=>({...previous,[current.id]:removeSubmittedAttachments(previous[current.id]||[],input.attachmentIds||[])}));
      clearPendingSubmission(permissionProfile+':'+current.workspaceId,current.id,storage);if(pendingAttempt.current?.value.clientRequestId===submission.clientRequestId)pendingAttempt.current=undefined;
      if(context.isSelectionCurrent(selection)){setPrepared(null);setPreviewOpen(false);}
      return result;
    }catch(failure){if((failure as ApiError)?.code==='agent_revision_conflict'){clearPendingSubmission(permissionProfile+':'+current.workspaceId,current.id,storage);if(pendingAttempt.current?.value.clientRequestId===submission.clientRequestId)pendingAttempt.current=undefined;}throw failure;}
  };
  const commit=async(value:Prepared,continuing?:SendOperation)=>{
    if(!value.preview.fits||!context.isSelectionCurrent(value.selection)||(!continuing&&activeSend.current))return;
    const operation=continuing??{selection:value.selection};activeSend.current=operation;
    setSending(true);setError('');
    try{
      const result=await context.api.send(value.conversation,{...value.input,previewToken:value.preview.token,clientRequestId:value.clientRequestId});
      context.apply(result.conversation,value.conversation.revision);
      if(!value.input.continueRunId){
        draft.clearSubmitted(value.conversation.workspaceId,value.conversation.id,value.input.text);
        setAttachments(previous=>({...previous,[value.conversation.id]:removeSubmittedAttachments(previous[value.conversation.id]||[],value.input.attachmentIds||[])}));
      }
      if(context.isSelectionCurrent(value.selection)){setPrepared(null);setSelectedHandoff(null);setPreviewOpen(false);}
      void context.refreshPending().catch(()=>{});
    }catch(failure){if(context.isSelectionCurrent(value.selection)){
      if(!value.input.continueRunId&&['agent_process_switching','agent_conversation_busy'].includes((failure as ApiError)?.code||'')){try{await queue(value.conversation,value.input);}catch(queueFailure){if(context.isSelectionCurrent(value.selection)&&!await recoverConflict(queueFailure))fail(queueFailure);}}
      else if(!await recoverConflict(failure)){fail(failure);setPreviewOpen(true);}
    }}finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);setPreparing(false);}}
  };
  const supplement=async()=>{
    if(!chat?.run||activeSend.current||!canSend||(!draft.text.trim()&&!images.length))return;
    const operation:SendOperation={selection:context.getSelection()},text=draft.text,ids=images.map(image=>image.id);
    const attempt=inputAttempts.begin(chat,text,images);activeSend.current=operation;setSending(true);setError('');
    try{
      const result=await context.api.supplement({...chat,run:{...chat.run,...{id:attempt.runId,participantId:attempt.participantId,generation:attempt.generation}}},{text,attachmentIds:ids as NonNullable<SendDraft['attachmentIds']>,clientRequestId:attempt.clientRequestId});
      context.apply(result.conversation,chat.revision);inputAttempts.finish(chat,attempt.clientRequestId);
      if(result.delivery!=='rejected'){
        draft.clearSubmitted(chat.workspaceId,chat.id,text);
        setAttachments(previous=>({...previous,[chat.id]:removeSubmittedAttachments(previous[chat.id]||[],ids)}));
      }
      if(context.isSelectionCurrent(operation.selection)){
        if(result.delivery==='rejected')setError('这条消息未发送成功，文字与图片已保留。');
        await context.refresh();
      }
      void context.refreshPending().catch(()=>{});
    }catch(failure){if(context.isSelectionCurrent(operation.selection)){
      const api=failure as ApiError;if(api.status&&api.status<500)inputAttempts.finish(chat,attempt.clientRequestId);
      setError(api.status?api.message:'是否送达尚待确认，输入已保留。再次发送相同内容会核对同一条消息。');
    }}finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);}}
  };
  const prepare=async(show=true,skipSummary=false,recoveryRunId?:string,retryFirst=false)=>{
    const continueRunId=recoveryRunId??(!draft.text.trim()&&!images.length&&recovery?.kind==='recover'?chat?.run?.id:undefined);
    if(continueRunId&&locked)return;
    const requestImages=continueRunId?[]:images;
    if(!chat&&firstSubmissions.read()){
      if(activeSend.current)return;
      if(!retryFirst){setUnconfirmedFirst(firstSubmissions.read());setError('还有一条首次提交结果待核对，请先核对原提交；当前新输入已保留。');return;}
      const operation:SendOperation={selection:context.getSelection()};activeSend.current=operation;setSending(true);setError('');
      try{await sendFirst(operation);}catch(failure){if(context.isSelectionCurrent(operation.selection))fail(failure);}
      finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);}}
      return;
    }
    if(locked&&supplementing){if(!show)await supplement();return;}
    const unavailable=(!connection?.enabled?'请先接入可用的智能体。':!permissionAvailable?'当前执行者不支持'+permissionModeLabels[permissionMode]:requestImages.length&&!connection.capabilities.images?'当前执行者不支持图片或视频画面。请移除附件或选择支持图片的执行者。':choice.modelAccountId&&context.modelCatalogReady&&!selectedSourceModel?.available?'所选模型暂不可用，请重新选择。':'');
    if(unavailable){setError(unavailable);return;}
    if(activeSend.current||(!canSend&&!skipSummary)||(!continueRunId&&!show&&!sendText.trim()&&!images.length))return;
    setSelectedHandoff(null);
    const operation:SendOperation={selection:context.getSelection(),continueRunId};activeSend.current=operation;setSending(true);setPreparing(true);setError('');
    try{
      if(!chat){await sendFirst(operation);return;}
      const current=chat;
      operation.selection={...operation.selection,scope:{workspaceId:current.workspaceId,conversationId:current.id}};
      if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
      const input:SendDraft={expectedRevision:current.revision,connectionId:choice.connectionId,modelAccountId:choice.modelAccountId,modelAccountRevision:choice.modelAccountRevision,modelAccountIdentity:choice.modelAccountIdentity,model:choice.model,serviceTier:choice.serviceTier,reasoningEffort:choice.reasoningEffort,skipHandoffSummary:skipSummary,permissionMode,...(continueRunId?{continueRunId}:{}),text:continueRunId?'':skipSummary&&!sendText.trim()&&!requestImages.length?'继续当前工作。':sendText,attachmentIds:requestImages.map(item=>item.id) as NonNullable<SendDraft['attachmentIds']>};
      if(executionLocked(current.run)&&!show){setPreparing(false);await queue(current,input);return;}
      let preview:SendPreview;
      try{preview=await context.api.prepare(current,input);}catch(failure){if(!continueRunId&&!show&&['agent_process_switching','agent_conversation_busy'].includes((failure as ApiError)?.code||'')){setPreparing(false);await queue(current,input);return;}throw failure;}
      if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
      setPreparing(false);
      const next:Prepared={conversation:current,input,preview,clientRequestId:crypto.randomUUID(),selection:operation.selection};setPrepared(next);
      if(show||!preview.fits)setPreviewOpen(true);else await commit(next,operation);
    }catch(failure){if(activeSend.current===operation&&context.isSelectionCurrent(operation.selection)&&!await recoverConflict(failure))fail(failure);}finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);setPreparing(false);}}
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
    if(!files?.length||uploading||sending||context.loading||Boolean(context.scope&&!chat))return;setError('');
    const selected=Array.from(files);const validation=imageSelectionError(selected,images.length,connection?.capabilities.maxImageBytes);
    if(validation){setError(validation);return;}
    let key=uploadKey;if(!actions.begin(key))return;let selection=context.getSelection();
    try {
      if(!chat){await newImages.add(selected);return;}
      let current=chat;
      selection={...selection,scope:{workspaceId:current.workspaceId,conversationId:current.id}};
      if(!context.isSelectionCurrent(selection))return;
      const boundKey=actionKey(current,'upload','');actions.move(key,boundKey);key=boundKey;
      for(const original of selected) {
        const mimeType=attachmentMimeType(original),file=original.type===mimeType?original:new File([original],original.name,{type:mimeType});
        let video:{duration:number;frames:Array<{id:string;time:number}>}|undefined;
        if(mimeType.startsWith('video/')) {
          const extracted=await extractVideoFrames(file);
          video={duration:extracted.duration,frames:[]};
          for(const frame of extracted.frames) {
            const saved=await context.api.upload(current,frame.file);
            current={...current,revision:saved.revision,attachmentRevision:saved.attachmentRevision};
            video.frames.push({id:saved.id,time:frame.time});
          }
        }
        const attachment=await context.api.upload(current,file,video);
        current={...current,revision:attachment.revision,attachmentRevision:attachment.attachmentRevision};
        setAttachments(previous=>({...previous,[current.id]:appendDraftAttachment(previous[current.id]||[],{...attachment,name:file.name,file})}));
      }
      if(context.isSelectionCurrent(selection))await context.refresh();
    }catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}finally{actions.finish(key);}
  };
  const updateMetadata=async(input:{title?:string;hidden?:boolean;taskId?:string|null})=>{if(!chat)return;const selection=context.getSelection();try{context.apply(await context.api.update(chat,input),chat.revision);if(context.isSelectionCurrent(selection)){setRename(false);if(input.hidden!==undefined)context.setView('history');}}catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}};
  const assignTask=(next:string|undefined)=>{
    if(chat){void updateMetadata({taskId:next??null});return;}
    draft.setTaskId(next);setPrepared(null);
    context.newConversation({preserveVisibility:true,scope:{workspaceId:draftWorkspaceId,...(next?{taskId:next}:{})}});
  };
  const generateTitle=async()=>{
    if(!chat||!canGenerateConversationTitle(chat))return;
    const key=actionKey(chat,'generate-title','');if(!actions.begin(key))return;
    const selection=context.getSelection();setError('');setFeedback('正在生成简短标题…');
    try{context.apply(await context.api.generateTitle(chat),chat.revision);if(context.isSelectionCurrent(selection))setFeedback('对话标题已更新。');}
    catch(failure){if(context.isSelectionCurrent(selection)){setFeedback('');fail(failure);}}
    finally{actions.finish(key);}
  };
  const earlier=useEarlierConversationEntries({conversation:chat,selectionKey:`${context.selectionGeneration}:${chat?.workspaceId}:${chat?.id}`,stream,bottom,position:readPosition,
    loadPage:(value,cursor,signal)=>context.api.entries(value.workspaceId,value.id,cursor,signal),
    prepend:page=>{if(chat)setExpandedToolGroups(previous=>carryExpandedProcessBlocks(chat.entries,page.entries,previous,chat.run));context.prependEntries(page);},
  });
  const seenAttempt=useRef('');
  useEffect(()=>{
    const element=stream.current;
    if(!chat||!element||!context.open||context.view!=='conversation')return;
    const latest=chat.entries.filter(entry=>(entry.kind==='message'&&(entry.role==='user'||entry.role==='assistant')||entry.role==='user'&&entry.kind==='notice'&&entry.id.startsWith('reply-'))&&entry.status!=='failed').at(-1);
    const check=()=>{
      if(document.visibilityState!=='visible'||!bottom.current||!latest||!element.getClientRects().length)return;
      const message=Array.from(element.querySelectorAll<HTMLElement>('[data-entry-id]')).find(node=>node.dataset.entryId===latest.id);
      if(!message)return;
      const bounds=element.getBoundingClientRect(),rect=message.getBoundingClientRect();
      if(rect.bottom>bounds.bottom+2||rect.bottom<=bounds.top||rect.width===0)return;
      const key=chat.workspaceId+':'+chat.id+':'+chat.activity?.version;
      if(seenAttempt.current===key)return;
      seenAttempt.current=key;void context.markSeen(chat);
    };
    const frame=requestAnimationFrame(check);
    element.addEventListener('scroll',check);document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
    return()=>{cancelAnimationFrame(frame);element.removeEventListener('scroll',check);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);};
  },[chat,context.open,context.view,context.markSeen]);
  const run=chat?.run;
  const runConnection=context.connections.find(item=>item.id===chat?.participants.find(participant=>participant.id===run?.participantId)?.connectionId);
  const runIdentity=run?conversationRunIdentity(run,runConnection,context.modelCatalog):'';
  const participantPairs=participantExecutionPairs(chat).map(pair=>({...pair,modelName:conversationModelLabel(pair.model,context.connections,context.modelCatalog,pair)}));
  const workspace=workspaces.find(item=>item.id===chat?.workspaceId);
  const titleStatus=chat?.titleState;
  const titleLabels={pending:'等待执行开始后生成标题，首轮结束后可补生成',generating:'正在生成标题',generated:'标题已自动生成',manual:'标题已手动设置',failed:'标题未能自动生成',unavailable:'当前无法自动生成标题',unknown:'旧对话未记录标题生成状态'};
  const settings=<div className="ac-location-settings">{chat&&<><strong>标题</strong><span>{titleLabels[titleStatus?.status??'unknown']}</span>{titleStatus?.reason&&<small>{titleStatus.reason}</small>}{canGenerateConversationTitle(chat)&&<Button size="small" loading={generatingTitle} onClick={()=>void generateTitle()}>生成简短标题</Button>}</>}<strong>工作空间</strong>{chat?<><span>{workspace?.name||(chat.workspaceId==='@default'?'默认工作空间':chat.workspaceId)}</span><code>{chat.cwd}</code>{chat.taskId&&<small>关联任务：{chat.taskId}</small>}</>:<><Select classNames={{popup:{root:'ac-panel-popup'}}} aria-label="新对话工作空间" allowClear={draftWorkspaceId!=='@default'} value={draftWorkspaceId==='@default'?undefined:draftWorkspaceId} placeholder="默认工作空间" options={workspaces.filter(item=>item.id!=='@default').map(item=>({value:item.id,label:item.name}))} onChange={value=>{const workspaceId=value||'@default';draft.setWorkspace(workspaceId);context.newConversation({preserveVisibility:true,scope:{workspaceId}});setPrepared(null);}}/>{newCwd&&<code className="ac-workspace-directory">{newCwd}</code>}</>}</div>;
  const transcript=chat?groupConversationStream(visibleConversationEntries(chat.entries),chat.run):[];
  const modelWarning=conversationModelWarning(context.modelCatalogReady,choice.modelAccountId,selectedSourceModel);
  const actionError=conversationActionError(error,modelWarning);
  const turns=conversationStreamTurns(transcript);
  const turnIdentity=(entry:ConversationEntry|undefined)=>{
    if(!entry)return '';
    const {participant,run:boundRun}=conversationTurnBinding(entry,chat);
    const provider=entry.provider||participant?.provider||boundRun?.provider;
    if(!provider&&!participant)return '';
    const agent=provider?providerNames[provider]||participant?.label||provider:participant?.label||'智能体';
    return agent+' · '+conversationModelLabel(boundRun?.model||participant?.model,context.connections,context.modelCatalog,{connectionId:participant?.connectionId,modelAccountId:boundRun?.modelAccountId??participant?.modelAccountId});
  };
  const markdownOptions:MarkdownRenderOptions={allowRelativeLinks:true,allowParentRelativeLinks:true,allowAbsoluteFileLinks:true,taskLinkPathname:chat&&chat.workspaceId!=='@default'?'/workspaces/'+encodeURIComponent(chat.workspaceId):null,onRelativeLinkClick:reference=>void openProcessFile(reference)};
  const renderEntry=(entry:ConversationEntry)=>entry.kind==='handoff'?<div className="ac-handoff-receipt" key={entry.id}><span>{entry.handoff?`${entry.handoff.changes.map(c=>c.after).join(' · ')||entry.handoff.agent} ${entry.status==='accepted'?'已接手':entry.status==='failed'?'未接收':'接收待确认'}`:entry.text}</span>{entry.handoff&&<Button type="link" size="small" onClick={()=>{setSelectedHandoff(entry);setPreviewOpen(true);}}>交接内容</Button>}</div>:<article key={entry.id} className={'ac-message is-'+entry.role} data-entry-id={entry.id} data-message-provider={entry.provider}>{entry.role==='assistant'?<MarkdownHost markdown={entry.text} className="markdown-body" options={markdownOptions}/>:<p>{entry.kind==='notice'&&entry.id.startsWith('reply-')?conversationReplyText(entry.text):entry.text}</p>}{entry.attachments?.length?<ConversationMessageImages conversation={chat!} ids={entry.attachments} read={context.api.readImage}/>:null}{entry.status==='unknown'&&<Tag color="warning">是否送达待确认</Tag>}{entry.role==='assistant'&&<CopyButton type="text" text={entry.text} ariaLabel="复制回复" failureMessage="复制失败，请手动选择文字。"/>}</article>;
  const fileError=fileLinkFailure&&<Alert type="warning" message={fileLinkFailure.message} description={<code>{fileLinkFailure.reference}</code>} closable onClose={()=>setFileLinkFailure(null)} action={<CopyButton type="text" text={fileLinkFailure.reference} ariaLabel="复制来源路径" failureMessage="复制失败，请手动复制来源路径。"/>}/>;
  const panel=<section id="agent-conversation-panel" className={'ac-panel'+(context.full?' is-full':'')} aria-label="内部对话" data-dock={context.side} data-conversation-id={chat?.id}>
    {context.view==='history'?<ConversationHistory workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId}/>:<>
      <header className="ac-thread-header" data-run-status={run&&['running','completed'].includes(run.status)?run.status:undefined}>
        <Button type="text" icon={<MenuOutlined/>} aria-label="查看对话列表" title="对话列表" onClick={()=>context.setView('history')}/>
        <div className="ac-thread-heading">
        <Popover rootClassName="ac-panel-popup" title="工作空间" trigger="click" open={locationOpen} onOpenChange={setLocationOpen} content={settings}>
          <button type="button" className="ac-thread-title" aria-label="对话信息" title={chat?.title||'新对话'}>{chat?.title||'新对话'}</button>
        </Popover>
        {chat&&<div className="ac-thread-identity"><CopyButton type="text" text={chat.id} ariaLabel="复制对话 ID" failureMessage="复制失败，请手动选择对话 ID 复制。"/><span title={chat.id}>{chat.id}</span></div>}
        </div>
        <div className="ac-thread-actions">

          <Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" title="新建对话" onClick={()=>context.newConversation({preserveVisibility:true})}/>
          <Dropdown overlayClassName="ac-panel-popup" trigger={['click']} open={moreOpen} onOpenChange={setMoreOpen} menu={{items:[
            {key:'settings',label:'智能体与模型'},
            {type:'divider'},
            {key:'collapse',label:'收起对话'},
            {key:'full',label:context.full?'恢复分屏':'专注对话'},
            {key:'side',label:context.side==='right'?'对话移到最左侧':'对话移到右侧'},
            {type:'divider'},
            {key:'generate-title',label:generatingTitle?'正在生成标题…':'生成简短标题',disabled:generatingTitle||!canGenerateConversationTitle(chat)},
            {key:'rename',label:'重命名',disabled:!chat},
            {key:'hide',label:chat?.hidden?'恢复到最近对话':'从最近对话隐藏',disabled:!chat}
          ],onClick:({key})=>{
            setMoreOpen(false);
            if(key==='collapse')context.setOpen(false);
            else if(key==='side')context.move();
            else if(key==='full'){context.setOpen(true);context.setFull(!context.full);}
            else if(key==='settings')context.setSettings(true);
            else if(key==='generate-title')void generateTitle();
            else if(key==='rename'&&chat){setTitle(chat.title);setRename(true);}
            else if(key==='hide'&&chat)void updateMetadata({hidden:!chat.hidden});
          }}}><Button type="text" icon={<EllipsisOutlined/>} aria-label="更多对话操作" title="更多"/></Dropdown>
        </div>
      </header>
      {participantPairs.length?<div className="ac-participants" aria-label="参与过此对话的智能体与模型">参与过此对话 {participantPairs.map(pair=><span key={pair.key} title={`${providerNames[pair.provider]||pair.provider} · ${pair.modelName}`}>{providerNames[pair.provider]||pair.provider} · {pair.modelName}</span>)}</div>:null}
      <div className="ac-stream" ref={stream} tabIndex={0} aria-label="对话记录" aria-busy={earlier.loading} onScroll={earlier.onScroll} onWheel={earlier.onWheel} onKeyDown={earlier.onKeyDown} onTouchStart={earlier.onTouchStart} onTouchMove={earlier.onTouchMove} onTouchEnd={earlier.onTouchEnd} onTouchCancel={earlier.onTouchCancel}>
        {earlier.loading&&<div className="ac-history-loading" role="status" aria-label="正在加载更早记录"><Spin size="small"/></div>}
        {context.loading?<Spin/>:context.error?<Alert type="error" showIcon message={context.error} action={<Button onClick={()=>void context.refresh().catch(fail)}>重新读取</Button>}/>:!chat?.entries.length?<div className="ac-welcome"><CommentOutlined/><h1>{chat?.taskId||boundTaskId?'从这项任务继续':'今天想做什么？'}</h1><p>了解一个问题，或者交办一件事。</p>{!chat&&settings}</div>:<div className="ac-message-list">
          {turns.map((turn,index)=>{
            const first=turn.items.find(item=>item.type==='process-block'||item.type==='entry'&&item.entry.role==='assistant');
            const assistant=first?.type==='process-block'?first.entries[0]:first?.entry;
            const prompt=turn.prompt;
            const executing=Boolean(index===turns.length-1&&run?.status==='running'&&(assistant?.runId||prompt?.runId)===run.id);
            const processKeys=turn.items.flatMap(item=>item.type==='process-block'?[...(!item.active?[processBlockKey(item.entries)]:[]),...item.entries.filter(entry=>entry.kind==='tool').flatMap(entry=>['tool-group:'+entry.id,'tool:'+entry.id])]:[]);
            const hasExpandedProcess=turn.items.some(item=>item.type==='process-block'&&!item.active&&expandedToolGroups[processBlockKey(item.entries)]===true);
            return <ConversationTurn showExecutionIndicator={false} key={turn.key} id={turn.key} runId={assistant?.runId||prompt?.runId} prompt={prompt?{id:prompt.id,text:prompt.text,images:prompt.attachments?.length?<ConversationMessageImages conversation={chat} ids={prompt.attachments} read={context.api.readImage}/>:undefined,diagnostic:prompt.deliveryDiagnostic?<small className="ac-input-diagnostic" role="status">{prompt.deliveryDiagnostic}</small>:prompt.status==='unknown'?<Tag color="warning">是否送达待确认</Tag>:undefined}:undefined}
              onCollapseProcess={processKeys.some(key=>expandedToolGroups[key]===true)?()=>setExpandedToolGroups(previous=>({...previous,...Object.fromEntries(processKeys.map(key=>[key,false]))})):undefined} collapseLabel={hasExpandedProcess?'收起处理过程':'收起工具调用'} identity={turnIdentity(assistant||prompt)} executing={executing} startedAt={executing?run?.startedAt:undefined}>
              {turn.items.map(item=>{
                if(item.type==='entry')return renderEntry(item.entry);
                const key=processBlockKey(item.entries);
                return <ConversationProcessBlock markdownOptions={markdownOptions} key={key} groupsOpen={expandedToolGroups} onGroupToggle={(ids,open)=>setExpandedToolGroups(previous=>({...previous,...Object.fromEntries(ids.map(id=>['tool-group:'+id,open]))}))} toolsOpen={expandedToolGroups} onToolToggle={(id,open)=>setExpandedToolGroups(previous=>({...previous,['tool:'+id]:open}))} blockKey={key} entries={item.entries} active={item.active} finishedAt={item.finishedAt} onOpenFile={path=>void openProcessFile(path)} open={expandedToolGroups[key]??false} onToggle={(name,open)=>setExpandedToolGroups(previous=>({...previous,[name]:open}))}/>;
              })}
            </ConversationTurn>;
          })}
        </div>}
        {context.streamError&&<Alert className="ac-stream-disconnect" type="warning" showIcon message="对话连接已中断" description={context.streamError.replace(/^对话连接已中断[；;]\s*/,'')} action={<Button type="text" size="small" loading={observing} onClick={()=>void observe()}>重新连接并核对</Button>}/>}
        {chat?.run?.status==='unknown'&&<Alert type="warning" showIcon message="执行状态待确认" description="可提交下一条指令等待接续；原执行确认结束前不会自动开始，重新连接不会重发。" action={<Button loading={observing} onClick={()=>void observe()}>核对执行状态</Button>}/>}
        {chat?.run?.status==='tools-active'&&<Alert type="warning" showIcon message="模型已中断，仍有命令运行" description={<div>{chat.run.tools.filter(tool=>tool.status!=='completed').map(tool=><p key={tool.id}>{tool.label}{canStopConversationTool(tool)?<Button size="small" loading={stopping} onClick={()=>void stop(tool.id)}>停止此命令</Button>:<small> · 不支持单独停止</small>}</p>)}<Button type="link" size="small" loading={observing} onClick={()=>void observe()}>核对执行状态</Button></div>} action={<Button loading={stopping} onClick={()=>void stop()}>停止剩余执行</Button>}/>}
        <ConversationPendingSend conversation={chat}/>{chat?.requests.map(request=><ConversationRequest key={request.id} request={request} provider={chat.run?.provider||chat.participants.find(item=>item.id===request.participantId)?.provider||'codex'} busy={actions.has(actionKey(chat,'reply',request.id))} onReply={answer=>void reply(request.id,answer)}/>)}
      </div>
      <div className="ac-compose-wrap">{fileError}{run&&locked&&<div className="ac-execution-statusbar" role="status" data-execution-state={run.status}><span>{statusLabels[run.status]}</span>{run.status==='running'&&<ConversationExecutionIndicator startedAt={run.startedAt} active/>}<Button className="ac-stop-button" type="text" icon={<StopOutlined/>} aria-label="停止本次执行" title="停止本次执行" loading={stopping} disabled={run.status==='stopping'} onClick={()=>void stop()}>{stopping||run.status==='stopping'?'正在停止…':'停止'}</Button></div>}{!chat&&newImages.error&&<Alert type="warning" message={newImages.error} action={<Button size="small" onClick={()=>void newImages.refresh().catch(fail)}>重新读取图片</Button>}/>} {!chat&&unconfirmedFirst&&<Alert type="warning" message="首次发送结果待核对，原内容已保留；重试将核对并沿用原提交，不发送后来编辑的内容。" action={<Button size="small" loading={sending} onClick={()=>void prepare(false,false,undefined,true)}>核对并重试原提交</Button>}/>}{run&&run.status!=='running'&&run.status!=='completed'&&<div className="ac-run-status" role="status" data-run-status={run.status}>{run.interrupted?'执行未完成':statusLabels[run.status]}{runIdentity&&` · ${runIdentity}`} · {permissionModeLabels[run.permissionMode||'default']}{run.diagnostic&&<p>{run.diagnostic}</p>}</div>} {modelWarning&&<Alert type="warning" showIcon message={modelWarning}/>}{earlier.error&&<Alert type="warning" showIcon message={earlier.error}/>} {actionError&&<Alert type="warning" showIcon message={actionError} closable onClose={()=>setError('')}/>} {feedback&&<small role="status">{feedback}</small>}{(!draft.available||!attachmentsAvailable)&&<Alert type="warning" message="浏览器存储不可用，刷新后无法恢复未发送草稿。"/>}
        {recovery&&<div className="ac-recovery-action" data-recovery-kind={recovery.kind}>{!run?.diagnostic&&<span>{recovery.kind==='observe'?'原执行状态仍待核对。':'上次执行未正常答复。'}</span>}<Button type="text" size="small" icon={<ReloadOutlined/>} autoInsertSpace={false} aria-label={recovery.kind==='recover'&&executionChanged?'继续':recovery.label} disabled={!canSend||observing} loading={recovery.kind==='observe'?observing:sending} onClick={()=>recovery.kind==='observe'?void observe():void prepare(false,false,chat!.run!.id)}>{recovery.kind==='recover'&&executionChanged?'继续':recovery.label}</Button></div>}
        {!connection?.enabled&&<div className="ac-connect-notice"><span>{connection?`${providerNames[connection.provider]} 尚未就绪`:'请先接入智能体'}</span><Button type="link" size="small" onClick={()=>context.setSettings(true)}>智能体与模型</Button></div>}
        {chat?.run&&(lastParticipant?.connectionId!==choice.connectionId||chat.run.model!==effectiveModel||chat.run.modelAccountId!==choice.modelAccountId)?<div className="ac-transfer-notice"><span>{lastParticipant?.connectionId!==choice.connectionId?`接下来由 ${connection?providerNames[connection.provider]||connection.label:''}${chat.run.model!==effectiveModel||chat.run.modelAccountId!==choice.modelAccountId?' · '+(effectiveModelLabel):''} 继续处理`:`接下来使用 ${effectiveModelLabel} 继续处理`}</span><Button type="link" size="small" disabled={!canSend||locked} loading={sending} onClick={()=>void prepare(true)}>交接内容</Button></div>:null}
        {preparing&&<div className="ac-notice" role="status">正在准备交接资料… <Button type="link" size="small" title="跳过模型精简，使用本地记录与按需读取" onClick={()=>{const continueRunId=activeSend.current?.continueRunId;activeSend.current=null;setSending(false);setPreparing(false);void prepare(false,true,continueRunId);}}>直接交接</Button><Button type="text" size="small" onClick={()=>{activeSend.current=null;setSending(false);setPreparing(false);}}>取消发送</Button></div>}
        {choice.connectionId&&!permissionAvailable&&<Alert type="warning" showIcon message={"当前执行者不支持"+permissionModeLabels[permissionMode]} description="已保留所选权限。请选择可用权限或切换执行者后再发送，草稿保留。"/>}{images.length>0&&!connection?.capabilities.images&&<Alert type="warning" message="当前执行者不支持图片或视频画面。请移除附件或选择支持图片的执行者。"/>}
        <ConversationComposer images={images} materialDisabled={sending||uploading||context.loading||Boolean(context.scope&&!chat)} addDisabled={sending||context.loading||Boolean(context.scope&&!chat)} uploading={uploading} onAdd={upload} onBlocked={()=>setError('当前正在发送或上传，请稍后再添加图片或视频。')} onRemove={id=>{if(!chat){void newImages.remove(id).catch(fail);}else setAttachments(previous=>({...previous,[attachmentKey]:(previous[attachmentKey]||[]).filter(item=>item.id!==id)}));setPrepared(null);setPreviewOpen(false);}}
          input={{id:'agent-conversation-input','aria-label':'对话输入',disabled:context.loading||Boolean(context.scope&&!chat),placeholder:supplementing?'继续补充要求，也可以粘贴截图…':locked?'可以提交下一条指令，上一轮结束后自动发送…':'提出问题，或描述想完成的工作…（可粘贴图片或视频）',value:draft.text,onChange:event=>{draft.setText(event.target.value);setPrepared(null);},autoSize:{minRows:2,maxRows:8},onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;},onKeyDown:event=>{if(shouldSendOnKey({key:event.key,shiftKey:event.shiftKey,isComposing:composing.current||event.nativeEvent.isComposing,keyCode:event.nativeEvent.keyCode})){event.preventDefault();if(canSend)void prepare(false);}}}}
          access={<><ConversationAgentSelect connections={context.connections} value={choice} disabled={sending} onChange={select}/><Select<PermissionMode> className="ac-choice ac-permission-select" aria-label="执行权限" placement="topLeft" variant="borderless" size="small" suffixIcon={null} labelRender={({label})=><span className="ac-permission-label"><SafetyCertificateOutlined/>{label}</span>} value={permissionMode} disabled={sending||uploading||context.loading||Boolean(context.scope&&!chat)} popupMatchSelectWidth={false} classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}} title="权限更改用于本对话下一轮。完全访问会跳过逐次工具审批；业务问题仍需回复，系统与厂家限制继续有效。" options={[{value:'default',label:'默认权限',disabled:!supportsConversationPermission(connection,'default')},{value:'full-access',label:'完全访问',disabled:!supportsConversationPermission(connection,'full-access')}]} onChange={selectPermission}/></>}
          execution={<><ConversationOptions showAgent={false} key={choiceKey+':'+context.side+':'+context.open} connections={context.connections} value={choice} disabled={sending} onChange={select}/><Button type="primary" shape="circle" icon={<ArrowUpOutlined/>} aria-label="发送对话" title="发送" disabled={!canSend||(!sendText.trim()&&!images.length)} loading={sending} onClick={()=>void prepare(false)}/></>}/>
        <div className="ac-location-meta"><span>所属工作空间：<span className="ac-location-name" title={(chat?.cwd||newCwd)||undefined}>{chat?(workspace?.name||(chat.workspaceId==='@default'?'默认工作空间':chat.workspaceId)):(workspaces.find(item=>item.id===draftWorkspaceId)?.name||'默认工作空间')}</span></span>{chat?chat.workspaceId!=='@default'&&<span>· {chat.taskId&&<>关联任务：<Link className="ac-task-link" to={'/workspaces/'+encodeURIComponent(chat.workspaceId)+'/tasks/'+encodeURIComponent(chat.taskId)} title={'打开关联任务 '+chat.taskId}>{chat.taskId}</Link> </>}<ConversationTaskLink workspaceId={chat.workspaceId} taskId={chat.taskId} onAssign={assignTask}/></span>:draftWorkspaceId!=='@default'&&<span>· {boundTaskId&&<>关联任务：<Link className="ac-task-link" to={'/workspaces/'+encodeURIComponent(draftWorkspaceId)+'/tasks/'+encodeURIComponent(boundTaskId)} title={'打开关联任务 '+boundTaskId}>{boundTaskId}</Link> </>}<ConversationTaskLink workspaceId={draftWorkspaceId} taskId={boundTaskId||undefined} onAssign={assignTask}/></span>}<small className="ac-location-keys">Enter 发送 · Shift+Enter 换行</small></div>
      </div>
    </>}
    <ConversationHandoffDrawer open={previewOpen} side={context.side} material={viewedHandoff?.handoff??prepared?.preview.handoff??null} onChooseModel={!viewedHandoff&&prepared&&!prepared.preview.fits?()=>{setPreviewOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('#agent-conversation-panel .ac-model-trigger')?.click());}:undefined} delivery={viewedHandoff&&viewedHandoff.status!=='accepted'?viewedHandoff.status==='failed'?'failed':'unknown':undefined} received={viewedHandoff?.status==='accepted'} issue={viewedHandoff&&viewedHandoff.status!=='accepted'?'尚未确认接收，请先核对原执行。':prepared&&!prepared.preview.fits?prepared.preview.diagnostic:undefined} onClose={()=>{setPreviewOpen(false);setSelectedHandoff(null);}}/>
    <Modal open={rename} title="重命名对话" getContainer={false} styles={{mask:{position:'absolute'},wrapper:{position:'absolute'}}} onCancel={()=>setRename(false)} onOk={()=>void updateMetadata({title:title.trim()})} okButtonProps={{disabled:!title.trim()}} okText="保存" cancelText="取消"><Input aria-label="对话名称" value={title} onChange={event=>setTitle(event.target.value)}/></Modal>
  </section>;
  return <ConversationDock panel={panel} portalTarget={portalTarget} workspaces={workspaces}/>;
}
