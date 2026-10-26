import type {ConnectionView, ConversationRun, SendDraft, CatalogModel} from './types';

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
export function selectedConversationPermission(selected:PermissionMode|undefined,run:ConversationRun|undefined):PermissionMode {
  return selected??run?.permissionMode??'default';
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

export function conversationReasoningSelection(connection:ConnectionView|undefined,choice:ConversationChoice) {
  const model=selectedConversationModel(connection,choice.model);
  const options=conversationReasoningOptions(connection,choice.model);
  const id=choice.reasoningEffort ?? model?.defaultReasoningEffort;
  const index=options.findIndex(option=>option.id===id);
  const ranks=options.map(option=>reasoningEffortRank(option.id));
  const ordered=options.length>1&&ranks.every(rank=>rank!==undefined)&&new Set(ranks).size===ranks.length;
  return {options,index,ordered,inherited:choice.reasoningEffort===undefined,label:index>=0?reasoningEffortLabel(options[index]!):choice.reasoningEffort||'默认'};
}

export function reasoningEffortLabel(effort:{id:string;label:string}) {
  const labels:Record<string,string>={minimal:'最小',low:'低',medium:'中',high:'高',xhigh:'极高',max:'最高',ultra:'极致',none:'无',off:'关闭',disabled:'关闭',auto:'自动',adaptive:'自适应'};
  return labels[effort.id]||effort.label;
}

/** Rank only explicit depth values. Auto/adaptive/unknown choices are not depth steps. */
export function reasoningEffortRank(id:string):number|undefined {
  const ranks:Record<string,number>={off:0,none:0,disabled:0,minimal:1,low:2,medium:3,high:4,xhigh:5,max:6,ultra:7};
  return ranks[id.toLowerCase()];
}
export function sortReasoningEfforts<T extends {id:string}>(options:readonly T[]):T[]{
  return options.map((value,index)=>({value,index,rank:reasoningEffortRank(value.id)})).sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.index-b.index).map(item=>item.value);
}

export function modelSourceName(provider:string):string {
  const id=provider.replace(/^native-/, '');
  return ({codex:'Codex',dsh:'DSH',deepseek:'DeepSeek',qoder:'Qoder',devin:'Devin'} as Record<string,string>)[id]??provider;
}

/** 状态行表达执行身份（智能体与模型）；来源账号只保留在模型设置和发送预览。 */
export function conversationRunIdentity(run:ConversationRun,connection:ConnectionView|undefined,catalog:CatalogModel[]):string {
  const shared=catalog.find(model=>model.accountId===run.modelAccountId&&model.modelId===run.model);
  const model=shared?modelSourceName(shared.provider)+' / '+shared.label:selectedConversationModel(connection,run.model)?.label||run.model;
  return [modelSourceName(run.provider),model].filter(Boolean).join(' · ');
}

/** Never select a different subscription without an explicit user choice. */
export function officialConversationChoice(connection:ConnectionView|undefined,catalog:CatalogModel[]):ConversationChoice {
 const connectionId=connection?.id??'';
 const own=catalog.filter(item=>item.accountId==='native-'+connectionId&&item.available&&item.enabled!==false);
 const source=own.find(item=>item.modelId===connection?.models.find(model=>model.isDefault)?.id)??own[0];
 return source?{connectionId,model:source.modelId,modelAccountId:source.accountId,modelAccountRevision:source.accountRevision,modelAccountIdentity:source.accountIdentity,serviceTier:source.defaultServiceTier}:{connectionId};
}
