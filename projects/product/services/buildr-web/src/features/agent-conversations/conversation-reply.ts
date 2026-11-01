import type { ConversationView, ConversationRequest, ConversationEntry } from './types';

export type ConversationReplyAttempt = {
  workspaceId:string; conversationId:string; request:ConversationRequest; answer:unknown;
  previousEntries:Pick<ConversationEntry,'id'|'status'|'text'>[];
};

const canonicalAnswer = (value:unknown):string => JSON.stringify(value, (_key, item:unknown) =>
  item && typeof item==='object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);

/** Only an accepted receipt for this exact submitted answer can resolve an error. */
export function confirmedConversationReply(chat:ConversationView|null|undefined, attempt:ConversationReplyAttempt):boolean {
  if(!chat || chat.id!==attempt.conversationId || chat.workspaceId!==attempt.workspaceId)return false;
  const {request,answer}=attempt;
  const owner=[...(chat.run?[chat.run]:[]),...(chat.retainedRuns??[])].find(run=>run.id===request.runId);
  if(!owner || owner.participantId!==request.participantId || owner.generation!==request.generation)return false;
  const isMaterial=(value:unknown):value is {text:string;attachmentIds:string[]}=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&typeof (value as any).text==='string'&&Array.isArray((value as any).attachmentIds));
  const values=isMaterial(answer)?[answer]:answer&&typeof answer==='object'&&!Array.isArray(answer)?Object.values(answer):[];
  const attachments=[...new Set(values.flatMap(value=>isMaterial(value)?value.attachmentIds:[]))].sort();
  const display=isMaterial(answer)?answer.text:answer&&typeof answer==='object'&&!Array.isArray(answer)?Object.fromEntries(Object.entries(answer).map(([id,value])=>[id,isMaterial(value)?value.text:value])):answer;
  return chat.entries.some(entry=>{
    if(entry.kind!=='notice'||entry.role!=='user'||entry.status!=='accepted'||entry.runId!==request.runId||entry.participantId!==request.participantId||!(entry.id==='reply-'+request.id||entry.id.startsWith('reply-'+request.id+'-')))return false;
    if(attempt.previousEntries.some(prior=>prior.id===entry.id&&prior.status==='accepted'&&prior.text===entry.text))return false;
    try {
      const receipt=JSON.parse(entry.text);
      return receipt.请求标识===request.id && canonicalAnswer(receipt.显示回答??receipt.回答)===canonicalAnswer(display)
        && canonicalAnswer([...(entry.attachments??[])].sort())===canonicalAnswer(attachments);
    } catch { return false; }
  });
}

/** Older replies appended native material locations to the answer itself. */
function withoutNativeMaterialAppendix(text:string):string{
  const marker='\n\n用户随此问题回答附加的材料（请按需读取以下准确本机来源，未读取不能声称看过）：\n';
  const index=text.lastIndexOf(marker);
  if(index<0)return text;
  try{
    const materials=JSON.parse(text.slice(index+marker.length).split('\n')[0]);
    if(!Array.isArray(materials)||!materials.length||!materials.every(item=>item&&typeof item.id==='string'&&typeof item.path==='string'&&item.path.startsWith('/')&&typeof item.mimeType==='string'&&item.mimeType.startsWith('image/')))return text;
    return text.slice(0,index)||'（见附件）';
  }catch{return text;}
}
/** Render a stored response naturally; native material references and send bodies stay untouched. */
export function conversationReplyText(text:string):string{
  let value:any;try{value=JSON.parse(text);}catch{return text;}
  try{
  const keys=['请求标识','问题','说明','问题列表','选项','回答','显示回答','授权性质','状态'];
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.请求标识!=='string'||typeof value.问题!=='string'||(!Object.hasOwn(value,'回答')&&typeof value.状态!=='string')||Object.keys(value).some(key=>!keys.includes(key)))return text;
  if(value.选项!==undefined&&!Array.isArray(value.选项)||value.问题列表!==undefined&&!Array.isArray(value.问题列表))return text;
  if(!Object.hasOwn(value,'回答'))return value.问题+'\n'+(Array.isArray(value.问题列表)?value.问题列表.map((question:any)=>question.label).join('\n')+'\n':'')+(value.状态.startsWith('原问题')||value.状态.includes('用户要求先讨论')?value.状态:'未回答；交接不代表同意。');
  const displayProvided=Object.hasOwn(value,'显示回答'),answer=displayProvided?value.显示回答:value.回答;
  const label=(answer:unknown,options:any[]|undefined):string=>Array.isArray(answer)?answer.map(item=>label(item,options)).join('、'):options?.find(item=>item.id===answer)?.label??(typeof answer==='string'?(displayProvided?answer||'（见附件）':withoutNativeMaterialAppendix(answer)):JSON.stringify(answer));
  if(answer&&typeof answer==='object'&&!Array.isArray(answer)&&Array.isArray(value.问题列表))return Object.entries(answer).map(([id,answer])=>{const question=value.问题列表.find((item:any)=>item.id===id);return `${question?.label??id}：${label(answer,question?.options)}`;}).join('\n');
  return `${value.问题}\n答复：${label(answer,value.选项)}`;
  }catch{return text;}
}
