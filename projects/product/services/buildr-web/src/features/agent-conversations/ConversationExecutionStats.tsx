import { useState } from 'react';
import { Button } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import type { ConversationPage } from './api/agent-conversations-api';
export type ExecutionFilter={kind:'agent'|'model';value:string}|null;
export function ConversationExecutionStats({stats,filter,onFilter}:{stats:ConversationPage['stats'];filter:ExecutionFilter;onFilter(value:ExecutionFilter):void}) {
  const [expanded,setExpanded]=useState(true),count=stats?.agents.reduce((sum,item)=>sum+item.count,0)??0;
  const providers:Record<string,string>={codex:'Codex',dsh:'DSH',qoder:'Qoder'};
  const group=(kind:'agent'|'model',rows:Array<{label:string;count:number}>)=><div className="ac-stats-group"><span>{kind==='agent'?'按智能体':'按模型'}</span><div>{rows.map(row=><button key={row.label} type="button" aria-label={`${kind==='agent'?'智能体':'模型'} ${kind==='agent'?providers[row.label]??row.label:row.label}，正在执行 ${row.count}`} aria-pressed={filter?.kind===kind&&filter.value===row.label} onClick={()=>onFilter(filter?.kind===kind&&filter.value===row.label?null:{kind,value:row.label})}><span>{kind==='agent'?providers[row.label]??row.label:row.label}</span><b>{row.count}</b></button>)}</div></div>;
  return <section className="ac-execution-stats" aria-label="执行统计"><header><strong>{count?<>正在执行 <b>{count}</b></>:'当前没有正在执行的对话'}</strong>{count>0&&<Button size="small" type="text" icon={expanded?<UpOutlined/>:<DownOutlined/>} aria-label={expanded?'收起执行统计':'展开执行统计'} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}/>}</header>{count>0&&expanded&&<><div className="ac-stats-groups">{group('agent',stats?.agents??[])}{group('model',stats?.models??[])}</div><p>仅统计所选空间中正在执行的对话</p></>}</section>;
}
