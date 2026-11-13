import type {CatalogModel,ConnectionView} from './types.ts';
import {catalogModelCompatibility,choiceReasoningOptions,selectedConversationModel,type ConversationChoice,type PermissionMode} from './conversation-options.ts';

type PreferenceStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type ConversationModulePreference={version:1;agent?:{connectionId:string};permission?:{mode?:PermissionMode;workspaceId?:string;workspaces?:Record<string,PermissionMode>}};
export type ConversationModelPreference={version:1;connectionId:string;model?:string;modelAccountId?:string;modelAccountIdentity?:string;serviceTier?:string;reasoningEffort?:string;byConnection?:Record<string,ConversationModelPreference>};

const emptyModule=():ConversationModulePreference=>({version:1});
const webProfile=()=>typeof document==='undefined'?'local':document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content')||'local';
const defaultStorage=():PreferenceStorage|undefined=>{try{return typeof localStorage==='undefined'?undefined:localStorage;}catch{return;}};
const stored=(storage:PreferenceStorage|undefined,key:string):string|null=>{try{return storage?.getItem(key)??null;}catch{return null;}};

export function conversationPreferenceKeys(profile=webProfile()){
 const suffix=encodeURIComponent(profile||'local');
 return {module:`buildr.agent-conversation.preference:${suffix}`,model:`buildr.agent-conversation.model-preference:${suffix}`};
}
function parsed(value:string|null):Record<string,unknown>|undefined{
 if(!value)return;
 try{const result=JSON.parse(value);return result&&typeof result==='object'&&!Array.isArray(result)?result as Record<string,unknown>:undefined;}catch{return;}
}
const object=(value:unknown):Record<string,unknown>|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
function optionalString(value:unknown):string|undefined{return typeof value==='string'&&value.trim()?value.trim():undefined;}

export function readConversationModulePreference(storage:PreferenceStorage|undefined=defaultStorage(),profile=webProfile()):ConversationModulePreference{
 const value=parsed(stored(storage,conversationPreferenceKeys(profile).module));
 if(value?.version!==1)return emptyModule();
 const connectionId=optionalString(object(value.agent)?.connectionId);
 const permission=object(value.permission);
 const mode=permission?.mode;
 const workspacesIn=object(permission?.workspaces);
 const workspaces=workspacesIn?Object.fromEntries(Object.entries(workspacesIn).filter((entry):entry is [string,PermissionMode]=>entry[1]==='default'||entry[1]==='full-access')):undefined;
 const hasWorkspaces=Boolean(workspaces&&Object.keys(workspaces).length);
 return {
  version:1,
  ...(typeof connectionId==='string'&&connectionId?{agent:{connectionId}}:{}),
  ...((mode==='default'||mode==='full-access'||hasWorkspaces)?{permission:{...(mode==='default'||mode==='full-access'?{mode}:{}) ,...(typeof permission?.workspaceId==='string'&&permission.workspaceId?{workspaceId:permission.workspaceId}:{}) ,...(hasWorkspaces?{workspaces}:{})}}:{}),
 };
}
export function writeConversationModulePreference(preference:ConversationModulePreference,storage:PreferenceStorage|undefined=defaultStorage(),profile=webProfile()):boolean{
 try{storage?.setItem(conversationPreferenceKeys(profile).module,JSON.stringify(preference));return Boolean(storage);}catch{return false;}
}
export function rememberConversationAgent(preference:ConversationModulePreference,connectionId:string):ConversationModulePreference{
 if(connectionId)return {...preference,agent:{connectionId}};
 const next={...preference};delete next.agent;return next;
}
export function rememberConversationPermission(preference:ConversationModulePreference,mode:PermissionMode,workspaceId?:string):ConversationModulePreference{
 if(!workspaceId)return {...preference,permission:{...preference.permission,mode}};
 const prior=preference.permission;
 const workspaces={...prior?.workspaces};
 // 迁移旧单槽的明确选择，避免切换空间时覆盖它。
 if(prior?.workspaceId&&prior.mode&&!Object.hasOwn(workspaces,prior.workspaceId))workspaces[prior.workspaceId]=prior.mode;
 workspaces[workspaceId]=mode;
 return {...preference,permission:{mode,workspaceId,workspaces}};
}

