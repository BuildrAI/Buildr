import { useContext, useEffect, useState } from 'react';
import { Alert, Button, Popover } from 'antd';
import { CommentOutlined, PlusOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../app/pageTabs';
import { useOptionalAgentConversations } from './AgentConversationsContext';
import type { ConversationSummary } from './types';
// 任务对话只保留一个入口：无对话时进入绑定此任务的草稿，单个直接打开，多个在此选择。
// 新对话不立即创建会话；草稿按工作空间共享，首次发送时才建立服务端对话。
export function TaskConversationEntry({workspaceId,taskId}:{workspaceId:string;taskId:string}){
  const context=useOptionalAgentConversations(),viewActive=useContext(WorkspaceViewActiveContext);
  const [rows,setRows]=useState<ConversationSummary[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);
  useEffect(()=>{if(!context||!viewActive)return;const controller=new AbortController();setLoading(true);void context.api.list(workspaceId,{taskId,signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setRows(result.conversations);setError('');}}).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'读取任务对话失败。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[context?.api,workspaceId,taskId,viewActive,context?.conversation?.id]);
  if(!context)return null;
  const startDraft=()=>{context.newConversation({scope:{workspaceId,taskId}});setOpen(false);};
  const openEntry=()=>{if(error){setOpen(true);return;}if(rows.length===0){startDraft();return;}if(rows.length===1){void context.openConversation(workspaceId,rows[0].id);return;}setOpen(true);};
  const state=loading?'is-loading':error?'has-error':rows.length?'has-items':'is-empty';
  const hint=loading?'正在读取任务对话…':error?'读取任务对话失败，点击查看详情':rows.length===0?'暂无关联对话，点击开始任务对话（首次发送时创建）':rows.length===1?'已有 1 段任务对话，点击继续':`已有 ${rows.length} 段任务对话，点击选择`;
  return <section className="task-conversation-entry" data-task-internal-conversations={taskId}><Popover trigger="click" open={open&&viewActive} onOpenChange={value=>setOpen(value&&(rows.length>1||Boolean(error)))} content={<div className="ac-task-picker">{error&&<Alert type="warning" message={error}/>} {rows.map(item=><button key={item.id} onClick={()=>{void context.openConversation(workspaceId,item.id);setOpen(false);}}><strong>{item.title}</strong><small>{item.participants.length} 位参与者 · {new Date(item.updatedAt).toLocaleString()}</small></button>)}<Button size="small" aria-label="新建任务对话" icon={<PlusOutlined aria-hidden/>} onClick={startDraft}>新对话</Button></div>}><button type="button" className={`task-conversation-link ${state}`} aria-label="任务对话" title={hint} aria-busy={loading} disabled={loading} onClick={openEntry}><CommentOutlined/> 任务对话{loading?' · 读取中…':error?' · 未确认':rows.length?` · ${rows.length}`:<PlusOutlined className="task-conversation-add" aria-hidden/>}</button></Popover></section>;
}
