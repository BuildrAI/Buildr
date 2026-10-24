import type {ConnectionView, ConversationRun, SendDraft} from './types';

export type ConversationChoice = Pick<SendDraft,'connectionId'|'model'|'reasoningEffort'>;
export type PermissionMode=NonNullable<SendDraft['permissionMode']>;
export const permissionModeLabels:Record<PermissionMode,string>={default:'默认权限','full-access':'完全访问'};

export function conversationPermissionKey(scope:{workspaceId:string;conversationId:string}|null,generation:number):string {
  return scope?JSON.stringify([scope.workspaceId,scope.conversationId]):`new:${generation}`;
}
export function conversationPermissionStorageKey(profile:string,scope:{workspaceId:string;conversationId:string}|null):string|null {
  return scope?`buildr.agent-conversation.permission:${encodeURIComponent(profile)}:${encodeURIComponent(scope.workspaceId)}:${encodeURIComponent(scope.conversationId)}`:null;
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
  return model?.reasoningEfforts||[];
}

export function conversationReasoningSelection(connection:ConnectionView|undefined,choice:ConversationChoice) {
  const model=selectedConversationModel(connection,choice.model);
  const options=conversationReasoningOptions(connection,choice.model);
  const id=choice.reasoningEffort ?? model?.defaultReasoningEffort;
  const index=options.findIndex(option=>option.id===id);
  return {options,index,inherited:choice.reasoningEffort===undefined,label:index>=0?reasoningEffortLabel(options[index]!):choice.reasoningEffort||'默认'};
}

export function reasoningEffortLabel(effort:{id:string;label:string}) {
  const labels:Record<string,string>={minimal:'最小',low:'低',medium:'中',high:'高',xhigh:'极高',max:'最高',ultra:'极致',none:'无',off:'关闭',auto:'自动'};
  return labels[effort.id]||effort.label;
}
