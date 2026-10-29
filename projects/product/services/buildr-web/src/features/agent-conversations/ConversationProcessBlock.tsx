import { EditOutlined, FileAddOutlined, FileTextOutlined, FolderOpenOutlined, GlobalOutlined, RightOutlined, SearchOutlined, ToolOutlined, WarningOutlined } from '@ant-design/icons';
import {useEffect,useState} from 'react';
import { MarkdownHost } from '../../components/MarkdownHost';
import type { MarkdownRenderOptions } from '../../markdown';
import { processBlockSummary, processEntryStatus } from './conversation-state';
import { processTool, type ProcessToolKind } from './conversation-process';
import type { ConversationEntry } from './types';
import { locateConversationContent } from './conversation-reading';

type FileOpener=(path:string)=>void;
function ToolIcon({kind}:{kind:ProcessToolKind}){
  if(kind==='command')return <span className="ac-command-symbol">›_</span>;
  const Icon={read:FileTextOutlined,write:FileAddOutlined,edit:EditOutlined,search:SearchOutlined,fetch:GlobalOutlined,directory:FolderOpenOutlined,tool:ToolOutlined}[kind];
  return <Icon/>;
}
function ToolStep({entry,active,onOpenFile,open,onToggle}:{entry:ConversationEntry;active:boolean;onOpenFile:FileOpener;open?:boolean;onToggle?:(open:boolean)=>void}){
  const [visited,setVisited]=useState(Boolean(open));
  const status=processEntryStatus(entry,active);
  const tool=processTool(entry);
  const fileLink=(path:string)=><button key={path} type="button" className="ac-tool-file-link" title={path} aria-label={'查看文件 '+path} onClick={event=>{event.preventDefault();event.stopPropagation();onOpenFile(path);}}>{path.split(/[\\/]/).at(-1)}</button>;
  return <details className={'ac-step ac-step-tool'+(status==='failed'?' is-failed':'')+(status==='running'?' is-running':'')} data-entry-id={entry.id} open={open} onToggle={event=>{if(event.target!==event.currentTarget)return;if(event.currentTarget.open)setVisited(true);if(event.currentTarget.open!==open)onToggle?.(event.currentTarget.open);}}>
    <summary>
      <span className="ac-step-node" aria-hidden="true"><ToolIcon kind={tool.kind}/></span>
      <span className="ac-step-action">{tool.action}</span>
      <span className={'ac-step-label'+(tool.kind==='command'?' is-command':'')} title={tool.paths[0]||tool.description}>{tool.paths.length===1?fileLink(tool.paths[0]):tool.description}</span>
      {status==='failed'&&<span className="ac-step-status"><WarningOutlined aria-hidden="true"/>失败</span>}
      {status==='unknown'&&<span className="ac-step-status">结果待核对</span>}
      <RightOutlined className="ac-step-chevron" aria-hidden="true"/>
    </summary>
    {(open||visited)&&<div className="ac-tool-detail">
      {tool.paths.length>0&&<div className="ac-tool-files"><span>当前文件</span>{tool.paths.map(fileLink)}</div>}
      {tool.kind==='command'&&tool.command?<><div className="ac-tool-detail-label">命令</div><pre className="ac-tool-command">{tool.command}</pre>{tool.output&&<><div className="ac-tool-detail-label">输出</div><pre>{tool.output}</pre></>}</>:
        <>{tool.input&&<><div className="ac-tool-detail-label">调用参数</div><pre>{tool.input}</pre></>}<div className="ac-tool-detail-label">{tool.input?'输出':'调用记录'}</div><pre>{entry.text}</pre></>}
    </div>}
  </details>;
}
/** 连续工具条目折叠为一个分组行；单条命令从一开始也以分组呈现，避免后续折叠跳动。 */
function ToolGroup({entries,active,onOpenFile,open,onToggle,toolsOpen,onToolToggle}:{entries:ConversationEntry[];active:boolean;onOpenFile:FileOpener;open:boolean;onToggle:(open:boolean)=>void;toolsOpen?:Record<string,boolean>;onToolToggle?:(id:string,open:boolean)=>void}){
  const [visited,setVisited]=useState(open);
  useEffect(()=>{if(open)setVisited(true);},[open]);
  const tools=entries.map(processTool);
  const kinds=new Set(tools.map(tool=>tool.kind));
  const counts=new Map<string,number>();
  for(const tool of tools)counts.set(tool.action,(counts.get(tool.action)||0)+1);
  const runningEntry=active?[...entries].reverse().find(entry=>entry.status==='running'):undefined;
  const label=runningEntry?`${processTool(runningEntry).action} ${processTool(runningEntry).description}`.trim():entries.length>1?[...counts].map(([action,count])=>count>1?`${action} ×${count}`:action).join(' · '):`${tools[0].action} ${tools[0].description}`.trim();
  const failed=entries.filter(entry=>processEntryStatus(entry,active)==='failed').length;
  const unknown=entries.filter(entry=>processEntryStatus(entry,active)==='unknown').length;
  const live=Boolean(runningEntry);
  const latestTool=processTool(runningEntry??entries.at(-1)!);
  const liveLabel=`${latestTool.action} ${latestTool.description}`.trim();
  return <details className={'ac-step-group'+(failed?' is-failed':'')+(live?' is-live':'')} open={open} onToggle={event=>{if(event.target===event.currentTarget&&event.currentTarget.open!==open)onToggle(event.currentTarget.open);}}>
    <summary data-entry-group={JSON.stringify(entries.map(entry=>entry.id))}>
      {live ? <>
        <span className="ac-step-node" aria-hidden="true"><ToolIcon kind={latestTool.kind}/></span>
        <span className="ac-execution-light" aria-hidden="true"/>
        <span className={'ac-step-label'+(latestTool.kind==='command'?' is-command':'')} title={liveLabel}>{liveLabel}</span>
      </> : <>
        <span className="ac-step-node" aria-hidden="true"><ToolIcon kind={kinds.size===1?tools[0].kind:'tool'}/></span>
        <span className="ac-step-action">{entries.length} 次工具调用</span>
        <span className="ac-step-label" title={label}>{label}</span>
        {unknown>0&&<span className="ac-step-status">{unknown} 项结果待核对</span>}
        {failed>0&&<span className="ac-step-status"><WarningOutlined aria-hidden="true"/>{failed} 项失败</span>}
        <RightOutlined className="ac-step-chevron" aria-hidden="true"/>
      </>}
    </summary>
    {(open||visited)&&<div className="ac-step-group-items">{entries.map(entry=><ToolStep key={entry.id} entry={entry} active={active} onOpenFile={onOpenFile} open={toolsOpen?toolsOpen['tool:'+entry.id]??false:undefined} onToggle={value=>onToolToggle?.(entry.id,value)}/>)}</div>}
    {open&&<button type="button" className="ac-process-collapse" onClick={event=>{const details=event.currentTarget.closest('details')!;onToggle(false);requestAnimationFrame(()=>{const summary=details.querySelector('summary');if(summary)locateConversationContent(summary);});}}>收起工具调用</button>}
  </details>;
}
type TimelineItem={type:'tools';entries:ConversationEntry[]}|{type:'narration';entry:ConversationEntry};
function processTimeline(entries:readonly ConversationEntry[]):TimelineItem[]{
  const items:TimelineItem[]=[];
  for(const entry of entries){
    const last=items[items.length-1];
    if(entry.kind==='tool'){
      if(last?.type==='tools')last.entries.push(entry);
      else items.push({type:'tools',entries:[entry]});
    }else items.push({type:'narration',entry});
  }
  return items;
}
function durationLabel(startedAt:string,finishedAt:string):string {
  const seconds=Math.max(0,Math.round((Date.parse(finishedAt)-Date.parse(startedAt))/1000));
  if(!Number.isFinite(seconds)||seconds<5)return '';
  const minutes=Math.floor(seconds/60),rest=seconds%60;
  return `${minutes?`${minutes} 分 `:''}${rest} 秒`;
}
type Props={markdownOptions?:MarkdownRenderOptions;headerless?:boolean;blockKey:string;entries:ConversationEntry[];active:boolean;finishedAt?:string;open:boolean;onToggle:(key:string,open:boolean)=>void;onOpenFile:FileOpener;toolsOpen?:Record<string,boolean>;onToolToggle?:(id:string,open:boolean)=>void;groupsOpen?:Record<string,boolean>;onGroupToggle?:(ids:string[],open:boolean)=>void};
export function ConversationProcessBlock({markdownOptions,headerless,blockKey,entries,active,finishedAt,open,onToggle,onOpenFile,toolsOpen,onToolToggle,groupsOpen={},onGroupToggle}:Props){
  const [visited,setVisited]=useState(active||open);
  useEffect(()=>{if(active||open)setVisited(true);},[active,open]);
  const summary=processBlockSummary(entries);
  const tools=entries.filter(entry=>entry.kind==='tool');
  const duration=active?'':durationLabel(summary.startedAt,finishedAt||summary.finishedAt);
  const timeline=active||open||visited?<div className="ac-process-timeline">{processTimeline(entries).map(item=>item.type==='narration'
    ?<div key={item.entry.id} className="ac-process-narration" data-entry-id={item.entry.id}><MarkdownHost markdown={item.entry.text} className="markdown-body" options={markdownOptions}/></div>
    :<ToolGroup key={item.entries[0].id} entries={item.entries} active={active} onOpenFile={onOpenFile} toolsOpen={toolsOpen} onToolToggle={onToolToggle} open={item.entries.map(entry=>groupsOpen['tool-group:'+entry.id]).find(value=>value!==undefined)??false} onToggle={value=>onGroupToggle?.(item.entries.map(entry=>entry.id),value)}/> )}</div>:null;
    if(active)return <div className="ac-process is-flow" data-process-state="live">{timeline}</div>;
    if(headerless)return <div className="ac-process is-flow ac-process-inline" data-process-state="settled" data-expanded={open}>{open&&timeline}</div>;
    return <details className={'ac-process is-flow'+(summary.failed?' is-failed':'')} data-process-state="settled" open={open} onToggle={event=>{
      if(event.target===event.currentTarget&&event.currentTarget.open!==open)onToggle(blockKey,event.currentTarget.open);
    }}>
      <summary><RightOutlined className="ac-process-chevron" aria-hidden="true"/><span className="ac-process-title">查看处理过程</span>{tools.length>0&&<span className="ac-process-meta">{tools.length} 次工具调用</span>}{duration&&<span className="ac-process-meta">{duration}</span>}{summary.failed>0&&<span className="ac-process-failures"><WarningOutlined aria-hidden="true"/>{summary.failed} 项失败</span>}</summary>
      {timeline}
      {open&&<button type="button" className="ac-process-collapse" onClick={event=>{const details=event.currentTarget.closest('details')!;onToggle(blockKey,false);requestAnimationFrame(()=>{const summary=details.querySelector('summary');if(summary)locateConversationContent(summary);});}}>收起处理过程</button>}
    </details>;
}
