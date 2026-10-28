import { EditOutlined, FileAddOutlined, FileTextOutlined, FolderOpenOutlined, GlobalOutlined, RightOutlined, SearchOutlined, ToolOutlined, WarningOutlined } from '@ant-design/icons';
import {useEffect,useState} from 'react';
import { MarkdownHost } from '../../components/MarkdownHost';
import { processBlockSummary, processEntryStatus } from './conversation-state';
import { processTool, type ProcessToolKind } from './conversation-process';
import type { ConversationEntry } from './types';

type FileOpener=(path:string)=>void;
function ToolIcon({kind}:{kind:ProcessToolKind}){
  if(kind==='command')return <span className="ac-command-symbol">›_</span>;
  const Icon={read:FileTextOutlined,write:FileAddOutlined,edit:EditOutlined,search:SearchOutlined,fetch:GlobalOutlined,directory:FolderOpenOutlined,tool:ToolOutlined}[kind];
  return <Icon/>;
}
function ToolStep({entry,active,onOpenFile}:{entry:ConversationEntry;active:boolean;onOpenFile:FileOpener}){
  const status=processEntryStatus(entry,active);
  const tool=processTool(entry);
  const fileLink=(path:string)=><button key={path} type="button" className="ac-tool-file-link" title={path} aria-label={'查看文件 '+path} onClick={event=>{event.preventDefault();event.stopPropagation();onOpenFile(path);}}>{path.split(/[\\/]/).at(-1)}</button>;
  return <details className={'ac-step ac-step-tool'+(status==='failed'?' is-failed':'')+(status==='running'?' is-running':'')} data-entry-id={entry.id}>
    <summary>
      <span className="ac-step-node" aria-hidden="true"><ToolIcon kind={tool.kind}/></span>
      <span className="ac-step-action">{tool.action}</span>
      <span className={'ac-step-label'+(tool.kind==='command'?' is-command':'')} title={tool.paths[0]||tool.description}>{tool.paths.length===1?fileLink(tool.paths[0]):tool.description}</span>
      {status==='failed'&&<span className="ac-step-status"><WarningOutlined aria-hidden="true"/>失败</span>}
      {status==='running'&&<span className="ac-step-status">执行中</span>}
      {status==='unknown'&&<span className="ac-step-status">结果待核对</span>}
      <RightOutlined className="ac-step-chevron" aria-hidden="true"/>
    </summary>
    <div className="ac-tool-detail">
      {tool.paths.length>0&&<div className="ac-tool-files"><span>当前文件</span>{tool.paths.map(fileLink)}</div>}
      {tool.kind==='command'&&tool.command?<><div className="ac-tool-detail-label">命令</div><pre className="ac-tool-command">{tool.command}</pre>{tool.output&&<><div className="ac-tool-detail-label">输出</div><pre>{tool.output}</pre></>}</>:
        <>{tool.input&&<><div className="ac-tool-detail-label">调用参数</div><pre>{tool.input}</pre></>}<div className="ac-tool-detail-label">{tool.input?'输出':'调用记录'}</div><pre>{entry.text}</pre></>}
    </div>
  </details>;
}
/** 连续工具条目折叠为一个分组行；单条命令从一开始也以分组呈现，避免后续折叠跳动。 */
function ToolGroup({entries,active,onOpenFile,open,onToggle}:{entries:ConversationEntry[];active:boolean;onOpenFile:FileOpener;open:boolean;onToggle:(open:boolean)=>void}){
  const [visited,setVisited]=useState(open);
  useEffect(()=>{if(open)setVisited(true);},[open]);
  const tools=entries.map(processTool);
  const kinds=new Set(tools.map(tool=>tool.kind));
  const counts=new Map<string,number>();
  for(const tool of tools)counts.set(tool.action,(counts.get(tool.action)||0)+1);
  const label=entries.length>1?[...counts].map(([action,count])=>count>1?`${action} ×${count}`:action).join(' · '):`${tools[0].action} ${tools[0].description}`.trim();
  const failed=entries.filter(entry=>processEntryStatus(entry,active)==='failed').length;
  const running=entries.filter(entry=>processEntryStatus(entry,active)==='running').length;
  return <details className={'ac-step-group'+(failed?' is-failed':'')+(running?' is-running':'')} open={open} onToggle={event=>{if(event.target===event.currentTarget&&event.currentTarget.open!==open)onToggle(event.currentTarget.open);}}>
    <summary data-entry-group={JSON.stringify(entries.map(entry=>entry.id))}>
      <span className="ac-step-node" aria-hidden="true"><ToolIcon kind={kinds.size===1?tools[0].kind:'tool'}/></span>
      <span className="ac-step-action">{entries.length} 个步骤</span>
      <span className="ac-step-label" title={label}>{label}</span>
      {running>0&&<span className="ac-step-status">执行中</span>}
      {failed>0&&<span className="ac-step-status"><WarningOutlined aria-hidden="true"/>{failed} 项失败</span>}
      <RightOutlined className="ac-step-chevron" aria-hidden="true"/>
    </summary>
    {(open||visited)&&<div className="ac-step-group-items">{entries.map(entry=><ToolStep key={entry.id} entry={entry} active={active} onOpenFile={onOpenFile}/>)}</div>}
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
type Props={blockKey:string;entries:ConversationEntry[];active:boolean;finishedAt?:string;open:boolean;onToggle:(key:string,open:boolean)=>void;onOpenFile:FileOpener;groupsOpen?:Record<string,boolean>;onGroupToggle?:(ids:string[],open:boolean)=>void};
export function ConversationProcessBlock({blockKey,entries,active,finishedAt,open,onToggle,onOpenFile,groupsOpen={},onGroupToggle}:Props){
  const [visited,setVisited]=useState(open);
  useEffect(()=>{if(open)setVisited(true);},[open]);
  const summary=processBlockSummary(entries),running=active;
  const tools=entries.filter(entry=>entry.kind==='tool');
  const title=running?'正在处理':tools.length?`执行了 ${tools.length} 次工具调用`:'处理过程';
  const duration=running?'':durationLabel(summary.startedAt,finishedAt||summary.finishedAt);
  const current=summary.focus.kind==='tool'?processTool(summary.focus).action+' '+processTool(summary.focus).description:summary.focus.text;
  return <details className={'ac-process'+(summary.failed?' is-failed':'')+(running?' is-running':'')} open={open} onToggle={event=>{
    // 程序化开合（执行中展开、结束自动折叠）把 DOM 对齐到渲染值；只记录用户交互造成的差异。
    if(event.target!==event.currentTarget||event.currentTarget.open===open)return;
    onToggle(blockKey,event.currentTarget.open);
  }}>
    <summary>
      <RightOutlined className="ac-process-chevron" aria-hidden="true"/>
      {running&&<span className="ac-process-running-dot" aria-hidden="true"/>}
      <span className="ac-process-title">{title}</span>
      {duration&&<span className="ac-process-meta">{duration}</span>}
      {summary.failed>0&&<span className="ac-process-failures"><WarningOutlined aria-hidden="true"/>{summary.failed} 项失败</span>}
      {running&&<span className="ac-process-current" title={current}>{current}</span>}
    </summary>
    {(open||visited)&&<div className="ac-process-timeline">{processTimeline(entries).map(item=>item.type==='narration'
      ?<div key={item.entry.id} className="ac-process-narration" data-entry-id={item.entry.id}><MarkdownHost markdown={item.entry.text} className="markdown-body"/></div>
      :<ToolGroup key={item.entries[0].id} entries={item.entries} active={active} onOpenFile={onOpenFile} open={item.entries.map(entry=>groupsOpen['tool-group:'+entry.id]).find(value=>value!==undefined)??false} onToggle={value=>onGroupToggle?.(item.entries.map(entry=>entry.id),value)}/>)}
    </div>}
  </details>;
}
