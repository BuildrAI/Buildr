import {useEffect,useRef,useState} from 'react';
import {ToolStep} from './ConversationProcessBlock';
import type {ConversationEntry} from './types';
import type {AgentConversationHistoryPageHistoryPage as HistoryPage} from '../../../build/generated/agent-service-http-dto';
import {Alert,Button,Drawer} from 'antd';
import {CloseOutlined} from '@ant-design/icons';
import type {SendPreview} from './types';
import './conversation-handoff.css';
import {conversationReplyText} from './conversation-reply';
type Material=NonNullable<SendPreview['handoff']>;

type LoadHistory=(input:{sourceId:string;roundId?:string;cursor?:number;limit?:number},signal?:AbortSignal)=>Promise<HistoryPage>;
type LoadEntry=(entry:ConversationEntry,signal?:AbortSignal)=>Promise<ConversationEntry>;
type Props={loadHistory?:LoadHistory;loadEntry?:LoadEntry;onOpenFile?:(path:string)=>void;open:boolean;side:'left'|'right';material:Material|null;received:boolean;delivery?:'unknown'|'failed';notice?:string;issue?:string;onChooseModel?():void;onContinue?():void;continueLabel?:string;continuing?:boolean;continueDisabled?:boolean;onClose():void};
export function ConversationHandoffContent({loadHistory,loadEntry,onOpenFile,open,material,received,delivery,notice,issue,onChooseModel}:Pick<Props,'loadHistory'|'loadEntry'|'onOpenFile'|'open'|'material'|'received'|'delivery'|'notice'|'issue'|'onChooseModel'>){
 if(!material)return null;
 const {agent,model,changes,rounds,body:text,sourceThrough:through}=material;
 return <>
  <p className="ac-hd-material-intro">{agent} · {model}<span>{received?'已接收':delivery==='unknown'?'接收待确认':delivery==='failed'?'未接收':'待发送'}</span></p>
  {notice&&<Alert className="ac-hd-policy-notice" type="info" showIcon message={notice}/>}
  {changes.length>0&&<dl className="ac-hd-execution-changes">{changes.map(change=><div key={change.kind}><dt>{change.label}</dt><dd>{change.before}<span>→</span><strong>{change.after}</strong></dd></div>)}</dl>}
  <p className="ac-hd-handoff-explanation">{delivery==='unknown'?'这是本次提交的资料，是否接收还未确认，请先核对。':delivery==='failed'?'本次资料尚未交付，原记录和草稿保留。':received?'已有对话、工作记录和成果已一并交接。你可以继续提出要求。':rounds.length?'本次交接可能建立新的原生会话（Session），已有对话、工作记录和成果会一并交接。确认后才会发送，也可以返回保留原会话。':'本次要求将发送给所选执行方。你可以返回补充后发送。'}</p>
  {issue&&<div className="ac-hd-user-action has-issue">{issue}{onChooseModel&&<Button type="link" size="small" onClick={onChooseModel}>选择模型</Button>}</div>}
  {rounds.length>0&&<section className="ac-hd-round-list"><h3>对话与工作记录<small>{material.roundCount&&material.roundCount>rounds.length?'最近 '+rounds.length+' / '+material.roundCount:rounds.length} 轮</small></h3>
   {rounds.map(round=>material.sourceOnly&&material.sourceId?<SourceRound key={material.sourceId+round.id} sourceId={material.sourceId} round={round} loadHistory={loadHistory} loadEntry={loadEntry} onOpenFile={onOpenFile}/>:<details className="ac-hd-round" key={round.id}><summary><span className="ac-hd-round-title">{round.title}</span><span className="ac-hd-round-preview" title={round.userInputs[0]}>{round.userInputs[0]??'继续处理已有工作'}</span><small>{round.execution.length?`${round.executionCount??round.execution.length} 项动作 · ${round.artifactCount??round.artifacts.length} 项成果`:'无工具记录'}{round.state==='failed'?' · 执行失败':round.state==='stopped'?' · 已停止':round.state==='unknown'?' · 状态待确认':''}{!round.finalReply?' · 无最终答复':''}</small></summary>
    <div className="ac-hd-round-body">{round.provider&&<p className="ac-hd-source-reference">执行方：{round.provider}{round.model?' · '+round.model:''}</p>}<h4>用户输入</h4>{round.userInputs.map((text,index)=><p key={index}>{conversationReplyText(text)}</p>)}
    {round.assistantNotes.length>0&&<><h4>助手说明</h4>{round.assistantNotes.map((text,index)=><p key={index}>{conversationReplyText(text)}</p>)}</>}
    <h4>执行概况</h4>{round.execution.length?<ul>{round.execution.map((item,index)=><li key={index}><p>{item.result}</p>{item.location&&<code>{item.location}</code>}</li>)}</ul>:<p>本轮未执行工具。</p>}
    <h4>本轮成果</h4>{round.artifacts.length?<ul>{round.artifacts.map(item=><li key={item.location}><code>{item.location}</code><p>{item.description}</p></li>)}</ul>:<p>没有可确认的新增成果。</p>}
    <h4>最后答复</h4><p>{round.finalReply??'本轮没有最终答复，不能视为已经完成。'}</p>{round.diagnostic&&<p>执行说明：{round.diagnostic}</p>}{round.sourcePath&&<p className="ac-hd-source-reference">完整本地记录：<code>{round.sourcePath}</code></p>}</div>
   </details>)}
  </section>}
  <details key={`${open}-${received}-${through}-${agent}-${model}`} className="ac-hd-material-more"><summary><span>{material.sourceOnly?'查看来源信息':'查看完整交接内容'}</span><small>{material.sourceOnly?'消息按轮读取，工具详情按需从原生会话读取。':'这是发送给新执行方的完整内容，无需逐项确认。'}</small></summary>
   <div className="ac-hd-send-body"><div className="ac-hd-send-body-label">{material.sourceOnly?'来源索引':received?'已发送原文':delivery?'本次提交原文':'待发送原文'}</div><pre>{text}</pre></div>
  </details>
 </>;
}

