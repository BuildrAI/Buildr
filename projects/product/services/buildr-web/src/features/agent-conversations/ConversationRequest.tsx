import { useState } from 'react';
import { Button, Checkbox, Input, Radio } from 'antd';
import { providerNames, type ConversationRequest as RequestView } from './types';
type Props={request:RequestView;provider:string;busy:boolean;handoffTarget?:string;onReply:(answer:unknown)=>void};
export function ConversationRequest({request,provider,busy,handoffTarget,onReply}:Props){
  const [answer,setAnswer]=useState(''),[answers,setAnswers]=useState<Record<string,string|string[]>>({});
  const questions=request.questions||[];
  const valid=questions.length?questions.every(question=>{const value=answers[question.id];return Array.isArray(value)?value.length>0:Boolean(value?.trim());}):Boolean(answer.trim());
  return <section className="ac-request" data-agent-request={request.id}><small>{providerNames[provider as keyof typeof providerNames]||provider} · {request.kind==='approval'?'需要你的授权':'等待你的回答'}</small><h3>{request.title}</h3>{request.description&&<p>{request.description}</p>}
    {request.kind==='approval'?<div className="ac-request-actions">{(request.options?.length?request.options:[{id:'deny',label:'拒绝'},{id:'allow-once',label:'允许本次'}]).map(option=><Button key={option.id} loading={busy} disabled={busy} type={/allow|accept|approve/i.test(option.id)?'primary':'default'} onClick={()=>onReply(option.id)}>{option.label}</Button>)}</div>:<>
      {questions.map(question=><QuestionInput key={question.id} question={question} value={answers[question.id]} busy={busy} onChange={value=>setAnswers(previous=>({...previous,[question.id]:value}))}/>)}
      {!questions.length&&<>{request.options?.length?<Radio.Group options={request.options.map(option=>({value:option.id,label:option.label}))} value={answer} onChange={event=>setAnswer(event.target.value as string)}/>:null}<Input.TextArea aria-label="补充回答" placeholder="输入你的回答" value={answer} onChange={event=>setAnswer(event.target.value)}/></>}
      {handoffTarget&&<p className="ac-question-handoff-target">回答将与原问题一起交给 {handoffTarget}，并结束原轮等待。</p>}
      <Button type="primary" autoInsertSpace={false} disabled={!valid||busy} loading={busy} onClick={()=>onReply(questions.length?answers:answer)}>{handoffTarget?'回答并交接':'回答并继续'}</Button>
    </>}
    <small>{handoffTarget?'只发送你在此卡片提交的回答；输入框里的其他草稿会保留。':'仅回应产生此请求的执行者与本轮执行。'}</small>
  </section>;
}

type Question=NonNullable<RequestView['questions']>[number];
function QuestionInput({question,value,busy,onChange}:{question:Question;value:string|string[]|undefined;busy:boolean;onChange:(value:string|string[])=>void}){
  const [other,setOther]=useState(false),[otherAnswer,setOtherAnswer]=useState('');
  const options=question.options?.map(option=>({value:option.id,label:<span className="ac-question-option"><span>{option.label}</span>{option.description&&<small>{option.description}</small>}</span>}))||[];
  return <div className="ac-question"><strong>{question.label}</strong>
    {options.length?question.multiple?
      <Checkbox.Group disabled={busy} options={options} value={Array.isArray(value)?value:[]} onChange={selected=>onChange(selected.map(String))}/>:
      <Radio.Group aria-label={question.label} disabled={busy} options={[...options,...(question.allowOther?[{value:0,label:<span>其他</span>}]:[])]} value={other?0:value} onChange={event=>{const custom=event.target.value===0;setOther(custom);onChange(custom?otherAnswer:String(event.target.value));}}/>:
      <Input aria-label={question.label} disabled={busy} value={typeof value==='string'?value:''} onChange={event=>onChange(event.target.value)}/>}
    {options.length>0&&!question.multiple&&other&&<Input.TextArea aria-label={question.label+'：其他回答'} placeholder="输入你的回答" disabled={busy} autoSize={{minRows:2,maxRows:6}} value={otherAnswer} onChange={event=>{setOtherAnswer(event.target.value);onChange(event.target.value);}}/>}
  </div>;
}
