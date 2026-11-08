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

export type ModelPickerGroup={id:string;label:string;options:{value:string;label:string;disabled?:boolean}[]};

/** 只按模型或来源名称过滤可见选项；分组标签匹配时保留该来源的完整选项。 */
export function filterModelGroups(groups:readonly ModelPickerGroup[],query:string):ModelPickerGroup[] {
  const needle=query.trim().toLocaleLowerCase();
  if(!needle)return groups.map(group=>({...group,options:[...group.options]}));
  return groups.map(group=>{
    const source=group.label.toLocaleLowerCase().includes(needle);
    return {...group,options:group.options.filter(option=>source||option.label.toLocaleLowerCase().includes(needle))};
  }).filter(group=>group.options.length>0);
}

export function modelSourceName(provider:string):string {
  const id=provider.replace(/^native-/, '');
  return ({codex:'Codex',openai:'ChatGPT API',dsh:'DSH',deepseek:'DeepSeek',qoder:'Qoder',devin:'Devin'} as Record<string,string>)[id]??provider;
}


/** Cycle only among tiers the selected model actually offers. */
export function nextServiceTier(tiers:ReadonlyArray<{id:string}>|undefined,current:string|undefined,fallback:string|undefined):string|undefined {
  if(!tiers?.length)return current;
  const selected=current??fallback??tiers[0]!.id;
  const index=tiers.findIndex(tier=>tier.id===selected);
  return tiers[(index+1+tiers.length)%tiers.length]!.id;
}

/** 切换档位保留已选推理强度；目标档位不提供该强度时回落继承，不发送无效值。 */
export function tierReasoningEffort(tier:{reasoningEfforts?:ReadonlyArray<{id:string}>}|undefined,fallback:ReadonlyArray<{id:string}>|undefined,effort:string|undefined):string|undefined {
  if(!effort)return effort;
  const options=tier?.reasoningEfforts??fallback;
  return options?.some(option=>option.id===effort)?effort:undefined;
}
