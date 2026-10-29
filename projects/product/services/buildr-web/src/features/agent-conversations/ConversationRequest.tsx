import { useState } from 'react';
import { Button, Checkbox, Radio } from 'antd';
import { ConversationAnswerInput, answerHasContent, type AnswerValue, type AnswerMaterialUpload } from './ConversationAnswerInput';
import { providerNames, type ConversationRequest as RequestView } from './types';
type Props={request:RequestView;provider:string;busy:boolean;handoffTarget?:string;onReply:(answer:unknown)=>void;onUpload?:AnswerMaterialUpload};
export function ConversationRequest({request,provider,busy,handoffTarget,onReply,onUpload}:Props){
  const [answer,setAnswer]=useState<AnswerValue>(''),[answers,setAnswers]=useState<Record<string,AnswerValue>>({});
  const questions=request.questions||[];
  const valid=questions.length?questions.every(question=>{const value=answers[question.id];return answerHasContent(value);}):answerHasContent(answer);
  return <section className="ac-request" data-agent-request={request.id}><small>{providerNames[provider as keyof typeof providerNames]||provider} · {request.kind==='approval'?'需要你的授权':'等待你的回答'}</small><h3>{request.title}</h3>{request.description&&<p>{request.description}</p>}
    {request.kind==='approval'?<div className="ac-request-actions">{(request.options?.length?request.options:[{id:'deny',label:'拒绝'},{id:'allow-once',label:'允许本次'}]).map(option=><Button key={option.id} loading={busy} disabled={busy} type={/allow|accept|approve/i.test(option.id)?'primary':'default'} onClick={()=>onReply(option.id)}>{option.label}</Button>)}</div>:<>
      {questions.map(question=><QuestionInput key={question.id} question={question} value={answers[question.id]} busy={busy} onUpload={onUpload} onChange={value=>setAnswers(previous=>({...previous,[question.id]:value}))}/>)}
      {!questions.length&&<>{request.options?.length?<Radio.Group options={request.options.map(option=>({value:option.id,label:option.label}))} value={typeof answer==='string'?answer:undefined} onChange={event=>setAnswer(event.target.value as string)}/>:null}<ConversationAnswerInput label="补充回答" busy={busy} value={typeof answer==='string'?answer:!Array.isArray(answer)?answer.text:''} onUpload={onUpload} onChange={(text,images)=>setAnswer(images.length?{text,attachmentIds:images.map(image=>image.id)}:text)}/></>}
      {handoffTarget&&<p className="ac-question-handoff-target">回答将与原问题一起交给 {handoffTarget}，并结束原轮等待。</p>}
      <Button type="primary" aria-label={handoffTarget?'回答并交接':'回答并继续'} autoInsertSpace={false} disabled={!valid||busy} loading={busy} onClick={()=>onReply(questions.length?answers:answer)}>{handoffTarget?'回答并交接':'回答并继续'}</Button>
    </>}
    <small>{handoffTarget?'只发送你在此卡片提交的回答；输入框里的其他草稿会保留。':'仅回应产生此请求的执行者与本轮执行。'}</small>
  </section>;
}

type Question=NonNullable<RequestView['questions']>[number];
function QuestionInput({question,value,busy,onChange,onUpload}:{question:Question;value:AnswerValue|undefined;busy:boolean;onUpload?:AnswerMaterialUpload;onChange:(value:AnswerValue)=>void}){
  const [other,setOther]=useState(false),[otherAnswer,setOtherAnswer]=useState<AnswerValue>('');
  const options=question.options?.map(option=>({value:option.id,label:<span className="ac-question-option"><span>{option.label}</span>{option.description&&<small>{option.description}</small>}</span>}))||[];
  return <div className="ac-question"><strong>{question.label}</strong>
    {options.length?question.multiple?
      <Checkbox.Group options={options} value={Array.isArray(value)?value:[]} onChange={selected=>onChange(selected.map(String))}/>:
      <Radio.Group aria-label={question.label} options={[...options,...(question.allowOther?[{value:0,label:<span>其他</span>}]:[])]} value={other?0:value} onChange={event=>{const custom=event.target.value===0;setOther(custom);onChange(custom?otherAnswer:String(event.target.value));}}/>:
      <ConversationAnswerInput label={question.label} busy={busy} value={typeof value==='string'?value:value&&!Array.isArray(value)?value.text:''} onUpload={onUpload} onChange={(text,images)=>onChange(images.length?{text,attachmentIds:images.map(image=>image.id)}:text)}/>}
    {options.length>0&&!question.multiple&&question.allowOther&&<div hidden={!other}><ConversationAnswerInput label={question.label+'：其他回答'} busy={busy} value={typeof otherAnswer==='string'?otherAnswer:!Array.isArray(otherAnswer)?otherAnswer.text:''} onUpload={onUpload} onChange={(text,images)=>{const next=images.length?{text,attachmentIds:images.map(image=>image.id)}:text;setOtherAnswer(next);if(other)onChange(next);}}/></div>}
  </div>;
}
