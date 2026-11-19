import {useEffect,useId,useRef,useState} from 'react';
import {Button} from 'antd';
import {SwapOutlined} from '@ant-design/icons';
import {ConversationHandoffContent} from './ConversationHandoffDrawer.tsx';
import type {ComponentProps} from 'react';

type Props=Pick<ComponentProps<typeof ConversationHandoffContent>,'material'|'loadHistory'|'loadEntry'|'onOpenFile'>&{
 target:string;notice?:string;issue?:string;confirmLabel:string;busy:boolean;disabled:boolean;
 onDismiss():void;onConfirm():void;onChooseModel():void;
};

export function ConversationHandoffReview({material,target,notice,issue,confirmLabel,busy,disabled,onDismiss,onConfirm,onChooseModel,...source}:Props){
 const [expanded,setExpanded]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null);
 const id=useId();
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
 return <section className="ac-handoff-review" aria-labelledby={`${id}-title`} onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();onDismiss();}}}>
  <div className="ac-hd-review-overview">
   <div className="ac-hd-review-summary">
    <h3 ref={heading} tabIndex={-1} id={`${id}-title`}><SwapOutlined aria-hidden="true"/> {issue?'暂不能交接':'确认交接'}</h3>
    <p>接手方：<strong>{material?`${material.agent} · ${material.model}`:target}</strong></p>
   </div>
   {material&&<Button type="link" size="small" aria-expanded={expanded} aria-controls={`${id}-details`} onClick={()=>setExpanded(value=>!value)}>{expanded?'收起详情':'查看交接详情'}</Button>}
  </div>
  {issue&&<p className="ac-hd-review-issue" role="status">{issue}</p>}
  {notice&&<p className="ac-hd-review-issue" role="status">{notice}</p>}
  {material&&<div id={`${id}-details`} className="ac-hd-review-details" hidden={!expanded} tabIndex={expanded?0:undefined} role="region" aria-label="交接详情">
   {expanded&&<ConversationHandoffContent {...source} material={material} received={false}/>}
  </div>}
  <div className="ac-hd-review-actions">
   <Button type="text" disabled={busy} onClick={onDismiss}>返回编辑</Button>
   {issue?<Button type="primary" disabled={busy} onClick={onChooseModel}>选择模型</Button>:<Button type="primary" autoInsertSpace={false} loading={busy} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>}
  </div>
 </section>;
}
