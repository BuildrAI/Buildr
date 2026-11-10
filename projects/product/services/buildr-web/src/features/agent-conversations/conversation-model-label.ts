import type { CatalogModel, ConnectionView } from './types';

/** Use the same catalog labels as the selector; identifiers remain query keys, never guessed names. */
export function conversationModelLabel(model:string|undefined,connections:ConnectionView[],catalog:CatalogModel[],identity?:{connectionId?:string;modelAccountId?:string}):string {
  if(!model||model==='未指定')return '模型未记录';
  if(identity?.modelAccountId){
    const bound=catalog.find(item=>item.accountId===identity.modelAccountId&&item.modelId===model);
    if(bound)return bound.label;
  }
  if(identity?.connectionId){
    const native=connections.find(item=>item.id===identity.connectionId)?.models.find(item=>item.id===model);
    if(native)return native.label;
  }
  const names=new Set([
    ...connections.flatMap(connection=>connection.models.filter(item=>item.id===model).map(item=>item.label)),
    ...catalog.filter(item=>item.modelId===model).map(item=>item.label),
  ]);
  return names.size===1?[...names][0]:'模型名称待确认';
}

/** Brand comes from the bound catalog provider, never from account display text. */
export function conversationModelSourceLabel(accountId:string,catalog:CatalogModel[]):string {
  const provider=catalog.find(item=>item.accountId===accountId)?.provider.replace(/^native-/, '');
  return provider?({codex:'ChatGPT',devin:'Devin',dsh:'DSH',qoder:'Qoder',deepseek:'DeepSeek'} as Record<string,string>)[provider]??provider:'来源未记录';
}
