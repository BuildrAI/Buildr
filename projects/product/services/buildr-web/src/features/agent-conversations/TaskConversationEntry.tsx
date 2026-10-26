import { useContext, useEffect, useState } from 'react';
import { Alert, Button, Popover } from 'antd';
import { CommentOutlined, PlusOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../app/pageTabs';
import { useOptionalAgentConversations } from './AgentConversationsContext';
import type { ConversationSummary } from './types';
export function TaskConversationEntry({workspaceId,taskId,cwd}:{workspaceId:string;taskId:string;cwd?:string}){
  const context=useOptionalAgentConversations(),viewActive=useContext(WorkspaceViewActiveContext);
  const [rows,setRows]=useState<ConversationSummary[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false),[creating,setCreating]=useState(false);
  useEffect(()=>{if(!context||!viewActive)return;const controller=new AbortController();setLoading(true);void context.api.list(workspaceId,{taskId,signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setRows(result.conversations);setError('');}}).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'读取任务对话失败。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[context?.api,workspaceId,taskId,viewActive,context?.conversation?.id]);
  if(!context)return null;
  const create=async()=>{if(creating)return;if(!cwd){setError('正在读取工作空间目录，请稍后重试。');return;}setCreating(true);try{const conversation=await context.create({workspaceId,taskId,cwd});setRows(previous=>[conversation,...previous]);setOpen(false);}catch(failure){setError(failure instanceof Error?failure.message:'创建任务对话失败。');}finally{setCreating(false);}};
  const openEntry=()=>{if(error){setOpen(true);return;}if(rows.length===0){void create();return;}if(rows.length===1){void context.openConversation(workspaceId,rows[0].id);return;}setOpen(true);};
  return <section className="task-internal-conversations" data-task-internal-conversations={taskId}><span><CommentOutlined/> 内部对话 · {loading?'读取中…':error?'未确认':rows.length}</span><Popover trigger="click" open={open&&viewActive} onOpenChange={value=>setOpen(value&&(rows.length>1||Boolean(error)))} title="此任务的内部对话" content={<div className="ac-task-picker">{error&&<Alert type="warning" message={error}/>} {rows.map(item=><button key={item.id} onClick={()=>{void context.openConversation(workspaceId,item.id);setOpen(false);}}><strong>{item.title}</strong><small>{item.participants.length} 位参与者 · {new Date(item.updatedAt).toLocaleString()}</small></button>)}<Button aria-label="新建任务对话" icon={<PlusOutlined aria-hidden/>} loading={creating} onClick={()=>void create()}>新建任务对话</Button></div>}><Button type="link" size="small" aria-label="打开对话" aria-busy={loading||creating} loading={loading||creating} disabled={loading} onClick={event=>{event.stopPropagation();openEntry();}}>打开对话</Button></Popover></section>;
}
