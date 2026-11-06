import { stoppedConversationEntries, type StoppedConversationOutput } from './conversation-stop';
import { conversationSendRoute, latestConversationSend } from './conversation-send-route';
import { BuildrParticipation } from './BuildrParticipation';
import {conversationTaskLinks} from './conversation-associations';
import type {ConversationTaskLink as TaskLink} from './types';
import {ConversationConnectionNotice} from './ConversationConnectionNotice';
import {ConversationPresentedFiles} from './ConversationPresentedFiles';
import {ConversationFirstSubmissionNotice} from './ConversationFirstSubmissionNotice';
import { confirmedConversationReply, type ConversationReplyAttempt } from './conversation-reply';
import { ConversationForkAction } from './ConversationForkAction';
import { withConversationSendRecovery, sameConversationSendPreview, refreshedConversationConflictMessage, type ConversationSendRecovery } from './conversation-send-recovery';
import { ConversationForkOrigin } from './ConversationForkOrigin';
import { finalReplyIds, forkableReplyIds } from './conversation-fork';
import { currentConversationRequests } from './conversation-state';
import { conversationModelLabel } from './conversation-model-label';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment, type ReactNode } from 'react';
import { Alert, Button, Dropdown, Input, Modal, Popover, Select, Spin, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CommentOutlined, EllipsisOutlined, MinusOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, StopOutlined, TeamOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { MarkdownHost } from '../../components/MarkdownHost';
import type { MarkdownRenderOptions } from '../../markdown';
import type { ApiError } from '../../api';
import { CopyButton } from '../../components/CopyButton';
import { useAgentConversations } from './AgentConversationsContext';
import {useEarlierConversationEntries} from './useEarlierConversationEntries';
import {conversationImageSource,conversationImageLinkSource} from './conversation-markdown-images';
import { ConversationImagePreview } from './ConversationImagePreview';
import {needsConversationObservation, conversationObservationFeedback, carryExpandedProcessBlocks, conversationContinuationText, conversationRecoveryAction, canCloseUncertainConversation, canContinueReleasedConversation} from './conversation-state';
import { ConversationHistory, type ConversationWorkspace } from './ConversationHistory';
import { ConversationRequest } from './ConversationRequest';
import { ConversationPendingSend } from './ConversationPendingSend';
import type { DraftImage } from './ConversationImageInput';
import { ConversationExecutionNotice } from './ConversationExecutionNotice';
import { ConversationActiveToolsNotice } from './ConversationActiveToolsNotice';
import { pendingSubmission, clearPendingSubmission } from './conversation-pending';
import { ConversationAgentSelect, ConversationOptions } from './ConversationOptions';
import { ConversationDock } from './ConversationDock';
import { ConversationMessageImages } from './ConversationMessageImages';
import { ConversationComposer } from './ConversationComposer';
import { ConversationTurn } from './ConversationTurn';
import { imageSelectionError } from './conversation-images';
import { uploadConversationMaterials } from './conversation-material-upload';
import {conversationPermissionKey,conversationPermissionStorageKey,conversationRunIdentity,nativeConversationChoice,permissionModeLabels,readConversationPermission,selectedConversationModel,selectedConversationPermission,supportsConversationPermission,validConversationChoice,writeConversationPermission,type ConversationChoice,type PermissionMode} from './conversation-options';
import { appendDraftAttachment, canGenerateConversationTitle, conversationConflictNeedsRefresh, conversationTurnBinding, executionLocked, groupConversationStream, conversationStreamTurns, conversationTurnExecution, conversationTurnTiming, participantExecutionPairs, removeSubmittedAttachments, shouldSendOnKey, latestConversationParticipant, processBlockKey, type ConversationSelection } from './conversation-state';
import { conversationActionKey, createConversationActions, createConversationInputAttempts, reconcileConversationInputAttempt } from './conversation-actions';
import { useNewConversationImages } from './useNewConversationImages';
import { useConversationAttachments } from './useConversationAttachments';
import { draftMaterialIds, firstConversationSubmissions, type FirstSubmission } from './conversation-first-submission';
import { useConversationDraft } from './useConversationDraft';
import { providerNames, type ConversationEntry, type ConversationView, type SendDraft, type SendPreview } from './types';
import { useLocation, useNavigate } from 'react-router-dom';
import { codeApi } from '../code/api/code-api';
import { conversationFileReference, conversationFileTarget } from './conversation-process';
import {conversationReplyText} from './conversation-reply';
import {ConversationHandoffDrawer} from './ConversationHandoffDrawer';
import { ConversationProcessBlock } from './ConversationProcessBlock';
import { ConversationTaskLink } from './ConversationTaskLink';
import {modelPreferenceFromChoice,preferredConversationChoice,readConversationModelPreference,readConversationModulePreference,rememberConversationAgent,rememberConversationPermission,rememberedConversationPermission,writeConversationModelPreference,writeConversationModulePreference} from './conversation-preferences';
import {conversationFailureImpact,conversationSystemNoticeText,visibleConversationEntries,conversationModelWarning,conversationActionError,conversationHandoffReceipt,latestVisibleConversationMessage} from './conversation-notices';
import './agent-conversations.css';
import './conversation-flow.css';
const statusLabels = {starting:'正在准备执行',running:'正在执行','waiting-approval':'等待授权','waiting-question':'等待你的回复',stopping:'正在停止',stopped:'已确认停止','tools-active':'仍有命令未结束',unknown:'执行状态待确认',completed:'本轮已结束',failed:'本轮执行失败'};
type Prepared = {conversation:ConversationView;input:SendDraft;preview:SendPreview;clientRequestId:string;selection:ConversationSelection;recovery:ConversationSendRecovery};
type SendOperation={selection:ConversationSelection;continueRunId?:string};
type Props={workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null;portalTarget?:HTMLElement|null;embedded?:boolean;accessory?:ReactNode;onCreateChild?:()=>void};
export function ConversationPanel({workspaces,defaultWorkspaceId,portalTarget,embedded=false,accessory,onCreateChild}:Props){
  const context=useAgentConversations(),chat=context.conversation;
  const navigate=useNavigate(),location=useLocation();
  const panelId=embedded?'agent-child-conversation-panel-'+context.scope?.conversationId:'agent-conversation-panel';
  const [modulePreference,setModulePreference]=useState(readConversationModulePreference);
  const [modelPreference,setModelPreference]=useState(readConversationModelPreference);
  const draft=useConversationDraft(context.scope?.workspaceId||defaultWorkspaceId||'@default',context.scope?.conversationId||null);
  const draftWorkspaceId=context.draftScope?.workspaceId||draft.workspaceId;
  const [defaultRoot,setDefaultRoot]=useState(''),[defaultRootError,setDefaultRootError]=useState('');
  const needsDefaultRoot=!context.scope&&draftWorkspaceId==='@default';
  useEffect(()=>{if(!needsDefaultRoot)return;const controller=new AbortController();setDefaultRootError('');void context.api.defaultWorkspace(controller.signal).then(value=>{if(!controller.signal.aborted){setDefaultRoot(value.rootPath);setDefaultRootError('');}}).catch(failure=>{if(!controller.signal.aborted)setDefaultRootError(failure instanceof Error?failure.message:'无法读取默认工作空间目录。');});return()=>controller.abort();},[context.api,needsDefaultRoot]);
  const newCwd=draftWorkspaceId==='@default'?defaultRoot:workspaces.find(item=>item.id===draftWorkspaceId)?.rootPath||'';
  // 新建入口始终恢复同一份草稿；权限继续按工作空间保存。
  const draftSlot=context.scope?.conversationId||'new';
  // 明确的入口意图优先；没有入口意图时跟随草稿自身已保存的绑定。
  const boundTaskLinks:TaskLink[]=context.draftScope?(context.draftScope.taskLinks??(context.draftScope.taskId?[{workspaceId:draftWorkspaceId,taskId:context.draftScope.taskId}]:[])):(draft.taskLinks??(draft.taskId?[{workspaceId:draftWorkspaceId,taskId:draft.taskId}]:[]));
  const boundTaskId=boundTaskLinks.find(link=>link.workspaceId===draftWorkspaceId)?.taskId||'';
  useEffect(()=>{
    if(context.scope||!context.draftScope||context.draftScope.workspaceId!==draftWorkspaceId)return;
    if(draft.workspaceId===context.draftScope.workspaceId&&draft.taskId===context.draftScope.taskId&&JSON.stringify(draft.taskLinks??[])===JSON.stringify(context.draftScope.taskLinks??[]))return;
    draft.setWorkspace(context.draftScope.workspaceId,context.draftScope.taskId,context.draftScope.taskLinks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[context.scope,context.draftScope,draftWorkspaceId,draft.workspaceId,draft.taskId]);
  const [choices,setChoices]=useState<Record<string,ConversationChoice>>({});
  const [handoffSelections,setHandoffSelections]=useState<Record<string,string>>({});
  const choiceKey=draftSlot;
  const lastParticipant=latestConversationParticipant(chat);
  const newConversationChoice=useMemo(()=>context.scope&&!chat?.childOf?undefined:preferredConversationChoice(modulePreference,modelPreference,context.connections,context.modelCatalog),[context.scope,chat?.childOf,modulePreference,modelPreference,context.connections,context.modelCatalog]);
  const seededChoice=choices[choiceKey];
  const defaultConnection=context.scope
    ?context.connections.find(item=>item.id===lastParticipant?.connectionId)||context.connections.find(item=>item.status==='ready')||context.connections[0]
    :context.connections.find(item=>item.id===newConversationChoice?.connectionId)||context.connections.find(item=>item.status==='ready')||context.connections[0];
  const rawChoice=seededChoice||(context.scope&&(!chat?.childOf||lastParticipant)?{connectionId:lastParticipant?.connectionId||defaultConnection?.id||'',model:chat?.run?.model??lastParticipant?.model,modelAccountId:chat?.run?.modelAccountId??lastParticipant?.modelAccountId,modelAccountIdentity:chat?.run?.modelAccountIdentity,serviceTier:chat?.run?.serviceTier,reasoningEffort:chat?.run?.reasoningEffort}:newConversationChoice)||{connectionId:defaultConnection?.id||''};
  const connection=context.connections.find(item=>item.id===rawChoice.connectionId);
  const choice=validConversationChoice(rawChoice,connection,context.modelCatalog);
  const [permissionChoices,setPermissionChoices]=useState<Record<string,PermissionMode>>({});
  const permissionKey=conversationPermissionKey(context.scope,draftWorkspaceId);
  const permissionProfile=document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content')||'local';
  const permissionStorageKey=conversationPermissionStorageKey(permissionProfile,context.scope,draftWorkspaceId);
  const savedPermission=(()=>{try{return readConversationPermission(permissionStorageKey,sessionStorage);}catch{return;}})();
  const rememberedPermission=context.scope&&(!chat?.childOf||chat.run)?undefined:modulePreference.permission?rememberedConversationPermission(modulePreference,draftWorkspaceId):savedPermission??rememberedConversationPermission(modulePreference,draftWorkspaceId);
  const permissionMode=selectedConversationPermission(permissionChoices[permissionKey]??(context.scope&&(!chat?.childOf||chat.run)?savedPermission:savedPermission??rememberedPermission),chat?.run,connection);
  const permissionAvailable=supportsConversationPermission(connection,permissionMode);
  const {attachments,setAttachments,available:attachmentsAvailable}=useConversationAttachments(context.api,chat,permissionProfile);
  const attachmentKey=draftSlot;
  const newImages=useNewConversationImages(context.api,!context.scope);
  const images=context.scope?(attachments[attachmentKey]||[]):newImages.images;
  const [preparing,setPreparing]=useState(false);
  const [sending,setSending]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const feedbackRun = useRef<string | undefined>(undefined);
  const [replyFailure,setReplyFailure]=useState<{attempt:ConversationReplyAttempt;message:string}|null>(null);
  useEffect(()=>{setReplyFailure(current=>current&&confirmedConversationReply(chat,current.attempt)?null:current);},[chat]);
  useEffect(()=>{setReplyFailure(null);},[context.selectionGeneration]);
  useEffect(()=>{if(feedbackRun.current!==chat?.run?.id)setFeedback('');feedbackRun.current=undefined;},[chat?.workspaceId,chat?.id,chat?.run?.id]);
  const [,setActionVersion]=useState(0);
  const [actions]=useState(()=>createConversationActions(()=>setActionVersion(value=>value+1)));
  const actionKey=(value:ConversationView,action:string,identity=value.run?.id||'')=>conversationActionKey({workspaceId:value.workspaceId,conversationId:value.id},action,identity);
  const uploadKey=chat?actionKey(chat,'upload',''):conversationActionKey({workspaceId:draftWorkspaceId,conversationId:'new'},'upload');
  const [stoppedOutput,setStoppedOutput]=useState<StoppedConversationOutput|null>(null);
  const outputPaused=Boolean(chat&&stoppedOutput&&stoppedOutput.workspaceId===chat.workspaceId&&stoppedOutput.conversationId===chat.id&&stoppedOutput.runId===chat.run?.id);
  const stopping=Boolean(chat&&actions.has(actionKey(chat,'stop'))),observing=Boolean(chat&&actions.has(actionKey(chat,'observe'))),uploading=actions.has(uploadKey);
  const generatingTitle=Boolean(chat&&actions.has(actionKey(chat,'generate-title','')));
  const closingConversation=Boolean(chat&&actions.has(actionKey(chat,'close')));
  const [selectedHandoff,setSelectedHandoff]=useState<ConversationEntry|null>(null),[prepared,setPrepared]=useState<Prepared|null>(null),[previewOpen,setPreviewOpen]=useState(false),[rename,setRename]=useState(false),[title,setTitle]=useState('');
  const viewedHandoff=selectedHandoff?(chat?.entries.find(entry=>entry.id===selectedHandoff.id)??selectedHandoff):null;
  const [moreOpen,setMoreOpen]=useState(false),[locationOpen,setLocationOpen]=useState(false);
  const [fileLinkFailure,setFileLinkFailure]=useState<{selection:ConversationSelection;reference:string;message:string}|null>(null);
  const [imageLink,setImageLink]=useState<{selection:ConversationSelection;reference:string;href:string}|null>(null);
  const [expandedToolGroups,setExpandedToolGroups]=useState<Record<string,boolean>>({});
  const [atBottom,setAtBottom]=useState(true);
  const stream=useRef<HTMLDivElement>(null),readPosition=useRef(0),bottom=useRef(true),composing=useRef(false);
  const streamContent=useRef<HTMLDivElement>(null);
  const revealAnswer=useCallback((element:HTMLElement)=>{
    const node=stream.current;if(!node)return;
    const overflow=element.getBoundingClientRect().bottom-node.getBoundingClientRect().bottom+12;
    if(overflow>0)node.scrollTop+=overflow;
    bottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<=24;
    earlier.remember();
    setAtBottom(bottom.current);
  },[]);
  const selectedSourceModel=context.modelCatalog.find(model=>model.accountId===choice.modelAccountId&&model.modelId===choice.model&&(!choice.modelAccountIdentity||model.accountIdentity===choice.modelAccountIdentity));
  const effectiveModel=choice.model??selectedConversationModel(connection,undefined)?.id;
  const effectiveModelLabel=selectedSourceModel?.label||selectedConversationModel(connection,effectiveModel)?.label||effectiveModel||'默认模型';
  const executionChangedFor=(value:ConversationView|null|undefined)=>Boolean(value?.run&&(latestConversationParticipant(value)?.connectionId!==choice.connectionId||value.run.model!==effectiveModel||value.run.modelAccountId!==choice.modelAccountId||value.run.serviceTier!==choice.serviceTier||value.run.reasoningEffort!==choice.reasoningEffort||(value.run.permissionMode??'default')!==permissionMode));
  const executionChanged=executionChangedFor(chat);
  const waitingHandoffAvailable=Boolean(executionChanged&&chat?.run?.status==='waiting-question'&&handoffSelections[choiceKey]===chat.run.id&&currentConversationRequests(chat).length&&currentConversationRequests(chat).every(request=>request.kind==='question'&&request.runId===chat.run!.id&&request.participantId===chat.run!.participantId&&request.generation===chat.run!.generation)&&!chat.pendingSend);
  const waitingQuestions=currentConversationRequests(chat).filter(request=>request.kind==='question');
  const waitingHandoffLabel=draft.text.trim()||images.length?'交接并发送':'交接并继续';
  const sendText=conversationContinuationText(chat,executionChanged,draft.text,images.length);
  const recovery=conversationRecoveryAction(chat);
  const queuedImages=useRef<Record<string,DraftImage[]>>({});
  useEffect(()=>{
    if(!chat||chat.pendingSend||!attachments['@pending:'+chat.id])return;
    setAttachments(previous=>{const next={...previous};delete next['@pending:'+chat.id];return next;});
  },[chat?.id,chat?.pendingSend?.id,attachments,setAttachments]);
  const pendingAttempt=useRef<{workspaceId:string;conversationId:string;value:ReturnType<typeof pendingSubmission>}|undefined>(undefined);
  const activeSend=useRef<SendOperation|null>(null),locked=executionLocked(chat?.run);
  const canSend=(Boolean(context.scope)||newImages.ready)&&!context.loading&&!context.productActionPending&&(!context.scope||Boolean(chat))&&!sending&&!uploading&&(!chat?.forkState||chat.forkState.status==='ready');
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
      if(chat?.run)setHandoffSelections(previous=>({...previous,[choiceKey]:chat.run!.id}));
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
  useLayoutEffect(()=>{setError('');setFeedback('');setFileLinkFailure(null);setImageLink(null);setExpandedToolGroups({});const active=activeSend.current;if(!active||!context.isSelectionCurrent(active.selection)){activeSend.current=null;setSending(false);setPreparing(false);setPrepared(null);setSelectedHandoff(null);setPreviewOpen(false);}bottom.current=true;readPosition.current=0;setAtBottom(true);},[context.selectionGeneration,context.scope?.workspaceId,context.scope?.conversationId,context.isSelectionCurrent]);
  useEffect(()=>{setMoreOpen(false);setLocationOpen(false);},[context.selectionGeneration,context.open,context.side,context.full,context.view]);
  useEffect(()=>{earlier.followLayout();setAtBottom(bottom.current);},[chat?.id,chat?.entries.length,chat?.entries.at(-1)?.text,chat?.requests.length,chat?.run?.status,chat?.pendingSend?.id]);
  useLayoutEffect(()=>{const node=stream.current;if(!node?.getClientRects().length)return;if(bottom.current)earlier.followLayout();else{node.scrollTop=readPosition.current;earlier.remember();}setAtBottom(bottom.current);},[portalTarget,context.view,context.open]);
  const hasMessageList=Boolean(chat?.entries.length)&&!context.loading&&!context.error;
  useEffect(()=>{
    const node=stream.current,list=streamContent.current;
    if(!node?.getClientRects().length)return;
    // Layout settles after the first pin: the compose area grows and fonts or images reflow content.
    // While the reader sits at the bottom, follow every size change so refreshes land on the true bottom.
    const observer=new ResizeObserver(()=>{earlier.followLayout();setAtBottom(bottom.current);});
    observer.observe(node);
    if(list)observer.observe(list);
    // A transient shrink can clamp scrollTop and regrow to the same size before
    // ResizeObserver sees it. Reconcile DOM changes before native scroll events.
    const mutations=new MutationObserver(()=>{earlier.followLayout();setAtBottom(bottom.current);});
    if(list)mutations.observe(list,{childList:true,subtree:true,characterData:true});
    return()=>{observer.disconnect();mutations.disconnect();};
  },[chat?.id,hasMessageList,context.view,context.open]);
  const fail=(failure:unknown)=>{setError(failure instanceof Error?failure.message:'操作未完成。');};
  const resolvePresentedFile=async(path:string,signal?:AbortSignal,literal=false)=>{
    if(!chat||chat.workspaceId==='@default')throw new Error('此文件没有已登记的代码来源，请复制原路径核对。');
    const reference=literal?{path}:conversationFileReference(path);
    if(!reference)throw new Error('来源路径或行号无效，请复制原路径核对。');
    const catalog=await codeApi.repositories(chat.workspaceId,chat.taskId,signal);
    const file=conversationFileTarget(chat.cwd,reference.path,catalog);
    if(!file)throw new Error('无法确认这个文件的原工作目录，请复制原路径核对。');
    return {file,reference};
  };
  const readPresentedFile=async(path:string,signal:AbortSignal)=>{
    if(!chat)throw new Error('原对话已变化。');
    const {file}=await resolvePresentedFile(path,signal,true);
    return codeApi.file(chat.workspaceId,file,signal);
  };
  const openProcessFile=async(path:string,literal=false)=>{
    if(!chat)return;
    const selection=context.getSelection();
    try{
      const image=literal?null:conversationImageLinkSource(chat.cwd,path);
      if(image){setFileLinkFailure(null);setImageLink({selection,reference:path,href:image.href});return;}
      const {file,reference}=await resolvePresentedFile(path,undefined,literal);
      // An invalid destination must not populate editor tabs and expand its parents.
      await codeApi.file(chat.workspaceId,file);
      if(!context.isSelectionCurrent(selection))return;
      context.setFull(false);
      navigate(`/workspaces/${encodeURIComponent(chat.workspaceId)}/code/explorer`,{state:{codeEntry:{file:{...file,...(reference.line?{line:reference.line}:{})},from:{pathname:location.pathname,search:location.search,hash:location.hash,state:location.state}}}});
      setFileLinkFailure(null);
    }catch(failure){if(context.isSelectionCurrent(selection))setFileLinkFailure({selection,reference:path,message:failure instanceof Error?failure.message:'无法打开来源文件。'});}
  };
  const recoverConflict=async(failure:unknown)=>{
    const api=failure as ApiError;if(api?.status!==409)return false;
    const selection=context.getSelection();
    setPrepared(null);setPreviewOpen(false);
    if(!conversationConflictNeedsRefresh(api)){fail(failure);return true;}
    try{await context.refresh();await Promise.allSettled([context.refreshConnections(),context.refreshModelCatalog()]);if(context.isSelectionCurrent(selection))setError(refreshedConversationConflictMessage(api));}catch{if(context.isSelectionCurrent(selection))fail(failure);}
    return true;
  };
  const [fallbackFirstSubmissions]=useState(()=>{try{return firstConversationSubmissions(sessionStorage,'buildr.conversation-first:'+permissionProfile);}catch{return firstConversationSubmissions();}});
  const firstSubmissions=context.firstSubmissionStore??fallbackFirstSubmissions;
  const [unconfirmedFirst,setUnconfirmedFirst]=useState(()=>firstSubmissions.read());
  const acceptFirst=async(submitted:FirstSubmission,result:ConversationView,selection:ConversationSelection,transferRemainder=false)=>{
    draft.acceptNewSubmitted(result.workspaceId,result.id,submitted.input.text,transferRemainder&&context.isSelectionCurrent(selection));
    firstSubmissions.clear(submitted.input.clientRequestId);setUnconfirmedFirst(undefined);
    if(submissionIdentity.current.requestId===submitted.input.clientRequestId)submissionIdentity.current.requestId=crypto.randomUUID();
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
  const submissionIdentity=useRef({draftId:'',requestId:crypto.randomUUID()});
  if(submissionIdentity.current.draftId!==newImages.id)submissionIdentity.current={draftId:newImages.id,requestId:crypto.randomUUID()};
  // 模型目录可能晚于输入到达；首条发送前用最新目录补齐原生账号，避免写入无法归属的执行记录。
  const firstSendChoice=async()=>{
    if(choice.modelAccountId)return choice;
    let catalog=context.modelCatalog;
    try{catalog=(await context.api.modelCatalog()).models;}catch{/* 读取失败时保留当前观察，继续原有发送行为。 */}
    const bound=nativeConversationChoice(choice,connection,catalog);
    if(bound!==choice)setChoices(previous=>({...previous,[choiceKey]:bound}));
    return bound;
  };
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
      const bound=await firstSendChoice();
      if(!context.isSelectionCurrent(operation.selection))return;
      submitted=firstSubmissions.save({draftId:newImages.id,workspaceId:draftWorkspaceId,input:{connectionId:bound.connectionId,modelAccountId:bound.modelAccountId,modelAccountRevision:bound.modelAccountRevision,modelAccountIdentity:bound.modelAccountIdentity,model:bound.model,serviceTier:bound.serviceTier,reasoningEffort:bound.reasoningEffort,permissionMode,text:draft.text,attachmentIds:expectedIds as NonNullable<SendDraft['attachmentIds']>,expectedDraftRevision:snapshot.revision,clientRequestId:submissionIdentity.current.requestId,...(draftWorkspaceId!=='@default'&&newCwd?{cwd:newCwd.trim()}:{}),...(boundTaskLinks.length?{taskLinks:boundTaskLinks}:{})}});
    }
    try{
      const result=await context.api.startDraft(submitted.workspaceId,submitted.draftId,submitted.input);
      await acceptFirst(submitted,result.conversation,operation.selection,fresh);
    }catch(failure){
      const error=failure as ApiError;
      const preserved=firstSubmissions.recordFailure(submitted.input.clientRequestId,error);
      setUnconfirmedFirst(firstSubmissions.read());
      if(preserved?.failureReason==='backend-updating')return;
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
    earlier.pinLatest();
    const prior=pendingAttempt.current;
    const submission=pendingSubmission(permissionProfile+':'+current.workspaceId,current.id,input,storage,prior?.workspaceId===current.workspaceId&&prior.conversationId===current.id?prior.value:undefined);
    pendingAttempt.current={workspaceId:current.workspaceId,conversationId:current.id,value:submission};
    try {
      const result=await context.api.queueSend(current,{...submission.input,clientRequestId:submission.clientRequestId,previousRunId:current.run?.id});
      context.apply(result,current.revision);
      queuedImages.current[current.id]=images.filter(image=>input.attachmentIds?.some(id=>id===image.id));
      draft.clearSubmitted(current.workspaceId,current.id,input.text);
      setAttachments(previous=>({...previous,['@pending:'+current.id]:queuedImages.current[current.id],[current.id]:removeSubmittedAttachments(previous[current.id]||[],input.attachmentIds||[])}));
      clearPendingSubmission(permissionProfile+':'+current.workspaceId,current.id,storage);if(pendingAttempt.current?.value.clientRequestId===submission.clientRequestId)pendingAttempt.current=undefined;
      if(context.isSelectionCurrent(selection)){setPrepared(null);setPreviewOpen(false);}
      return result;
    }catch(failure){if((failure as ApiError)?.code==='agent_revision_conflict'){clearPendingSubmission(permissionProfile+':'+current.workspaceId,current.id,storage);if(pendingAttempt.current?.value.clientRequestId===submission.clientRequestId)pendingAttempt.current=undefined;}throw failure;}
  };
  const commit=async(value:Prepared,continuing?:SendOperation)=>{
    if(!value.preview.fits||!context.isSelectionCurrent(value.selection)||(!continuing&&activeSend.current))return;
    const operation=continuing??{selection:value.selection};activeSend.current=operation;
    earlier.pinLatest();
    setSending(true);setError('');
    try{
      if(value.input.waitingHandoff){await queue(value.conversation,value.input);void context.refreshPending().catch(()=>{});return;}
      let dispatchAttempts=0;
      const submitted=await withConversationSendRecovery(value.conversation,continuing?value.recovery:{enabled:false,used:false},{
        isCurrent:()=>activeSend.current===operation&&context.isSelectionCurrent(value.selection),
        read:()=>context.api.read(value.conversation.workspaceId,value.conversation.id),
        apply:context.apply,
        perform:async current=>{
          const input={...value.input,expectedRevision:current.revision};
          const preview=dispatchAttempts++===0&&current.revision===value.conversation.revision?value.preview:await context.api.prepare(current,input);
          if(activeSend.current!==operation||!context.isSelectionCurrent(value.selection))return;
          if(!preview.fits){setPrepared({...value,conversation:current,input,preview});setPreviewOpen(true);throw new Error(preview.diagnostic||'交接资料需要重新核对，草稿保留。');}
          if(!sameConversationSendPreview(value.preview,preview))throw Object.assign(new Error('发送配置已变化，请核对后重新发送。'),{status:409,code:'agent_preview_stale'});
          return context.api.send(current,{...input,previewToken:preview.token,clientRequestId:value.clientRequestId});
        },
      });
      if(!submitted?.value)return;
      context.apply(submitted.value.conversation,submitted.conversation.revision);
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
  const prepare=async(show=true,skipSummary=false,recoveryRunId?:string,retryFirst=false,handoffAnswer?:{requestId:string;answer:unknown})=>{
    const waitingHandoff:SendDraft['waitingHandoff']=waitingHandoffAvailable&&chat?.run?{runId:chat.run.id,participantId:chat.run.participantId,generation:chat.run.generation,requestIds:currentConversationRequests(chat).map(request=>request.id) as NonNullable<SendDraft['waitingHandoff']>['requestIds'],...(handoffAnswer?{answers:[handoffAnswer]}:{})}:undefined;
    if(handoffAnswer&&!waitingHandoff){setError('原问题或模型选择已变化，请核对后重新提交；回答保留。');return;}
    const continueRunId=recoveryRunId??(waitingHandoff&&(handoffAnswer||!draft.text.trim()&&!images.length)?chat?.run?.id:!draft.text.trim()&&!images.length&&recovery?.kind==='recover'?chat?.run?.id:undefined);
    if(continueRunId&&locked&&!waitingHandoff&&!canContinueReleasedConversation(chat))return;
    const requestImages=continueRunId?[]:images;
    if(!chat&&firstSubmissions.read()){
      if(activeSend.current)return;
      if(!retryFirst){setUnconfirmedFirst(firstSubmissions.read());setError('还有一条首次提交结果待核对，请先核对原提交；当前新输入已保留。');return;}
      const operation:SendOperation={selection:context.getSelection()};activeSend.current=operation;setSending(true);setError('');
      try{await sendFirst(operation);}catch(failure){if(context.isSelectionCurrent(operation.selection))fail(failure);}
      finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);}}
      return;
    }
    const unavailable=(!connection?.enabled?'请先接入可用的智能体。':!permissionAvailable?'当前执行者不支持'+permissionModeLabels[permissionMode]:requestImages.length&&!connection.capabilities.images?'当前执行者不支持图片或视频画面。请移除附件或选择支持图片的执行者。':choice.modelAccountId&&context.modelCatalogReady&&!selectedSourceModel?.available?'所选模型暂不可用，请重新选择。':'');
    if(unavailable){setError(unavailable);return;}
    if(activeSend.current||(!canSend&&!skipSummary)||(!continueRunId&&!show&&!sendText.trim()&&!images.length))return;
    setSelectedHandoff(null);
    const operation:SendOperation={selection:context.getSelection(),continueRunId};activeSend.current=operation;setSending(true);setPreparing(show||Boolean(continueRunId)||Boolean(waitingHandoff));setError('');
    try{
      if(!chat){await sendFirst(operation);return;}
      let current=chat;
      const refreshLatest=async()=>{
        const refreshed=await latestConversationSend(current,{
          read:()=>context.api.read(current.workspaceId,current.id),
          observe:context.api.observe,
          apply:context.apply,
          isCurrent:()=>activeSend.current===operation&&context.isSelectionCurrent(operation.selection),
        });
        if(!refreshed)return false;
        current=refreshed;
        return true;
      };
      if(!continueRunId&&!await refreshLatest())return;
      const pendingInput=inputAttempts.read(current);
      if(!show&&!continueRunId&&pendingInput){
        const result=await reconcileConversationInputAttempt(pendingInput,{
          reconcile:attempt=>context.api.supplement(current,{text:attempt.text,attachmentIds:attempt.images.map(image=>image.id) as NonNullable<SendDraft['attachmentIds']>,clientRequestId:attempt.clientRequestId,sameRunOnly:true},attempt),
          finish:requestId=>inputAttempts.finish(current,requestId),
          isCurrent:()=>activeSend.current===operation&&context.isSelectionCurrent(operation.selection),
        });
        if(!result)return;
        if('conversation' in result){context.apply(result.conversation,current.revision);current=result.conversation;}
        if(result.delivery==='unknown')throw new Error('消息是否送达仍待确认，请勿重复发送；输入已保留。');
        if(result.delivery==='accepted'||result.delivery==='continued'){
          if(pendingInput.text===sendText&&JSON.stringify(pendingInput.images.map(image=>image.id))===JSON.stringify(requestImages.map(image=>image.id))){
            draft.clearSubmitted(current.workspaceId,current.id,pendingInput.text);
            setAttachments(previous=>({...previous,[current.id]:removeSubmittedAttachments(previous[current.id]||[],pendingInput.images.map(image=>image.id))}));
            setFeedback('上条追加消息已确认接收，无需重复发送。');return;
          }
        }
        if(!await refreshLatest())return;
      }
      const route=conversationSendRoute(current,executionChangedFor(current),show);
      if(route==='pending')throw new Error('原轮仍在等待回答或授权，请在原卡片处理；输入已保留，不会另开会话。');
      if(!show&&!continueRunId){
        if(route==='unavailable')throw new Error('原轮暂不能接收追加消息，请稍后核对；输入已保留，不会另开会话。');
        if(route==='supplement'){
          earlier.pinLatest();
          const attempt=inputAttempts.begin(current,sendText,requestImages);
          const result=await reconcileConversationInputAttempt(attempt,{
            reconcile:()=>context.api.supplement(current,{text:sendText,attachmentIds:requestImages.map(item=>item.id) as NonNullable<SendDraft['attachmentIds']>,clientRequestId:attempt.clientRequestId,sameRunOnly:true},attempt),
            finish:requestId=>inputAttempts.finish(current,requestId),
            isCurrent:()=>activeSend.current===operation&&context.isSelectionCurrent(operation.selection),
          });
          if(!result)return;
          if('conversation' in result)context.apply(result.conversation,current.revision);
          if(result.delivery==='accepted'||result.delivery==='continued'){
            draft.clearSubmitted(current.workspaceId,current.id,sendText);
            setAttachments(previous=>({...previous,[current.id]:removeSubmittedAttachments(previous[current.id]||[],requestImages.map(item=>item.id))}));
          }else {
            const refusal='conversation' in result?result.conversation.entries.slice().reverse().find(entry=>entry.runId===attempt.runId&&entry.kind==='message'&&entry.role==='user'&&entry.status==='failed'&&entry.text===sendText)?.deliveryDiagnostic:result.diagnostic;
            throw new Error(result.delivery==='unknown'?'消息是否送达仍待确认，请勿重复发送；输入已保留。':refusal||'原轮未接收这条消息；输入已保留，不会另开会话。');
          }
          return;
        }
      }

      if(continueRunId&&!waitingHandoff){
        current=await context.api.observe(chat);
        if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
        context.apply(current,chat.revision);
        if(current.run?.id!==continueRunId)throw new Error('原执行已变化，请核对当前记录后继续。');
        if(!conversationRecoveryAction(current)){setFeedback(conversationObservationFeedback(current.run)+' 可以直接提出新的要求。');await context.refresh();return;}
        if(!canContinueReleasedConversation(current)&&(executionLocked(current.run)||currentConversationRequests(current).length||current.run.tools.some(tool=>tool.status!=='completed')))throw new Error(current.run.diagnostic||'原执行或工具仍未结束，请先核对或停止相关工作。');
      }
      operation.selection={...operation.selection,scope:{workspaceId:current.workspaceId,conversationId:current.id}};
      if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
      let input:SendDraft={expectedRevision:current.revision,connectionId:choice.connectionId,modelAccountId:choice.modelAccountId,modelAccountRevision:choice.modelAccountRevision,modelAccountIdentity:choice.modelAccountIdentity,model:choice.model,serviceTier:choice.serviceTier,reasoningEffort:choice.reasoningEffort,skipHandoffSummary:skipSummary,permissionMode,...(waitingHandoff?{waitingHandoff}:{}),...(continueRunId?{continueRunId}:{}),text:continueRunId?'':skipSummary&&!sendText.trim()&&!requestImages.length?'继续当前工作。':sendText,attachmentIds:requestImages.map(item=>item.id) as NonNullable<SendDraft['attachmentIds']>};
      const recovery:ConversationSendRecovery={enabled:!show&&!continueRunId&&!waitingHandoff&&!executionLocked(current.run),used:false};
      if(!show&&!continueRunId&&!waitingHandoff){
        // Ordinary sends are validated and admitted atomically by the server.
        // The preview endpoint is reserved for an explicit inspection.
        earlier.pinLatest();
        let storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
        try{storage=sessionStorage;}catch{/* Retain the same-page attempt below. */}
        const prior=pendingAttempt.current;
        const submission=pendingSubmission(permissionProfile+':direct:'+current.workspaceId,current.id,input,storage,prior?.workspaceId===current.workspaceId&&prior.conversationId===current.id?prior.value:undefined);
        pendingAttempt.current={workspaceId:current.workspaceId,conversationId:current.id,value:submission};
        const submitted=await withConversationSendRecovery(current,recovery,{
          isCurrent:()=>activeSend.current===operation&&context.isSelectionCurrent(operation.selection),
          read:()=>context.api.read(current.workspaceId,current.id),apply:context.apply,
          perform:value=>{current=value;return context.api.send(value,{...input,expectedRevision:value.revision,clientRequestId:submission.clientRequestId});},
        }).catch(async(failure:unknown)=>{
          if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))throw failure;
          const code=(failure as ApiError)?.code||'';
          if(['agent_process_switching','agent_conversation_busy'].includes(code)){await queue(current,input);return;}
          if(['agent_handoff_capacity','agent_session_confirmation_required'].includes(code)){
            const preview=await context.api.prepare(current,{...input,expectedRevision:current.revision});
            if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
            setPrepared({conversation:current,input,preview,clientRequestId:submission.clientRequestId,selection:operation.selection,recovery});
            setPreviewOpen(true);return;
          }
          throw failure;
        });
        if(!submitted?.value)return;
        context.apply(submitted.value.conversation,submitted.conversation.revision);
        clearPendingSubmission(permissionProfile+':direct:'+current.workspaceId,current.id,storage);
        if(pendingAttempt.current?.value.clientRequestId===submission.clientRequestId)pendingAttempt.current=undefined;
        draft.clearSubmitted(current.workspaceId,current.id,input.text);
        setAttachments(previous=>({...previous,[current.id]:removeSubmittedAttachments(previous[current.id]||[],input.attachmentIds||[])}));
        void context.refreshPending().catch(()=>{});
        return;
      }
      let preview:SendPreview;
      try{
        const result=await withConversationSendRecovery(current,recovery,{
          isCurrent:()=>activeSend.current===operation&&context.isSelectionCurrent(operation.selection),
          read:()=>context.api.read(current.workspaceId,current.id),apply:context.apply,
          perform:value=>context.api.prepare(value,{...input,expectedRevision:value.revision}),
        });
        if(!result)return;
        current=result.conversation;preview=result.value;
        if(recovery.used&&input.modelAccountId&&input.modelAccountRevision&&preview.modelAccountRevision!==input.modelAccountRevision)throw Object.assign(new Error('模型账号状态已更新，请核对所选模型后重新发送。'),{status:409,code:'agent_model_source_changed'});
        input={...input,expectedRevision:current.revision};
      }catch(failure){if(!continueRunId&&!show&&['agent_process_switching','agent_conversation_busy'].includes((failure as ApiError)?.code||'')){setPreparing(false);await queue(current,input);return;}throw failure;}
      if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
      setPreparing(false);
      const next:Prepared={conversation:current,input,preview,clientRequestId:crypto.randomUUID(),selection:operation.selection,recovery};setPrepared(next);
      if(show||!preview.fits)setPreviewOpen(true);else await commit(next,operation);
    }catch(failure){if(activeSend.current===operation&&context.isSelectionCurrent(operation.selection)&&!await recoverConflict(failure))fail(failure);}finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);setPreparing(false);}}
  };
  const observe=async()=>{
    if(!chat)return;const key=actionKey(chat,'observe');if(!actions.begin(key))return;const selection=context.getSelection();setError('');setFeedback('');
    try{const result=await context.api.observe(chat);context.apply(result,chat.revision);if(context.isSelectionCurrent(selection)){setFeedback(conversationObservationFeedback(result.run));await context.refresh();}}catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}finally{actions.finish(key);}
  };
  const stop=async(toolId?:string)=>{
    if(!chat)return;if(chat.run?.resourcesReleased)return;const key=actionKey(chat,'stop');if(!actions.begin(key))return;const selection=context.getSelection();setError('');setFeedback('');
    if(!toolId&&chat.run)setStoppedOutput({workspaceId:chat.workspaceId,conversationId:chat.id,runId:chat.run.id,entries:chat.entries.filter(entry=>entry.runId===chat.run!.id).map(entry=>({...entry}))});
    try{const result=await context.api.stop(chat,toolId);context.apply(result,chat.revision);if(context.isSelectionCurrent(selection)&&toolId)setFeedback(result.run?.diagnostic||'');void context.refreshPending().catch(()=>{});}catch(failure){if(context.isSelectionCurrent(selection)){fail(failure);void context.refresh().catch(()=>{});}}finally{actions.finish(key);}
  };
  const reply=async(requestId:string,answer:unknown)=>{
    const request=chat?.requests.find(request=>request.id===requestId);
    if(!chat)return;const key=actionKey(chat,'reply',requestId);if(!actions.begin(key))return;const selection=context.getSelection();setError('');setReplyFailure(null);
    const attempt:ConversationReplyAttempt|undefined=request?{workspaceId:chat.workspaceId,conversationId:chat.id,request,answer,previousEntries:chat.entries.filter(entry=>entry.id==='reply-'+requestId||entry.id.startsWith('reply-'+requestId+'-')).map(entry=>({id:entry.id,status:entry.status,text:entry.text}))}:undefined;
    try{const owner=[...(chat.run?[chat.run]:[]),...(chat.retainedRuns??[])].find(run=>run.id===request?.runId&&run.participantId===request.participantId&&run.generation===request.generation);if(!owner)throw new Error('原问题归属已变化，请重新核对。');context.apply(await context.api.reply({...chat,run:owner},requestId,{answer}),chat.revision);void context.refreshPending().catch(()=>{});}catch(failure){if(context.isSelectionCurrent(selection)){if(attempt)setReplyFailure({attempt,message:failure instanceof Error?failure.message:'回答是否接收仍待确认，请核对原问题。'});else fail(failure);void context.refresh().catch(()=>{});}}finally{actions.finish(key);}
  };
  const renderQuestion=(request:ConversationView['requests'][number])=><ConversationRequest key={request.id} request={request} run={[...(chat?.run?[chat.run]:[]),...(chat?.retainedRuns??[])].find(run=>run.id===request.runId)} provider={chat?.participants.find(item=>item.id===request.participantId)?.provider||'codex'} onUpload={uploadAnswerMaterials} busy={sending||stopping||uploading||Boolean(chat?.pendingSend?.draft.waitingHandoff)||actions.has(actionKey(chat!,'reply',request.id))} onRevealAnswer={revealAnswer} onReply={answer=>void reply(request.id,answer)}/>;
  const uploadAnswerMaterials=async(files:File[],accept:(image:DraftImage)=>void)=>{
    if(!chat)throw new Error('原对话已变化，请重新打开问题。');
    const key=actionKey(chat,'upload','');if(!actions.begin(key))throw new Error('正在上传，请稍后再添加图片。');
    const selection=context.getSelection();
    try{await uploadConversationMaterials(chat,files,context.api.upload,accept,()=>context.isSelectionCurrent(selection));}
    finally{try{if(context.isSelectionCurrent(selection))await context.refresh();}finally{actions.finish(key);}}
  };
  const upload=async(files:FileList|File[]|null)=>{
    if(!files?.length||uploading||sending||context.loading||Boolean(context.scope&&!chat))return;setError('');
    const selected=Array.from(files);const validation=imageSelectionError(selected,images.length,connection?.capabilities.maxImageBytes);
    if(validation){setError(validation);return;}
    let key=uploadKey;if(!actions.begin(key))return;let selection=context.getSelection();
    try {
      if(!chat){await newImages.add(selected);return;}
      const current=chat;
      selection={...selection,scope:{workspaceId:current.workspaceId,conversationId:current.id}};
      if(!context.isSelectionCurrent(selection))return;
      const boundKey=actionKey(current,'upload','');actions.move(key,boundKey);key=boundKey;
      await uploadConversationMaterials(current,selected,context.api.upload,image=>{
        setAttachments(previous=>({...previous,[current.id]:appendDraftAttachment(previous[current.id]||[],image)}));
      },()=>context.isSelectionCurrent(selection));
      if(context.isSelectionCurrent(selection))await context.refresh();
    }catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}finally{actions.finish(key);}
  };
  const updateMetadata=async(input:{title?:string;hidden?:boolean;taskId?:string|null;taskIds?:string[];taskLinks?:TaskLink[]})=>{if(!chat)return;const selection=context.getSelection();try{context.apply(await context.api.update(chat,input),chat.revision);if(context.isSelectionCurrent(selection)){setRename(false);if(input.hidden!==undefined)context.setView('history');}return true;}catch(failure){if(context.isSelectionCurrent(selection))fail(failure);return false;}};
  const closeConversation=async()=>{
    if(!chat||!canCloseUncertainConversation(chat))return;
    const key=actionKey(chat,'close');if(!actions.begin(key))return;
    try{if(await updateMetadata({hidden:true}))await context.refresh();}finally{actions.finish(key);}
  };
  const assignTask=async(links:TaskLink[]):Promise<boolean>=>{
    if(chat)return Boolean(await updateMetadata({taskLinks:links}));
    const local=links.find(link=>link.workspaceId===draftWorkspaceId)?.taskId;
    draft.setTaskLinks(links);setPrepared(null);
    context.newConversation({preserveVisibility:true,scope:{workspaceId:draftWorkspaceId,taskId:local,taskLinks:links}});
    return true;
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
    prepend:page=>{if(chat)setExpandedToolGroups(previous=>carryExpandedProcessBlocks(visibleConversationEntries(chat.entries),visibleConversationEntries(page.entries),previous,chat.run));context.prependEntries(page);},
  });
  const followBottom=()=>{
    setAtBottom(previous=>previous===bottom.current?previous:bottom.current);
    // Completion must not collapse the live process underneath an upward reader.
    if(!bottom.current)setExpandedToolGroups(previous=>{
      const keys=turns.filter(turn=>conversationTurnExecution(turn,chat?.run).active||turn.items.some(item=>item.type==='process-block'&&item.active)).map(turn=>'turn:'+(turn.prompt?.runId??turn.items.flatMap(item=>item.type==='process-block'?item.entries:item.type==='entry'?[item.entry]:[]).find(entry=>entry.role==='assistant')?.runId??turn.key));
      if(keys.every(key=>previous[key]!==undefined))return previous;
      return {...previous,...Object.fromEntries(keys.filter(key=>previous[key]===undefined).map(key=>[key,true]))};
    });
  };
  const scrollToLatest=()=>{earlier.pinLatest();setAtBottom(true);};
  const seenAttempt=useRef('');
  useEffect(()=>{
    const element=stream.current;
    if(!chat||!element||!context.open||context.view!=='conversation')return;
    const latest=latestVisibleConversationMessage(chat.entries);
    const check=()=>{
      if(document.visibilityState!=='visible'||!latest||!element.getClientRects().length)return;
      const message=Array.from(element.querySelectorAll<HTMLElement>('[data-entry-id]')).find(node=>node.dataset.entryId===latest.id);
      if(!message)return;
      const bounds=element.getBoundingClientRect(),rect=message.getBoundingClientRect();
      if(rect.top>=bounds.bottom||rect.bottom<=bounds.top||rect.width===0)return;
      const key=chat.workspaceId+':'+chat.id+':'+chat.activity?.version;
      if(seenAttempt.current===key)return;
      seenAttempt.current=key;void context.markSeen(chat);
    };
    const frame=requestAnimationFrame(check);
    const observer=new ResizeObserver(check);observer.observe(element);if(streamContent.current)observer.observe(streamContent.current);
    element.addEventListener('scroll',check);document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();element.removeEventListener('scroll',check);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);};
  },[chat,context.open,context.view,context.markSeen]);
  const run=chat?.run;
  const runConnection=context.connections.find(item=>item.id===chat?.participants.find(participant=>participant.id===run?.participantId)?.connectionId);
  const runIdentity=run?conversationRunIdentity(run,runConnection,context.modelCatalog):'';
  const participantPairs=participantExecutionPairs(chat).map(pair=>({...pair,modelName:conversationModelLabel(pair.model,context.connections,context.modelCatalog,pair)}));
  const workspace=workspaces.find(item=>item.id===chat?.workspaceId);
  const titleStatus=chat?.titleState;
  const titleLabels={pending:'等待执行开始后生成标题，首轮结束后可补生成',generating:'正在生成标题',generated:'标题已自动生成',manual:'标题已手动设置',failed:'标题未能自动生成',unavailable:'当前无法自动生成标题',unknown:'旧对话未记录标题生成状态'};
  const settings=<div className="ac-location-settings">{chat&&<><strong>标题</strong><span>{titleLabels[titleStatus?.status??'unknown']}</span>{titleStatus?.reason&&<small>{titleStatus.reason}</small>}{canGenerateConversationTitle(chat)&&<Button size="small" loading={generatingTitle} onClick={()=>void generateTitle()}>生成简短标题</Button>}</>}<strong>工作空间</strong>{chat?<><span>{workspace?.name||(chat.workspaceId==='@default'?'默认工作空间':chat.workspaceId)}</span><code>{chat.cwd}</code></>:<><Select classNames={{popup:{root:'ac-panel-popup'}}} aria-label="新对话工作空间" allowClear={draftWorkspaceId!=='@default'} value={draftWorkspaceId==='@default'?undefined:draftWorkspaceId} placeholder="默认工作空间" options={workspaces.filter(item=>item.id!=='@default').map(item=>({value:item.id,label:item.name}))} onChange={value=>{const workspaceId=value||'@default';draft.setWorkspace(workspaceId);context.newConversation({preserveVisibility:true,scope:{workspaceId}});setPrepared(null);}}/></>}</div>;
  const visibleEntries=chat?visibleConversationEntries(stoppedConversationEntries(chat,stoppedOutput)):[];
  const transcript=groupConversationStream(visibleEntries,chat?.run,chat?.retainedRuns);
  const liveToolId=!outputPaused&&chat?.run?.status==='running'?[...visibleEntries].reverse().find(entry=>entry.kind==='tool'&&entry.runId===chat.run!.id)?.id??null:null;
  const modelWarning=conversationModelWarning(context.modelCatalogReady,choice.modelAccountId,selectedSourceModel);
  const actionError=conversationActionError(error||(replyFailure&&!confirmedConversationReply(chat,replyFailure.attempt)?replyFailure.message:'')||(needsDefaultRoot?defaultRootError:''),modelWarning);
  const connectionWarning=context.streamError&&needsConversationObservation(chat)&&run?.status!=='unknown'&&<Alert className="ac-stream-disconnect" type="warning" showIcon message="实时连接正在恢复" description={context.streamError.replace(/^对话连接已中断[；;]\s*/,'')} action={<Button type="text" size="small" loading={observing} onClick={()=>void observe()}>重新连接并核对</Button>}/>;
  const turns=conversationStreamTurns(transcript);
  const turnIdentity=(entry:ConversationEntry|undefined)=>{
    if(!entry)return '';
    const {participant,run:boundRun}=conversationTurnBinding(entry,chat);
    const provider=entry.provider||participant?.provider||boundRun?.provider;
    if(!provider&&!participant)return '';
    const agent=provider?providerNames[provider]||participant?.label||provider:participant?.label||'智能体';
    return agent+' · '+conversationModelLabel(boundRun?.model||participant?.model,context.connections,context.modelCatalog,{connectionId:participant?.connectionId,modelAccountId:boundRun?.modelAccountId??participant?.modelAccountId});
  };
  const markdownImageResolver=useMemo(()=>(href:string)=>conversationImageSource(chat?.cwd,href),[chat?.cwd]);
  const markdownOptions:MarkdownRenderOptions={allowRelativeLinks:true,allowParentRelativeLinks:true,allowAbsoluteFileLinks:true,taskLinkPathname:chat&&chat.workspaceId!=='@default'?'/workspaces/'+encodeURIComponent(chat.workspaceId):null,onRelativeLinkClick:reference=>void openProcessFile(reference),imageResolver:markdownImageResolver,onImageClick:image=>{if(!chat||!image.src)return;setFileLinkFailure(null);setImageLink({selection:context.getSelection(),reference:image.reference||image.src,href:image.src});}};
  const forkableReplies = forkableReplyIds(chat);
  const finalReplies = finalReplyIds(chat);
  const loadToolEntry=useCallback((entry:ConversationEntry,signal?:AbortSignal)=>context.api.entry(chat!.workspaceId,chat!.id,entry,signal),[context.api,chat?.workspaceId,chat?.id]);
  const renderEntry=(entry:ConversationEntry)=>{
    if(entry.kind==='handoff'){
      const text=conversationHandoffReceipt(entry);
      if(entry.nativeSession?.reason==='backend-adoption'){
        const issue=entry.status==='failed'?'本轮未送达':entry.status==='unknown'?'本轮送达待确认':'';
        return <details className={'ac-handoff-receipt ac-adoption-diagnostic'+(issue?' has-issue':'')} key={entry.id} data-native-session-event={entry.nativeSession.reason}>
          <summary>{issue?`${issue} · 接续诊断`:'接续诊断'}</summary>
          <p><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('zh-CN',{hour12:false})} · </time>{text}</p>
        </details>;
      }
      return text?<div className="ac-handoff-receipt" key={entry.id} data-native-session-event={entry.nativeSession?.reason}><span>{entry.nativeSession&&<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('zh-CN',{hour12:false})} · </time>}{text}</span>{Boolean(entry.handoff?.changes.length)&&<Button type="link" size="small" onClick={()=>{setSelectedHandoff(entry);setPreviewOpen(true);}}>交接内容</Button>}</div>:null;
    }
    return <article key={entry.id} className={'ac-message is-'+entry.role} data-entry-id={entry.id} data-message-provider={entry.provider}>{entry.role==='assistant'?<MarkdownHost markdown={entry.text} className="markdown-body" options={markdownOptions}/>:<p>{entry.kind==='notice'&&entry.id.startsWith('reply-')?conversationReplyText(entry.text):conversationSystemNoticeText(entry)}</p>}{entry.attachments?.length?<ConversationMessageImages conversation={chat!} ids={entry.attachments} read={context.api.readImage}/>:null}{entry.deliveryDiagnostic&&<small className="ac-input-diagnostic" role="status">{entry.deliveryDiagnostic}</small>}{entry.status==='unknown'&&<Tag color="warning">是否送达待确认</Tag>}{entry.role==='assistant'&&finalReplies.has(entry.id)&&<span className="ac-reply-actions"><CopyButton type="text" text={entry.text} ariaLabel="复制回复" failureMessage="复制失败，请手动选择文字。"/>{chat&&forkableReplies.has(entry.id)&&<ConversationForkAction conversation={chat} entryId={entry.id}/>}</span>}</article>;
  };
  const fileError=fileLinkFailure&&context.isSelectionCurrent(fileLinkFailure.selection)&&<Alert type="warning" message={fileLinkFailure.message} description={<code>{fileLinkFailure.reference}</code>} closable onClose={()=>setFileLinkFailure(null)} action={<CopyButton type="text" text={fileLinkFailure.reference} ariaLabel="复制来源路径" failureMessage="复制失败，请手动复制来源路径。"/>}/>;
  const panel=<section id={panelId} className={'ac-panel'+(context.full?' is-full':'')+(embedded?' ac-child-panel':'')} aria-label={embedded?'子对话':'内部对话'} data-dock={context.side} data-conversation-id={chat?.id}>
    {context.view==='history'?<ConversationHistory workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId}/>:<>
      <header className="ac-thread-header" data-run-status={run&&['running','completed'].includes(run.status)?run.status:undefined}>
        {!embedded&&<Button type="text" icon={<UnorderedListOutlined/>} aria-label="查看对话列表" title="对话列表" onClick={()=>context.openHistory(null)}/>}
        <div className="ac-thread-heading">
        <Popover rootClassName="ac-panel-popup" title="工作空间" trigger="click" open={locationOpen} onOpenChange={setLocationOpen} content={settings}>
          <button type="button" className="ac-thread-title" aria-label="对话信息" title={chat?.title||'新对话'}>{chat?.title||'新对话'}</button>
        </Popover>
        {chat&&<div className="ac-thread-identity"><CopyButton type="text" text={chat.id} ariaLabel="复制对话 ID" failureMessage="复制失败，请手动选择对话 ID 复制。"/><span title={chat.id}>{chat.id}</span></div>}
        </div>
        <div className="ac-thread-actions">
          {accessory}
          {participantPairs.length>0&&<Popover rootClassName="ac-panel-popup ac-participant-history" title="参与过此对话" trigger="click" content={<div className="ac-participants" aria-label="参与过此对话的智能体与模型">{participantPairs.map(pair=><span key={pair.key}>{providerNames[pair.provider]||pair.provider} · {pair.modelName}</span>)}</div>}>
            <Button type="text" icon={<TeamOutlined/>} aria-label="参与过此对话的智能体与模型" title="参与过此对话"/>
          </Popover>}
          {embedded?<Button type="text" icon={<MinusOutlined/>} aria-label="收起子对话" title="收起子对话" onClick={()=>context.setOpen(false)}/>:<Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" title="新建对话" onClick={()=>context.newConversation({preserveVisibility:true})}/>}
          <Dropdown overlayClassName="ac-panel-popup" trigger={['click']} open={moreOpen} onOpenChange={setMoreOpen} menu={{items:[
            ...(onCreateChild?[{key:'create-child',label:'创建子对话',icon:<PlusOutlined aria-hidden/>},{type:'divider' as const}]:[]),
            {key:'collapse',label:'收起对话'},
            {key:'full',label:context.full?'恢复分屏':'专注对话'},
            {key:'side',label:context.side==='right'?'对话移到最左侧':'对话移到右侧'},
            {type:'divider' as const},
            {key:'generate-title',label:generatingTitle?'正在生成标题…':'生成简短标题',disabled:generatingTitle||!canGenerateConversationTitle(chat)},
            {key:'rename',label:'重命名',disabled:!chat},
            {key:'hide',label:chat?.hidden?'恢复到最近对话':canCloseUncertainConversation(chat)?'关闭对话':'从最近对话隐藏',disabled:!chat}
          ].filter(item=>!embedded||!['full','side','hide'].includes(item.key||'')),onClick:({key})=>{
            setMoreOpen(false);
            if(key==='collapse')context.setOpen(false);
            else if(key==='side')context.move();
            else if(key==='full'){context.setOpen(true);context.setFull(!context.full);}
            else if(key==='create-child')onCreateChild?.();
            else if(key==='generate-title')void generateTitle();
            else if(key==='rename'&&chat){setTitle(chat.title);setRename(true);}
            else if(key==='hide'&&chat){if(!chat.hidden&&canCloseUncertainConversation(chat))void closeConversation();else void updateMetadata({hidden:!chat.hidden});}
          }}}><Button type="text" icon={<EllipsisOutlined/>} aria-label="更多对话操作" title="更多"/></Dropdown>
        </div>
      </header>
      {chat?.childOf&&<div className="ac-child-origin"><span title={chat.childOf.title}>背景来自「{chat.childOf.title}」 · {new Date(chat.childOf.createdAt).toLocaleString()}</span><span>仅继承创建时背景；后续按你的新要求独立处理。</span></div>}
      {chat&&<ConversationForkOrigin conversation={chat}/>}
      <div className="ac-stream" ref={stream} tabIndex={0} aria-label="对话记录" aria-busy={earlier.loading} onScroll={()=>{earlier.onScroll();followBottom();}} onPointerDown={earlier.onPointerDown} onPointerUp={earlier.onPointerUp} onPointerCancel={earlier.onPointerCancel} onWheel={earlier.onWheel} onKeyDown={earlier.onKeyDown} onTouchStart={earlier.onTouchStart} onTouchMove={earlier.onTouchMove} onTouchEnd={earlier.onTouchEnd} onTouchCancel={earlier.onTouchCancel}>
        {earlier.loading&&<div className="ac-history-loading" role="status" aria-label="正在加载更早记录"><Spin size="small"/></div>}
        <div className="ac-stream-content" ref={streamContent}>
        {context.loading?<Spin/>:context.error?<Alert type="error" showIcon message={context.error} action={<Button onClick={()=>void context.refresh().catch(fail)}>重新读取</Button>}/>:!chat?.entries.length?<div className="ac-welcome"><CommentOutlined/><h1>{chat?.taskId||boundTaskId?'从这项任务继续':'今天想做什么？'}</h1><p>了解一个问题，或者交办一件事。</p>{!chat&&settings}</div>:<div className="ac-message-list">
          {turns.map((turn,index)=>{
            const first=turn.items.find(item=>item.type==='process-block'||item.type==='entry'&&item.entry.role==='assistant');
            const assistant=first?.type==='process-block'?first.entries[0]:first?.entry;
            const prompt=turn.prompt;
            const execution=conversationTurnExecution(turn,run);
            const executing=index===turns.length-1&&execution.active;
            const processKeys=turn.items.flatMap(item=>item.type==='process-block'?[...(!item.active?[processBlockKey(item.entries)]:[]),...item.entries.filter(entry=>entry.kind==='tool').flatMap(entry=>['tool-group:'+entry.id,'tool:'+entry.id])]:[]);
            const hasExpandedProcess=turn.items.some(item=>item.type==='process-block'&&!item.active&&expandedToolGroups[processBlockKey(item.entries)]===true);
            const settled=turn.items.filter(item=>item.type==='process-block'&&!item.active);
            const hasSupplement=turn.items.some(item=>item.type==='entry'&&item.entry.kind==='message'&&item.entry.role==='user');
            const hasProcess=turn.items.some(item=>item.type==='process-block');
            const turnExpansionKey='turn:'+(prompt?.runId??assistant?.runId??turn.key);
            const turnExpanded=expandedToolGroups[turnExpansionKey]??(execution.active||turn.items.some(item=>item.type==='process-block'&&item.active)||hasExpandedProcess);
            const timing=conversationTurnTiming(turn,[...(chat.retainedRuns??[]),...(run?[run]:[])]);
            return <ConversationTurn key={turn.key} id={turn.key} runId={execution.current?run?.id:assistant?.runId||prompt?.runId} prompt={prompt?{id:prompt.id,text:prompt.text,images:prompt.attachments?.length?<ConversationMessageImages conversation={chat} ids={prompt.attachments} read={context.api.readImage}/>:undefined,diagnostic:prompt.deliveryDiagnostic?<small className="ac-input-diagnostic" role="status">{prompt.deliveryDiagnostic}</small>:prompt.status==='unknown'?<Tag color="warning">是否送达待确认</Tag>:undefined}:undefined}
              onCollapseProcess={processKeys.some(key=>expandedToolGroups[key]===true)?()=>setExpandedToolGroups(previous=>({...previous,...Object.fromEntries(processKeys.map(key=>[key,false]))})):undefined} collapseLabel={hasExpandedProcess?'收起处理过程':'收起工具调用'} identity={execution.current?runIdentity:turnIdentity(assistant||prompt)} executing={executing&&!outputPaused} startedAt={timing.startedAt} finishedAt={timing.finishedAt} processExpanded={turnExpanded} onToggleProcess={hasProcess||hasSupplement?()=>setExpandedToolGroups(previous=>({...previous,[turnExpansionKey]:!turnExpanded,...Object.fromEntries(settled.flatMap(item=>item.type==='process-block'?[[processBlockKey(item.entries),!turnExpanded]]:[]))})):undefined}>
              {executing&&execution.waiting&&<small className="ac-input-diagnostic" role="status">{execution.waiting}</small>}
              {turn.items.map(item=>{
                if(item.type==='entry')return item.entry.kind==='message'&&item.entry.role==='user'&&!turnExpanded?null:renderEntry(item.entry);
                const key=processBlockKey(item.entries);
                return <Fragment key={key}><ConversationProcessBlock hidden={!turnExpanded} loadEntry={loadToolEntry} markdownOptions={markdownOptions} headerless groupsOpen={expandedToolGroups} onGroupToggle={(ids,open)=>setExpandedToolGroups(previous=>({...previous,...Object.fromEntries(ids.map(id=>['tool-group:'+id,open]))}))} toolsOpen={expandedToolGroups} onToolToggle={(id,open)=>setExpandedToolGroups(previous=>({...previous,['tool:'+id]:open}))} blockKey={key} entries={item.entries} active={item.active&&!outputPaused} liveToolId={liveToolId} finishedAt={item.finishedAt} onOpenFile={path=>void openProcessFile(path)} open={turnExpanded} onToggle={(name,open)=>setExpandedToolGroups(previous=>({...previous,[name]:open}))}/><ConversationPresentedFiles key={chat.id+':'+key} entries={item.entries} read={readPresentedFile} onOpen={path=>void openProcessFile(path,true)}/></Fragment>;
              })}
              {(execution.current?run?.id:assistant?.runId||prompt?.runId)&&<BuildrParticipation workspaceId={chat.workspaceId} conversationId={chat.id} runId={execution.current?run?.id:assistant?.runId||prompt?.runId}/>}
            </ConversationTurn>;
          })}
        </div>}
        <ConversationPendingSend conversation={chat} onCancelled={(cancelled,answers)=>{setError('');const text=[cancelled.text,answers].filter(Boolean).join('\n');if(text)draft.setText(draft.text.trim()&&draft.text!==text?[draft.text,text].join('\n\n'):text);if(cancelled.attachmentIds?.length&&chat)setAttachments(previous=>({...previous,[chat.id]:[...(previous[chat.id]||[]),...(previous['@pending:'+chat.id]||queuedImages.current[chat.id]||[]).filter(image=>cancelled.attachmentIds!.some(id=>id===image.id)&&!(previous[chat.id]||[]).some(value=>value.id===image.id))]}));setFeedback('已取消，内容已放回输入框。');requestAnimationFrame(()=>document.getElementById(panelId)?.querySelector<HTMLTextAreaElement>('textarea')?.focus());}}/>{currentConversationRequests(chat).map(renderQuestion)}
        </div>
      </div>
      {!atBottom&&<div className="ac-scroll-latest"><Button className="ac-scroll-latest-button" shape="circle" icon={<ArrowDownOutlined/>} aria-label="向下到底" title="向下到底，回到最新消息" onClick={scrollToLatest}/></div>}
      <div className="ac-compose-wrap" data-run-status={run?.status==='stopped'?'stopped':undefined}>{fileError}

        {(!outputPaused||!stopping)&&run?.status==='tools-active'&&<ConversationActiveToolsNotice key={run.id} tools={run.tools} resourcesReleased={run.resourcesReleased} feedback={feedback} diagnostic={run.diagnostic} canContinue={Boolean(chat&&conversationSendRoute(chat,executionChanged)==='send')} observing={observing} stopping={stopping} onObserve={()=>void observe()} onStop={toolId=>void stop(toolId)}/>}
        {(!outputPaused||!stopping)&&run?.status==='unknown'&&<ConversationExecutionNotice feedback={feedback} closed={chat?.hidden} closing={closingConversation} continuing={sending} continueDisabled={!canSend} onContinue={canContinueReleasedConversation(chat)&&!executionChanged?()=>void prepare(false,false,run.id):undefined} onClose={canCloseUncertainConversation(chat)?()=>void closeConversation():undefined} resourcesReleased={run.resourcesReleased} diagnostic={[run.diagnostic,context.streamError].filter(Boolean).join('\n')} observing={observing} stopping={stopping} onObserve={()=>void observe()} onStop={()=>void stop()}/>}{(!outputPaused||Boolean(actionError))&&run&&locked&&run.status!=='unknown'&&run.status!=='tools-active'&&<div className="ac-execution-statusbar" role="status" data-execution-state={run.status}>{!waitingQuestions.length&&run.status!=='running'&&<span>{statusLabels[run.status]}</span>}{!run.resourcesReleased&&<Button className="ac-stop-button" type="text" icon={<StopOutlined/>} aria-label="停止本次执行" title="停止本次执行" loading={stopping} disabled={run.status==='stopping'} onClick={()=>void stop()}>{stopping||run.status==='stopping'?'正在停止…':'停止'}</Button>}</div>}{!chat&&newImages.error&&<Alert type="warning" message={newImages.error} action={<Button size="small" onClick={()=>void newImages.refresh().catch(fail)}>重新读取图片</Button>}/>} {!chat&&unconfirmedFirst&&<ConversationFirstSubmissionNotice submission={unconfirmedFirst} busy={sending} onRetry={()=>void prepare(false,false,undefined,true)}/>}{!outputPaused&&run&&run.status!=='stopped'&&run.status!=='running'&&run.status!=='completed'&&run.status!=='unknown'&&run.status!=='tools-active'&&(!locked||Boolean(run.diagnostic))&&<div className="ac-run-status" role="status" data-run-status={run.status}>{!locked&&<>{run.interrupted?'执行未完成':statusLabels[run.status]}{runIdentity&&` · ${runIdentity}`} · {permissionModeLabels[run.permissionMode||'default']}</>}{run.status==='failed'&&<p>{conversationFailureImpact(run)}</p>}{run.diagnostic&&(run.status==='failed'?<details><summary>技术详情</summary><p>{run.diagnostic}</p></details>:<p>{run.diagnostic}</p>)}</div>} {connectionWarning}{modelWarning&&<Alert type="warning" showIcon message={modelWarning}/>}{earlier.error&&<Alert type="warning" showIcon message={earlier.error}/>} {actionError&&<Alert type="warning" showIcon message={actionError} closable onClose={()=>{setError('');setReplyFailure(null);setDefaultRootError('');}}/>} {feedback&&run?.status!=='unknown'&&run?.status!=='tools-active'&&<small role="status">{feedback}</small>}{(!draft.available||!attachmentsAvailable)&&<Alert type="warning" message="浏览器存储不可用，刷新后无法恢复未发送草稿。"/>}
        {recovery&&!chat?.pendingSend&&run?.status!=='unknown'&&run?.status!=='tools-active'&&<div className="ac-recovery-action" data-recovery-kind={recovery.kind}>{!run?.diagnostic&&<span>{recovery.kind==='observe'?'原执行状态仍待核对。':'上次执行未正常答复。'}</span>}<Button type="text" size="small" icon={<ReloadOutlined/>} autoInsertSpace={false} aria-label={recovery.kind==='recover'&&executionChanged?'继续':recovery.label} disabled={!canSend||observing} loading={recovery.kind==='observe'?observing:sending} onClick={()=>recovery.kind==='observe'?void observe():void prepare(false,false,chat!.run!.id)}>{recovery.kind==='recover'&&executionChanged?'继续':recovery.label}</Button>{recovery.kind==='recover'&&executionChanged&&<><span className="ac-recovery-target">接下来使用 {effectiveModelLabel} 继续处理</span><Button type="link" size="small" disabled={!canSend} onClick={()=>void prepare(true,false,chat!.run!.id)}>交接内容</Button></>}</div>}
        <ConversationConnectionNotice ready={context.connectionsReady} loading={context.connectionsLoading} error={context.connectionsError} connection={connection} onSettings={()=>context.setSettings(true)}/>
        {connection?.enabled&&chat?.run&&recovery?.kind!=='recover'&&!waitingHandoffAvailable&&(lastParticipant?.connectionId!==choice.connectionId||chat.run.model!==effectiveModel||chat.run.modelAccountId!==choice.modelAccountId)?<div className="ac-transfer-notice"><span>{lastParticipant?.connectionId!==choice.connectionId?`接下来由 ${connection?providerNames[connection.provider]||connection.label:''}${chat.run.model!==effectiveModel||chat.run.modelAccountId!==choice.modelAccountId?' · '+(effectiveModelLabel):''} 继续处理`:`接下来使用 ${effectiveModelLabel} 继续处理`}</span><Button type="link" size="small" disabled={!canSend} loading={sending} onClick={()=>void prepare(true)}>交接内容</Button></div>:null}
        {preparing&&<div className="ac-notice" role="status">正在准备发送… <Button type="text" size="small" onClick={()=>{activeSend.current=null;setSending(false);setPreparing(false);}}>取消发送</Button></div>}
        {choice.connectionId&&!permissionAvailable&&<Alert type="warning" showIcon message={"当前执行者不支持"+permissionModeLabels[permissionMode]} description="已保留所选权限。请选择可用权限或切换执行者后再发送，草稿保留。"/>}{images.length>0&&!connection?.capabilities.images&&<Alert type="warning" message="当前执行者不支持图片或视频画面。请移除附件或选择支持图片的执行者。"/>}
        <ConversationComposer images={images} materialDisabled={sending||uploading||context.loading||Boolean(context.scope&&!chat)} addDisabled={sending||context.loading||Boolean(context.scope&&!chat)} uploading={uploading} onAdd={upload} onBlocked={()=>setError('当前正在发送或上传，请稍后再添加图片或视频。')} onRemove={id=>{if(!chat){void newImages.remove(id).catch(fail);}else setAttachments(previous=>({...previous,[attachmentKey]:(previous[attachmentKey]||[]).filter(item=>item.id!==id)}));setPrepared(null);setPreviewOpen(false);}}
          input={{id:embedded?'agent-child-conversation-input-'+chat?.id:'agent-conversation-input','aria-label':embedded?'子对话输入':'对话输入',disabled:context.loading||Boolean(context.scope&&!chat),placeholder:currentConversationRequests(chat).length?'原轮等待回答或授权，请使用上方卡片；输入会保留…':locked&&!chat?.run?.resourcesReleased?'追加要求到当前执行，不另开会话…':'提出问题，或描述想完成的工作',value:draft.text,onChange:event=>{draft.setText(event.target.value);setPrepared(null);},autoSize:{minRows:2,maxRows:8},onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;},onKeyDown:event=>{if(shouldSendOnKey({key:event.key,shiftKey:event.shiftKey,isComposing:composing.current||event.nativeEvent.isComposing,keyCode:event.nativeEvent.keyCode})){event.preventDefault();if(canSend)void prepare(false);}}}}
          access={<><ConversationAgentSelect connections={context.connections} value={choice} disabled={sending} onChange={select}/><Select<PermissionMode> className="ac-choice ac-permission-select" aria-label="执行权限" placement="topLeft" variant="borderless" size="small" suffixIcon={null} labelRender={({label})=><span className="ac-permission-label"><SafetyCertificateOutlined/>{label}</span>} value={permissionMode} disabled={sending||uploading||context.loading||Boolean(context.scope&&!chat)} popupMatchSelectWidth={false} classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}} title="权限更改用于本对话下一轮。完全访问会跳过逐次工具审批；业务问题仍需回复，系统与厂家限制继续有效。" options={[{value:'default',label:'默认权限',disabled:!supportsConversationPermission(connection,'default')},{value:'full-access',label:'完全访问',disabled:!supportsConversationPermission(connection,'full-access')}]} onChange={selectPermission}/></>}
          execution={<><ConversationOptions showAgent={false} key={choiceKey+':'+context.side+':'+context.open} connections={context.connections} value={choice} disabled={sending} onChange={select}/><Button type="primary" shape="circle" icon={<ArrowUpOutlined/>} aria-label="发送对话" title={waitingHandoffAvailable?waitingHandoffLabel:'发送'} disabled={!canSend||(!waitingHandoffAvailable&&!sendText.trim()&&!images.length)} loading={sending} onClick={()=>void prepare(false)}/></>}/>
        <div className="ac-location-meta"><span>所属工作空间：<span className="ac-location-name" title={(chat?.cwd||newCwd)||undefined}>{chat?(workspace?.name||(chat.workspaceId==='@default'?'默认工作空间':chat.workspaceId)):(workspaces.find(item=>item.id===draftWorkspaceId)?.name||'默认工作空间')}</span></span><span>· <ConversationTaskLink key={chat?chat.workspaceId+':'+chat.id:'draft'} taskLinks={chat?conversationTaskLinks(chat):boundTaskLinks} onAssign={assignTask} onNavigate={()=>context.setFull(false)}/></span><small className="ac-location-keys">Enter 发送 · Shift+Enter 换行</small></div>
      </div>
    </>}
    <ConversationHandoffDrawer loadHistory={chat?(input,signal)=>context.api.historySource(chat.workspaceId,chat.id,input,signal):undefined} loadEntry={chat?(entry,signal)=>context.api.entry(chat.workspaceId,chat.id,entry,signal,viewedHandoff?.handoff?.sourceId):undefined} onOpenFile={path=>void openProcessFile(path)} open={previewOpen} side={context.side} material={viewedHandoff?.handoff??prepared?.preview.handoff??null} onChooseModel={!viewedHandoff&&prepared&&!prepared.preview.fits?()=>{setPreviewOpen(false);requestAnimationFrame(()=>document.getElementById(panelId)?.querySelector<HTMLButtonElement>('.ac-model-trigger')?.click());}:undefined} onContinue={!viewedHandoff&&prepared&&prepared.preview.fits?()=>{if(prepared.input.continueRunId&&!prepared.input.waitingHandoff)void prepare(false,false,prepared.input.continueRunId);else void commit(prepared);}:undefined} continueLabel={prepared?.input.waitingHandoff?(prepared.input.waitingHandoff.answers?.length?'回答并交接':prepared.input.continueRunId?'交接并继续':'交接并发送'):undefined} continuing={sending} continueDisabled={!canSend||Boolean(chat?.pendingSend)} delivery={viewedHandoff&&viewedHandoff.status!=='accepted'?viewedHandoff.status==='failed'?'failed':'unknown':undefined} received={viewedHandoff?.status==='accepted'} issue={viewedHandoff&&viewedHandoff.status!=='accepted'?'尚未确认接收，请先核对原执行。':prepared&&!prepared.preview.fits?prepared.preview.diagnostic:undefined} onClose={()=>{setPreviewOpen(false);setSelectedHandoff(null);setPrepared(null);}}/>
    <Modal open={rename} title="重命名对话" getContainer={false} styles={{mask:{position:'absolute'},wrapper:{position:'absolute'}}} onCancel={()=>setRename(false)} onOk={()=>void updateMetadata({title:title.trim()})} okButtonProps={{disabled:!title.trim()}} okText="保存" cancelText="取消"><Input aria-label="对话名称" value={title} onChange={event=>setTitle(event.target.value)}/></Modal>
  </section>;
  return <>{embedded?panel:<ConversationDock panel={panel} portalTarget={portalTarget} workspaces={workspaces}/>}
    {imageLink&&context.isSelectionCurrent(imageLink.selection)&&<ConversationImagePreview key={imageLink.selection.generation+':'+imageLink.href} href={imageLink.href} reference={imageLink.reference} onClose={()=>setImageLink(null)}/>}
  </>;
}
