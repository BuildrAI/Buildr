import {reasoningEffortLabel,reasoningEffortRank,sortReasoningEfforts,modelSourceName,executionAgentName,tierReasoningEffort} from '../../lib/model-picker.ts';
export {reasoningEffortLabel,reasoningEffortRank,sortReasoningEfforts,modelSourceName,executionAgentName,nextServiceTier,tierReasoningEffort} from '../../lib/model-picker.ts';
import type {ConnectionView, ConversationRun, SendDraft, CatalogModel} from './types';

type CompatibilityTarget = Pick<ConnectionView,'id'|'label'|'modelPolicy'>|string|undefined;
type CompatibilityModel = Pick<CatalogModel,'provider'|'sharing'|'inference'|'executorCompatibility'>;

/**
 * Evaluate static compatibility between an executor connection and a catalog model.
 * Server `executorCompatibility` is authoritative; when absent on older snapshots,
 * fall back to `connection.modelPolicy` if present, otherwise treat as compatible
 * and defer enforcement to server-side send validation.
 */
export function catalogModelCompatibility(connection:CompatibilityTarget,item:CompatibilityModel):{compatible:boolean;reasonCode?:string;reason?:string} {
  const connectionId=typeof connection==='string'?connection:connection?.id;
  if(!connectionId)return {compatible:true};
  const declared=item.executorCompatibility?.find(entry=>entry.connectionId===connectionId);
  if(declared)return declared;
  if(typeof connection==='object'&&connection?.modelPolicy){
    const native=connection.modelPolicy.native;
    const isNative=Boolean(native?.sourceProviders.includes(item.provider));
    if(item.sharing?.kind==='executor-exclusive'&&!item.sharing.executors.includes(connectionId)){
      return {compatible:false,reasonCode:'agent_model_source_unsupported',reason:item.sharing.reason};
    }
    if(!isNative&&native?.exclusive){
      const label=connection.label||connectionId;
      return {compatible:false,reasonCode:'agent_model_source_unsupported',reason:`${label} Agent 暂不支持选择其他供应商的模型，请改用 ${label} 原生模型。`};
    }
    if(!isNative&&(item.inference==='none'||!connection.modelPolicy.gateway)){
      return {compatible:false,reasonCode:'agent_model_source_unsupported',reason:`${connection.label||connectionId} 不支持通过模型网关接入此来源。`};
    }
  }
  return {compatible:true};
}

export function executorCompatibilityNotice(connection:CompatibilityTarget,catalog:readonly CompatibilityModel[]):string|undefined {
  const incompatible=catalog.map(item=>({item,result:catalogModelCompatibility(connection,item)})).filter(entry=>!entry.result.compatible&&entry.result.reason);
  if(!incompatible.length)return undefined;
  if(typeof connection==='object'&&connection?.modelPolicy?.native?.exclusive){
    const own=incompatible.find(entry=>entry.item.sharing?.kind!=='executor-exclusive');
    return own?.result.reason??incompatible[0]!.result.reason;
  }
  return incompatible[0]!.result.reason;
}

/** Disabled choices keep their actual model name; compatibility is not a name suffix. */
export function catalogConversationOption(connection:CompatibilityTarget,item:CatalogModel) {
  const compatibility=catalogModelCompatibility(connection,item);
  return {value:'shared:'+item.accountId+'::'+item.modelId,
    label:item.creditFactor!==undefined?`${item.label} · ${item.creditFactor.toFixed(2)}x`:item.label,
    disabled:!item.available||!compatibility.compatible,
    ...(!compatibility.compatible&&compatibility.reason?{title:compatibility.reason}:{})};
}
export type ConversationChoice = Pick<SendDraft,'connectionId'|'model'|'reasoningEffort'|'serviceTier'|'modelAccountId'|'modelAccountRevision'|'modelAccountIdentity'>;
export type PermissionMode=NonNullable<SendDraft['permissionMode']>;
export const permissionModeLabels:Record<PermissionMode,string>={default:'默认权限','full-access':'完全访问'};

