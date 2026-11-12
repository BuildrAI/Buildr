export type CustomProviderProtocol='chat-completions'|'responses'|'anthropic-messages'|'gemini';
export interface CustomProviderModelInput {id:string;label?:string;contextWindow?:number;}
export interface CustomProviderSaveInput {accountId?:string;label:string;baseUrl:string;protocol:CustomProviderProtocol;useApiKey:boolean;apiKey?:string;models:CustomProviderModelInput[];sourceEnabled:boolean;}
export interface CustomProviderDiscoverInput {accountId?:string;baseUrl:string;protocol:CustomProviderProtocol;useApiKey:boolean;apiKey?:string;}
export interface CustomProviderDiscoverResult {models:Array<{id:string;label?:string}>;diagnostic?:string;}

export const CUSTOM_PROVIDER_PROTOCOLS:ReadonlyArray<{value:CustomProviderProtocol;label:string}>=[
  {value:'chat-completions',label:'OpenAI 兼容 Chat Completions'},
  {value:'responses',label:'OpenAI Responses'},
  {value:'anthropic-messages',label:'Anthropic Messages'},
  {value:'gemini',label:'Gemini'},
];

/** Show the request path the selected protocol actually calls; discovery always uses `<Base URL>/models`. */
export function customProviderEndpoint(protocol:CustomProviderProtocol,baseUrl:string):string{
  const base=baseUrl.trim().replace(/\/+$/,'')||'<Base URL>';
  if(protocol==='chat-completions')return `${base}/chat/completions`;
  if(protocol==='responses')return `${base}/responses`;
  if(protocol==='anthropic-messages')return `${base}/messages`;
  return `${base}/models/<模型 ID>:generateContent`;
}

/** Joining an existing id keeps its label, window and preferences while filling missing details. */
export function upsertCustomModel(models:CustomProviderModelInput[],entry:CustomProviderModelInput):CustomProviderModelInput[]{
  const id=entry.id.trim(),label=entry.label?.trim(),index=models.findIndex(model=>model.id===id);
  if(!id)return models;
  const existing=index<0?undefined:models[index];
  const next:CustomProviderModelInput={id,...(label?{label}:existing?.label?{label:existing.label}:{}),...(entry.contextWindow!==undefined?{contextWindow:entry.contextWindow}:existing?.contextWindow!==undefined?{contextWindow:existing.contextWindow}:{})};
  return index<0?[...models,next]:models.map((model,position)=>position===index?next:model);
}

export function removeCustomModel(models:CustomProviderModelInput[],id:string):CustomProviderModelInput[]{
  return models.filter(model=>model.id!==id);
}
