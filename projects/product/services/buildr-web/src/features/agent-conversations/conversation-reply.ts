/** Render a stored response naturally; the source JSON and send body stay untouched. */
export function conversationReplyText(text:string):string{
  let value:any;try{value=JSON.parse(text);}catch{return text;}
  try{
  const keys=['请求标识','问题','说明','问题列表','选项','回答','授权性质','状态'];
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.请求标识!=='string'||typeof value.问题!=='string'||(!Object.hasOwn(value,'回答')&&typeof value.状态!=='string')||Object.keys(value).some(key=>!keys.includes(key)))return text;
  if(value.选项!==undefined&&!Array.isArray(value.选项)||value.问题列表!==undefined&&!Array.isArray(value.问题列表))return text;
  if(!Object.hasOwn(value,'回答'))return value.问题+'\n'+(Array.isArray(value.问题列表)?value.问题列表.map((question:any)=>question.label).join('\n')+'\n':'')+(value.状态.startsWith('原问题')?value.状态:'未回答；交接不代表同意。');
  const label=(answer:unknown,options:any[]|undefined):string=>Array.isArray(answer)?answer.map(item=>label(item,options)).join('、'):options?.find(item=>item.id===answer)?.label??(typeof answer==='string'?answer:JSON.stringify(answer));
  if(value.回答&&typeof value.回答==='object'&&!Array.isArray(value.回答)&&Array.isArray(value.问题列表))return Object.entries(value.回答).map(([id,answer])=>{const question=value.问题列表.find((item:any)=>item.id===id);return `${question?.label??id}：${label(answer,question?.options)}`;}).join('\n');
  return `${value.问题}\n答复：${label(value.回答,value.选项)}`;
  }catch{return text;}
}
