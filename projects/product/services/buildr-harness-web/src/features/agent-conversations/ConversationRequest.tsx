import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Checkbox, Radio } from 'antd';
import { ConversationAnswerInput, answerHasContent, type AnswerValue, type AnswerMaterialUpload } from './ConversationAnswerInput.tsx';
import type { ConversationRequest as RequestView, ConversationRun } from './types.ts';
import { executionAgentName } from './conversation-options.ts';
import { questionStatus } from './conversation-interaction.ts';
type Props={request:RequestView;run?:ConversationRun;provider:string;busy:boolean;handoffTarget?:string;onReply:(answer:unknown)=>void;onUpload?:AnswerMaterialUpload;onRevealAnswer?:(anchor:HTMLElement,container?:HTMLElement)=>void};
export function ConversationRequest({request,run,provider,busy,handoffTarget,onReply,onUpload,onRevealAnswer}:Props){
  const [answer,setAnswer]=useState<AnswerValue>(''),[answers,setAnswers]=useState<Record<string,AnswerValue>>({});
  const card=useRef<HTMLElement>(null),pendingReveal=useRef<{getAnchor:()=>HTMLElement|null;isLast:boolean}|null>(null),[expansion,setExpansion]=useState(0);
  useLayoutEffect(()=>{
    const pending=pendingReveal.current;
    if(!expansion||!pending)return;
    pendingReveal.current=null;
    const anchor=pending.getAnchor()??card.current;
    if(!anchor)return;
    const container=pending.isLast?(card.current??anchor):anchor;
    onRevealAnswer?.(anchor,container);
  },[expansion,onRevealAnswer]);
  const questions=request.questions||[];
  const genericTitle=request.kind==='question'&&questions.length>0&&['需要你的回复','需要你的回答','等待你的回答'].includes(request.title);
  const valid=questions.length?questions.every(question=>{const value=answers[question.id];return answerHasContent(value);}):answerHasContent(answer);
  const submitLabel=handoffTarget?'回答并交接':run?.status==='running'?'提交回答':'回答并继续';
  const submit=()=>{if(!valid||busy)return;onReply(questions.length?answers:answer);};
  const submitNote=<small className={handoffTarget?'ac-question-handoff-target':undefined}>{handoffTarget?<>交给 {handoffTarget}，结束原轮等待；其他草稿保留。</>:'仅提交此卡片的回答'}</small>;
  const submitButton=<Button type="primary" aria-label={submitLabel} autoInsertSpace={false} disabled={!valid||busy} loading={busy} onClick={submit}>{submitLabel}</Button>;
  const submitAction=<div className="ac-request-submit">{submitNote}{submitButton}</div>;
  return <section className="ac-request" ref={card} data-agent-request={request.id}><small>{(provider?executionAgentName(provider):'智能体')} · {questionStatus(request,run)}</small>{!genericTitle&&<h3>{request.title}</h3>}{request.description&&<p>{request.description}</p>}
    {request.kind==='approval'?<div className="ac-request-actions">{(request.options?.length?request.options:[{id:'deny',label:'拒绝'},{id:'allow-once',label:'允许本次'}]).map(option=><Button key={option.id} loading={busy} disabled={busy} type={/allow|accept|approve/i.test(option.id)?'primary':'default'} onClick={()=>onReply(option.id)}>{option.label}</Button>)}</div>:<>
      {questions.map((question,index)=>{const isLast=index===questions.length-1;return <QuestionInput key={question.id} question={question} value={answers[question.id]} actions={isLast?submitAction:undefined} submitButton={isLast?submitButton:undefined} submitNote={isLast?submitNote:undefined} onSubmit={submit} busy={busy} onUpload={onUpload} onExpand={getAnchor=>{pendingReveal.current={getAnchor,isLast};setExpansion(value=>value+1);}} onChange={value=>setAnswers(previous=>({...previous,[question.id]:value}))}/>;})}
      {!questions.length&&<>{request.options?.length?<Radio.Group options={request.options.map(option=>({value:option.id,label:option.label}))} value={typeof answer==='string'?answer:undefined} onChange={event=>setAnswer(event.target.value as string)}/>:null}<ConversationAnswerInput actions={submitButton} note={submitNote} onSubmit={submit} label="补充回答" busy={busy} value={typeof answer==='string'?answer:!Array.isArray(answer)?answer.text:''} onUpload={onUpload} onChange={(text,images)=>setAnswer(images.length?{text,attachmentIds:images.map(image=>image.id)}:text)}/></>}
    </>}
  </section>;
}