const volatileModelPreferences=new Map<string,ConversationModelPreference>();
function parseModelPreference(value:Record<string,unknown>|undefined):ConversationModelPreference|null{
 const connectionId=optionalString(value?.connectionId);if(value?.version!==1||!connectionId)return null;
 const model=optionalString(value.model),modelAccountId=optionalString(value.modelAccountId),modelAccountIdentity=optionalString(value.modelAccountIdentity),serviceTier=optionalString(value.serviceTier),reasoningEffort=optionalString(value.reasoningEffort);
 return {version:1,connectionId,...(model?{model}:{}),...(modelAccountId?{modelAccountId}:{}),...(modelAccountIdentity?{modelAccountIdentity}:{}),...(serviceTier?{serviceTier}:{}),...(reasoningEffort?{reasoningEffort}:{})};
}
export function readConversationModelPreference(storage:PreferenceStorage|undefined=defaultStorage(),profile=webProfile()):ConversationModelPreference|null{
 const volatile=volatileModelPreferences.get(profile);if(volatile)return volatile;
 const value=parsed(stored(storage,conversationPreferenceKeys(profile).model));
 if(value?.version===2){
  const entries=object(value.connections)??{};
  const byConnection=Object.fromEntries(Object.entries(entries).flatMap(([id,raw])=>{const p=parseModelPreference(object(raw));return p?.connectionId===id?[[id,p]]:[];}));
  const last=typeof value.lastConnectionId==='string'?byConnection[value.lastConnectionId]:undefined;
  return last?{...last,byConnection}:null;
 }
 return parseModelPreference(value)??volatileModelPreferences.get(profile)??null;
}
export function modelPreferenceFromChoice(choice:ConversationChoice):ConversationModelPreference|null{
 if(!choice.connectionId)return null;
 return {version:1,connectionId:choice.connectionId,...(choice.model?{model:choice.model}:{}),...(choice.modelAccountId?{modelAccountId:choice.modelAccountId}:{}),...(choice.modelAccountIdentity?{modelAccountIdentity:choice.modelAccountIdentity}:{}),...(choice.serviceTier?{serviceTier:choice.serviceTier}:{}),...(choice.reasoningEffort?{reasoningEffort:choice.reasoningEffort}:{})};
}
export function writeConversationModelPreference(preference:ConversationModelPreference|null,storage:PreferenceStorage|undefined=defaultStorage(),profile=webProfile()):boolean{
 if(!preference?.model)return false; // Empty/invalid selections never erase the last explicit model.
 const previous=readConversationModelPreference(storage,profile);
 const byConnection={...(previous?.byConnection??(previous?{[previous.connectionId]:previous}:{}))};
 const {byConnection:_,...selected}=preference;byConnection[selected.connectionId]=selected;
 const next={...selected,byConnection};
 try{storage?.setItem(conversationPreferenceKeys(profile).model,JSON.stringify({version:2,lastConnectionId:selected.connectionId,connections:byConnection}));if(storage){volatileModelPreferences.delete(profile);return true;}}catch{}
 volatileModelPreferences.set(profile,next);return false;
}

export function rememberedConversationAgent(preference:ConversationModulePreference,connections:ConnectionView[]):ConnectionView|undefined{
 const remembered=preference.agent?.connectionId?connections.find(connection=>connection.id===preference.agent!.connectionId&&connection.enabled):undefined;
 return remembered??connections.find(connection=>connection.status==='ready')??connections[0];
}
export function rememberedConversationPermission(preference:ConversationModulePreference,workspaceId:string):PermissionMode{
 const selected=preference.permission;
 const scoped=selected?.workspaces?.[workspaceId];
 if(scoped==='default'||scoped==='full-access')return scoped;
 // 旧单槽偏好只应用到原空间；旧全局默认选择仍然有效。
 if(selected?.workspaceId===workspaceId&&selected.mode)return selected.mode;
 if(selected?.mode==='default'&&!selected.workspaceId)return 'default';
 return 'full-access';
}

