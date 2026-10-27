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
