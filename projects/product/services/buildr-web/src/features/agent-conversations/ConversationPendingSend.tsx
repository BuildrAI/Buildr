import { pendingSendReason } from './conversation-activity';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import type { ConversationView, SendDraft } from './types';
import { ConversationMessageImages } from './ConversationMessageImages';

function handoffAnswers(pending:NonNullable<ConversationView['pendingSend']>):string {
  return (pending.draft.waitingHandoff?.answers??[]).map(item=>{
    const request=pending.waitingQuestions?.find(question=>question.id===item.requestId);
    const answer=item.answer;
    if(request?.questions?.length&&answer&&typeof answer==='object'&&!Array.isArray(answer))return request.questions.map(question=>{
      const value=(answer as Record<string,unknown>)[question.id],values=Array.isArray(value)?value:[value];
      return question.label+'：'+values.map(value=>question.options?.find(option=>option.id===value)?.label??String(value??'')).join('、');
    }).join('\n');
    return (request?.title??'原问题')+'：'+(typeof answer==='string'?answer:JSON.stringify(answer));
  }).join('\n');
}
export function ConversationPendingSend({ conversation, onCancelled }: { conversation: ConversationView | null; onCancelled?(draft:SendDraft,answers:string):void }) {
  const context = useAgentConversations(), pending = conversation?.pendingSend;
  const onCancelledRef=useRef(onCancelled);
  onCancelledRef.current=onCancelled;
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [cancelled,setCancelled]=useState('');
  useEffect(()=>{setBusy(false);setError('');setCancelled('');},[conversation?.workspaceId,conversation?.id]);
  const cancel = async () => {
    if (!conversation || !pending || busy) return;
    const selection=context.getSelection();
    setBusy(true);setError('');
    try { context.apply(await context.api.cancelPendingSend(conversation,pending.revision),conversation.revision);if(context.isSelectionCurrent(selection)){const answers=handoffAnswers(pending);setCancelled([pending.draft.text,answers].filter(Boolean).join('\n'));onCancelledRef.current?.(pending.draft,answers);} }
    catch (failure) { if(context.isSelectionCurrent(selection)){setError(failure instanceof Error?failure.message:'取消未完成，待发送内容已保留。');void context.refresh().catch(()=>{});} }
    finally { if(context.isSelectionCurrent(selection))setBusy(false); }
  };
  return <>
    {pending&&conversation&&<section className="ac-pending-send" data-pending-send-state={pending.state} aria-label="待发送指令">
      <div className="ac-pending-send-header">
        <span className="ac-pending-send-status" role="status">{pending.state==='failed'?<ExclamationCircleOutlined aria-hidden/>:<ClockCircleOutlined aria-hidden/>}{pending.state==='failed'?'发送失败':'等待发送'}</span>
        <div className="ac-pending-send-actions"><Button type="text" size="small" aria-label="取消" disabled={busy||pending.state==='dispatching'} loading={busy} onClick={()=>void cancel()}>取消</Button></div>
      </div>
      {pending.reason&&pending.state==='failed'&&<p className="ac-pending-send-reason" role="alert">{pendingSendReason(pending)}</p>}
      <div className="ac-pending-send-text">{pending.draft.text||(!pending.draft.waitingHandoff?.answers?.length?'继续原目标':'')}{handoffAnswers(pending)&&<p>随交接提交的回答：{handoffAnswers(pending)}</p>}</div>
      {pending.reason&&pending.state!=='failed'&&<p className="ac-pending-send-reason">{pendingSendReason(pending)}</p>}
      {pending.draft.waitingHandoff&&<small>仅交接明确提交的回答，不自动停止原执行。取消只撤回尚未发送的新要求。</small>}
      {!!pending.draft.attachmentIds?.length&&<ConversationMessageImages conversation={conversation} ids={pending.draft.attachmentIds} read={context.api.readImage} label="待发送图片"/>}
    </section>}
    {cancelled&&!pending&&<details className="ac-cancelled-send"><summary>查看已取消的内容</summary><pre>{cancelled}</pre></details>}
    {error&&<Alert type="warning" message={error}/ >}
  </>;
}
