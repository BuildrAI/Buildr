import { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, Select, Space } from 'antd';
import { ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationOptions } from './ConversationOptions';
import type { ConversationView, SendDraft } from './types';
import type { ConversationChoice, PermissionMode } from './conversation-options';
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
  const [edit,setEdit] = useState<{pending:NonNullable<ConversationView['pendingSend']>;draft:SendDraft;conversation:ConversationView}|null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [cancelled,setCancelled]=useState('');
  useEffect(()=>{setEdit(null);setBusy(false);setError('');setCancelled('');},[conversation?.workspaceId,conversation?.id]);
  const cancel = async () => {
    if (!conversation || !pending || busy) return;
    const selection=context.getSelection();
    setBusy(true);setError('');
    try { context.apply(await context.api.cancelPendingSend(conversation,pending.revision),conversation.revision);if(context.isSelectionCurrent(selection)){const answers=handoffAnswers(pending);setCancelled([pending.draft.text,answers].filter(Boolean).join('\n'));onCancelled?.(pending.draft,answers);} }
    catch (failure) { if(context.isSelectionCurrent(selection)){setError(failure instanceof Error?failure.message:'取消未完成，待发送内容已保留。');void context.refresh().catch(()=>{});} }
    finally { if(context.isSelectionCurrent(selection))setBusy(false); }
  };
  const save = async () => {
    if (!edit || busy) return;
    const current = conversation?.id === edit.conversation.id ? conversation : edit.conversation;
    const selection=context.getSelection();
    setBusy(true);setError('');
    try {
      const next = await context.api.queueSend(current,{...edit.draft,expectedRevision:current.revision,clientRequestId:edit.pending.id,expectedPendingRevision:edit.pending.revision});
      context.apply(next,current.revision);if(context.isSelectionCurrent(selection))setEdit(null);
    } catch (failure) { if(context.isSelectionCurrent(selection)){setError(failure instanceof Error?failure.message:'保存未完成，编辑内容保留。');void context.refresh().catch(()=>{});} }
    finally { if(context.isSelectionCurrent(selection))setBusy(false); }
  };
  const choose = (choice: ConversationChoice) => setEdit(value=>value?{...value,draft:{...value.draft,connectionId:choice.connectionId,model:choice.model,modelAccountId:choice.modelAccountId,modelAccountIdentity:choice.modelAccountIdentity,modelAccountRevision:choice.modelAccountRevision,serviceTier:choice.serviceTier,reasoningEffort:choice.reasoningEffort}}:value);
  return <>
    {pending&&conversation&&<section className="ac-pending-send" data-pending-send-state={pending.state} aria-label="待发送指令">
      <div className="ac-pending-send-header">
        <span className="ac-pending-send-status" role="status">{pending.state==='failed'?<ExclamationCircleOutlined aria-hidden/>:<ClockCircleOutlined aria-hidden/>}{pending.state==='dispatching'?(pending.draft.waitingHandoff?'正在提交交接':'正在提交下一轮'):pending.state==='failed'?'待发送指令尚未执行':'新指令已保存，尚未发送'}</span>
        <div className="ac-pending-send-actions"><Button type="text" size="small" disabled={busy||pending.state==='dispatching'} onClick={()=>{setError('');setEdit({pending,draft:{...pending.draft},conversation});}}>修改待发送内容</Button><Button type="text" size="small" disabled={busy||pending.state==='dispatching'} onClick={()=>void cancel()}>取消待发送</Button></div>
      </div>
      {pending.reason&&pending.state==='failed'&&<p className="ac-pending-send-reason" role="alert">{pending.reason}</p>}
      <div className="ac-pending-send-text">{pending.draft.text||(!pending.draft.waitingHandoff?.answers?.length?'继续原目标':'')}{handoffAnswers(pending)&&<p>随交接提交的回答：{handoffAnswers(pending)}</p>}</div>
      {pending.reason&&pending.state!=='failed'&&<p className="ac-pending-send-reason">{pending.reason}</p>}
      {pending.draft.waitingHandoff&&<small>仅交接明确提交的回答，不自动停止原执行。取消只撤回尚未发送的新要求。</small>}
      {!!pending.draft.attachmentIds?.length&&<ConversationMessageImages conversation={conversation} ids={pending.draft.attachmentIds} read={context.api.readImage} label="待发送图片"/>}
    </section>}
    {cancelled&&!pending&&<details className="ac-cancelled-send"><summary>查看已取消的内容</summary><pre>{cancelled}</pre></details>}
    {error&&!edit&&<Alert type="warning" message={error}/ >}
    <Modal open={Boolean(edit)} title="修改待发送指令" getContainer={false} styles={{mask:{position:'absolute'},wrapper:{position:'absolute'}}} onCancel={()=>setEdit(null)} onOk={()=>void save()} confirmLoading={busy} okText="保存并等待发送" cancelText="保留原内容" okButtonProps={{disabled:!edit?.draft.continueRunId&&!edit?.draft.text.trim()&&!edit?.draft.attachmentIds?.length}}>
      {error&&<Alert type="warning" message={error}/ >}
      <Input.TextArea aria-label="待发送内容" value={edit?.draft.text??''} placeholder={edit?.draft.waitingHandoff?'可补充新要求；已提交的回答会一起交接':'输入下一条要求'} autoSize={{minRows:3,maxRows:10}} onChange={event=>setEdit(value=>value?{...value,draft:{...value.draft,text:event.target.value,continueRunId:event.target.value.trim()?undefined:value.draft.waitingHandoff?.runId}}:value)}/>
      {edit?.draft.waitingHandoff?.answers?.length&&<p>已保存的回答：{handoffAnswers({...edit.pending,draft:edit.draft})}</p>}
      {edit&&<Space wrap><ConversationOptions connections={context.connections} value={edit.draft} disabled={busy} onChange={choose}/><Select<PermissionMode> aria-label="待发送权限" value={edit.draft.permissionMode??'default'} disabled={busy} options={[{value:'default',label:'默认权限'},{value:'full-access',label:'完全访问'}]} onChange={permissionMode=>setEdit(value=>value?{...value,draft:{...value.draft,permissionMode}}:value)}/></Space>}
    </Modal>
  </>;
}
