import { useContext, useEffect, useRef, useState } from 'react';
import { Alert, Button, Popover } from 'antd';
import { CommentOutlined, PlusOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../app/pageTabs';
import { useOptionalAgentConversations } from './AgentConversationsContext';
import type { ConversationSummary } from './types';

/** A task selects an exact conversation identity; opening never sends input. */
export function TaskConversationEntry({workspaceId,taskId}:{workspaceId:string;taskId:string}) {
  const context = useOptionalAgentConversations(), viewActive = useContext(WorkspaceViewActiveContext);
  const [rows,setRows] = useState<ConversationSummary[]>([]), [loading,setLoading] = useState(false), [error,setError] = useState('');
  const [open,setOpen] = useState(false), [reload,setReload] = useState(0), [cursor,setCursor] = useState<string>();
  const scopeKey = workspaceId+':'+taskId, currentScope = useRef(scopeKey);currentScope.current=scopeKey;
  const relations = JSON.stringify(context?.conversation?.taskIds ?? (context?.conversation?.taskId ? [context.conversation.taskId] : []));
  useEffect(() => {
    if (!context || !viewActive) return;
    const controller = new AbortController();
    setLoading(true);
    void context.api.list(workspaceId,{taskId,signal:controller.signal}).then(result => {
      if (controller.signal.aborted) return;
      setRows(result.conversations); setCursor(result.nextCursor); setError('');
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '读取任务对话失败。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[context?.api,workspaceId,taskId,viewActive,relations,reload]);
  useEffect(() => {setRows([]);setCursor(undefined);setOpen(false);},[workspaceId,taskId]);
  if (!context) return null;
  const startDraft = () => {context.setFull(false);context.newConversation({scope:{workspaceId,taskId}});setOpen(false);};
  const show = (id:string) => {context.setFull(false);context.setOpen(true);context.setView('conversation');void context.openConversation(workspaceId,id);setOpen(false);};
  const more = async () => {
    setLoading(true);
    try {const result=await context.api.list(workspaceId,{taskId,cursor});if(currentScope.current!==scopeKey)return;setRows(previous=>[...previous,...result.conversations.filter(row=>!previous.some(item=>item.id===row.id))]);setCursor(result.nextCursor);setError('');}
    catch(failure){if(currentScope.current===scopeKey)setError(failure instanceof Error?failure.message:'读取任务对话失败。');}
    finally{if(currentScope.current===scopeKey)setLoading(false);}
  };
  const choose = () => {if(error || rows.length>1 || cursor){setOpen(true);return;}if(rows.length===1)show(rows[0].id);else startDraft();};
  return <section className="task-conversation-entry" data-task-internal-conversations={taskId}>
    <Popover trigger="click" open={open&&viewActive} onOpenChange={value=>{if(!value)setOpen(false);}} content={<div className="ac-task-picker">
      {error&&<Alert type="warning" message={error} action={<Button size="small" onClick={()=>setReload(value=>value+1)}>重试</Button>}/>}
      {rows.map(item=><button type="button" key={item.id} data-associated-conversation={item.id} onClick={()=>show(item.id)}><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString()}</small></button>)}
      {cursor&&<Button size="small" loading={loading} onClick={()=>void more()}>加载更多对话</Button>}
      <Button size="small" aria-label="新建任务对话" icon={<PlusOutlined aria-hidden/>} onClick={startDraft}>新对话</Button>
    </div>}>
      <button type="button" className={`task-conversation-link ${loading?'is-loading':error?'has-error':rows.length?'has-items':'is-empty'}`} aria-label="任务对话" aria-busy={loading} disabled={loading} onClick={choose}><CommentOutlined/> 任务对话{loading?' · 读取中…':error?' · 未确认':rows.length?` · ${rows.length}${cursor?'+':''}`:<PlusOutlined className="task-conversation-add" aria-hidden/>}</button>
    </Popover>
  </section>;
}