type Question=NonNullable<RequestView['questions']>[number];
function QuestionInput({question,value,busy,onChange,onUpload,onExpand,onSubmit,actions,submitButton,submitNote}:{question:Question;value:AnswerValue|undefined;busy:boolean;onUpload?:AnswerMaterialUpload;onChange:(value:AnswerValue)=>void;onExpand:(getAnchor:()=>HTMLElement|null)=>void;onSubmit:()=>void;actions?:ReactNode;submitButton?:ReactNode;submitNote?:ReactNode}){
  const [other,setOther]=useState(false),[otherAnswer,setOtherAnswer]=useState<AnswerValue>('');
  const questionRef=useRef<HTMLDivElement>(null),answerRef=useRef<HTMLDivElement>(null);
  const options=question.options?.map(option=>({value:option.id,label:<span className="ac-question-option"><span>{option.label}</span>{option.description&&<small>{option.description}</small>}</span>}))||[];
  const selected=Array.isArray(value)?value.filter(item=>question.options?.some(option=>option.id===item)):[];
  const customText=typeof otherAnswer==='string'?otherAnswer:'';
  const multipleAnswer=(choices:string[],text:string)=>[...choices,...(text.trim()?[text]:[])];
  const expand=()=>onExpand(()=>answerRef.current??questionRef.current);
  return <div className="ac-question" ref={questionRef}><strong>{question.label}</strong>
    {options.length?question.multiple?
      <><div className="ac-question-options" role="group" aria-label={question.label}>{options.map(option=><Checkbox key={option.value} checked={selected.includes(option.value)} disabled={busy} onChange={event=>{const next=event.target.checked?[...selected,option.value]:selected.filter(value=>value!==option.value);onChange(multipleAnswer(next,other?customText:''));}}>{option.label}</Checkbox>)}</div>
      {question.allowOther&&<Checkbox checked={other} disabled={busy} onChange={event=>{const custom=event.target.checked;setOther(custom);onChange(multipleAnswer(selected,custom?customText:''));if(custom)expand();}}>其他</Checkbox>}</>:
      <Radio.Group aria-label={question.label} options={[...options,...(question.allowOther?[{value:0,label:<span>其他</span>}]:[])]} value={other?0:value} onChange={event=>{const custom=event.target.value===0;setOther(custom);onChange(custom?otherAnswer:String(event.target.value));if(custom)expand();}}/>:
      <ConversationAnswerInput actions={submitButton} note={submitNote} onSubmit={onSubmit} label={question.label} busy={busy} value={typeof value==='string'?value:value&&!Array.isArray(value)?value.text:''} onUpload={onUpload} onChange={(text,images)=>onChange(images.length?{text,attachmentIds:images.map(image=>image.id)}:text)}/>}
    {options.length>0&&question.multiple&&question.allowOther&&other&&<div ref={answerRef}><ConversationAnswerInput actions={submitButton} note={submitNote} onSubmit={onSubmit} label={question.label+'：其他回答'} busy={busy} value={customText} onChange={text=>{setOtherAnswer(text);onChange(multipleAnswer(selected,text));}}/></div>}
    {options.length>0&&!question.multiple&&question.allowOther&&<div ref={answerRef} hidden={!other}><ConversationAnswerInput actions={other?submitButton:undefined} note={other?submitNote:undefined} onSubmit={onSubmit} label={question.label+'：其他回答'} busy={busy} value={typeof otherAnswer==='string'?otherAnswer:!Array.isArray(otherAnswer)?otherAnswer.text:''} onUpload={onUpload} onChange={(text,images)=>{const next=images.length?{text,attachmentIds:images.map(image=>image.id)}:text;setOtherAnswer(next);if(other)onChange(next);}}/></div>}
    {options.length>0&&(!other||!question.allowOther)&&actions}
  </div>;
}
