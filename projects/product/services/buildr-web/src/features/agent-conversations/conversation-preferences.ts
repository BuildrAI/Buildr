import type {CatalogModel,ConnectionView} from './types.ts';
import {conversationModelCompatibility,officialConversationChoice,type ConversationChoice,type PermissionMode} from './conversation-options.ts';

type PreferenceStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type ConversationModulePreference={version:1;agent?:{connectionId:string};permission?:{mode:PermissionMode;workspaceId?:string}};
export type ConversationModelPreference={version:1;connectionId:string;model?:string;modelAccountId?:string;serviceTier?:string;reasoningEffort?:string};

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
 return {
  version:1,
  ...(typeof connectionId==='string'&&connectionId?{agent:{connectionId}}:{}),
  ...(mode==='default'||mode==='full-access'?{permission:{mode,...(typeof permission?.workspaceId==='string'&&permission.workspaceId?{workspaceId:permission.workspaceId}:{})}}:{}),
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
 return {...preference,permission:{mode,...(mode==='full-access'&&workspaceId?{workspaceId}:{})}};
}

export function readConversationModelPreference(storage:PreferenceStorage|undefined=defaultStorage(),profile=webProfile()):ConversationModelPreference|null{
 const value=parsed(stored(storage,conversationPreferenceKeys(profile).model));
 const connectionId=optionalString(value?.connectionId);
 if(value?.version!==1||!connectionId)return null;
 const model=optionalString(value.model),modelAccountId=optionalString(value.modelAccountId),serviceTier=optionalString(value.serviceTier),reasoningEffort=optionalString(value.reasoningEffort);
 return {version:1,connectionId,...(model?{model}:{}),...(modelAccountId?{modelAccountId}:{}),...(serviceTier?{serviceTier}:{}),...(reasoningEffort?{reasoningEffort}:{})};
}
export function modelPreferenceFromChoice(choice:ConversationChoice):ConversationModelPreference|null{
 if(!choice.connectionId)return null;
 return {version:1,connectionId:choice.connectionId,...(choice.model?{model:choice.model}:{}),...(choice.modelAccountId?{modelAccountId:choice.modelAccountId}:{}),...(choice.serviceTier?{serviceTier:choice.serviceTier}:{}),...(choice.reasoningEffort?{reasoningEffort:choice.reasoningEffort}:{})};
}
export function writeConversationModelPreference(preference:ConversationModelPreference|null,storage:PreferenceStorage|undefined=defaultStorage(),profile=webProfile()):boolean{
 try{
  const key=conversationPreferenceKeys(profile).model;
  if(preference)storage?.setItem(key,JSON.stringify(preference));else storage?.removeItem(key);
  return Boolean(storage);
 }catch{return false;}
}

export function rememberedConversationAgent(preference:ConversationModulePreference,connections:ConnectionView[]):ConnectionView|undefined{
 const remembered=preference.agent?.connectionId?connections.find(connection=>connection.id===preference.agent!.connectionId&&connection.enabled):undefined;
 return remembered??connections.find(connection=>connection.status==='ready')??connections[0];
}
export function rememberedConversationPermission(preference:ConversationModulePreference,workspaceId:string):PermissionMode{
 const selected=preference.permission;
 if(!selected||selected.mode==='default')return 'default';
 return selected.workspaceId&&workspaceId&&selected.workspaceId===workspaceId?'full-access':'default';
}

function selectableModel(connection:ConnectionView,catalog:CatalogModel[],preference:ConversationModelPreference){
 if(preference.model&&preference.modelAccountId){
  const source=catalog.find(model=>model.accountId===preference.modelAccountId&&model.modelId===preference.model&&model.available&&model.enabled!==false);
  if(!source||conversationModelCompatibility(connection,source))return;
  const tier=source.serviceTiers?.find(item=>item.id===preference.serviceTier)?preference.serviceTier:source.defaultServiceTier;
  const efforts=tier?source.serviceTiers?.find(item=>item.id===tier)?.reasoningEfforts:source.reasoningEfforts;
  return {choice:{connectionId:connection.id,model:source.modelId,modelAccountId:source.accountId,modelAccountRevision:source.accountRevision,modelAccountIdentity:source.accountIdentity,serviceTier:tier,reasoningEffort:preference.reasoningEffort&&efforts?.some(item=>item.id===preference.reasoningEffort)?preference.reasoningEffort:undefined} satisfies ConversationChoice};
 }
 if(preference.model){
  const native=connection.models.find(model=>model.id===preference.model);
  if(native)return {choice:{connectionId:connection.id,model:native.id} satisfies ConversationChoice};
 }
}

/** Resolve only new-conversation memory; existing conversations keep their observed run. */
export function preferredConversationChoice(modulePreference:ConversationModulePreference,modelPreference:ConversationModelPreference|null,connections:ConnectionView[],catalog:CatalogModel[]):ConversationChoice|undefined{
 const connection=rememberedConversationAgent(modulePreference,connections);
 if(!connection)return;
 if(modelPreference?.connectionId===connection.id){
  const selected=selectableModel(connection,catalog,modelPreference);
  if(selected)return selected.choice;
 }
 return officialConversationChoice(connection,catalog);
}
