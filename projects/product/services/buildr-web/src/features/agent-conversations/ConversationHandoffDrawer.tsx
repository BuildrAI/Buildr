import {Button,Drawer} from 'antd';
import {CloseOutlined} from '@ant-design/icons';
import type {SendPreview} from './types';
import './conversation-handoff.css';
import {conversationReplyText} from './conversation-reply';
type Material=NonNullable<SendPreview['handoff']>;

type Props={open:boolean;side:'left'|'right';material:Material|null;received:boolean;delivery?:'unknown'|'failed';issue?:string;onChooseModel?():void;onContinue?():void;continueLabel?:string;continuing?:boolean;continueDisabled?:boolean;onClose():void};
export function ConversationHandoffDrawer({open,side,material,received,delivery,issue,onChooseModel,onContinue,continueLabel='继续',continuing,continueDisabled,onClose}:Props){
 if(!material)return null;
 const {agent,model,changes,rounds,body:text,sourceThrough:through}=material;
 return <Drawer open={open} title="交接内容" placement={side} width="min(460px,100%)" getContainer={false} rootStyle={{position:'absolute'}} rootClassName="drawer-shell ac-handoff-drawer" closable={false} extra={<Button type="text" aria-label="关闭交接内容" icon={<CloseOutlined/>} onClick={onClose}/>} onClose={onClose} footer={!received&&!delivery&&onContinue?<Button type="primary" autoInsertSpace={false} loading={continuing} disabled={continueDisabled} onClick={onContinue}>{continueLabel}</Button>:null} destroyOnClose>
  <p className="ac-hd-material-intro">{agent} · {model}<span>{received?'已接收':delivery==='unknown'?'接收待确认':delivery==='failed'?'未接收':'待发送'}</span></p>
  {changes.length>0&&<dl className="ac-hd-execution-changes">{changes.map(change=><div key={change.kind}><dt>{change.label}</dt><dd>{change.before}<span>→</span><strong>{change.after}</strong></dd></div>)}</dl>}
  <p className="ac-hd-handoff-explanation">{delivery==='unknown'?'这是本次提交的资料，是否接收还未确认，请先核对。':delivery==='failed'?'本次资料尚未交付，原记录和草稿保留。':received?'已有对话、工作记录和成果已一并交接。你可以继续提出要求。':rounds.length?'已有对话、工作记录和成果会一并交接。点击“继续”即可接着处理，也可以返回补充要求。':'本次要求将发送给所选执行方。你可以返回补充后发送。'}</p>
  {issue&&<div className="ac-hd-user-action has-issue">{issue}{onChooseModel&&<Button type="link" size="small" onClick={onChooseModel}>选择模型</Button>}</div>}
  {rounds.length>0&&<section className="ac-hd-round-list"><h3>对话与工作记录<small>{material.roundCount&&material.roundCount>rounds.length?'最近 '+rounds.length+' / '+material.roundCount:rounds.length} 轮</small></h3>
   {rounds.map(round=><details className="ac-hd-round" key={round.id}><summary><span className="ac-hd-round-title">{round.title}</span><span className="ac-hd-round-preview" title={round.userInputs[0]}>{round.userInputs[0]??'继续处理已有工作'}</span><small>{round.execution.length?`${round.executionCount??round.execution.length} 项动作 · ${round.artifactCount??round.artifacts.length} 项成果`:'无工具记录'}{round.state==='failed'?' · 执行失败':round.state==='stopped'?' · 已停止':round.state==='unknown'?' · 状态待确认':''}{!round.finalReply?' · 无最终答复':''}</small></summary>
    <div className="ac-hd-round-body">{round.provider&&<p className="ac-hd-source-reference">执行方：{round.provider}{round.model?' · '+round.model:''}</p>}<h4>用户输入</h4>{round.userInputs.map((text,index)=><p key={index}>{conversationReplyText(text)}</p>)}
    {round.assistantNotes.length>0&&<><h4>助手说明</h4>{round.assistantNotes.map((text,index)=><p key={index}>{conversationReplyText(text)}</p>)}</>}
    <h4>执行概况</h4>{round.execution.length?<ul>{round.execution.map((item,index)=><li key={index}><p>{item.result}</p>{item.location&&<code>{item.location}</code>}</li>)}</ul>:<p>本轮未执行工具。</p>}
    <h4>本轮成果</h4>{round.artifacts.length?<ul>{round.artifacts.map(item=><li key={item.location}><code>{item.location}</code><p>{item.description}</p></li>)}</ul>:<p>没有可确认的新增成果。</p>}
    <h4>最后答复</h4><p>{round.finalReply??'本轮没有最终答复，不能视为已经完成。'}</p>{round.diagnostic&&<p>执行说明：{round.diagnostic}</p>}{round.sourcePath&&<p className="ac-hd-source-reference">完整本地记录：<code>{round.sourcePath}</code></p>}</div>
   </details>)}
  </section>}
  <details key={`${open}-${received}-${through}-${agent}-${model}`} className="ac-hd-material-more"><summary><span>查看完整交接内容</span><small>这是发送给新执行方的完整内容，无需逐项确认。</small></summary>
   <div className="ac-hd-send-body"><div className="ac-hd-send-body-label">{received?'已发送原文':delivery?'本次提交原文':'待发送原文'}</div><pre>{text}</pre></div>
  </details>
 </Drawer>;
}