export function conversationPermissionKey(scope:{workspaceId:string;conversationId:string}|null,draftWorkspaceId:string):string {
  return scope?JSON.stringify([scope.workspaceId,scope.conversationId]):`new:${draftWorkspaceId||'unselected'}`;
}
export function conversationPermissionStorageKey(profile:string,scope:{workspaceId:string;conversationId:string}|null,draftWorkspaceId?:string):string|null {
  if(scope)return `buildr.agent-conversation.permission:${encodeURIComponent(profile)}:${encodeURIComponent(scope.workspaceId)}:${encodeURIComponent(scope.conversationId)}`;
  return draftWorkspaceId?`buildr.agent-conversation.permission:${encodeURIComponent(profile)}:${encodeURIComponent(draftWorkspaceId)}:new`:null;
}
export function readConversationPermission(key:string|null,storage:Pick<Storage,'getItem'>):PermissionMode|undefined {
  if(!key)return;
  try{const value=storage.getItem(key);return value==='default'||value==='full-access'?value:undefined;}catch{return;}
}
export function writeConversationPermission(key:string|null,value:PermissionMode,storage:Pick<Storage,'setItem'>):boolean {
  if(!key)return false;
  try{storage.setItem(key,value);return true;}catch{return false;}
}
export function selectedConversationPermission(selected:PermissionMode|undefined,run:ConversationRun|undefined,connection?:ConnectionView):PermissionMode {
  return selected??(run ? run.permissionMode??'default' : connection&&!supportsConversationPermission(connection,'full-access')?'default':'full-access');
}
export function supportsConversationPermission(connection:ConnectionView|undefined,mode:PermissionMode):boolean {
  return (connection?.capabilities.permissionModes||['default']).includes(mode);
}

export function selectedConversationModel(connection:Pick<ConnectionView,'models'>|undefined,modelId?:string) {
  return modelId?connection?.models.find(model=>model.id===modelId):connection?.models.find(model=>model.isDefault);
}

export function conversationReasoningOptions(connection:ConnectionView|undefined,modelId?:string) {
  const model=selectedConversationModel(connection,modelId);
  return sortReasoningEfforts(model?.reasoningEfforts||[]);
}

/** 只依据所选来源及档位判断能力，不借用同名原生模型。undefined 表示尚未观察到来源。 */
export function choiceReasoningOptions(choice:ConversationChoice,connection:ConnectionView|undefined,catalog:CatalogModel[]):ReadonlyArray<{id:string}>|undefined {
  const modelId=choice.model??selectedConversationModel(connection)?.id??connection?.models[0]?.id;
  const source=catalog.find(item=>item.accountId===(choice.modelAccountId??'native-'+choice.connectionId)&&item.modelId===modelId&&(!choice.modelAccountIdentity||item.accountIdentity===choice.modelAccountIdentity));
  if(choice.modelAccountId||source){
    if(!source)return;
    const tier=source.serviceTiers?.find(item=>item.id===(choice.serviceTier??source.defaultServiceTier));
    return tier?.reasoningEfforts??source.reasoningEfforts??[];
  }
  const model=selectedConversationModel(connection,modelId);
  return model?model.reasoningEfforts??[]:undefined;
}

/** 只修正下一次选择和发送，不修改历史运行记录。 */
/** Restore a legacy variant when the same source now exposes its series and depth. */
export function restoreModelSeriesChoice<T extends {model?:string;modelAccountId?:string;reasoningEffort?:string}>(choice:T,catalog:CatalogModel[]):T {
  if(!choice.modelAccountId||!choice.model||catalog.some(model=>model.accountId===choice.modelAccountId&&model.modelId===choice.model))return choice;
  const split=/^(.*)-(low|medium|high|xhigh)$/.exec(choice.model);
  if(!split||!catalog.some(model=>model.accountId===choice.modelAccountId&&model.modelId===split[1]
    &&model.reasoningEfforts?.some(depth=>depth.id===split[2])))return choice;
  return {...choice,model:split[1],reasoningEffort:choice.reasoningEffort??split[2]};
}

export function validConversationChoice(choice:ConversationChoice,connection:ConnectionView|undefined,catalog:CatalogModel[]):ConversationChoice {
  choice=restoreModelSeriesChoice(choice,catalog);
  if(choice.modelAccountId&&!catalog.some(item=>item.accountId===choice.modelAccountId&&item.modelId===choice.model&&item.available&&item.enabled!==false&&(!choice.modelAccountIdentity||item.accountIdentity===choice.modelAccountIdentity)))return {connectionId:choice.connectionId};
  const options=choiceReasoningOptions(choice,connection,catalog);
  return choice.reasoningEffort&&options&&!options.some(item=>item.id===choice.reasoningEffort)?{...choice,reasoningEffort:undefined}:choice;
}

