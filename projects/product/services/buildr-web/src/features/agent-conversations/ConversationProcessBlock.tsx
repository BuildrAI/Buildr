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
function durationLabel(startedAt:string,finishedAt:string):string {
  const seconds=Math.max(0,Math.round((Date.parse(finishedAt)-Date.parse(startedAt))/1000));
  if(!Number.isFinite(seconds)||seconds<5)return '';
  const minutes=Math.floor(seconds/60),rest=seconds%60;
  return `${minutes?`${minutes} 分 `:''}${rest} 秒`;
}
type Props={blockKey:string;entries:ConversationEntry[];active:boolean;finishedAt?:string;open:boolean;onToggle:(key:string,open:boolean)=>void;onOpenFile:FileOpener;toolsOpen?:Record<string,boolean>;onToolToggle?:(id:string,open:boolean)=>void};
export function ConversationProcessBlock({blockKey,entries,active,finishedAt,open,onToggle,onOpenFile,toolsOpen,onToolToggle}:Props){
  const [visited,setVisited]=useState(active||open);
  useEffect(()=>{if(active||open)setVisited(true);},[active,open]);
  const summary=processBlockSummary(entries);
  const tools=entries.filter(entry=>entry.kind==='tool');
  const duration=active?'':durationLabel(summary.startedAt,finishedAt||summary.finishedAt);
    const timeline=active||open||visited?<div className="ac-process-timeline">{entries.map(entry=>entry.kind==='tool'
      ?<ToolStep key={entry.id} entry={entry} active={active} onOpenFile={onOpenFile} open={toolsOpen?toolsOpen['tool:'+entry.id]??false:undefined} onToggle={value=>onToolToggle?.(entry.id,value)}/>
      :<div key={entry.id} className="ac-process-narration" data-entry-id={entry.id}><MarkdownHost markdown={entry.text} className="markdown-body"/></div>)}</div>:null;
    if(active)return <div className="ac-process is-flow" data-process-state="live">{timeline}</div>;
    return <details className={'ac-process is-flow'+(summary.failed?' is-failed':'')} data-process-state="settled" open={open} onToggle={event=>{
      if(event.target===event.currentTarget&&event.currentTarget.open!==open)onToggle(blockKey,event.currentTarget.open);
    }}>
      <summary><RightOutlined className="ac-process-chevron" aria-hidden="true"/><span className="ac-process-title">查看处理过程</span>{tools.length>0&&<span className="ac-process-meta">{tools.length} 次工具调用</span>}{duration&&<span className="ac-process-meta">{duration}</span>}{summary.failed>0&&<span className="ac-process-failures"><WarningOutlined aria-hidden="true"/>{summary.failed} 项失败</span>}</summary>
      {timeline}
    </details>;
}
