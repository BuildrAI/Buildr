import { useLayoutEffect, useRef } from 'react';
import { ApartmentOutlined, CloseOutlined, RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { AgentStatus } from './ConversationSubagents.tsx';
import { subagentStatus, type Subagent } from './conversation-subagents.ts';

export function ConversationTurnSubagents({agents,onSelect,onOverview}: {agents:Subagent[];onSelect(id:string,trigger:HTMLElement):void;onOverview(trigger:HTMLElement,runId?:string):void}) {
  return <div className="ac-turn-subagents" aria-label="本轮子智能体">
    <span><ApartmentOutlined aria-hidden="true"/> 子智能体</span>
    {agents.slice(0,3).map(agent=><button key={agent.entry.id} type="button" data-subagent-summary={agent.entry.id}
      aria-label={`${agent.dispatch.label}，${subagentStatus[agent.dispatch.status]}`} title={agent.dispatch.label} onClick={event=>onSelect(agent.entry.id,event.currentTarget)}>
      <AgentStatus agent={agent} compact/><span>{agent.dispatch.label}</span>
    </button>)}
    {agents.length>3&&<button type="button" onClick={event=>onOverview(event.currentTarget,agents[0].entry.runId)}>另 {agents.length-3} 个</button>}
  </div>;
}

function excerpt(value:string) {
  const line=value.trim().replace(/\s+/g,' ');
  return line.length>140?line.slice(0,140)+'…':line;
}

type Props = {id:string;agents:readonly Subagent[];currentRunId?:string;focusRunId?:string;hasEarlier:boolean;loading:boolean;error:string;
  onLoadEarlier():void;onSelect(id:string):void;onClose():void};
export function ConversationSubagentOverview({id,agents,currentRunId,focusRunId,hasEarlier,loading,error,onLoadEarlier,onSelect,onClose}:Props) {
  const heading=useRef<HTMLHeadingElement>(null), focusedGroup=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    heading.current?.focus({preventScroll:true});
    focusedGroup.current?.scrollIntoView({block:'nearest'});
  },[focusRunId]);
  const byId=new Map(agents.map(row=>[row.entry.id,row]));
  const byRun=new Map<string,Subagent[]>();
  const children=new Map<string,Subagent[]>();
  for(const agent of agents){
    const key=agent.entry.runId!;
    const batch=byRun.get(key)??[];
    batch.push(agent);byRun.set(key,batch);
    if(agent.parent){const descendants=children.get(agent.parent)??[];descendants.push(agent);children.set(agent.parent,descendants);}
  }
  const groups=[...byRun].sort(([a,first],[b,second])=>a===currentRunId?-1:b===currentRunId?1:second[0].entry.sequence-first[0].entry.sequence);
  function row(agent:Subagent){
    const parent=agent.parent?byId.get(agent.parent):undefined;
    const summary=agent.entry.text.trim()?`结果：${excerpt(agent.entry.text)}`:agent.dispatch.prompt?.trim()?`要求：${excerpt(agent.dispatch.prompt)}`:undefined;
    const descendants=children.get(agent.entry.id);
    return <li key={agent.entry.id}>
      <button type="button" className="ac-subagent-overview-item" onClick={()=>onSelect(agent.entry.id)}>
        <span className="ac-subagent-overview-name"><strong>{agent.dispatch.label}</strong><AgentStatus agent={agent}/><RightOutlined aria-hidden="true"/></span>
        {summary&&<span className="ac-subagent-overview-summary">{summary}</span>}
        {agent.entry.parentToolId&&<small>派发自 {parent?.dispatch.label??'上一级子智能体（待确认）'}</small>}
      </button>
      {!!descendants?.length&&<ul>{descendants.map(row)}</ul>}
    </li>;
  }
  return <aside className="ac-subagent-pane" id={id} aria-labelledby={id+'-title'} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();onClose();}}}>
    <header className="ac-thread-header ac-subagent-pane-header">
      <h2 id={id+'-title'} ref={heading} tabIndex={-1}>子智能体总览</h2>
      <Button type="text" size="small" icon={<CloseOutlined aria-hidden="true"/>} aria-label="收起子智能体" title="收起子智能体" onClick={onClose}/>
    </header>
    <div className="ac-stream ac-subagent-overview" aria-label="对话的子智能体名单" tabIndex={0}>
      <p className="ac-subagent-overview-count" role="status">{hasEarlier?'已读到':'共 '}{agents.length} 个子智能体{hasEarlier?' · 还有更早记录':''}</p>
      {groups.map(([runId,members])=><section key={runId} ref={runId===focusRunId?focusedGroup:undefined} className="ac-subagent-overview-group">
        <h3>{runId===currentRunId?'本轮执行':new Date(members[0].entry.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' 的执行'}</h3>
        <ul>{members.filter(agent=>!agent.parent).map(row)}</ul>
      </section>)}
      {!agents.length&&!hasEarlier&&<p>这段对话没有已知的子智能体派发。</p>}
      {hasEarlier&&<div className="ac-subagent-overview-earlier">
        {error&&<p role="alert">{error}</p>}
        <Button size="small" loading={loading} onClick={onLoadEarlier}>读取更早记录</Button>
      </div>}
    </div>
  </aside>;
}