export function conversationReasoningSelection(connection:ConnectionView|undefined,choice:ConversationChoice) {
  const model=selectedConversationModel(connection,choice.model);
  const options=conversationReasoningOptions(connection,choice.model);
  const id=choice.reasoningEffort ?? model?.defaultReasoningEffort;
  const index=options.findIndex(option=>option.id===id);
  const ranks=options.map(option=>reasoningEffortRank(option.id));
  const ordered=options.length>1&&ranks.every(rank=>rank!==undefined)&&new Set(ranks).size===ranks.length;
  return {options,index,ordered,inherited:choice.reasoningEffort===undefined,label:index>=0?reasoningEffortLabel(options[index]!):choice.reasoningEffort||'默认'};
}

/**
 * 执行目标是否变化只看智能体、来源账号、模型与档位。
 * 思考深度与权限都是单轮参数：原原生会话可以用新强度或新授权接收下一条要求，不构成换人交接。
 */
export function executionSelectionChanged(run:Pick<ConversationRun,'model'|'modelAccountId'|'serviceTier'>|undefined,participantConnectionId:string|undefined,choice:Pick<ConversationChoice,'connectionId'|'model'|'modelAccountId'|'serviceTier'>):boolean {
  if(!run)return false;
  return participantConnectionId!==choice.connectionId||run.model!==choice.model||run.modelAccountId!==choice.modelAccountId||run.serviceTier!==choice.serviceTier;
}

/** 状态行表达执行身份（智能体与模型）；来源账号只保留在模型设置和发送预览。 */
export function conversationRunIdentity(run:ConversationRun,connection:ConnectionView|undefined,catalog:CatalogModel[]):string {
  const restored=restoreModelSeriesChoice(run,catalog);
  const shared=catalog.find(model=>model.accountId===restored.modelAccountId&&model.modelId===restored.model);
  const sharedName=shared?(shared.provider==='custom'?(shared.accountLabel||'自定义供应商'):(shared.presentation?.quotaLabel||shared.presentation?.sourceLabel||modelSourceName(shared.provider))):undefined;
  const model=shared?sharedName+' / '+shared.label:selectedConversationModel(connection,run.model)?.label||run.model;
  const agent=connection?.provider===run.provider&&connection.label?connection.label:executionAgentName(run.provider);
  return [agent,model].filter(Boolean).join(' · ');
}

/** A legacy native choice must bind its own catalog source before selecting a tier. */
export function conversationTierChoice(choice:ConversationChoice,source:CatalogModel,tierId:string|undefined):ConversationChoice {
 const tier=source.serviceTiers?.find(item=>item.id===tierId);
 return {...choice,model:source.modelId,modelAccountId:source.accountId,modelAccountIdentity:source.accountIdentity,modelAccountRevision:source.accountRevision,
   serviceTier:tierId,reasoningEffort:tierReasoningEffort(tier,source.reasoningEfforts,choice.reasoningEffort)};
}

/** Never select a different subscription without an explicit user choice. */
export function officialConversationChoice(connection:ConnectionView|undefined,catalog:CatalogModel[]):ConversationChoice {
 const connectionId=connection?.id??'';
 const own=catalog.filter(item=>item.accountId==='native-'+connectionId&&item.available&&item.enabled!==false);
 const source=own.find(item=>item.modelId===connection?.models.find(model=>model.isDefault)?.id)??own[0];
 return source?{connectionId,model:source.modelId,modelAccountId:source.accountId,modelAccountRevision:source.accountRevision,modelAccountIdentity:source.accountIdentity,serviceTier:source.defaultServiceTier}:{connectionId};
}

/** 首条发送前把连接实际提供的原生账号绑定到选择；没有可证明的同名模型来源时保持原选择，不推断账号。 */
export function nativeConversationChoice(choice:ConversationChoice,connection:ConnectionView|undefined,catalog:CatalogModel[]):ConversationChoice {
  if(choice.modelAccountId||!choice.model)return choice;
  const model=choice.model??selectedConversationModel(connection)?.id??connection?.models[0]?.id;
  const source=catalog.find(item=>item.accountId==='native-'+choice.connectionId&&item.modelId===model&&item.available&&item.enabled!==false);
  return source?{...choice,model:model??source.modelId,modelAccountId:source.accountId,modelAccountRevision:source.accountRevision,modelAccountIdentity:source.accountIdentity,serviceTier:choice.serviceTier??source.defaultServiceTier}:choice;
}