export function ConversationHandoffDrawer({loadHistory,loadEntry,onOpenFile,open,side,material,received,delivery,notice,issue,onChooseModel,onContinue,continueLabel='确认交接并发送',continuing,continueDisabled,onClose}:Props){
 if(!material)return null;
 return <Drawer open={open} title="交接内容" placement={side} width="min(460px,100%)" getContainer={false} rootStyle={{position:'absolute'}} rootClassName="drawer-shell ac-handoff-drawer" closable={false} extra={<Button type="text" aria-label="关闭交接内容" icon={<CloseOutlined/>} onClick={onClose}/>} onClose={onClose} footer={!received&&!delivery&&onContinue?<Button type="primary" autoInsertSpace={false} loading={continuing} disabled={continueDisabled} onClick={onContinue}>{continueLabel}</Button>:null} destroyOnClose>
  <ConversationHandoffContent loadHistory={loadHistory} loadEntry={loadEntry} onOpenFile={onOpenFile} open={open} material={material} received={received} delivery={delivery} notice={notice} issue={issue} onChooseModel={onChooseModel}/>
 </Drawer>;
}

function SourceRound({sourceId,round,loadHistory,loadEntry,onOpenFile}:{sourceId:string;round:Material['rounds'][number];loadHistory?:LoadHistory;loadEntry?:LoadEntry;onOpenFile?:(path:string)=>void}) {
 const [open,setOpen]=useState(false),[cursor,setCursor]=useState(0),[retry,setRetry]=useState(0),[page,setPage]=useState<HistoryPage>(),[error,setError]=useState(''),[loading,setLoading]=useState(false),[tools,setTools]=useState<Record<string,boolean>>({}),[full,setFull]=useState<Record<string,ConversationEntry>>({});
 const reader=useRef(loadHistory),loaded=useRef(new Set<number>());reader.current=loadHistory;
 useEffect(()=>{
  if(!open||loaded.current.has(cursor))return;const controller=new AbortController();setLoading(true);setError('');
  const work=reader.current?reader.current({sourceId,roundId:round.id,cursor},controller.signal):Promise.reject(new Error('本轮来源读取入口不可用。'));
  void work.then(next=>{if(!controller.signal.aborted){loaded.current.add(cursor);setPage(previous=>cursor===0?next:{...next,entries:[...(previous?.entries??[]),...next.entries],truncatedIds:[...(previous?.truncatedIds??[]),...next.truncatedIds],unavailable:[...(previous?.unavailable??[]),...next.unavailable]});}}).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'本轮来源不可读。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[open,sourceId,round.id,cursor,retry]);
 return <details className="ac-hd-round" onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}><summary><span className="ac-hd-round-title">{round.title}</span><span className="ac-hd-round-preview">{round.executionCount??0} 项工具 · {round.state??'状态见记录'}</span><small>记录 #{round.from}–#{round.through}</small></summary>
  {open&&<div className="ac-hd-round-body">
   {page?.entries.map(entry=>entry.kind==='tool'?<ToolStep key={entry.id} entry={entry} active={false} loadEntry={loadEntry} onOpenFile={onOpenFile??(()=>{})} open={tools[entry.id]??false} onToggle={value=>setTools(previous=>({...previous,[entry.id]:value}))}/>:<section key={entry.id}><h4>{entry.role==='user'?'用户输入／追加／回答':entry.id===round.finalReplyId?'最终答复':entry.role==='assistant'?'助手说明':'执行记录'} · #{entry.sequence}</h4><p>{conversationReplyText((full[entry.id]??entry).text)}</p>{page.truncatedIds.includes(entry.id)&&!full[entry.id]&&<><small>当前仅显示片段，完整内容尚未读取。</small><Button size="small" disabled={!loadEntry} onClick={()=>{void loadEntry?.(entry).then(value=>setFull(previous=>({...previous,[entry.id]:value}))).catch(error=>setError(error instanceof Error?error.message:'完整消息不可读。'));}}>读取完整消息</Button></>}</section>)}
   {page?.unavailable.map(entry=><p role="status" key={entry.id}>记录 {entry.id}：{entry.reason}</p>)}
   {!round.finalReplyId&&<p>本轮没有已确认的最终答复，不能视为完成。</p>}{round.diagnostic&&<p>执行说明：{round.diagnostic}</p>}
   {loading&&<p role="status">正在读取本轮记录…</p>}{error&&<p role="alert">{error}<Button size="small" onClick={()=>{loaded.current.delete(cursor);setRetry(value=>value+1);}}>重新读取</Button></p>}
   {page?.nextCursor!==undefined&&<Button disabled={loading} onClick={()=>setCursor(page.nextCursor!)}>继续读取本轮</Button>}
  </div>}
 </details>;
}
