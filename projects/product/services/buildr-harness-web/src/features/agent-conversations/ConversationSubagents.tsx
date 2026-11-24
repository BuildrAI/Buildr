import { useLayoutEffect, useRef, useState } from 'react';
import { ApartmentOutlined, ArrowLeftOutlined, CloseOutlined, RightOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { MarkdownHost } from '../../components/MarkdownHost.tsx';
import type { MarkdownRenderOptions } from '../../markdown.ts';
import { ConversationProcessBlock } from './ConversationProcessBlock.tsx';
import { ConversationTurn } from './ConversationTurn.tsx';
import { executionAgentName } from './conversation-options.ts';
import { subagentStatus, subagentStream, type Subagent } from './conversation-subagents.ts';
import type { ConversationEntry } from './types.ts';
import './conversation-subagents.css';

export function AgentStatus({ agent, compact=false }: { agent: Subagent; compact?:boolean }) {
  return <span className="ac-subagent-status" data-status={agent.dispatch.status} title={compact?subagentStatus[agent.dispatch.status]:undefined}><i aria-hidden="true"/>{!compact&&subagentStatus[agent.dispatch.status]}</span>;
}

export function SubagentDispatchCard({agent,active,onOpen}: {agent:Subagent;active:boolean;onOpen:(trigger:HTMLElement)=>void}) {
  return <button type="button" className="ac-subagent-dispatch" data-subagent-dispatch={agent.entry.id} aria-expanded={active} onClick={event=>onOpen(event.currentTarget)}>
    <ApartmentOutlined aria-hidden="true"/><span className="ac-subagent-dispatch-label">派发给 <strong>{agent.dispatch.label}</strong></span>
    <AgentStatus agent={agent}/><RightOutlined aria-hidden="true"/>
  </button>;
}

type Props = {
  id: string; agents: Subagent[]; agent: Subagent; onSelect(id:string):void; onOverview():void; onClose(locate?:boolean):void;
  onOpenFile(path:string):void; loadEntry(entry:ConversationEntry,signal?:AbortSignal):Promise<ConversationEntry>;
  markdownOptions: MarkdownRenderOptions;
};
export function ConversationSubagentPane({id,agents,agent,onSelect,onOverview,onClose,onOpenFile,loadEntry,markdownOptions}:Props) {
  const heading=useRef<HTMLHeadingElement>(null), scroll=useRef<HTMLDivElement>(null), content=useRef<HTMLDivElement>(null);
  const positions=useRef(new Map<string,number>()), follow=useRef(true), pendingDispatch=useRef<string>(undefined);
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  const parent=agents.find(row=>row.entry.id===agent.parent);
  const childId=agent.entry.id;
  const running=agent.dispatch.status==='running';
  const groups=subagentStream(agent,agents);
  const liveToolId=running&&agent.process.at(-1)?.kind==='tool'&&agent.process.at(-1)?.status==='running'?agent.process.at(-1)?.id:null;
  const select=(id:string)=>{if(scroll.current)positions.current.set(childId,scroll.current.scrollTop);onSelect(id);};
  useLayoutEffect(()=>{
    const node=scroll.current;
    if(!node)return;
    node.scrollTop=positions.current.get(childId)??0;
    const target=pendingDispatch.current;
    pendingDispatch.current=undefined;
    const dispatch=target?node.querySelector<HTMLButtonElement>(`[data-subagent-dispatch="${CSS.escape(target)}"]`):null;
    if(dispatch){dispatch.scrollIntoView({block:'nearest'});dispatch.focus({preventScroll:true});}
    else heading.current?.focus({preventScroll:true});
    const nearEnd=()=>node.scrollHeight-node.clientHeight-node.scrollTop<36;
    follow.current=nearEnd();
    const observer=new ResizeObserver(()=>{if(follow.current)node.scrollTop=node.scrollHeight;});
    if(content.current)observer.observe(content.current);
    return ()=>observer.disconnect();
  },[childId]);
  const returnToDispatch=()=>{
    if(!parent){onClose(true);return;}
    pendingDispatch.current=childId;
    select(parent.entry.id);
  };
  return <aside id={id} className="ac-subagent-pane" aria-labelledby={id+'-title'} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();onClose();}}}>
    <header className="ac-thread-header ac-subagent-pane-header">
      <Button type="text" size="small" aria-label="回到派发" title="回到派发" icon={<ArrowLeftOutlined aria-hidden="true"/>} onClick={returnToDispatch}/>
      <h2 id={id+'-title'} ref={heading} tabIndex={-1}>{agent.dispatch.label}</h2>
      <div className="ac-thread-actions">
        <Button type="text" size="small" className="ac-subagent-to-overview" aria-label="子智能体总览" title="子智能体总览" icon={<UnorderedListOutlined aria-hidden="true"/>} onClick={onOverview}>总览</Button>
        <Button type="text" size="small" icon={<CloseOutlined aria-hidden="true"/>} aria-label="收起子智能体" title="收起子智能体" onClick={()=>onClose()}/>
      </div>
    </header>
    <div className="ac-stream ac-subagent-stream" ref={scroll} tabIndex={0} aria-label="子智能体对话记录" onScroll={event=>{
      const node=event.currentTarget; follow.current=node.scrollHeight-node.clientHeight-node.scrollTop<36;
    }}>
      <div className="ac-message-list" ref={content}>
        <div className="ac-subagent-origin"><span>派发自 {parent?.dispatch.label??(agent.entry.parentToolId?'上一级子智能体（待确认）':'主智能体')}</span><AgentStatus agent={agent}/></div>
        <ConversationTurn key={childId} id={'subagent-'+childId} identity={agent.entry.provider?executionAgentName(agent.entry.provider):'子智能体'} executing={running}
          startedAt={agent.entry.createdAt} showExecutionIndicator={running} prompt={agent.dispatch.prompt?{id:'dispatch-prompt-'+childId,text:agent.dispatch.prompt}:undefined}>
          {groups.map(group=>group.type==='dispatch'?<SubagentDispatchCard key={group.agent.entry.id} agent={group.agent} active={false} onOpen={()=>select(group.agent.entry.id)}/>:
            <ConversationProcessBlock key={group.entries[0].id} blockKey={group.entries[0].id} entries={group.entries} active={running} liveToolId={liveToolId}
              open headerless onToggle={()=>{}} onOpenFile={onOpenFile} loadEntry={loadEntry} markdownOptions={markdownOptions}
              groupsOpen={expanded} toolsOpen={expanded} onGroupToggle={(ids,value)=>setExpanded(previous=>({...previous,...Object.fromEntries(ids.map(id=>['tool-group:'+id,value]))}))}
              onToolToggle={(id,value)=>setExpanded(previous=>({...previous,['tool:'+id]:value}))}/>)}
          {agent.entry.text?<>
            <article className="ac-message is-assistant ac-subagent-result"><MarkdownHost markdown={agent.entry.text} className="markdown-body" options={markdownOptions}/></article>
            <p className="ac-subagent-receipt">{agent.dispatch.returned?'已回传给派发者':'是否回传待确认'}</p>
          </>:!groups.length?<p className="ac-subagent-receipt">暂未读到执行记录。</p>:!running?<p className="ac-subagent-receipt">暂无可确认的结果。</p>:null}
        </ConversationTurn>
      </div>
    </div>
  </aside>;
}