function selectableModel(connection:ConnectionView,catalog:CatalogModel[],preference:ConversationModelPreference):{choice:ConversationChoice}|undefined{
 if(preference.model&&preference.modelAccountId){
  const source=catalog.find(model=>model.accountId===preference.modelAccountId&&model.modelId===preference.model&&model.available&&model.enabled!==false);
  if(!source||!catalogModelCompatibility(connection,source).compatible||preference.modelAccountIdentity&&preference.modelAccountIdentity!==source.accountIdentity)return;
  const tier=source.serviceTiers?.find(item=>item.id===preference.serviceTier)?preference.serviceTier:source.defaultServiceTier;
  const efforts=source.serviceTiers?.find(item=>item.id===tier)?.reasoningEfforts??source.reasoningEfforts;
  return {choice:{connectionId:connection.id,model:source.modelId,modelAccountId:source.accountId,modelAccountRevision:source.accountRevision,modelAccountIdentity:source.accountIdentity,serviceTier:tier,reasoningEffort:preference.modelAccountIdentity&&preference.modelAccountIdentity===source.accountIdentity&&preference.reasoningEffort&&efforts?.some(item=>item.id===preference.reasoningEffort)?preference.reasoningEffort:undefined} satisfies ConversationChoice};
 }
 if(preference.model){
  const source=catalog.find(item=>item.accountId==='native-'+connection.id&&item.modelId===preference.model&&item.available&&item.enabled!==false);
  if(source){
   const selected=selectableModel(connection,catalog,{...preference,modelAccountId:source.accountId});
   if(selected&&!preference.modelAccountIdentity)selected.choice.reasoningEffort=source.reasoningEfforts?.some(option=>option.id===preference.reasoningEffort)?preference.reasoningEffort:undefined;
   return selected;
  }
 }
}

/** Resolve only new-conversation memory; existing conversations keep their observed run. */
export function preferredConversationChoice(modulePreference:ConversationModulePreference,modelPreference:ConversationModelPreference|null,connections:ConnectionView[],catalog:CatalogModel[]):ConversationChoice|undefined{
 const connection=rememberedConversationAgent(modulePreference,connections);
 if(!connection)return;
 const remembered=modelPreference?.byConnection?.[connection.id]??(modelPreference?.connectionId===connection.id?modelPreference:null);
 if(remembered){
  const selected=selectableModel(connection,catalog,remembered);
  if(selected)return restoreReasoningChoice(selected.choice,connection,catalog);
 }
 return {connectionId:connection.id};
}

// 每个身份使用独立存储项，多个选择器或标签页写入不同模型时不会覆盖整张表。
const volatileReasoningMemory=new Map<string,string>();
export function reasoningMemoryKey(choice:ConversationChoice,profile=webProfile()):string|undefined{
 if(!choice.connectionId||!choice.model)return;
 return `buildr.agent-conversation.reasoning-effort:${encodeURIComponent(profile||'local')}:${encodeURIComponent(JSON.stringify([choice.connectionId,choice.modelAccountId||'',choice.modelAccountIdentity||'',choice.model]))}`;
}
export function rememberReasoningEffort(choice:ConversationChoice,effort:string,storage:PreferenceStorage|undefined=defaultStorage(),profile=webProfile()):boolean{
 const key=reasoningMemoryKey(choice,profile);
 if(!key||!effort)return false;
 try{if(storage){storage.setItem(key,effort);volatileReasoningMemory.delete(key);return true;}}catch{/* 存储不可写时在当前页面继续记住。 */}
 volatileReasoningMemory.set(key,effort);
 return false;
}
export function restoreReasoningChoice(choice:ConversationChoice,connection:ConnectionView|undefined,catalog:CatalogModel[],storage:PreferenceStorage|undefined=defaultStorage(),profile=webProfile()):ConversationChoice{
 const model=choice.model??selectedConversationModel(connection)?.id??connection?.models[0]?.id;
 const nativeSource=!choice.modelAccountId?catalog.find(item=>item.accountId==='native-'+choice.connectionId&&item.modelId===model):undefined;
 const key=reasoningMemoryKey({...choice,model,...(nativeSource?{modelAccountId:nativeSource.accountId,modelAccountIdentity:nativeSource.accountIdentity}:{})},profile);
 if(!key)return choice;
 const effort=volatileReasoningMemory.get(key)??stored(storage,key);
 if(!effort)return choice;
 const options=choiceReasoningOptions(choice,connection,catalog);
 return {...choice,reasoningEffort:options?.some(item=>item.id===effort)?effort:undefined};
}
