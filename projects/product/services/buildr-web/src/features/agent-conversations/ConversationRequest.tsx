import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Checkbox, Radio } from 'antd';
import { ConversationAnswerInput, answerHasContent, type AnswerValue, type AnswerMaterialUpload } from './ConversationAnswerInput';
import type { ConversationRequest as RequestView, ConversationRun } from './types';
import { executionAgentName } from './conversation-options';
import { questionStatus } from './conversation-interaction';
type Props={request:RequestView;run?:ConversationRun;provider:string;busy:boolean;handoffTarget?:string;onReply:(answer:unknown)=>void;onUpload?:AnswerMaterialUpload;onRevealAnswer?:(element:HTMLElement)=>void};
export function ConversationRequest({request,run,provider,busy,handoffTarget,onReply,onUpload,onRevealAnswer}:Props){
  const [answer,setAnswer]=useState<AnswerValue>(''),[answers,setAnswers]=useState<Record<string,AnswerValue>>({});
  const footer=useRef<HTMLDivElement>(null),[expansion,setExpansion]=useState(0);
  useLayoutEffect(()=>{if(expansion&&footer.current)onRevealAnswer?.(footer.current);},[expansion,onRevealAnswer]);
  const questions=request.questions||[];
  const genericTitle=request.kind==='question'&&questions.length>0&&['需要你的回复','需要你的回答','等待你的回答'].includes(request.title);
  const valid=questions.length?questions.every(question=>{const value=answers[question.id];return answerHasContent(value);}):answerHasContent(answer);
  const submitAction=<div className="ac-request-submit" ref={footer}>
        <small className={handoffTarget?'ac-question-handoff-target':undefined}>{handoffTarget?<>交给 {handoffTarget}，结束原轮等待；其他草稿保留。</>:'仅提交此卡片的回答'}</small>
        <Button type="primary" aria-label={handoffTarget?'回答并交接':run?.status==='running'?'提交回答':'回答并继续'} autoInsertSpace={false} disabled={!valid||busy} loading={busy} onClick={()=>onReply(questions.length?answers:answer)}>{handoffTarget?'回答并交接':run?.status==='running'?'提交回答':'回答并继续'}</Button>
      </div>;
  return <section className="ac-request" data-agent-request={request.id}><small>{(provider?executionAgentName(provider):'智能体')} · {questionStatus(request,run)}</small>{!genericTitle&&<h3>{request.title}</h3>}{request.description&&<p>{request.description}</p>}
    {request.kind==='approval'?<div className="ac-request-actions">{(request.options?.length?request.options:[{id:'deny',label:'拒绝'},{id:'allow-once',label:'允许本次'}]).map(option=><Button key={option.id} loading={busy} disabled={busy} type={/allow|accept|approve/i.test(option.id)?'primary':'default'} onClick={()=>onReply(option.id)}>{option.label}</Button>)}</div>:<>
      {questions.map((question,index)=><QuestionInput key={question.id} question={question} value={answers[question.id]} actions={index===questions.length-1?submitAction:undefined} busy={busy} onUpload={onUpload} onExpand={()=>setExpansion(value=>value+1)} onChange={value=>setAnswers(previous=>({...previous,[question.id]:value}))}/>)}
      {!questions.length&&<>{request.options?.length?<Radio.Group options={request.options.map(option=>({value:option.id,label:option.label}))} value={typeof answer==='string'?answer:undefined} onChange={event=>setAnswer(event.target.value as string)}/>:null}<ConversationAnswerInput actions={submitAction} label="补充回答" busy={busy} value={typeof answer==='string'?answer:!Array.isArray(answer)?answer.text:''} onUpload={onUpload} onChange={(text,images)=>setAnswer(images.length?{text,attachmentIds:images.map(image=>image.id)}:text)}/></>}
    </>}
  </section>;
}

type Question=NonNullable<RequestView['questions']>[number];
function QuestionInput({question,value,busy,onChange,onUpload,onExpand,actions}:{question:Question;value:AnswerValue|undefined;busy:boolean;onUpload?:AnswerMaterialUpload;onChange:(value:AnswerValue)=>void;onExpand:()=>void;actions?:ReactNode}){
  const [other,setOther]=useState(false),[otherAnswer,setOtherAnswer]=useState<AnswerValue>('');
  const options=question.options?.map(option=>({value:option.id,label:<span className="ac-question-option"><span>{option.label}</span>{option.description&&<small>{option.description}</small>}</span>}))||[];
  const selected=Array.isArray(value)?value.filter(item=>question.options?.some(option=>option.id===item)):[];
  const customText=typeof otherAnswer==='string'?otherAnswer:'';
  const multipleAnswer=(choices:string[],text:string)=>[...choices,...(text.trim()?[text]:[])];
  return <div className="ac-question"><strong>{question.label}</strong>
    {options.length?question.multiple?
      <><div className="ac-question-options" role="group" aria-label={question.label}>{options.map(option=><Checkbox key={option.value} checked={selected.includes(option.value)} disabled={busy} onChange={event=>{const next=event.target.checked?[...selected,option.value]:selected.filter(value=>value!==option.value);onChange(multipleAnswer(next,other?customText:''));}}>{option.label}</Checkbox>)}</div>
      {question.allowOther&&<Checkbox checked={other} disabled={busy} onChange={event=>{const custom=event.target.checked;setOther(custom);onChange(multipleAnswer(selected,custom?customText:''));if(custom)onExpand();}}>其他</Checkbox>}</>:
      <Radio.Group aria-label={question.label} options={[...options,...(question.allowOther?[{value:0,label:<span>其他</span>}]:[])]} value={other?0:value} onChange={event=>{const custom=event.target.value===0;setOther(custom);onChange(custom?otherAnswer:String(event.target.value));if(custom)onExpand();}}/>:
      <ConversationAnswerInput actions={actions} label={question.label} busy={busy} value={typeof value==='string'?value:value&&!Array.isArray(value)?value.text:''} onUpload={onUpload} onChange={(text,images)=>onChange(images.length?{text,attachmentIds:images.map(image=>image.id)}:text)}/>}
    {options.length>0&&question.multiple&&question.allowOther&&other&&<ConversationAnswerInput actions={actions} label={question.label+'：其他回答'} busy={busy} value={customText} onChange={text=>{setOtherAnswer(text);onChange(multipleAnswer(selected,text));}}/>}
    {options.length>0&&!question.multiple&&question.allowOther&&<div hidden={!other}><ConversationAnswerInput actions={other?actions:undefined} label={question.label+'：其他回答'} busy={busy} value={typeof otherAnswer==='string'?otherAnswer:!Array.isArray(otherAnswer)?otherAnswer.text:''} onUpload={onUpload} onChange={(text,images)=>{const next=images.length?{text,attachmentIds:images.map(image=>image.id)}:text;setOtherAnswer(next);if(other)onChange(next);}}/></div>}
    {options.length>0&&(!other||!question.allowOther)&&actions}
  </div>;
}
