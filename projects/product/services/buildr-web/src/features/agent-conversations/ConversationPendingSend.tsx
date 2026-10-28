import { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, Select, Space } from 'antd';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationOptions } from './ConversationOptions';
import type { ConversationView, SendDraft } from './types';
import type { ConversationChoice, PermissionMode } from './conversation-options';
import { ConversationMessageImages } from './ConversationMessageImages';

export function ConversationPendingSend({ conversation }: { conversation: ConversationView | null }) {
  const context = useAgentConversations(), pending = conversation?.pendingSend;
  const [edit,setEdit] = useState<{pending:NonNullable<ConversationView['pendingSend']>;draft:SendDraft;conversation:ConversationView}|null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  useEffect(()=>{setEdit(null);setBusy(false);setError('');},[conversation?.workspaceId,conversation?.id]);
  const cancel = async () => {
    if (!conversation || !pending || busy) return;
    const selection=context.getSelection();
    setBusy(true);setError('');
    try { context.apply(await context.api.cancelPendingSend(conversation,pending.revision),conversation.revision); }
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
      <Alert type={pending.state==='failed'?'warning':'info'} showIcon message={pending.state==='dispatching'?'正在提交下一轮':pending.state==='failed'?'待发送指令尚未执行':'已提交，等待自动发送'} description={pending.reason}/>
      <div className="ac-pending-send-text">{pending.draft.text}</div>
      {!!pending.draft.attachmentIds?.length&&<ConversationMessageImages conversation={conversation} ids={pending.draft.attachmentIds} read={context.api.readImage} label="待发送图片"/>}
      <Space><Button size="small" disabled={busy||pending.state==='dispatching'} onClick={()=>{setError('');setEdit({pending,draft:{...pending.draft},conversation});}}>修改待发送内容</Button><Button size="small" disabled={busy||pending.state==='dispatching'} onClick={()=>void cancel()}>取消待发送</Button></Space>
    </section>}
    {error&&!edit&&<Alert type="warning" message={error}/ >}
    <Modal open={Boolean(edit)} title="修改待发送指令" getContainer={false} styles={{mask:{position:'absolute'},wrapper:{position:'absolute'}}} onCancel={()=>setEdit(null)} onOk={()=>void save()} confirmLoading={busy} okText="保存并等待发送" cancelText="保留原内容" okButtonProps={{disabled:!edit?.draft.text.trim()&&!edit?.draft.attachmentIds?.length}}>
      {error&&<Alert type="warning" message={error}/ >}
      <Input.TextArea aria-label="待发送内容" value={edit?.draft.text??''} autoSize={{minRows:3,maxRows:10}} onChange={event=>setEdit(value=>value?{...value,draft:{...value.draft,text:event.target.value}}:value)}/>
      {edit&&<Space wrap><ConversationOptions connections={context.connections} value={edit.draft} disabled={busy} onChange={choose}/><Select<PermissionMode> aria-label="待发送权限" value={edit.draft.permissionMode??'default'} disabled={busy} options={[{value:'default',label:'默认权限'},{value:'full-access',label:'完全访问'}]} onChange={permissionMode=>setEdit(value=>value?{...value,draft:{...value.draft,permissionMode}}:value)}/></Space>}
    </Modal>
  </>;
}
