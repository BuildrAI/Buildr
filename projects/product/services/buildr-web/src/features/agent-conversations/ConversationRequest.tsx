import { useState } from 'react';
import { Button, Checkbox, Input, Radio } from 'antd';
import { providerNames, type ConversationRequest as RequestView } from './types';
type Props={request:RequestView;provider:string;busy:boolean;onReply:(answer:unknown)=>void};
export function ConversationRequest({request,provider,busy,onReply}:Props){
  const [answer,setAnswer]=useState(''),[answers,setAnswers]=useState<Record<string,string|string[]>>({});
  const questions=request.questions||[];
  const valid=questions.length?questions.every(question=>{const value=answers[question.id];return Array.isArray(value)?value.length>0:Boolean(value?.trim());}):Boolean(answer.trim());
  return <section className="ac-request" data-agent-request={request.id}><small>{providerNames[provider as keyof typeof providerNames]||provider} · {request.kind==='approval'?'需要你的授权':'需要你补充信息'}</small><h3>{request.title}</h3>{request.description&&<p>{request.description}</p>}
    {request.kind==='approval'?<div className="ac-request-actions">{(request.options?.length?request.options:[{id:'deny',label:'拒绝'},{id:'allow-once',label:'允许本次'}]).map(option=><Button key={option.id} loading={busy} disabled={busy} type={/allow|accept|approve/i.test(option.id)?'primary':'default'} onClick={()=>onReply(option.id)}>{option.label}</Button>)}</div>:<>
      {questions.map(question=><label className="ac-question" key={question.id}><strong>{question.label}</strong>{question.options?.length?question.multiple?<Checkbox.Group options={question.options.map(option=>({value:option.id,label:option.label}))} value={Array.isArray(answers[question.id])?answers[question.id] as string[]:[]} onChange={value=>setAnswers(previous=>({...previous,[question.id]:value.map(String)}))}/>:<Radio.Group options={question.options.map(option=>({value:option.id,label:option.label}))} value={answers[question.id]} onChange={event=>setAnswers(previous=>({...previous,[question.id]:event.target.value as string}))}/>:<Input aria-label={question.label} value={String(answers[question.id]||'')} onChange={event=>setAnswers(previous=>({...previous,[question.id]:event.target.value}))}/>}</label>)}
      {!questions.length&&<>{request.options?.length?<Radio.Group options={request.options.map(option=>({value:option.id,label:option.label}))} value={answer} onChange={event=>setAnswer(event.target.value as string)}/>:null}<Input.TextArea aria-label="补充回答" placeholder="输入你的回答" value={answer} onChange={event=>setAnswer(event.target.value)}/></>}
      <Button type="primary" disabled={!valid||busy} loading={busy} onClick={()=>onReply(questions.length?answers:answer)}>回答并继续</Button>
    </>}
    <small>仅回应产生此请求的执行者与本轮执行。</small>
  </section>;
}
