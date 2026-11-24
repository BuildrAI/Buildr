import { copyMessageWithAttachments, readPastedMessageAttachments, readCopiedMessageAttachments } from './conversation-message-clipboard.ts';
import {HARNESS_MOBILE_BREAKPOINT} from '../../shell/harness-layout';
import {ConversationContextSlot, useConversationHost} from '../../integration/ConversationHost';
import {useHarnessDirectoryFiles} from '../../directory-files.tsx';
import { ConversationCompactionNotice } from './ConversationCompactionNotice.tsx';
import { stoppedConversationEntries,conversationStopRunIds,conversationStopControlState, type StoppedConversationOutput } from './conversation-stop.ts';
import { conversationSendRoute, latestConversationSend } from './conversation-send-route.ts';
import type {ConversationTaskLink as TaskLink} from './types.ts';
import {ConversationConnectionNotice} from './ConversationConnectionNotice.tsx';
import {ConversationPresentedFiles} from './ConversationPresentedFiles.tsx';
import {ConversationFirstSubmissionNotice} from './ConversationFirstSubmissionNotice.tsx';
import { confirmedConversationReply, type ConversationReplyAttempt } from './conversation-reply.ts';
import { ConversationForkAction } from './ConversationForkAction.tsx';
import { withConversationSendRecovery, sameConversationSendPreview, refreshedConversationConflictMessage, type ConversationSendRecovery } from './conversation-send-recovery.ts';
import { ConversationForkOrigin } from './ConversationForkOrigin.tsx';
import { finalReplyIds, forkableReplyIds } from './conversation-fork.ts';
import { currentConversationRequests } from './conversation-state.ts';
import { conversationModelLabel } from './conversation-model-label.ts';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, Fragment, type ReactNode } from 'react';
import { SplitDivider } from '../../components/SplitDivider.tsx';
import { readOptionalPreference, writeOptionalPreference } from '../../lib/optional-preferences.ts';
import { Alert, App, Button, Dropdown, Input, Modal, Popover, Select, Spin, Tag } from 'antd';
import { ApartmentOutlined, ArrowDownOutlined, ArrowUpOutlined, CommentOutlined, EllipsisOutlined, MinusOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, StopOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { MarkdownHost } from '../../components/MarkdownHost.tsx';
import type { MarkdownRenderOptions } from '../../markdown.ts';
import type { ApiError } from '../../api/index.ts';
import { CopyButton } from '../../components/CopyButton.tsx';
import { copyText } from '../../lib/copyText.ts';
import { copyConversationIdTitle } from './conversation-activity.ts';
import { useAgentConversations } from './AgentConversationsContext.tsx';
import {useEarlierConversationEntries} from './useEarlierConversationEntries.ts';
import {conversationImageSource,conversationImageLinkSource} from './conversation-markdown-images.ts';
import { ConversationImagePreview } from './ConversationImagePreview.tsx';
import {FOCUS_HISTORY_DEFAULT_WIDTH, FOCUS_HISTORY_MIN_WIDTH, canSplitFocusHistory, clampFocusHistoryWidth, focusHistoryMaxWidth, needsConversationObservation, conversationObservationFeedback, carryExpandedProcessBlocks, conversationContinuationText, conversationRecoveryAction, canCloseUncertainConversation, canContinueConversation, canSettleRetainedRun} from './conversation-state.ts';
import { ConversationHistory, type ConversationWorkspace } from './ConversationHistory.tsx';
import { ConversationRequest } from './ConversationRequest.tsx';
import { ConversationPendingSend } from './ConversationPendingSend.tsx';
import type { DraftImage } from './ConversationImageInput.tsx';
import { ConversationExecutionNotice } from './ConversationExecutionNotice.tsx';
import { ConversationActiveToolsNotice } from './ConversationActiveToolsNotice.tsx';
import { ConversationFailureNotice } from './ConversationFailureNotice.tsx';
import { pendingSubmission, clearPendingSubmission } from './conversation-pending.ts';
import { ConversationAgentSelect, ConversationOptions } from './ConversationOptions.tsx';
import { ConversationDock } from './ConversationDock.tsx';
import { ConversationMessageImages } from './ConversationMessageImages.tsx';
import { ConversationComposer } from './ConversationComposer.tsx';
import { ConversationTurn } from './ConversationTurn.tsx';
import { ConversationTranscript } from './ConversationTranscript.tsx';
import { imageSelectionError, conversationDocumentTypes } from './conversation-images.ts';
import { uploadConversationMaterials } from './conversation-material-upload.ts';
import {conversationPermissionKey,conversationPermissionStorageKey,conversationRunIdentity,executionAgentName,executionTargetChanges,permissionModeLabels,readConversationPermission,resolveNativeExecutionAccountId,selectedConversationModel,selectedConversationPermission,supportsConversationPermission,validConversationChoice,writeConversationPermission,type ConversationChoice,type PermissionMode} from './conversation-options.ts';
import { appendDraftAttachment, canGenerateConversationTitle, conversationConflictNeedsRefresh, conversationTurnBinding, executionLocked, groupConversationStream, conversationStreamTurns, conversationTurnExecution, conversationTurnTiming, conversationTurnLatestEntry, conversationTurnExpansionKey, conversationTurnExpanded, conversationProcessExpansionAfterSettle, participantExecutionPairs, removeSubmittedAttachments, shouldSendOnKey, latestConversationParticipant, processBlockKey, type ConversationSelection } from './conversation-state.ts';
import { conversationActionKey, conversationInputAttemptAccepted, conversationInputAttemptMatches, createConversationActions, createConversationInputAttempts, reconcileConversationInputAttempt } from './conversation-actions.ts';
import { useNewConversationImages } from './useNewConversationImages.ts';
import { useConversationAttachments } from './useConversationAttachments.ts';
import { draftMaterialIds, firstConversationSubmissions, type FirstSubmission } from './conversation-first-submission.ts';
import { useConversationDraft } from './useConversationDraft.ts';
import type { ConversationEntry, ConversationRun, ConversationView, SendDraft, SendPreview } from './types.ts';
import {conversationReplyText} from './conversation-reply.ts';
import {ConversationHandoffDrawer} from './ConversationHandoffDrawer.tsx';
import {ConversationHandoffReview} from './ConversationHandoffReview.tsx';
import { ConversationSubagentOverview, ConversationTurnSubagents } from './ConversationSubagentOverview.tsx';
import { ConversationSubagentPane, SubagentDispatchCard } from './ConversationSubagents.tsx';
import { conversationSubagents, subagentWaitingLabel } from './conversation-subagents.ts';
import { ConversationProcessBlock } from './ConversationProcessBlock.tsx';
import {modelPreferenceFromChoice,preferredConversationChoice,readConversationModelPreference,readConversationModulePreference,rememberConversationAgent,rememberConversationPermission,rememberedConversationPermission,writeConversationModelPreference,writeConversationModulePreference} from './conversation-preferences.ts';
import {isQuietAutomaticContinuation,conversationSystemNoticeText,visibleConversationEntries,conversationModelWarning,conversationActionError,conversationHandoffReceipt,conversationNativeSessionDiagnostic,conversationNativeSessionIssue,conversationNativeSessionSummary,latestVisibleConversationMessage} from './conversation-notices.ts';
import { findSeenFallbackTarget, isConversationViewVisible, seenAttemptKey } from './seen-activity-refresh.ts';
import { revealConversationAnswer } from './conversation-reading.ts';
import './agent-conversations.css';
import {AgentConnectionSettings} from './AgentConnectionSettings';
import './conversation-flow.css';
const statusLabels = {starting:'正在准备执行',running:'正在执行','waiting-approval':'等待授权','waiting-question':'等待你的回复',stopping:'正在停止',stopped:'已确认停止','tools-active':'仍有命令未结束',unknown:'执行状态待确认',completed:'本轮已结束',failed:'本轮执行失败'};
const unconfirmedSupplementMessage='消息是否送达仍待确认，请勿重复发送；输入已保留。';
type Prepared = {conversation:ConversationView;input:SendDraft;preview:SendPreview;clientRequestId:string;selection:ConversationSelection;recovery:ConversationSendRecovery};
type SendOperation={selection:ConversationSelection;continueRunId?:string};
type Props={development?:boolean;workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null;portalTarget?:HTMLElement|null;embedded?:boolean;accessory?:ReactNode|((conversationVisible:boolean)=>ReactNode);headerAction?:ReactNode;onReturnToHost?:()=>void;onCreateChild?:()=>void};
export function ConversationPanel({development=false,workspaces,defaultWorkspaceId,portalTarget,embedded=false,accessory,headerAction,onReturnToHost,onCreateChild}:Props){
  const context=useAgentConversations(),chat=context.conversation;
  const {message:appMessage}=App.useApp();
  const engineeringAnchor=useRef<HTMLSpanElement>(null);
  const host=useHarnessDirectoryFiles();
  const composition=useConversationHost();
  const standalone=Boolean(composition.standalone)&&!embedded;
  const panelId=embedded?'agent-child-conversation-panel-'+context.scope?.conversationId:'agent-conversation-panel';
  const focusHistoryWidthKey='buildr.agent-conversation-history-width';
  const focusHistoryPaneId=panelId+'-history';
  const [historyWidth,setHistoryWidth]=useState<number>(()=>{const saved=Number(readOptionalPreference(focusHistoryWidthKey));return Number.isFinite(saved)&&saved>=FOCUS_HISTORY_MIN_WIDTH?saved:FOCUS_HISTORY_DEFAULT_WIDTH;});
  const [panelWidth,setPanelWidth]=useState<number>(()=>(typeof window!=='undefined'?Math.max(0,window.innerWidth-52):0));
  const [viewportWidth,setViewportWidth]=useState<number>(()=>(typeof window!=='undefined'?window.innerWidth:1280));
  const historyDrag=useRef<{pointerId:number;x:number;width:number;latest:number;moved:boolean}|null>(null);
  const [historyResizing,setHistoryResizing]=useState(false);
  const threePane=!embedded?composition.threePane:undefined;
  const threePaneWorkspaceOpen=Boolean(threePane?.workspaceOpen);
  useLayoutEffect(()=>{
    if(embedded)return;
    const element=document.getElementById(panelId);
    const measure=()=>{
      const rectWidth=element?.getBoundingClientRect().width??0;
      const nextPanelWidth=rectWidth>0?rectWidth:(typeof window!=='undefined'?Math.max(0,window.innerWidth-52):0);
      if(nextPanelWidth>0)setPanelWidth(nextPanelWidth);
      if(typeof window!=='undefined')setViewportWidth(window.innerWidth);
    };
    measure();
    const observer=element&&typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null;
    observer?.observe(element!);
    window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[embedded,panelId,context.full,context.open,context.view,threePaneWorkspaceOpen]);
  const ownsSettings=!embedded&&(standalone||development);
  const focusSettings=ownsSettings&&context.full;
  const showFocusSettings=focusSettings&&context.settings;
  const effectivePanelWidth=!threePaneWorkspaceOpen&&threePane?.panelWidth&&threePane.panelWidth>0?threePane.panelWidth:panelWidth;
  const canSplitHistory=threePaneWorkspaceOpen?Boolean(threePane?.canSplitHistory):canSplitFocusHistory(effectivePanelWidth,viewportWidth);
  const focusSplit=Boolean(context.full&&!embedded&&canSplitHistory);
  const effectiveHistoryMinWidth=threePaneWorkspaceOpen?threePane!.historyMinWidth:FOCUS_HISTORY_MIN_WIDTH;
  const effectiveHistoryDefaultWidth=threePaneWorkspaceOpen?threePane!.defaultHistoryWidth:FOCUS_HISTORY_DEFAULT_WIDTH;
  const historyMaxWidth=threePaneWorkspaceOpen?threePane!.historyMaxWidth:focusHistoryMaxWidth(effectivePanelWidth);
  const effectiveHistoryWidth=threePaneWorkspaceOpen?threePane!.historyWidth:clampFocusHistoryWidth(historyWidth,effectivePanelWidth);
  useLayoutEffect(()=>{
    if(window.parent===window)return;
    const anchor=engineeringAnchor.current;if(!anchor)return;
    const report=()=>{const rect=anchor.getBoundingClientRect();window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'context-anchor',x:rect.x,y:rect.y,width:rect.width,height:rect.height},location.origin);};
    report();const observer=new ResizeObserver(report);observer.observe(anchor);observer.observe(anchor.parentElement!);
    window.addEventListener('resize',report);return()=>{observer.disconnect();window.removeEventListener('resize',report);};
  },[chat?.id,chat?.workspaceId,context.draftScope,context.view,context.full,context.open,workspaces,focusSplit,effectiveHistoryWidth]);
  const commitHistoryWidth=useCallback((nextWidth:number)=>{
    const liveWidth=document.getElementById(panelId)?.getBoundingClientRect().width||panelWidth;
    const clamped=clampFocusHistoryWidth(nextWidth,liveWidth);
    setHistoryWidth(clamped);
    writeOptionalPreference(focusHistoryWidthKey,String(clamped));
  },[panelId,panelWidth]);
  const [modulePreference,setModulePreference]=useState(readConversationModulePreference);
  const [modelPreference,setModelPreference]=useState(readConversationModelPreference);
  const draft=useConversationDraft(context.scope?.workspaceId||defaultWorkspaceId||'@default',context.scope?.conversationId||null);
  const draftWorkspaceId=context.draftScope?.workspaceId||draft.workspaceId;
  const [defaultRoot,setDefaultRoot]=useState(''),[defaultRootError,setDefaultRootError]=useState('');
  const scopeMissing=Boolean(host.scopeRequired)&&!context.scope&&!context.draftScope&&!defaultWorkspaceId;
  const needsDefaultRoot=!scopeMissing&&!context.scope&&draftWorkspaceId==='@default';
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
  const observedEntries=useMemo(()=>chat?stoppedConversationEntries(chat,stoppedOutput):[],[chat,stoppedOutput]);
  const subagents=useMemo(()=>conversationSubagents(observedEntries,[...(chat?.retainedRuns??[]),...(chat?.run?[chat.run]:[])]),[observedEntries,chat?.run,chat?.retainedRuns]);
  const visibleEntries=useMemo(()=>visibleConversationEntries(observedEntries).filter(entry=>!subagents.owned.has(entry.id)),[observedEntries,subagents]);
  const [subagentView,setSubagentView]=useState<{kind:'overview';focusRunId?:string}|{kind:'detail';id:string}>();
  const subagentTrigger=useRef<HTMLElement>(null);
  const subagentMenu=useRef<HTMLButtonElement>(null);
  const subagentId=subagentView?.kind==='detail'?subagentView.id:undefined;
  const selectedSubagent=subagents.agents.find(agent=>agent.entry.id===subagentId);
  const subagentOverviewOpen=subagentView?.kind==='overview';
  const subagentPaneOpen=subagentOverviewOpen||Boolean(selectedSubagent);
  useEffect(()=>{setSubagentView(undefined);subagentTrigger.current=null;},[chat?.id,chat?.workspaceId]);
  function openSubagent(id:string,trigger?:HTMLElement){
    if(trigger)subagentTrigger.current=trigger;
    setSubagentView({kind:'detail',id});
  }
  function openSubagentOverview(trigger?:HTMLElement,focusRunId?:string){
    if(trigger)subagentTrigger.current=trigger;
    setSubagentView({kind:'overview',focusRunId});
  }

  const outputPaused=Boolean(chat&&stoppedOutput&&stoppedOutput.workspaceId===chat.workspaceId&&stoppedOutput.conversationId===chat.id&&(stoppedOutput.runIds??[stoppedOutput.runId]).includes(chat.run?.id??''));
  const stopping=Boolean(chat&&actions.has(actionKey(chat,'stop'))),observing=Boolean(chat&&actions.has(actionKey(chat,'observe'))),uploading=actions.has(uploadKey);
  const stopControl=conversationStopControlState(chat,stopping);
  const generatingTitle=Boolean(chat&&actions.has(actionKey(chat,'generate-title','')));
  const [selectedHandoff,setSelectedHandoff]=useState<ConversationEntry|null>(null),[prepared,setPrepared]=useState<Prepared|null>(null),[reviewOpen,setReviewOpen]=useState(false),[rename,setRename]=useState(false),[title,setTitle]=useState('');
  const draftEditVersion=useRef(0);
  const review=reviewOpen?prepared:null;
  const viewedHandoff=selectedHandoff?(chat?.entries.find(entry=>entry.id===selectedHandoff.id)??selectedHandoff):null;
  const [moreOpen,setMoreOpen]=useState(false),[locationOpen,setLocationOpen]=useState(false);
  const fileOpenRequest=useRef<AbortController|null>(null);
  const [openingFile,setOpeningFile]=useState<ConversationSelection|null>(null);
  const [fileLinkFailure,setFileLinkFailure]=useState<{selection:ConversationSelection;reference:string;message:string}|null>(null);
  const [imageLink,setImageLink]=useState<{selection:ConversationSelection;reference:string;href?:string;load?:(signal:AbortSignal)=>Promise<string>}|null>(null);
  const [expandedToolGroups,setExpandedToolGroups]=useState<Record<string,boolean>>({});
  const [atBottom,setAtBottom]=useState(true);
  const stream=useRef<HTMLDivElement>(null),readPosition=useRef(0),bottom=useRef(true),composing=useRef(false);
  const streamContent=useRef<HTMLDivElement>(null);
  const earlierRef=useRef<ReturnType<typeof useEarlierConversationEntries>|null>(null);
  const revealAnswer=useCallback((anchor:HTMLElement,container?:HTMLElement)=>{
    const node=stream.current;if(!node)return;
    const pinned=revealConversationAnswer(node,anchor,bottom.current,container);
    bottom.current=pinned;
    earlierRef.current?.remember();
    setAtBottom(pinned);
  },[]);
  const effectiveAccountId=resolveNativeExecutionAccountId(choice.modelAccountId,choice.connectionId,context.connections,context.modelCatalog);
  const selectedSourceModel=context.modelCatalog.find(model=>model.accountId===effectiveAccountId&&model.modelId===choice.model&&(!choice.modelAccountIdentity||model.accountIdentity===choice.modelAccountIdentity));
  const effectiveModel=choice.model;
  const effectiveModelLabel=selectedSourceModel?.label||selectedConversationModel(connection,effectiveModel)?.label||effectiveModel||'默认模型';
  const targetChangesFor=(value:ConversationView|null|undefined)=>{
    const participant=value?latestConversationParticipant(value):undefined;
    return executionTargetChanges(value?.run,participant?.connectionId,{...choice,model:effectiveModel},{
      connections:context.connections,
      catalog:context.modelCatalog,
      participantModel:participant?.model,
      participantModelAccountId:participant?.modelAccountId,
    });
  };
  const targetChanges=targetChangesFor(chat);
  const executionChangedFor=(value:ConversationView|null|undefined)=>targetChangesFor(value).changed;
  const executionChanged=targetChanges.changed;
  const nextAgentLabel=connection?connection.label||executionAgentName(connection.provider):'';
  const transferNoticeText=targetChanges.agentChanged?`接下来由 ${nextAgentLabel}${targetChanges.modelChanged?' · '+effectiveModelLabel:''} 继续处理`:`接下来使用 ${effectiveModelLabel} 继续处理`;
  const waitingHandoffAvailable=Boolean(executionChanged&&chat?.run?.status==='waiting-question'&&handoffSelections[choiceKey]===chat.run.id&&currentConversationRequests(chat).length&&currentConversationRequests(chat).every(request=>request.kind==='question'&&request.runId===chat.run!.id&&request.participantId===chat.run!.participantId&&request.generation===chat.run!.generation)&&!chat.pendingSend);
  const waitingQuestions=currentConversationRequests(chat).filter(request=>request.kind==='question');
  const waitingHandoffLabel=draft.text.trim()||images.length?'交接并发送':'交接并继续';
  const sendText=conversationContinuationText(chat,executionChanged,draft.text,images.length);
  const recovery=conversationRecoveryAction(chat,visibleEntries);
  const queuedImages=useRef<Record<string,DraftImage[]>>({});
  useEffect(()=>{
    if(!chat||chat.pendingSend||!attachments['@pending:'+chat.id])return;
    setAttachments(previous=>{const next={...previous};delete next['@pending:'+chat.id];return next;});
  },[chat?.id,chat?.pendingSend?.id,attachments,setAttachments]);
  const pendingAttempt=useRef<{workspaceId:string;conversationId:string;value:ReturnType<typeof pendingSubmission>}|undefined>(undefined);
  const activeSend=useRef<SendOperation|null>(null),locked=executionLocked(chat?.run);
  const sendGatePaused=connection?.sendGate?.state==='paused';
  const canSend=!scopeMissing&&(Boolean(context.scope)||newImages.ready)&&!context.loading&&!context.productActionPending&&(!context.scope||Boolean(chat))&&!sending&&!uploading&&!sendGatePaused&&(!chat?.forkState||chat.forkState.status==='ready');
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
  // A bounded supplement response can return before the native turn absorbs the
  // input. Once a later authoritative read repairs that exact entry, retire the
  // false warning and the retained draft instead of asking the user to resend.
  useEffect(()=>{
    if(!chat)return;
    const pending=inputAttempts.read(chat);
    if(!pending)return;
    const ids=pending.images.map(image=>image.id);
    const entry=[...chat.entries].reverse().find(item=>item.runId===pending.runId&&item.kind==='message'&&item.role==='user'&&item.text===pending.text&&(item.attachments??[]).length===ids.length&&(item.attachments??[]).every((id,index)=>id===ids[index]));
    if(entry?.status!=='accepted')return;
    inputAttempts.finish(chat,pending.clientRequestId);
    setError(previous=>previous===unconfirmedSupplementMessage?'':previous);
    draft.clearSubmitted(chat.workspaceId,chat.id,pending.text);
    setAttachments(previous=>({...previous,[chat.id]:removeSubmittedAttachments(previous[chat.id]||[],ids)}));
  },[chat?.id,chat?.workspaceId,chat?.entries,inputAttempts,setAttachments]);
  useEffect(()=>{if(context.scope||seededChoice||!newConversationChoice)return;setChoices(previous=>previous[choiceKey]?previous:{...previous,[choiceKey]:newConversationChoice});},[choiceKey,context.scope,seededChoice,newConversationChoice]);
  const select=(value:ConversationChoice,remember=true)=>{
    const resolved=remember&&!value.model&&context.scope&&lastParticipant?.connectionId===value.connectionId&&(chat?.run?.model??lastParticipant?.model)
      ?validConversationChoice({connectionId:value.connectionId,model:chat?.run?.model??lastParticipant?.model,modelAccountId:chat?.run?.modelAccountId??lastParticipant?.modelAccountId,modelAccountIdentity:chat?.run?.modelAccountIdentity,serviceTier:chat?.run?.serviceTier,reasoningEffort:chat?.run?.reasoningEffort},context.connections.find(item=>item.id===value.connectionId),context.modelCatalog)
      :value;
    setChoices(previous=>!remember&&!previous[choiceKey]?previous:{...previous,[choiceKey]:resolved});
    if(remember){
      if(chat?.run)setHandoffSelections(previous=>({...previous,[choiceKey]:chat.run!.id}));
      setModulePreference(current=>{const next=rememberConversationAgent(current,resolved.connectionId);writeConversationModulePreference(next);return next;});
      const nextModel=modelPreferenceFromChoice(resolved);writeConversationModelPreference(nextModel);setModelPreference(readConversationModelPreference());
    }
    setPrepared(null);setSelectedHandoff(null);setReviewOpen(false);
  };
  const selectPermission=(value:PermissionMode)=>{
    const workspaceId=context.scope?.workspaceId||draftWorkspaceId;
    setPermissionChoices(previous=>({...previous,[permissionKey]:value,[conversationPermissionKey(null,workspaceId)]:value}));
    setModulePreference(current=>{const next=rememberConversationPermission(current,value,context.scope?.workspaceId||draftWorkspaceId);writeConversationModulePreference(next);return next;});
    try{writeConversationPermission(permissionStorageKey,value,sessionStorage);writeConversationPermission(conversationPermissionStorageKey(permissionProfile,null,workspaceId),value,sessionStorage);}catch{/* Same-page selection remains usable. */}
    setPrepared(null);setSelectedHandoff(null);setReviewOpen(false);
  };
  useLayoutEffect(()=>{setError('');setFeedback('');setFileLinkFailure(null);setOpeningFile(null);setImageLink(null);setExpandedToolGroups({});const active=activeSend.current;if(!active||!context.isSelectionCurrent(active.selection)){activeSend.current=null;setSending(false);setPreparing(false);setPrepared(null);setSelectedHandoff(null);setReviewOpen(false);}bottom.current=true;readPosition.current=0;setAtBottom(true);},[context.selectionGeneration,context.scope?.workspaceId,context.scope?.conversationId,context.isSelectionCurrent]);
  useEffect(()=>()=>fileOpenRequest.current?.abort(),[context.selectionGeneration,context.scope?.workspaceId,context.scope?.conversationId]);
  useEffect(()=>{setMoreOpen(false);setLocationOpen(false);},[context.selectionGeneration,context.open,context.side,context.full,context.view,context.settings]);
  useEffect(()=>{earlier.followLayout();setAtBottom(bottom.current);},[chat?.id,chat?.entries.length,chat?.entries.at(-1)?.text,chat?.requests.length,chat?.run?.status,chat?.pendingSend?.id]);
  const conversationVisible=!showFocusSettings&&isConversationViewVisible(context.open,context.view,focusSplit);
  useLayoutEffect(()=>{const node=stream.current;if(!node?.getClientRects().length)return;if(bottom.current)earlier.followLayout();else{node.scrollTop=readPosition.current;earlier.remember();}setAtBottom(bottom.current);},[portalTarget,context.view,focusSplit,context.open]);
  const hasMessageList=Boolean(chat?.entries.length)&&!context.loading;
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
  },[chat?.id,hasMessageList,context.view,focusSplit,context.open]);
  const fail=(failure:unknown)=>{setError(failure instanceof Error?failure.message:'操作未完成。');};
  const readPresentedFile=async(path:string,signal:AbortSignal)=>{
    if(!chat||!host.readFile)throw new Error('此入口未提供来源文件读取。');
    return host.readFile(chat,path,signal);
  };
  const loadImage=useCallback(async(path:string,signal:AbortSignal)=>{
    if(!chat||!host.readFile)throw new Error('此入口未提供来源图片读取。');
    const file=await host.readFile(chat,path,signal);
    signal.throwIfAborted();
    if(file.kind!=='image'||file.truncated||!/^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon);base64,/i.test(file.content))throw new Error('来源不是可完整预览的图片。');
    return file.content;
  },[host.readFile,chat?.workspaceId,chat?.id,chat?.cwd]);
  const openProcessFile=async(path:string,literal=false,fileUrl?:string)=>{
    if(!chat)return;
    fileOpenRequest.current?.abort();
    const selection=context.getSelection(), request=new AbortController();
    fileOpenRequest.current=request;
    const stillCurrent=()=>!request.signal.aborted&&fileOpenRequest.current===request&&context.isSelectionCurrent(selection);
    setFileLinkFailure(null);
    try{
      const image=literal?null:conversationImageLinkSource(chat.cwd,path);
      if(image){setOpeningFile(null);setImageLink({selection,reference:path,load:signal=>loadImage(image,signal)});return;}
      if(!host.openFile)throw new Error('此入口未提供来源文件打开，请复制路径核对。');
      setOpeningFile(selection);
      const shouldExitFull=await host.openFile(chat,fileUrl??path,literal,request.signal);
      if(stillCurrent()&&shouldExitFull!==false)context.setFull(false);
    }catch(failure){if(stillCurrent())setFileLinkFailure({selection,reference:path,message:failure instanceof Error?failure.message:'无法打开来源文件。'});}
    finally{if(stillCurrent()){fileOpenRequest.current=null;setOpeningFile(null);}}
  };
  const findFileAction=chat&&host.findExplorerFile?async(reference:string,signal:AbortSignal)=>{
    const selection=context.getSelection();
    const open=await host.findExplorerFile!(chat,reference,signal);
    if(!open||!context.isSelectionCurrent(selection))return null;
    return async()=>{
      if(signal.aborted||!context.isSelectionCurrent(selection))return;
      try {await open();}
      catch (failure) {
        if(!signal.aborted&&context.isSelectionCurrent(selection))setFileLinkFailure({selection,reference,message:failure instanceof Error?failure.message:'无法在资源管理器中打开。'});
      }
    };
  }:undefined;
  const recoverConflict=async(failure:unknown)=>{
    const api=failure as ApiError;if(api?.status!==409)return false;
    const selection=context.getSelection();
    setPrepared(null);setReviewOpen(false);
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
    const acceptedRun=result.run;
    setPermissionChoices(previous=>({...previous,[conversationPermissionKey(createdScope,'')]:submitted.input.permissionMode||'default'}));
    setChoices(previous=>({...previous,[result.id]:{connectionId:submitted.input.connectionId,model:acceptedRun?.model??submitted.input.model,modelAccountId:acceptedRun?.modelAccountId??submitted.input.modelAccountId,modelAccountIdentity:acceptedRun?.modelAccountIdentity??submitted.input.modelAccountIdentity,serviceTier:acceptedRun?.serviceTier??submitted.input.serviceTier,reasoningEffort:acceptedRun?.reasoningEffort??submitted.input.reasoningEffort}}));
    await newImages.refresh().catch(fail);
    if(context.isSelectionCurrent(selection))await context.openConversation(result.workspaceId,result.id,{preserveVisibility:true,preserveHistoryView:focusSplit&&context.view==='history'});
    void context.refreshPending().catch(()=>{});
  };
  useEffect(()=>{if(!context.scope)setUnconfirmedFirst(firstSubmissions.read());},[context.selectionGeneration,context.scope,firstSubmissions]);
  const submissionIdentity=useRef({draftId:'',requestId:crypto.randomUUID()});
  if(submissionIdentity.current.draftId!==newImages.id)submissionIdentity.current={draftId:newImages.id,requestId:crypto.randomUUID()};
  const sendFirst=async(operation:SendOperation, isActive = () => true)=>{
    let submitted=firstSubmissions.read();
    const fresh=!submitted;
    let draftRevision: string | undefined;
    if(submitted){
      const result=await context.api.lookupDraft(submitted.workspaceId,submitted.draftId,submitted.input.clientRequestId);
      const stillCurrent=()=>isActive()&&context.isSelectionCurrent(operation.selection)&&firstSubmissions.read()===submitted;
      if(!stillCurrent())return;
      if(result.found){
        if(result.conversation)await acceptFirst(submitted,result.conversation,operation.selection);
        return;
      }
      if(submitted.failureReason!=='backend-updating'){
        if(firstSubmissions.releaseMissing(submitted)){
          setUnconfirmedFirst(undefined);
          setError('');
          if(submissionIdentity.current.requestId===submitted.input.clientRequestId)submissionIdentity.current.requestId=crypto.randomUUID();
        }
        return;
      }
      const snapshot=await context.api.draftImages(submitted.draftId);
      if(!stillCurrent())return;
      const staged=new Set(draftMaterialIds(snapshot.images));
      if(submitted.input.attachmentIds?.some(id=>!staged.has(id)))throw new Error('原提交的附件已变化，当前草稿已保留。');
      draftRevision=snapshot.revision;
    }else{
      if(draftWorkspaceId!=='@default'&&!newCwd.trim())throw new Error('工作空间目录不可用，请重新选择。');
      const snapshot=await newImages.refresh();
      if(!context.isSelectionCurrent(operation.selection))return;
      const expectedIds=images.map(image=>image.id);
      if(JSON.stringify(draftMaterialIds(snapshot.images))!==JSON.stringify(expectedIds))throw new Error('草稿图片已变化，请核对后重新发送。');
      submitted=firstSubmissions.save({draftId:newImages.id,workspaceId:draftWorkspaceId,input:{connectionId:choice.connectionId,modelAccountId:choice.modelAccountId,modelAccountRevision:choice.modelAccountRevision,modelAccountIdentity:choice.modelAccountIdentity,model:choice.model,serviceTier:choice.serviceTier,reasoningEffort:choice.reasoningEffort,permissionMode,text:draft.text,attachmentIds:expectedIds as NonNullable<SendDraft['attachmentIds']>,expectedDraftRevision:snapshot.revision,clientRequestId:submissionIdentity.current.requestId,...(draftWorkspaceId!=='@default'&&newCwd?{cwd:newCwd.trim()}:{}),...(boundTaskLinks.length?{taskLinks:boundTaskLinks}:{})}});
    }
    if(!firstSubmissions.beginDispatch(submitted.input.clientRequestId))return;
    try{
      const input=draftRevision===undefined?submitted.input:{...submitted.input,expectedDraftRevision:draftRevision};
      const result=await context.api.startDraft(submitted.workspaceId,submitted.draftId,input);
      if(isActive()&&firstSubmissions.read()?.input.clientRequestId===input.clientRequestId){
        await acceptFirst(submitted,result.conversation,operation.selection,fresh);
      }
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
    }finally{
      firstSubmissions.endDispatch(submitted.input.clientRequestId);
    }
  };
  const recoverFirst = useEffectEvent(async (isActive: () => boolean) => {
    if(activeSend.current)return false;
    const operation:SendOperation={selection:context.getSelection()};
    activeSend.current=operation;
    setSending(true);
    try{
      await sendFirst(operation,isActive);
      return firstSubmissions.read()?.failureReason!=='backend-updating';
    }catch(failure){
      if(isActive()&&context.isSelectionCurrent(operation.selection))fail(failure);
      return true;
    }finally{
      if(activeSend.current===operation){activeSend.current=null;setSending(false);}
    }
  });
  const firstRequestId=unconfirmedFirst?.input.clientRequestId;
  const firstFailureReason=unconfirmedFirst?.failureReason;
  useEffect(()=>{
    if(context.scope||!firstRequestId)return;
    let active=true,attempts=0;
    let timer:ReturnType<typeof setTimeout>;
    const reconcile=async()=>{
      if(!active||firstSubmissions.read()?.input.clientRequestId!==firstRequestId)return;
      const settled=await recoverFirst(()=>active);
      if(active&&!settled&&firstFailureReason==='backend-updating'&&++attempts<4)timer=setTimeout(reconcile,2_000);
    };
    timer=setTimeout(reconcile,firstFailureReason==='backend-updating'?1_000:0);
    return()=>{active=false;clearTimeout(timer);};
  },[context.scope,context.selectionGeneration,firstSubmissions,firstRequestId,firstFailureReason]);
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
      if(context.isSelectionCurrent(selection)){setPrepared(null);setReviewOpen(false);}
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
          if(!preview.fits){setPrepared({...value,conversation:current,input,preview});setReviewOpen(true);throw new Error(preview.diagnostic||'交接资料需要重新核对，草稿保留。');}
          if(!sameConversationSendPreview(value.preview,preview))throw Object.assign(new Error('发送配置已变化，请核对后重新发送。'),{status:409,code:'agent_preview_stale'});
          return context.api.send(current,{...input,previewToken:preview.token,clientRequestId:value.clientRequestId});
        },
      });
      if(!submitted?.value)return;
      context.apply(submitted.value.conversation,submitted.conversation.revision);
      setChoices(previous=>previous[value.conversation.id]?{...previous,[value.conversation.id]:{connectionId:value.input.connectionId,model:value.input.model,modelAccountId:value.input.modelAccountId,modelAccountRevision:value.input.modelAccountRevision,modelAccountIdentity:value.input.modelAccountIdentity,serviceTier:value.input.serviceTier,reasoningEffort:choice.reasoningEffort}}:previous);
      if(!value.input.continueRunId){
        draft.clearSubmitted(value.conversation.workspaceId,value.conversation.id,value.input.text);
        setAttachments(previous=>({...previous,[value.conversation.id]:removeSubmittedAttachments(previous[value.conversation.id]||[],value.input.attachmentIds||[])}));
      }
      if(context.isSelectionCurrent(value.selection)){setPrepared(null);setSelectedHandoff(null);setReviewOpen(false);}
      void context.refreshPending().catch(()=>{});
    }catch(failure){if(context.isSelectionCurrent(value.selection)){
      if(!value.input.continueRunId&&['agent_process_switching','agent_conversation_busy'].includes((failure as ApiError)?.code||'')){try{await queue(value.conversation,value.input);}catch(queueFailure){if(context.isSelectionCurrent(value.selection)&&!await recoverConflict(queueFailure))fail(queueFailure);}}
      else if(!await recoverConflict(failure)){fail(failure);setReviewOpen(true);}
    }}finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);setPreparing(false);}}
  };
  const prepare=async(show=true,skipSummary=false,recoveryRunId?:string,retryFirst=false,handoffAnswer?:{requestId:string;answer:unknown})=>{
    const waitingHandoff:SendDraft['waitingHandoff']=waitingHandoffAvailable&&chat?.run?{runId:chat.run.id,participantId:chat.run.participantId,generation:chat.run.generation,requestIds:currentConversationRequests(chat).map(request=>request.id) as NonNullable<SendDraft['waitingHandoff']>['requestIds'],...(handoffAnswer?{answers:[handoffAnswer]}:{})}:undefined;
    if(handoffAnswer&&!waitingHandoff){setError('原问题或模型选择已变化，请核对后重新提交；回答保留。');return;}
    const continueRunId=recoveryRunId??(waitingHandoff&&(handoffAnswer||!draft.text.trim()&&!images.length)?chat?.run?.id:!draft.text.trim()&&!images.length&&recovery?.kind==='recover'?chat?.run?.id:undefined);
    if(continueRunId&&locked&&!waitingHandoff&&!canContinueConversation(chat))return;
    const requestImages=continueRunId?[]:images;
    if(!chat&&firstSubmissions.read()){
      if(activeSend.current)return;
      if(!retryFirst){setUnconfirmedFirst(firstSubmissions.read());setError('还有一条首次提交结果待核对，请先核对原提交；当前新输入已保留。');return;}
      const operation:SendOperation={selection:context.getSelection()};activeSend.current=operation;setSending(true);setError('');
      try{await sendFirst(operation);}catch(failure){if(context.isSelectionCurrent(operation.selection))fail(failure);}
      finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);}}
      return;
    }
    const unavailable=(!connection?.enabled?'请先接入可用的智能体。':sendGatePaused?(connection?.sendGate?.diagnostic||'当前智能体正在进行账号切换或核对，新发送已暂停；草稿已保留。'):!choice.model?'请选择模型；没有有效记忆时不会自动选择默认模型。':!permissionAvailable?'当前执行者不支持'+permissionModeLabels[permissionMode]:requestImages.some(image=>!conversationDocumentTypes.includes(image.mimeType))&&!connection.capabilities.images?'当前执行者不支持图片或视频画面。请移除附件或选择支持图片的执行者。':choice.modelAccountId&&context.modelCatalogReady&&!selectedSourceModel?.available?'所选模型暂不可用，请重新选择。':'');
    if(unavailable){setError(unavailable);return;}
    if(activeSend.current||(!canSend&&!skipSummary)||(!continueRunId&&!show&&!sendText.trim()&&!images.length))return;
    setSelectedHandoff(null);
    const editVersion=draftEditVersion.current;
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
      // An unknown receipt protects only its exact original draft. A different
      // instruction must remain sendable and must never replay that request.
      if(!show&&!continueRunId&&pendingInput&&conversationInputAttemptMatches(pendingInput,current,sendText,requestImages)){
        const result=await reconcileConversationInputAttempt(pendingInput,{
          reconcile:attempt=>context.api.supplement(current,{text:attempt.text,attachmentIds:attempt.images.map(image=>image.id) as NonNullable<SendDraft['attachmentIds']>,clientRequestId:attempt.clientRequestId,sameRunOnly:true},attempt),
          finish:requestId=>inputAttempts.finish(current,requestId),
          isCurrent:()=>activeSend.current===operation&&context.isSelectionCurrent(operation.selection),
        });
        if(!result)return;
        if('conversation' in result){context.apply(result.conversation,current.revision);current=result.conversation;}
        if(result.delivery==='unknown'){
          // The bounded authoritative read may repair the exact native receipt while
          // the supplement response is still returning.
          const beforeRefresh=current;
          if(!await refreshLatest())return;
          if(conversationInputAttemptAccepted(beforeRefresh,current,pendingInput)){
            inputAttempts.finish(current,pendingInput.clientRequestId);
            if(pendingInput.text===sendText&&JSON.stringify(pendingInput.images.map(image=>image.id))===JSON.stringify(requestImages.map(image=>image.id))){
              draft.clearSubmitted(current.workspaceId,current.id,pendingInput.text);
              setAttachments(previous=>({...previous,[current.id]:removeSubmittedAttachments(previous[current.id]||[],pendingInput.images.map(image=>image.id))}));
            }
            return;
          }
          throw new Error(unconfirmedSupplementMessage);
        }
        if(result.delivery==='accepted'||result.delivery==='continued'){
          if(conversationInputAttemptMatches(pendingInput,current,sendText,requestImages)){
            draft.clearSubmitted(current.workspaceId,current.id,pendingInput.text);
            setAttachments(previous=>({...previous,[current.id]:removeSubmittedAttachments(previous[current.id]||[],pendingInput.images.map(image=>image.id))}));
            return;
          }
        }
        if(!await refreshLatest())return;
      }
      const route=conversationSendRoute(current,executionChangedFor(current),show);
      if(route==='pending'&&!continueRunId)throw new Error('原轮仍在等待回答或授权，请在原卡片处理；输入已保留，不会另开会话。');
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
          if('conversation' in result){context.apply(result.conversation,current.revision);current=result.conversation;}
          if(result.delivery==='accepted'||result.delivery==='continued'){
            draft.clearSubmitted(current.workspaceId,current.id,sendText);
            setAttachments(previous=>({...previous,[current.id]:removeSubmittedAttachments(previous[current.id]||[],requestImages.map(item=>item.id))}));
          }else {
            if(result.delivery==='unknown'){
              const beforeRefresh=current;
              if(!await refreshLatest())return;
              if(conversationInputAttemptAccepted(beforeRefresh,current,attempt)){
                draft.clearSubmitted(current.workspaceId,current.id,sendText);
                setAttachments(previous=>({...previous,[current.id]:removeSubmittedAttachments(previous[current.id]||[],requestImages.map(item=>item.id))}));
                return;
              }
            }
            const refusal='conversation' in result?result.conversation.entries.slice().reverse().find(entry=>entry.runId===attempt.runId&&entry.kind==='message'&&entry.role==='user'&&entry.status==='failed'&&entry.text===sendText)?.deliveryDiagnostic:result.diagnostic;
            throw new Error(result.delivery==='unknown'?unconfirmedSupplementMessage:refusal||'原轮未接收这条消息；输入已保留，不会另开会话。');
          }
          return;
        }
      }

      if(continueRunId&&!waitingHandoff){
        current=chat.run?.stopRequested?await context.api.read(chat.workspaceId,chat.id):await context.api.observe(chat);
        if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
        context.apply(current,chat.revision);
        if(current.run?.id!==continueRunId)throw new Error('原执行已变化，请核对当前记录后继续。');
        if(!conversationRecoveryAction(current)){setFeedback(conversationObservationFeedback(current.run)+' 可以直接提出新的要求。');await context.refresh();return;}
        if(!canContinueConversation(current)&&(executionLocked(current.run)||currentConversationRequests(current).length||current.run.tools.some(tool=>tool.status!=='completed')))throw new Error(current.run.diagnostic||'原执行或工具仍未结束，请先核对或停止相关工作。');
      }
      operation.selection={...operation.selection,scope:{workspaceId:current.workspaceId,conversationId:current.id}};
      if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
      let input:SendDraft={expectedRevision:current.revision,connectionId:choice.connectionId,modelAccountId:choice.modelAccountId,modelAccountRevision:choice.modelAccountRevision??selectedSourceModel?.accountRevision,modelAccountIdentity:choice.modelAccountIdentity,model:choice.model,serviceTier:choice.serviceTier,reasoningEffort:choice.reasoningEffort,skipHandoffSummary:skipSummary,permissionMode,...(waitingHandoff?{waitingHandoff}:{}),...(continueRunId?{continueRunId}:{}),text:continueRunId?'':skipSummary&&!sendText.trim()&&!requestImages.length?'继续当前工作。':sendText,attachmentIds:requestImages.map(item=>item.id) as NonNullable<SendDraft['attachmentIds']>};
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
            if(editVersion!==draftEditVersion.current)return;
            setPrepared({conversation:current,input,preview,clientRequestId:submission.clientRequestId,selection:operation.selection,recovery});
            setReviewOpen(true);return;
          }
          throw failure;
        });
        if(!submitted?.value)return;
        context.apply(submitted.value.conversation,submitted.conversation.revision);
        setChoices(previous=>previous[current.id]?{...previous,[current.id]:{connectionId:input.connectionId,model:input.model,modelAccountId:input.modelAccountId,modelAccountRevision:input.modelAccountRevision,modelAccountIdentity:input.modelAccountIdentity,serviceTier:input.serviceTier,reasoningEffort:choice.reasoningEffort}}:previous);
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
        if(recovery.used&&input.modelAccountId&&input.modelAccountRevision&&preview.modelAccountRevision!==input.modelAccountRevision)throw Object.assign(new Error('模型供应商状态已更新，请核对所选模型后重新发送。'),{status:409,code:'agent_model_source_changed'});
        input={...input,expectedRevision:current.revision};
      }catch(failure){if(!continueRunId&&!show&&['agent_process_switching','agent_conversation_busy'].includes((failure as ApiError)?.code||'')){setPreparing(false);await queue(current,input);return;}throw failure;}
      if(activeSend.current!==operation||!context.isSelectionCurrent(operation.selection))return;
      setPreparing(false);
      const next:Prepared={conversation:current,input,preview,clientRequestId:crypto.randomUUID(),selection:operation.selection,recovery};
      if((show||!preview.fits)&&editVersion!==draftEditVersion.current)return;
      setPrepared(next);
      if(show||!preview.fits)setReviewOpen(true);else await commit(next,operation);
    }catch(failure){if(activeSend.current===operation&&context.isSelectionCurrent(operation.selection)&&!await recoverConflict(failure))fail(failure);}finally{if(activeSend.current===operation){activeSend.current=null;setSending(false);setPreparing(false);}}
  };
  const observe=async()=>{
    if(!chat)return;const key=actionKey(chat,'observe');if(!actions.begin(key))return;const selection=context.getSelection();setError('');setFeedback('');
    try{const result=await context.api.observe(chat);context.apply(result,chat.revision);if(context.isSelectionCurrent(selection)){setFeedback(conversationObservationFeedback(result.run));await context.refresh();}}catch(failure){if(context.isSelectionCurrent(selection))fail(failure);}finally{actions.finish(key);}
  };
  const stop=async(toolId?:string)=>{
    if(!chat)return;if(toolId&&chat.run?.resourcesReleased)return;const key=actionKey(chat,'stop');if(!actions.begin(key))return;const selection=context.getSelection();setError('');setFeedback('');
    if(!toolId)setStoppedOutput({workspaceId:chat.workspaceId,conversationId:chat.id,runIds:conversationStopRunIds(chat),entries:chat.entries.map(entry=>({...entry}))});
    try{
      const result=await (toolId?context.api.stop(chat,toolId):context.api.stopAll(chat));context.apply(result,chat.revision);
      if(context.isSelectionCurrent(selection)){
        if(toolId)setFeedback(result.run?.diagnostic||'');
        else setFeedback('');
      }
      void context.refreshPending().catch(()=>{});
    }catch(failure){if(context.isSelectionCurrent(selection)){fail(failure);void context.refresh().catch(()=>{});}}finally{actions.finish(key);}
  };
  const settleRetained=async(target:ConversationRun)=>{
    if(!chat)return;const key=actionKey(chat,'settle-retained',target.id);if(!actions.begin(key))return;const selection=context.getSelection();setError('');
    try{const result=await context.api.settleRetainedRun(chat,target);context.apply(result,chat.revision);if(context.isSelectionCurrent(selection))setFeedback('已结束本轮提醒；原执行结果仍未知，未终止任何进程，不会重发原操作。');}
    catch(failure){if(context.isSelectionCurrent(selection)){fail(failure);void context.refresh().catch(()=>{});}}finally{actions.finish(key);}
  };
  const reply=async(requestId:string,answer:unknown)=>{
    const request=chat?.requests.find(request=>request.id===requestId);
    if(!chat)return;const key=actionKey(chat,'reply',requestId);if(!actions.begin(key))return;const selection=context.getSelection();setError('');setReplyFailure(null);
    const attempt:ConversationReplyAttempt|undefined=request?{workspaceId:chat.workspaceId,conversationId:chat.id,request,answer,previousEntries:chat.entries.filter(entry=>entry.id==='reply-'+requestId||entry.id.startsWith('reply-'+requestId+'-')).map(entry=>({id:entry.id,status:entry.status,text:entry.text}))}:undefined;
    try{const owner=[...(chat.run?[chat.run]:[]),...(chat.retainedRuns??[])].find(run=>run.id===request?.runId&&run.participantId===request.participantId&&run.generation===request.generation);if(!owner)throw new Error('原问题归属已变化，请重新核对。');context.apply(await context.api.reply({...chat,run:owner},requestId,{answer}),chat.revision);void context.refreshPending().catch(()=>{});}catch(failure){if(context.isSelectionCurrent(selection)){if(attempt)setReplyFailure({attempt,message:failure instanceof Error?failure.message:'回答是否接收仍待确认，请核对原问题。'});else fail(failure);void context.refresh().catch(()=>{});}}finally{actions.finish(key);}
  };
  const renderQuestion=(request:ConversationView['requests'][number])=>{
    const requestParticipant=chat?.participants.find(item=>item.id===request.participantId);
    const requestAgent=requestParticipant?.label||context.connections.find(item=>item.id===requestParticipant?.connectionId)?.label||(requestParticipant?.provider?executionAgentName(requestParticipant.provider):'智能体');
    return <ConversationRequest key={request.id} request={request} run={[...(chat?.run?[chat.run]:[]),...(chat?.retainedRuns??[])].find(run=>run.id===request.runId)} provider={requestAgent} onUpload={uploadAnswerMaterials} busy={sending||stopping||uploading||Boolean(chat?.stopRequest?.runIds.includes(request.runId))||Boolean(chat?.pendingSend?.draft.waitingHandoff)||actions.has(actionKey(chat!,'reply',request.id))} onRevealAnswer={revealAnswer} onReply={answer=>void reply(request.id,answer)}/>;
  };
  const uploadAnswerMaterials=async(files:File[],accept:(image:DraftImage)=>void)=>{
    if(!chat)throw new Error('原对话已变化，请重新打开问题。');
    const key=actionKey(chat,'upload','');if(!actions.begin(key))throw new Error('正在上传，请稍后再添加图片。');
    const selection=context.getSelection();
    try{await uploadConversationMaterials(chat,files,context.api.upload,accept,()=>context.isSelectionCurrent(selection));}
    finally{try{if(context.isSelectionCurrent(selection))await context.refresh();}finally{actions.finish(key);}}
  };
  const upload=async(files:FileList|File[]|null|(()=>Promise<File[]>))=>{
    if((typeof files!=='function'&&!files?.length)||uploading||sending||context.loading||Boolean(context.scope&&!chat))return;setError('');
    let key=uploadKey;if(!actions.begin(key))return;setPrepared(null);setReviewOpen(false);let selection=context.getSelection();
    try {
      const selected=typeof files==='function'?await files():Array.from(files!);
      if(!context.isSelectionCurrent(selection))return;
      const validation=imageSelectionError(selected,images.length,connection?.capabilities.maxImageBytes);
      if(validation){setError(validation);return;}
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
    prepend:page=>{if(chat)setExpandedToolGroups(previous=>carryExpandedProcessBlocks(visibleConversationEntries(chat.entries),visibleConversationEntries(page.entries),previous,chat.run,chat.retainedRuns));context.prependEntries(page);},
  });
  earlierRef.current=earlier;
  const followBottom=()=>{
    setAtBottom(previous=>previous===bottom.current?previous:bottom.current);
    // Completion must not collapse the live process underneath an upward reader.
    if(!bottom.current)setExpandedToolGroups(previous=>{
      const keys=turns.filter(turn=>conversationTurnExecution(turn,chat?.run).active||turn.items.some(item=>item.type==='process-block'&&item.active)).map(turn=>conversationTurnExpansionKey(turn,chat?.run));
      if(keys.every(key=>previous[key]!==undefined))return previous;
      return {...previous,...Object.fromEntries(keys.filter(key=>previous[key]===undefined).map(key=>[key,true]))};
    });
  };
  const scrollToLatest=()=>{earlier.pinLatest();setAtBottom(true);};
  const expandedGroupsRef=useRef(expandedToolGroups);expandedGroupsRef.current=expandedToolGroups;
  const seenAttempt=useRef('');
  useEffect(()=>{
    const element=stream.current;
    if(!chat||!element||!conversationVisible)return;
    const latest=latestVisibleConversationMessage(chat.entries);
    const key=seenAttemptKey(chat);
    let activeFrame=0;
    const check=(forceRetry=false)=>{
      if(document.visibilityState!=='visible'||!latest||!key||!element.getClientRects().length)return;
      let message=Array.from(element.querySelectorAll<HTMLElement>('[data-entry-id]')).find(node=>node.dataset.entryId===latest.id);
      if(!message||!message.getClientRects().length){
        const fallback=findSeenFallbackTarget(latest,visibleEntries,chat.run,chat.retainedRuns,expandedGroupsRef.current);
        if(fallback?.kind==='entry')message=Array.from(element.querySelectorAll<HTMLElement>('[data-entry-id]')).find(node=>node.dataset.entryId===fallback.id);
        else if(fallback?.kind==='turn'){
          const turnNode=Array.from(element.querySelectorAll<HTMLElement>('[data-turn-id]')).find(node=>node.dataset.turnId===fallback.id);
          message=turnNode?.querySelector<HTMLElement>('.ac-turn-head')??turnNode;
        }
      }
      if(!message)return;
      const bounds=element.getBoundingClientRect(),rect=message.getBoundingClientRect();
      if(rect.top>=bounds.bottom||rect.bottom<=bounds.top||rect.width===0)return;
      if(!forceRetry&&seenAttempt.current===key)return;
      seenAttempt.current=key;void context.markSeen(chat);
    };
    const checkPassive=()=>check(false),checkRetry=()=>check(true);
    const onHost=(event:Event)=>{
      if((event as CustomEvent).detail?.active!==true)return;
      checkRetry();
      if(!activeFrame)activeFrame=requestAnimationFrame(()=>{activeFrame=0;checkRetry();});
    };
    const frame=requestAnimationFrame(checkPassive);
    const observer=new ResizeObserver(checkPassive);observer.observe(element);if(streamContent.current)observer.observe(streamContent.current);
    element.addEventListener('scroll',checkPassive);document.addEventListener('visibilitychange',checkRetry);window.addEventListener('focus',checkRetry);window.addEventListener('buildr-dsh-host',onHost);
    return()=>{cancelAnimationFrame(frame);if(activeFrame)cancelAnimationFrame(activeFrame);observer.disconnect();element.removeEventListener('scroll',checkPassive);document.removeEventListener('visibilitychange',checkRetry);window.removeEventListener('focus',checkRetry);window.removeEventListener('buildr-dsh-host',onHost);};
  },[chat,visibleEntries,conversationVisible,context.markSeen]);
  const run=chat?.run;
  const failedRunInputStatus=run?.status==='failed'
    ? visibleEntries.find(entry=>entry.runId===run.id&&entry.kind==='message'&&entry.role==='user')?.status
    : undefined;
  const backgroundSubagents=run?.status==='tools-active'?subagents.agents.filter(({entry,dispatch})=>entry.runId===run.id&&entry.participantId===run.participantId&&dispatch.status==='running'):[];
  const backgroundSubagentKeys=new Set(backgroundSubagents.map(agent=>agent.dispatch.key));
  const showExecutionNotice=(!outputPaused||!stopping)&&(run?.status==='unknown'||run?.status==='tools-active');
  const noticeHasStop=showExecutionNotice&&!run?.resourcesReleased&&!run?.stopRequested;
  const runConnection=context.connections.find(item=>item.id===chat?.participants.find(participant=>participant.id===run?.participantId)?.connectionId);
  const runIdentity=run?conversationRunIdentity(run,runConnection,context.modelCatalog):'';
  const participantPairs=participantExecutionPairs(chat).map(pair=>({...pair,modelName:conversationModelLabel(pair.model,context.connections,context.modelCatalog,pair)}));
  const workspace=workspaces.find(item=>item.id===chat?.workspaceId);
  const titleStatus=chat?.titleState;
  const titleLabels={pending:'输入受理后会先显示首条消息标题，并同时生成智能标题',generating:'正在并行生成智能标题',generated:'标题已自动生成',fallback:'标题来自首条用户消息，智能标题生成后会自动替换',manual:'标题已手动设置',failed:'智能标题未生成，当前名称已保留',unavailable:'当前执行方无法自动生成标题，可手动命名',unknown:'旧对话未记录标题生成状态'};
  const settings=<div className="ac-location-settings">{chat&&<div className="ac-location-section"><strong className="ac-location-label">标题</strong><span>{titleLabels[titleStatus?.status??'unknown']}</span>{titleStatus?.reason&&<small>{titleStatus.reason}</small>}{canGenerateConversationTitle(chat)&&<div><Button size="small" loading={generatingTitle} onClick={()=>void generateTitle()}>生成简短标题</Button></div>}</div>}<div className="ac-location-section"><strong className="ac-location-label">工作空间</strong>{chat?<><span>{workspace?.name||(chat.workspaceId==='@default'?'默认工作空间':chat.workspaceId)}</span><code>{chat.cwd}</code></>:<div className="ac-location-controls"><Select className="ac-workspace-select" classNames={{popup:{root:'ac-panel-popup'}}} aria-label="新对话工作空间" allowClear={!scopeMissing&&draftWorkspaceId!=='@default'} value={scopeMissing||draftWorkspaceId==='@default'?undefined:draftWorkspaceId} placeholder={scopeMissing?'选择工作空间':'默认工作空间'} options={workspaces.filter(item=>item.id!=='@default').map(item=>({value:item.id,label:item.name}))} onChange={(value:string|undefined)=>{const workspaceId=value||'@default';draft.setWorkspace(workspaceId);context.newConversation({preserveVisibility:true,preserveHistoryView:focusSplit&&context.view==='history',scope:{workspaceId}});setPrepared(null);}}/>{host.chooseWorkspace&&<Button className="ac-workspace-add-btn" icon={<PlusOutlined aria-hidden/>} onClick={()=>{setLocationOpen(false);host.chooseWorkspace?.();}}>添加工作空间</Button>}</div>}</div></div>;
  const transcript=useMemo(()=>groupConversationStream(visibleEntries,chat?.run,chat?.retainedRuns),[visibleEntries,chat?.run,chat?.retainedRuns]);
  const liveToolId=!outputPaused&&chat?.run?.status==='running'?[...visibleEntries].reverse().find(entry=>entry.kind==='tool'&&entry.runId===chat.run!.id)?.id??null:null;
  const modelWarning=conversationModelWarning(context.modelCatalogReady,choice.modelAccountId,selectedSourceModel,!seededChoice&&rawChoice.modelAccountId&&!choice.modelAccountId?{accountId:rawChoice.modelAccountId,accountIdentity:rawChoice.modelAccountIdentity,cleared:true}:undefined,context.modelCatalog);
  const actionError=conversationActionError(error||(replyFailure&&!confirmedConversationReply(chat,replyFailure.attempt)?replyFailure.message:'')||(needsDefaultRoot?defaultRootError:''),modelWarning);
  const connectionWarning=context.streamError&&needsConversationObservation(chat)&&run?.status!=='unknown'&&<Alert className="ac-stream-disconnect" type="warning" showIcon message="实时连接正在恢复" description={context.streamError.replace(/^对话连接已中断[；;]\s*/,'')} action={<Button type="text" size="small" loading={observing} onClick={()=>void observe()}>重新连接并核对</Button>}/>;
  const turns=useMemo(()=>conversationStreamTurns(transcript,[...(chat?.retainedRuns??[]),...(run?[run]:[])]),[transcript,chat?.retainedRuns,run]);
  const latestTurn=turns.at(-1);
  const latestTurnKey=latestTurn?conversationTurnExpansionKey(latestTurn,run):undefined;
  const latestTurnExecution=latestTurn?conversationTurnExecution(latestTurn,run):undefined;
  const latestTurnLive=Boolean(latestTurn&&(latestTurnExecution?.active||latestTurn.items.some(item=>item.type==='process-block'&&item.active)));
  const latestTurnHasProcess=Boolean(latestTurn?.items.some(item=>item.type==='process-block'));
  const latestTurnExpanded=Boolean(latestTurn&&conversationTurnExpanded(latestTurn,run,expandedToolGroups));
  const previousLatestTurn=useRef({conversationId:chat?.id,live:latestTurnLive,expanded:latestTurnExpanded});
  useEffect(()=>{
    // The final reply is promoted out of the live process when the run settles; that
    // transition is the point where the answer starts appearing in the main line.
    const previous=previousLatestTurn.current;
    if(previous.conversationId===chat?.id&&previous.live&&!latestTurnLive&&latestTurnKey&&latestTurnHasProcess){
      const next=conversationProcessExpansionAfterSettle(previous.expanded,bottom.current);
      if(next!==undefined)setExpandedToolGroups(values=>values[latestTurnKey]===next?values:{...values,[latestTurnKey]:next});
    }
    previousLatestTurn.current={conversationId:chat?.id,live:latestTurnLive,expanded:latestTurnExpanded};
  },[chat?.id,latestTurnLive,latestTurnKey,latestTurnHasProcess,latestTurnExpanded]);
  const turnIdentity=(entry:ConversationEntry|undefined)=>{
    if(!entry)return '';
    const {participant,run:boundRun}=conversationTurnBinding(entry,chat);
    const provider=entry.provider||participant?.provider||boundRun?.provider;
    if(!provider&&!participant)return '';
    const connectionLabel=participant?.connectionId?context.connections.find(item=>item.id===participant.connectionId)?.label:undefined;
    const agent=participant?.label||connectionLabel||(provider?executionAgentName(provider):'智能体');
    return agent+' · '+conversationModelLabel(boundRun?.model||participant?.model,context.connections,context.modelCatalog,{connectionId:participant?.connectionId,modelAccountId:boundRun?.modelAccountId??participant?.modelAccountId});
  };
  const markdownImageResolver=useCallback((href:string)=>{
    const source=conversationImageSource(chat?.cwd,href);
    return source?.path?{load:(signal:AbortSignal)=>loadImage(source.path,signal)}:source?.href?{href:source.href}:null;
  },[chat?.cwd,loadImage]);
  const markdownOptions:MarkdownRenderOptions={allowRelativeLinks:true,allowParentRelativeLinks:true,allowAbsoluteFileLinks:true,taskLinkPathname:chat&&chat.workspaceId!=='@default'?'/workspaces/'+encodeURIComponent(chat.workspaceId):null,onRelativeLinkClick:(reference,_event,fileUrl)=>void openProcessFile(reference,false,fileUrl),imageResolver:markdownImageResolver,onImageClick:image=>{if(!chat||!image.src)return;setFileLinkFailure(null);setImageLink({selection:context.getSelection(),reference:image.reference||image.src,href:image.src});}};
  const forkableReplies = forkableReplyIds(chat);
  const finalReplies = finalReplyIds(chat);
  const loadToolEntry=useCallback((entry:ConversationEntry,signal?:AbortSignal)=>context.api.entry(chat!.workspaceId,chat!.id,entry,signal),[context.api,chat?.workspaceId,chat?.id]);
  const subagentPaneId=panelId+'-subagents';
  function closeSubagent(locate=false){
    const anchorId=selectedSubagent?.entry.id;
    const trigger=subagentTrigger.current;
    setSubagentView(undefined);
    requestAnimationFrame(()=>{
      const dispatch=locate&&anchorId?stream.current?.querySelector<HTMLButtonElement>(`[data-subagent-dispatch="${CSS.escape(anchorId)}"], [data-subagent-summary="${CSS.escape(anchorId)}"]`):null;
      if(dispatch){dispatch.scrollIntoView({block:'center'});dispatch.focus({preventScroll:true});}
      else if(!locate&&trigger?.isConnected)trigger.focus({preventScroll:true});
      else subagentMenu.current?.focus({preventScroll:true});
    });
  }
  const attachmentPaste=useRef<AbortController|null>(null);
  useEffect(()=>()=>attachmentPaste.current?.abort(),[context.selectionGeneration,context.scope?.workspaceId,context.scope?.conversationId]);
  const pasteMessageAttachments=async(event:React.ClipboardEvent<HTMLTextAreaElement>)=>{
    // Native files retain their usual path. For a copied message, leave the default text insertion alone.
    if(event.clipboardData.files.length)return;
    const selection=context.getSelection();
    const source=await readPastedMessageAttachments(permissionProfile,event.clipboardData.getData('text/html'),event.clipboardData.getData('text/plain'));
    if(!source||!context.isSelectionCurrent(selection))return;
    if(source==='unavailable'){setError('复制的附件已不可用，请从原消息重新复制。');return;}
    if(activeSend.current||sending||uploading||actions.has(uploadKey)||context.loading||Boolean(context.scope&&!chat)){
      setError('当前无法添加复制的附件，请稍后重试。');return;
    }
    if(source.ids.length+images.length>9){setError('未添加复制的附件：每次最多添加 9 份附件。');return;}
    const controller=new AbortController();attachmentPaste.current=controller;
    void upload(()=>readCopiedMessageAttachments(source,context.api.readImage,controller.signal)).finally(()=>{
      if(attachmentPaste.current===controller)attachmentPaste.current=null;
    });
  };
  const copyUserMessage=(text:string,ids?:string[])=>{
    if(!text&&!ids?.length)return null;
    const source=chat&&ids?.length?{workspaceId:chat.workspaceId,id:chat.id,ids}:undefined;
    return <span className="ac-reply-actions ac-user-actions"><CopyButton type="text" text={text} ariaLabel="复制消息"
      title={source?'复制消息和附件':undefined} failureMessage={source?'复制消息和附件失败。':'复制失败，请手动选择文字。'}
      write={source?async()=>{
        const result=await copyMessageWithAttachments(permissionProfile,text,source);
        if(result==='text')setError('仅复制了正文：此浏览器未能复制附件。');
        return result!=='failed';
      }:undefined}/></span>;
  };
  const renderEntry=(entry:ConversationEntry)=>{
    if(entry.subagent){
      const agent=subagents.agents.find(row=>row.entry.id===entry.id);
      return agent?<SubagentDispatchCard key={entry.id} agent={agent} active={agent.entry.id===subagentId} onOpen={trigger=>openSubagent(entry.id,trigger)}/>:null;
    }
    if(entry.kind==='handoff'){
      if(entry.nativeSession){
        const issue=conversationNativeSessionIssue(entry),summary=conversationNativeSessionSummary(entry);
        return <details className={'ac-handoff-receipt ac-adoption-diagnostic'+(issue?' has-issue':'')} key={entry.id} data-native-session-event={entry.nativeSession.reason}>
          <summary>{issue?`${issue} · ${summary}`:summary}</summary>
          <dl className="ac-native-session-fields">
            <dt>时间</dt><dd><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('zh-CN',{hour12:false})}</time></dd>
            {conversationNativeSessionDiagnostic(entry).flatMap(field=>[<dt key={field.label+'dt'}>{field.label}</dt>,<dd key={field.label+'dd'}>{field.value}</dd>])}
          </dl>
        </details>;
      }
      const text=conversationHandoffReceipt(entry);
      return text?<div className="ac-handoff-receipt" key={entry.id}><span>{text}</span>{Boolean(entry.handoff?.changes.length)&&<Button type="link" size="small" onClick={()=>{setSelectedHandoff(entry);}}>交接内容</Button>}</div>:null;
    }
    const text=entry.kind==='notice'&&entry.id.startsWith('reply-')?conversationReplyText(entry.text):conversationSystemNoticeText(entry);
    const body=<>{entry.role==='assistant'?<MarkdownHost markdown={entry.text} className="markdown-body" options={markdownOptions} findFileAction={findFileAction}/>:<p>{text}</p>}{entry.attachments?.length?<ConversationMessageImages conversation={chat!} ids={entry.attachments} read={context.api.readImage}/>:null}{entry.deliveryDiagnostic&&<small className="ac-input-diagnostic" role="status">{entry.deliveryDiagnostic}</small>}{entry.status==='unknown'&&<Tag color="warning">是否送达待确认</Tag>}</>;
    return <article key={entry.id} className={'ac-message is-'+entry.role} data-entry-id={entry.id} data-message-provider={entry.provider}>{entry.role==='user'?<div className="ac-user-bubble">{body}</div>:body}{entry.role==='user'&&copyUserMessage(text,entry.attachments)}{entry.role==='assistant'&&finalReplies.has(entry.id)&&<span className="ac-reply-actions"><CopyButton type="text" text={entry.text} ariaLabel="复制回复" failureMessage="复制失败，请手动选择文字。"/>{chat&&forkableReplies.has(entry.id)&&<ConversationForkAction conversation={chat} entryId={entry.id}/>}</span>}</article>;
  };
  const fileError=fileLinkFailure&&context.isSelectionCurrent(fileLinkFailure.selection)&&<Alert type="warning" message={fileLinkFailure.message} description={<code>{fileLinkFailure.reference}</code>} closable onClose={()=>setFileLinkFailure(null)} action={<CopyButton type="text" text={fileLinkFailure.reference} ariaLabel="复制来源路径" failureMessage="复制失败，请手动复制来源路径。"/>}/>;
  const threadHeader=<header className={"ac-thread-header"+(standalone?" ac-thread-header-in-stream":"")} data-run-status={run&&['running','completed'].includes(run.status)?run.status:undefined}>
        {!embedded&&!context.open&&<Button type="text" icon={<UnorderedListOutlined/>} aria-label="查看对话列表" title="对话列表" onClick={()=>context.openHistory(null,{preserveVisibility:true})}/>}
        <div className="ac-thread-heading">
        {chat?<button type="button" className="ac-thread-title" aria-label="重命名对话" title={chat.title} onClick={()=>{setTitle(chat.title);setRename(true);}}>{chat.title}</button>:<strong className="ac-thread-title ac-thread-title-static">{context.loading?'正在读取对话…':context.scope?'对话':'新对话'}</strong>}
        </div>
        <div className="ac-thread-actions">
          {typeof accessory==='function'?accessory(conversationVisible):accessory}
          {subagents.agents.length>0&&<Button ref={subagentMenu} type="text" className="ac-subagent-entry" icon={<ApartmentOutlined aria-hidden="true"/>} title="子智能体总览" aria-label={`子智能体（${subagents.agents.length}）`} aria-expanded={subagentPaneOpen} aria-controls={subagentPaneOpen?subagentPaneId:undefined} onClick={event=>{
            if(subagentOverviewOpen)closeSubagent();
            else openSubagentOverview(event.currentTarget);
          }}><span className="ac-subagent-entry-label">子智能体</span><span className="ac-subagent-entry-count" aria-hidden="true">{subagents.agents.length}{chat?.nextEntryCursor!==undefined?'+':''}</span></Button>}
          {embedded?<Button type="text" icon={<MinusOutlined/>} aria-label="收起子对话" title="收起子对话" onClick={()=>context.setOpen(false)}/>:!context.open&&<Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" title="新建对话" onClick={()=>context.newConversation({preserveVisibility:true})}/>}
          <Dropdown overlayClassName="ac-panel-popup" trigger={['click']} open={moreOpen} onOpenChange={setMoreOpen}
            popupRender={participantPairs.length>0?(menu=><div className="ac-more-menu-popup">{menu}<div className="ac-participant-history"><div className="ac-participant-history-title">参与过此对话</div><div className="ac-participants" aria-label="参与过此对话的智能体与模型">{participantPairs.map(pair=><span key={pair.key}>{pair.label||context.connections.find(item=>item.id===pair.connectionId)?.label||executionAgentName(pair.provider)} · {pair.modelName}</span>)}</div></div></div>):undefined}
            menu={{items:[
            ...(onReturnToHost?[{key:'return-to-host',label:'返回 DSH'},{type:'divider' as const}]:[]),
            ...(onCreateChild?[{key:'create-child',label:'创建子对话',icon:<PlusOutlined aria-hidden/>},{type:'divider' as const}]:[]),
            ...(!standalone?[
              {key:'collapse',label:'收起对话'},
              ...(!composition.modeSwitchInHost?[{key:'full',label:context.full?'恢复分屏':'专注对话'}]:[]),
              ...(!composition.modeSwitchInHost || (!context.full && viewportWidth > HARNESS_MOBILE_BREAKPOINT) ? [{key:'side',label:composition.modeSwitchInHost
                ? (context.side==='right'?'将对话栏移到左侧':'将对话栏移到右侧')
                : (context.side==='right'?'对话移到最左侧':'对话移到右侧')}] : []),
              {type:'divider' as const},
            ]:[]),
            {key:'generate-title',label:generatingTitle?'正在生成标题…':'生成简短标题',disabled:generatingTitle||!canGenerateConversationTitle(chat)},
            {key:'rename',label:'重命名',disabled:!chat},
            {key:'copy-id',label:chat?copyConversationIdTitle(chat.id):'复制对话 ID',disabled:!chat},
            {key:'hide',label:chat?.hidden?'恢复到最近对话':canCloseUncertainConversation(chat)?'关闭对话':'从最近对话隐藏',disabled:!chat}
          ].filter(item=>!embedded||!['full','side','hide'].includes(item.key||'')),onClick:({key})=>{
            setMoreOpen(false);
            if(standalone&&['collapse','full','side'].includes(key))return;
            if(!embedded&&composition.requestLayout&&(key==='collapse'||key==='full')){composition.requestLayout(key,key==='full'?!context.full:undefined);return;}
            if(!embedded&&window.parent!==window&&['collapse','full'].includes(key)){window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'layout',action:key,...(key==='full'?{full:!context.full}:{})},location.origin);return;}
            if(key==='collapse')context.setOpen(false);
            else if(key==='side')context.move();
            else if(key==='full'){context.setOpen(true);context.setFull(!context.full);}
            else if(key==='return-to-host')onReturnToHost?.();
            else if(key==='create-child')onCreateChild?.();
            else if(key==='generate-title')void generateTitle();
            else if(key==='rename'&&chat){setTitle(chat.title);setRename(true);}
            else if(key==='copy-id'&&chat)void copyText(chat.id).then(copied=>copied?appMessage.success('对话 ID 已复制'):appMessage.warning('复制失败，请手动选择对话 ID 复制。'));
            else if(key==='hide'&&chat){if(!chat.hidden&&canCloseUncertainConversation(chat))void closeConversation();else void updateMetadata({hidden:!chat.hidden});}
          }}}><Button type="text" icon={<EllipsisOutlined/>} aria-label="更多对话操作" title="更多"/></Dropdown>
          {headerAction}
        </div>
      </header>;
  const finishHistoryResize=(element?:HTMLButtonElement,pointerId?:number)=>{
    const drag=historyDrag.current;
    if(!drag||(pointerId!==undefined&&drag.pointerId!==pointerId))return;
    historyDrag.current=null;
    setHistoryResizing(false);
    if(element&&pointerId!==undefined&&element.hasPointerCapture(pointerId))element.releasePointerCapture(pointerId);
    if(drag.moved&&threePaneWorkspaceOpen)threePane?.onResizeHistory(drag.latest,true);
    threePane?.onHistoryDragChange?.(false);
  };
  const panel=<section id={panelId} className={'ac-panel'+(context.full?' is-full':'')+(historyResizing?' is-resizing':'')+(embedded?' ac-child-panel':'')} aria-label={embedded?'子对话':'内部对话'} data-dock={context.side} data-conversation-id={chat?.id} data-can-split-history={canSplitHistory?'true':'false'} data-three-pane={focusSplit&&threePaneWorkspaceOpen?'true':undefined}>
    {context.view==='history'&&!focusSplit&&<ConversationHistory workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId} hiddenBySettings={showFocusSettings}
      headerAction={onReturnToHost&&<><Dropdown trigger={['click']} menu={{items:[{key:'return-to-host',label:'返回 DSH'}],onClick:onReturnToHost}}><Button type="text" icon={<EllipsisOutlined/>} aria-label="更多对话操作" title="更多"/></Dropdown>{headerAction}</>}/>}
    {focusSplit&&context.view==='history'&&<>
      <aside id={focusHistoryPaneId} className="ac-focus-history-pane" style={{width:effectiveHistoryWidth}} hidden={showFocusSettings}><ConversationHistory workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId} keepHistoryOpen hiddenBySettings={showFocusSettings}/></aside>
      {!showFocusSettings&&<SplitDivider className={'ac-focus-history-divider'+(historyResizing?' is-dragging':'')} aria-label="调整专注模式对话列表宽度" aria-controls={focusHistoryPaneId} aria-orientation="vertical" aria-valuemin={effectiveHistoryMinWidth} aria-valuemax={historyMaxWidth} aria-valuenow={Math.round(effectiveHistoryWidth)} aria-valuetext={`${Math.round(effectiveHistoryWidth)} 像素`} title={`拖拽调整对话列表宽度（${effectiveHistoryMinWidth}–${historyMaxWidth}px）；方向键微调，双击恢复`}
        onPointerDown={event=>{if(event.button!==0||historyDrag.current)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);historyDrag.current={pointerId:event.pointerId,x:event.clientX,width:effectiveHistoryWidth,latest:effectiveHistoryWidth,moved:false};setHistoryResizing(true);if(threePaneWorkspaceOpen)threePane?.onHistoryDragChange?.(true);}}
        onPointerMove={event=>{const start=historyDrag.current;if(start?.pointerId!==event.pointerId)return;const next=start.width+event.clientX-start.x;start.latest=next;start.moved=true;if(threePaneWorkspaceOpen)threePane!.onResizeHistory(next,false);else commitHistoryWidth(next);}}
        onPointerUp={event=>finishHistoryResize(event.currentTarget,event.pointerId)}
        onPointerCancel={event=>finishHistoryResize(event.currentTarget,event.pointerId)}
        onLostPointerCapture={event=>finishHistoryResize(event.currentTarget,event.pointerId)}
        onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?effectiveHistoryMinWidth:event.key==='End'?historyMaxWidth:effectiveHistoryWidth+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?32:16);if(threePaneWorkspaceOpen)threePane!.onResizeHistory(next,true);else commitHistoryWidth(next);}}
        onDoubleClick={()=>{if(threePaneWorkspaceOpen)threePane!.onResizeHistory(effectiveHistoryDefaultWidth,true);else commitHistoryWidth(effectiveHistoryDefaultWidth);}}/>}
    </>}
    {ownsSettings&&<AgentConnectionSettings inMain={focusSettings}/>}
    <div className="ac-conversation-split" hidden={showFocusSettings||context.view==='history'&&!focusSplit}>
    <div className="ac-conversation-view">
      {!standalone&&threadHeader}
      {chat?.childOf&&<div className="ac-child-origin"><span title={chat.childOf.title}>背景来自「{chat.childOf.title}」 · {new Date(chat.childOf.createdAt).toLocaleString()}</span><span>仅继承创建时背景；后续按你的新要求独立处理。</span></div>}
      {chat&&<ConversationForkOrigin conversation={chat}/>}
      <div className="ac-stream" ref={stream} tabIndex={0} aria-label="对话记录" aria-busy={context.loading||earlier.loading} onScroll={()=>{earlier.onScroll();followBottom();}} onPointerDown={earlier.onPointerDown} onPointerUp={earlier.onPointerUp} onPointerCancel={earlier.onPointerCancel} onWheel={earlier.onWheel} onKeyDown={earlier.onKeyDown} onTouchStart={earlier.onTouchStart} onTouchMove={earlier.onTouchMove} onTouchEnd={earlier.onTouchEnd} onTouchCancel={earlier.onTouchCancel}>
        {standalone&&threadHeader}
        {earlier.loading&&<div className="ac-history-loading" role="status" aria-label="正在加载更早记录"><Spin size="small"/></div>}
        <div className="ac-stream-content" ref={streamContent}>
        {context.error&&<Alert type="error" showIcon message={context.error} action={<Button onClick={()=>void context.refresh().catch(fail)}>重新读取</Button>}/>}
        {run?.systemPrompt?.enabled&&run.systemPrompt.delivery==='unsupported'&&<Alert type="info" showIcon message="当前智能体不支持追加系统提示词，本轮未注入。"/>}
        <ConversationTranscript loading={context.loading}>
        {context.error&&!chat?null:!chat||!visibleEntries.length?<div className="ac-welcome"><CommentOutlined/><h1>{chat?.taskId||boundTaskId?'从这项任务继续':'今天想做什么？'}</h1><p>了解一个问题，或者交办一件事。</p>{!chat&&!showFocusSettings&&settings}</div>:<div className="ac-message-list">
          {turns.map((turn,index)=>{
            const first=turn.items.find(item=>item.type==='process-block'||item.type==='entry'&&item.entry.role==='assistant');
            const assistant=first?.type==='process-block'?first.entries[0]:first?.entry;
            const latestEntry=conversationTurnLatestEntry(turn);
            const latestAssistant=conversationTurnLatestEntry(turn,true);
            const prompt=turn.prompt,shownPrompt=prompt??turn.continuedFrom?.prompt;
            const execution=conversationTurnExecution(turn,run);
            const executing=index===turns.length-1&&execution.active;
            const processKeys=turn.items.flatMap(item=>item.type==='process-block'?[...(!item.active?[processBlockKey(item.entries)]:[]),...item.entries.filter(entry=>entry.kind==='tool').flatMap(entry=>['tool-group:'+entry.id,'tool:'+entry.id])]:[]);
            const hasExpandedProcess=turn.items.some(item=>item.type==='process-block'&&!item.active&&expandedToolGroups[processBlockKey(item.entries)]===true);
            const settled=turn.items.filter(item=>item.type==='process-block'&&!item.active);
            const hasSupplement=turn.items.some(item=>item.type==='entry'&&item.entry.kind==='message'&&item.entry.role==='user');
            const hasProcess=turn.items.some(item=>item.type==='process-block');
            const hasQuietContinuation=turn.items.some(item=>item.type==='entry'&&isQuietAutomaticContinuation(item.entry));
            const turnExpansionKey=conversationTurnExpansionKey(turn,run);
            const turnExpanded=conversationTurnExpanded(turn,run,expandedToolGroups);
            const turnRuns=[...(chat.retainedRuns??[]),...(run?[run]:[])];
            const timing=conversationTurnTiming(turn,turnRuns);
            /* A released run may have ended without a verified outcome; the current
               run keeps its own prominent notice, so only recalled turns need this. */
            const resolvedRunId=execution.current?run?.id:latestEntry?.runId||assistant?.runId||prompt?.runId;
            const turnEntryRunIds=new Set([...(prompt?.runId?[prompt.runId]:[]),...turn.items.flatMap(item=>item.type==='entry'?(item.entry.runId?[item.entry.runId]:[]):item.entries.flatMap(entry=>entry.runId?[entry.runId]:[]))]);
            const turnRun=turnRuns.find(value=>value.id===resolvedRunId)??turnRuns.find(value=>value.status==='unknown'&&!value.supersededBy&&turnEntryRunIds.has(value.id));
            const turnPaused=Boolean(stoppedOutput&&stoppedOutput.workspaceId===chat.workspaceId&&stoppedOutput.conversationId===chat.id&&(stoppedOutput.runIds??[stoppedOutput.runId]).includes(turnRun?.id??''));
            const unverified=Boolean(turnRun&&turnRun.status==='unknown'&&!execution.current&&!turnRun.supersededBy);
            const turnSubagents=subagents.agents.filter(agent=>agent.entry.runId&&turnEntryRunIds.has(agent.entry.runId));
            const turnWaiting=subagentWaitingLabel(execution.current?run:undefined,subagents.agents)??(execution.current&&backgroundSubagents.length?'后台子智能体仍在运行':execution.waiting);
            return <ConversationTurn key={turn.key} id={turn.key} runId={resolvedRunId} prompt={shownPrompt?{id:shownPrompt.id,text:shownPrompt.text,copyAction:copyUserMessage(shownPrompt.text,shownPrompt.attachments),images:shownPrompt.attachments?.length?<ConversationMessageImages conversation={chat} ids={shownPrompt.attachments} read={context.api.readImage}/>:undefined,diagnostic:prompt?(prompt.deliveryDiagnostic?<small className="ac-input-diagnostic" role="status">{prompt.deliveryDiagnostic}</small>:prompt.status==='failed'?<small className="ac-input-diagnostic" role="status">未送达</small>:prompt.status==='unknown'&&(execution.current||turnExpanded)?<Tag color={execution.current?'warning':'default'}>{execution.current?'是否送达待确认':'历史送达未确认'}</Tag>:undefined):<small className="ac-continuation-prompt-label">继续上次要求</small>}:undefined}
              onCollapseProcess={processKeys.some(key=>expandedToolGroups[key]===true)?()=>setExpandedToolGroups(previous=>({...previous,...Object.fromEntries(processKeys.map(key=>[key,false]))})):undefined} collapseLabel={hasExpandedProcess?'收起处理过程':'收起工具调用'} identity={execution.current?runIdentity:turnIdentity(latestAssistant||assistant||latestEntry||prompt)} executing={executing&&!turnPaused} showExecutionIndicator={Boolean(assistant||hasProcess||executing)} startedAt={timing.startedAt} finishedAt={timing.finishedAt} processExpanded={turnExpanded} summary={!turnExpanded&&turnSubagents.length>0?<ConversationTurnSubagents agents={turnSubagents} onSelect={openSubagent} onOverview={openSubagentOverview}/>:undefined} onToggleProcess={hasProcess||hasQuietContinuation||hasSupplement||turnSubagents.length>0?()=>setExpandedToolGroups(previous=>({...previous,[turnExpansionKey]:!turnExpanded,...Object.fromEntries(settled.flatMap(item=>item.type==='process-block'?[[processBlockKey(item.entries),!turnExpanded]]:[]))})):undefined}>
              {executing&&turnWaiting&&<small className="ac-input-diagnostic" role="status">{turnWaiting}</small>}
              {unverified&&turnExpanded&&<small className="ac-input-diagnostic" title={turnRun?.diagnostic}>{turnRun?.attentionSettled?'历史执行提醒已结束；原记录仍保留。':<>历史执行结果未确认，不影响当前对话。原记录保留在可展开的处理过程中。{canSettleRetainedRun(chat,turnRun)&&<Button type="link" size="small" loading={Boolean(chat&&actions.has(actionKey(chat,'settle-retained',turnRun!.id)))} onClick={()=>void settleRetained(turnRun!)} title="仅结束提醒：原执行结果仍未知，不终止可能仍在运行的进程，不会重发原操作。">结束提醒</Button>}</>}</small>}
              {turn.items.map(item=>{
                if(item.type==='entry'){
                  if(isQuietAutomaticContinuation(item.entry)&&expandedToolGroups[turnExpansionKey]!==true)return null;
                  return !turnExpanded&&(item.entry.subagent||item.entry.kind==='message'&&item.entry.role==='user')?null:renderEntry(item.entry);
                }
                const key=processBlockKey(item.entries);
                return <Fragment key={key}><ConversationProcessBlock hidden={!turnExpanded} loadEntry={loadToolEntry} markdownOptions={markdownOptions} headerless groupsOpen={expandedToolGroups} onGroupToggle={(ids,open)=>setExpandedToolGroups(previous=>({...previous,...Object.fromEntries(ids.map(id=>['tool-group:'+id,open]))}))} toolsOpen={expandedToolGroups} onToolToggle={(id,open)=>setExpandedToolGroups(previous=>({...previous,['tool:'+id]:open}))} blockKey={key} entries={item.entries} active={item.active&&!turnPaused} liveToolId={liveToolId} finishedAt={item.finishedAt} onOpenFile={path=>void openProcessFile(path)} open={turnExpanded} onToggle={(name,open)=>setExpandedToolGroups(previous=>({...previous,[name]:open}))}/><ConversationPresentedFiles key={chat.id+':'+key} entries={item.entries} read={readPresentedFile} onOpen={path=>void openProcessFile(path,true)}/></Fragment>;
              })}
              
            </ConversationTurn>;
          })}
        </div>}
        </ConversationTranscript>
        <ConversationPendingSend conversation={chat} onCancelled={(cancelled,answers)=>{setError('');draftEditVersion.current++;setPrepared(null);setReviewOpen(false);const text=[cancelled.text,answers].filter(Boolean).join('\n');if(text)draft.setText(draft.text.trim()&&draft.text!==text?[draft.text,text].join('\n\n'):text);if(cancelled.attachmentIds?.length&&chat)setAttachments(previous=>({...previous,[chat.id]:[...(previous[chat.id]||[]),...(previous['@pending:'+chat.id]||queuedImages.current[chat.id]||[]).filter(image=>cancelled.attachmentIds!.some(id=>id===image.id)&&!(previous[chat.id]||[]).some(value=>value.id===image.id))]}));setFeedback('已取消，内容已放回输入框。');requestAnimationFrame(()=>document.getElementById(panelId)?.querySelector<HTMLTextAreaElement>('textarea')?.focus());}}/>{currentConversationRequests(chat).map(renderQuestion)}
        </div>
      </div>
      {!atBottom&&<div className="ac-scroll-latest"><Button className="ac-scroll-latest-button" shape="circle" icon={<ArrowDownOutlined/>} aria-label="向下到底" title="向下到底，回到最新消息" onClick={scrollToLatest}/></div>}
      <div className="ac-compose-wrap" data-run-status={run?.status==='stopped'?'stopped':undefined}>{fileError}{openingFile&&context.isSelectionCurrent(openingFile)&&<div role="status" className="ac-input-diagnostic">正在打开文件…</div>}

        {showExecutionNotice&&run?.status==='tools-active'&&<ConversationActiveToolsNotice key={run.id} tools={run.tools.filter(tool=>!backgroundSubagentKeys.has(tool.id))} subagents={backgroundSubagents.length} onOpenSubagents={backgroundSubagents.length?()=>openSubagent(backgroundSubagents[0].entry.id):undefined} resourcesReleased={run.resourcesReleased} stopRequested={run.stopRequested===true} feedback={feedback} diagnostic={run.diagnostic} canContinue={Boolean(chat&&conversationSendRoute(chat,executionChanged)==='send')} observing={observing} stopping={stopping} onObserve={()=>void observe()} onStop={toolId=>void stop(toolId)}/>}
        {showExecutionNotice&&run?.status==='unknown'&&<ConversationExecutionNotice run={run} feedback={feedback} streamError={context.streamError} continuing={sending} continueDisabled={!canSend} onContinue={canContinueConversation(chat)&&!executionChanged?()=>void prepare(false,false,run.id):undefined} observing={observing} stopping={stopping} onObserve={()=>void observe()} onStop={()=>void stop()}/>}{!outputPaused&&<ConversationCompactionNotice run={run}/>}{(!outputPaused||Boolean(actionError))&&run&&locked&&run.status!=='unknown'&&run.status!=='tools-active'&&<div className="ac-execution-statusbar" role="status" data-execution-state={run.status}>{run.stopRequested?<span>停止已请求，等待结束确认</span>:!waitingQuestions.length&&run.status!=='running'&&<span>{statusLabels[run.status]}</span>}</div>}{!chat&&newImages.error&&<Alert type="warning" message={newImages.error} action={<Button size="small" onClick={()=>void newImages.refresh().catch(fail)}>重新读取图片</Button>}/>} {!chat&&unconfirmedFirst&&<ConversationFirstSubmissionNotice submission={unconfirmedFirst} busy={sending} onRetry={()=>void prepare(false,false,undefined,true)}/>}{!outputPaused&&run&&run.status!=='stopped'&&run.status!=='running'&&run.status!=='completed'&&run.status!=='unknown'&&run.status!=='tools-active'&&(!locked||Boolean(run.diagnostic))&&<div className="ac-run-status" role="status" data-run-status={run.status}>{!locked&&<>{run.interrupted?'执行未完成':statusLabels[run.status]}{runIdentity&&` · ${runIdentity}`} · {permissionModeLabels[run.permissionMode||'default']}</>}{run.status==='failed'?<ConversationFailureNotice run={run} inputStatus={failedRunInputStatus}/>:run.diagnostic&&<p>{run.diagnostic}</p>}</div>} {connectionWarning}{modelWarning&&<Alert type="warning" showIcon message={modelWarning}/>}{earlier.error&&<Alert type="warning" showIcon message={earlier.error}/>} {actionError&&<Alert type="warning" showIcon message={actionError} closable onClose={()=>{setError('');setReplyFailure(null);setDefaultRootError('');}}/>} {feedback&&run?.status!=='unknown'&&run?.status!=='tools-active'&&<small role="status">{feedback}</small>}{(!draft.available||!attachmentsAvailable)&&<Alert type="warning" message="浏览器存储不可用，刷新后无法恢复未发送草稿。"/>}
        {recovery&&!chat?.pendingSend&&run?.status!=='unknown'&&run?.status!=='tools-active'&&<div className="ac-recovery-action" data-recovery-kind={recovery.kind}>{!run?.diagnostic&&<span>{recovery.kind==='observe'?'原执行状态仍待核对。':'上次执行未正常答复。'}</span>}<Button type="text" size="small" icon={<ReloadOutlined/>} autoInsertSpace={false} aria-label={recovery.kind==='recover'&&executionChanged?'继续':recovery.label} disabled={Boolean(review)||!canSend||observing} loading={recovery.kind==='observe'?observing:sending} onClick={()=>recovery.kind==='observe'?void observe():void prepare(false,false,chat!.run!.id)}>{recovery.kind==='recover'&&executionChanged?'继续':recovery.label}</Button>{recovery.kind==='recover'&&executionChanged&&!review&&<><span className="ac-recovery-target">{transferNoticeText}</span><Button type="link" size="small" disabled={!canSend} onClick={()=>void prepare(true,false,chat!.run!.id)}>交接内容</Button></>}</div>}
        <ConversationConnectionNotice ready={context.connectionsReady} loading={context.connectionsLoading} error={context.connectionsError} connection={connection} onSettings={()=>context.setSettings(true)}/>
        {sendGatePaused&&<Alert type={connection?.sendGate?.reason==='account-unconfirmed'?'warning':'info'} showIcon message={connection?.sendGate?.reason==='account-unconfirmed'?'账号状态待核对，新发送已暂停':'账号切换或退出进行中，新发送已暂停'} description={connection?.sendGate?.diagnostic||'请先完成账号操作或核对状态；当前草稿已保留。'} action={<Button size="small" onClick={()=>context.setSettings(true)}>查看账号状态</Button>}/>}
        {connection?.enabled&&!sendGatePaused&&chat?.run&&recovery?.kind!=='recover'&&executionChanged&&!review?<div className="ac-transfer-notice"><span>{transferNoticeText}</span><Button type="link" size="small" disabled={!canSend} loading={sending} onClick={()=>void prepare(true)}>交接内容</Button></div>:null}
        {preparing&&<div className="ac-notice" role="status">正在准备发送… <Button type="text" size="small" onClick={()=>{activeSend.current=null;setSending(false);setPreparing(false);}}>取消发送</Button></div>}
        {choice.connectionId&&!permissionAvailable&&<Alert type="warning" showIcon message={"当前执行者不支持"+permissionModeLabels[permissionMode]} description="已保留所选权限。请选择可用权限或切换执行者后再发送，草稿保留。"/>}{images.some(image=>!conversationDocumentTypes.includes(image.mimeType))&&!connection?.capabilities.images&&<Alert type="warning" message="当前执行者不支持图片或视频画面。请移除附件或选择支持图片的执行者。"/>}
        {chat?.stopRequest?.cancelledSend&&<details className="ac-notice" data-cancelled-send><summary>排队输入已随对话停止取消，内容已保留</summary><p>{chat.stopRequest.cancelledSend.draft.text}</p>{Boolean(chat.stopRequest.cancelledSend.draft.attachmentIds?.length)&&<ConversationMessageImages conversation={chat} ids={chat.stopRequest.cancelledSend.draft.attachmentIds!} read={context.api.readImage}/>}</details>}
        {stopControl!=='hidden'&&!noticeHasStop&&<div className="ac-compose-controls"><Button className="ac-stop-button" type="text" icon={<StopOutlined/>} aria-label="停止对话" title="停止此对话的全部执行和排队输入" loading={stopControl==='stopping'} disabled={stopControl==='stopping'} onClick={()=>void stop()}>{stopControl==='stopping'?'停止中':'停止'}</Button></div>}
        {review&&<ConversationHandoffReview key={review.preview.token} material={review.preview.handoff??null} target={`${nextAgentLabel} · ${effectiveModelLabel}`}
          loadHistory={chat?(input,signal)=>context.api.historySource(chat.workspaceId,chat.id,input,signal):undefined} loadEntry={chat?(entry,signal)=>context.api.entry(chat.workspaceId,chat.id,entry,signal,review.preview.handoff?.sourceId):undefined} onOpenFile={path=>void openProcessFile(path)}
          notice={review.preview.fits?review.preview.diagnostic:undefined} issue={!review.preview.fits?(review.preview.diagnostic||'交接资料超出当前模型的接收容量。'):undefined}
          confirmLabel={review.input.waitingHandoff?(review.input.waitingHandoff.answers?.length?'回答并交接':review.input.continueRunId?'交接并继续':'交接并发送'):review.input.continueRunId?'确认交接并继续':'确认交接并发送'} busy={sending} disabled={!canSend||Boolean(chat?.pendingSend)}
          onConfirm={()=>{if(!canSend||chat?.pendingSend||!review.preview.fits)return;if(review.input.continueRunId&&!review.input.waitingHandoff)void prepare(false,false,review.input.continueRunId);else void commit(review);}}
          onDismiss={()=>{setPrepared(null);setReviewOpen(false);requestAnimationFrame(()=>document.getElementById(panelId)?.querySelector<HTMLTextAreaElement>('.ac-composer textarea')?.focus());}}
          onChooseModel={()=>{setPrepared(null);setReviewOpen(false);requestAnimationFrame(()=>{const trigger=document.getElementById(panelId)?.querySelector<HTMLButtonElement>('.ac-model-trigger');trigger?.focus();trigger?.click();});}}/>}
        <ConversationComposer images={images} materialDisabled={sending||uploading||context.loading||Boolean(context.scope&&!chat)} addDisabled={sending||context.loading||Boolean(context.scope&&!chat)} uploading={uploading} onAdd={upload} onBlocked={()=>setError('当前正在发送或上传，请稍后再添加附件。')} onRemove={id=>{if(!chat){void newImages.remove(id).catch(fail);}else setAttachments(previous=>({...previous,[attachmentKey]:(previous[attachmentKey]||[]).filter(item=>item.id!==id)}));setPrepared(null);setReviewOpen(false);}}
          input={{id:embedded?'agent-child-conversation-input-'+chat?.id:'agent-conversation-input','aria-label':embedded?'子对话输入':'对话输入',disabled:context.loading||Boolean(context.scope&&!chat),placeholder:currentConversationRequests(chat).length?'原轮等待回答或授权，请使用上方卡片；输入会保留…':locked&&!chat?.run?.resourcesReleased&&!chat?.run?.stopRequested?'追加要求到当前执行，不另开会话…':'提出问题，或描述想完成的工作',value:draft.text,onPaste:pasteMessageAttachments,onChange:event=>{draftEditVersion.current++;draft.setText(event.target.value);setPrepared(null);setReviewOpen(false);},autoSize:{minRows:2,maxRows:8},onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;},onKeyDown:event=>{if(shouldSendOnKey({key:event.key,shiftKey:event.shiftKey,isComposing:composing.current||event.nativeEvent.isComposing,keyCode:event.nativeEvent.keyCode})){event.preventDefault();if(canSend&&!review)void prepare(false);}}}}
          access={<><ConversationAgentSelect connections={context.connections} value={choice} disabled={sending} onChange={select}/><Select<PermissionMode> className="ac-choice ac-permission-select" aria-label="执行权限" placement="topLeft" variant="borderless" size="small" suffixIcon={null} labelRender={({label})=><span className="ac-permission-label"><SafetyCertificateOutlined/>{label}</span>} value={permissionMode} disabled={sending||uploading||context.loading||Boolean(context.scope&&!chat)} popupMatchSelectWidth={false} classNames={{popup:{root:'ac-panel-popup ac-choice-popup'}}} title="权限更改用于本对话下一轮。完全访问会跳过逐次工具审批；业务问题仍需回复，系统与厂家限制继续有效。" options={[{value:'default',label:'默认权限',disabled:!supportsConversationPermission(connection,'default')},{value:'full-access',label:'完全访问',disabled:!supportsConversationPermission(connection,'full-access')}]} onChange={selectPermission}/></>}
          execution={<><ConversationOptions showAgent={false} key={choiceKey+':'+context.side+':'+context.open} connections={context.connections} value={choice} disabled={sending} onChange={select}/><Button type="primary" shape="circle" icon={<ArrowUpOutlined/>} aria-label="发送对话" title={waitingHandoffAvailable?waitingHandoffLabel:'发送'} disabled={Boolean(review)||!canSend||(!waitingHandoffAvailable&&!sendText.trim()&&!images.length)} loading={sending} onClick={()=>void prepare(false)}/></>}/>
        <div className="ac-location-meta"><span>所属工作空间：<Popover rootClassName="ac-panel-popup" title="对话信息" trigger="click" open={locationOpen} onOpenChange={setLocationOpen} content={settings}><button type="button" className="ac-location-name" aria-label="对话信息与工作空间" title={(chat?.cwd||newCwd)||undefined}>{chat?(workspace?.name||(chat.workspaceId==='@default'?'默认工作空间':chat.workspaceId)):(scopeMissing?'请选择工作空间':workspaces.find(item=>item.id===draftWorkspaceId)?.name||'默认工作空间')}</button></Popover></span>{chat&&composition.renderContext?<span className="ac-engineering-context"><ConversationContextSlot conversation={chat} apply={context.apply}/></span>:window.parent!==window&&<span ref={engineeringAnchor} className="ac-engineering-context-anchor"/>}<small className="ac-location-keys">{review?'确认后发送 · Shift+Enter 换行':'Enter 发送 · Shift+Enter 换行'}</small></div>
      </div>
    <ConversationHandoffDrawer loadHistory={chat?(input,signal)=>context.api.historySource(chat.workspaceId,chat.id,input,signal):undefined} loadEntry={chat?(entry,signal)=>context.api.entry(chat.workspaceId,chat.id,entry,signal,viewedHandoff?.handoff?.sourceId):undefined} onOpenFile={path=>void openProcessFile(path)} open={Boolean(viewedHandoff)} side={context.side} material={viewedHandoff?.handoff??null} delivery={viewedHandoff&&viewedHandoff.status!=='accepted'?viewedHandoff.status==='failed'?'failed':'unknown':undefined} received={viewedHandoff?.status==='accepted'} issue={viewedHandoff&&viewedHandoff.status!=='accepted'?'尚未确认接收，请先核对原执行。':undefined} onClose={()=>setSelectedHandoff(null)}/>
    <Modal open={rename} title="重命名对话" centered getContainer={false} styles={{mask:{position:'absolute'},wrapper:{position:'absolute'}}} onCancel={()=>setRename(false)} onOk={()=>void updateMetadata({title:title.trim()})} okButtonProps={{disabled:!title.trim()}} okText="保存" cancelText="取消"><Input aria-label="对话名称" value={title} onChange={event=>setTitle(event.target.value)}/></Modal>
    </div>
    {subagentOverviewOpen&&<ConversationSubagentOverview id={subagentPaneId} agents={subagents.agents} currentRunId={run?.id} focusRunId={subagentView.focusRunId} hasEarlier={chat?.nextEntryCursor!==undefined} loading={earlier.loading} error={earlier.error} onLoadEarlier={earlier.readEarlierFromOverview} onSelect={openSubagent} onClose={()=>closeSubagent()}/>}
    {selectedSubagent&&<ConversationSubagentPane id={subagentPaneId} agents={subagents.agents} agent={selectedSubagent} onSelect={openSubagent} onOverview={()=>openSubagentOverview(undefined,selectedSubagent.entry.runId)} onClose={closeSubagent} onOpenFile={path=>void openProcessFile(path)} loadEntry={loadToolEntry} markdownOptions={markdownOptions}/>}
    </div>
  </section>;
  return <>{embedded?panel:<ConversationDock focusSettings={focusSettings} panel={panel} portalTarget={portalTarget} workspaces={workspaces}/>}
    {imageLink&&context.isSelectionCurrent(imageLink.selection)&&<ConversationImagePreview key={imageLink.selection.generation+':'+imageLink.reference} href={imageLink.href} load={imageLink.load} reference={imageLink.reference} onClose={()=>setImageLink(null)}/>}
  </>;
}
