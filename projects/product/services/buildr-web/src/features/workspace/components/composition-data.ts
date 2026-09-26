export type CompositionSource = 'projects'|'services'|'repositories';
export type CompositionStatus = 'complete'|'partial'|'unavailable';
export type CompositionObject = {id:string;name:string;description?:string;code:string;unavailable?:boolean};
export type CompositionData = {projects:Array<CompositionObject & {serviceIds?:string[]}>;services:Array<CompositionObject & {repositoryId?:string}>;repositories:CompositionObject[];sources?:Record<CompositionSource,CompositionStatus>};
export const emptyComposition:CompositionData={projects:[],services:[],repositories:[]};

/** Failed sources retain observed objects until a complete read can replace them. */
export function retainComposition<T extends CompositionData>(previous:T|null,next:T):T {
  if(!previous)return next;
  const result={...next};
  for(const source of ['projects','services','repositories'] as const){
    if(next.sources?.[source] && next.sources[source]!=='complete'){
      const items=new Map(previous[source].map(item=>[item.id,item]));
      for(const item of next[source])items.set(item.id,item);
      result[source]=[...items.values()];
    }
  }
  return result;
}

/** A registered reference remains visible even when its target cannot be read. */
export function compositionWithReferences(data:CompositionData):CompositionData {
  const services=new Map(data.services.map(s=>[s.id,s]));
  for(const project of data.projects)for(const id of project.serviceIds||[])if(!services.has(id))services.set(id,{id,code:id,name:'服务信息不可读取',description:'已登记此引用，暂时无法查看详情。',unavailable:true});
  const repositories=new Map(data.repositories.map(r=>[r.id,r]));
  for(const service of services.values())if(service.repositoryId&&!repositories.has(service.repositoryId))repositories.set(service.repositoryId,{id:service.repositoryId,code:service.repositoryId,name:'代码库信息不可读取',description:'已登记此引用，暂时无法查看详情。',unavailable:true});
  return {...data,services:[...services.values()],repositories:[...repositories.values()]};
}
