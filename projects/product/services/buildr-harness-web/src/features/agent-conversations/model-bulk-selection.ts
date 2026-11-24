interface ModelRow {
 id:string;label:string;family:string;available:boolean;enabled:boolean;
 upstreamProvider?:string;upstreamProviderLabel?:string;
 source:{id:string;providerLabel:string;status:string};
}

export function modelBulkSelection<T extends ModelRow>(rows:T[],query:string,filter:string,family:string,upstreamProvider='all'){
 const search=query.toLowerCase();
 const filtered=rows.filter(row=>(!search||`${row.label} ${row.source.providerLabel} ${row.upstreamProviderLabel??''}`.toLowerCase().includes(search))&&(filter==='all'||row.enabled===(filter==='enabled'))&&(family==='all'||family===row.family)&&(upstreamProvider==='all'||row.upstreamProvider===upstreamProvider));
 const editable=filtered.filter(row=>row.available&&row.source.status==='ready');
 const changes=(enabled:boolean)=>editable.filter(row=>row.enabled!==enabled).map(row=>({sourceId:row.source.id,modelId:row.id,enabled}));
 return {filtered,enabledCount:filtered.filter(row=>row.enabled).length,enable:changes(true),disable:changes(false)};
}
