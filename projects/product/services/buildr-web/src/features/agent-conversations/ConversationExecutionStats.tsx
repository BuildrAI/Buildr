import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import type { ConversationPage } from './api/agent-conversations-api';
export type ExecutionFilter={kind:'agent'|'model';value:string}|null;
type GroupProps={rows:Array<{label:string;count:number}>;filter:ExecutionFilter;onFilter(value:ExecutionFilter):void;compact:boolean;modelLabel?:(id:string)=>string};
function ExecutionStatsGroup({rows,filter,onFilter,compact,modelLabel}:GroupProps) {
  const chips=useRef<HTMLDivElement>(null),[maxHeight,setMaxHeight]=useState<number>();
  useLayoutEffect(()=>{
    const element=chips.current;if(!element||!compact)return;
    // Measure actual wrapped rows, not a guessed fixed height: two complete rows always fit.
    const measure=()=>{
      const origin=element.getBoundingClientRect().top;
      const boxes=[...element.querySelectorAll('button')].map(button=>{const box=button.getBoundingClientRect();return {top:Math.round(box.top-origin+element.scrollTop),bottom:box.bottom-origin+element.scrollTop};});
      const tops=[...new Set(boxes.map(box=>box.top))].sort((a,b)=>a-b);
      setMaxHeight(tops.length>2?Math.ceil(Math.max(...boxes.filter(box=>box.top<=tops[1]).map(box=>box.bottom)))+4:undefined);
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(element);for(const child of element.children)observer.observe(child);
    return()=>observer.disconnect();
  },[rows,compact,modelLabel]);
  return <div className="ac-stats-group"><span>按模型</span><div ref={chips} style={compact?{maxHeight}:undefined}>{rows.map(row=>{
    const label=modelLabel?.(row.label)??row.label,selected=filter?.kind==='model'&&filter.value===row.label;
    return <button key={row.label} type="button" title={label===row.label?label:`${label}（${row.label}）`} aria-label={`模型 ${label}，正在执行 ${row.count}`} aria-pressed={selected} onClick={()=>onFilter(selected?null:{kind:'model',value:row.label})}><span>{label}</span><b>{row.count}</b></button>;
  })}</div></div>;
}
export function ConversationExecutionStats({stats,filter,onFilter,description,status,compact=false,modelLabel}:{compact?:boolean;status?:'ready'|'unknown'|'error';description?:string;stats:ConversationPage['stats'];filter:ExecutionFilter;onFilter(value:ExecutionFilter):void;modelLabel?:(id:string)=>string}) {
  const [expanded,setExpanded]=useState(true),count=stats?.models.reduce((sum,item)=>sum+item.count,0)??0;
  if(status==='error'||status==='unknown'||!stats)return <section className="ac-execution-stats" aria-label="执行统计"><header><strong>{status==='error'?'执行统计暂时无法读取':'执行统计尚未确认'}</strong></header></section>;
  return <section className={'ac-execution-stats'+(compact?' is-compact':'')} aria-label="执行统计"><header><strong>{count?<>正在执行 <b>{count}</b></>:'当前没有正在执行的对话'}</strong>{count>0&&<Button size="small" type="text" icon={expanded?<UpOutlined/>:<DownOutlined/>} aria-label={expanded?'收起执行统计':'展开执行统计'} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}/>}</header>{count>0&&expanded&&<><div className="ac-stats-groups"><ExecutionStatsGroup rows={stats.models} filter={filter} onFilter={onFilter} compact={compact} modelLabel={modelLabel}/></div>{description&&<p>{description}</p>}</>}</section>;
}
