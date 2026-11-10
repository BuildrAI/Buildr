import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import {Alert,Button} from 'antd';
import {PlusOutlined} from '@ant-design/icons';
import {WorkspaceViewActiveContext} from '../../app/pageTabs';
import {useOptionalAgentConversations} from './AgentConversationsContext';
import {ConversationAssociationPopover,AssociationRows,AssociationSearch} from './ConversationAssociationPopover';
import {associationPages,associationKey,conversationTaskLinks,conversationAssociationItem,type AssociationItem} from './conversation-associations';
import {associationWorkspaces,searchConversationAssociations,ASSOCIATIONS_CHANGED} from './conversation-association-client';

/** Both ends edit the conversation's versioned relation, never a task-side copy. */
export function TaskConversationEntry({workspaceId,taskId}:{workspaceId:string;taskId:string}){
  const context=useOptionalAgentConversations(),active=useContext(WorkspaceViewActiveContext);
  const [rows,setRows]=useState<AssociationItem[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[names,setNames]=useState<Record<string,string>>({});
  const scopeKey=JSON.stringify([workspaceId,taskId]),scope=useRef(scopeKey);scope.current=scopeKey;
  const relations=JSON.stringify(context?.conversation?.taskLinks??context?.conversation?.taskIds??context?.conversation?.taskId);
  useEffect(()=>{const refresh=()=>setReload(value=>value+1);window.addEventListener(ASSOCIATIONS_CHANGED,refresh);return()=>window.removeEventListener(ASSOCIATIONS_CHANGED,refresh);},[]);
  useEffect(()=>{
    if(!context||!active)return;
    const controller=new AbortController();setLoading(true);setError('');
    void associationPages(async cursor=>{const result=await context.api.list(workspaceId,{taskId,cursor,hidden:true,signal:controller.signal});return {items:result.conversations,nextCursor:result.nextCursor};},controller.signal).then(result=>{if(!controller.signal.aborted)setRows(result.map(conversationAssociationItem));}).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'关联对话读取失败。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    void associationWorkspaces(controller.signal).then(result=>{if(!controller.signal.aborted)setNames(Object.fromEntries([['@default','默认工作空间'],...result.map(item=>[item.id,item.name])]));}).catch(()=>{});
    return()=>controller.abort();
  },[context?.api,scopeKey,active,relations,reload]);
  useEffect(()=>{setRows([]);setError('');setLoading(true);setSaving(false);},[scopeKey]);
  const search=useCallback((query:string,signal:AbortSignal)=>context?searchConversationAssociations(context.api,query,signal):Promise.resolve({items:[],errors:['对话服务不可用。']}),[context?.api]);
  if(!context)return null;
  const change=async(item:AssociationItem,add:boolean)=>{
    if(saving)return;const observed=scopeKey;setSaving(true);setError('');
    try{
      const current=await context.api.read(item.workspaceId,item.id);
      if(scope.current!==observed)return;
      const previous=conversationTaskLinks(current),exists=previous.some(link=>link.workspaceId===workspaceId&&link.taskId===taskId);
      const next=add?(exists?previous:[...previous,{workspaceId,taskId}]):previous.filter(link=>link.workspaceId!==workspaceId||link.taskId!==taskId);
      const updated=await context.api.update(current,{taskLinks:next});context.apply(updated,current.revision);
      if(scope.current!==observed)return;
      setRows(previous=>add?[...previous.filter(row=>associationKey(row)!==associationKey(item)),item]:previous.filter(row=>associationKey(row)!==associationKey(item)));
      window.dispatchEvent(new Event(ASSOCIATIONS_CHANGED));
    }catch(failure){if(scope.current===observed)setError(failure instanceof Error?failure.message:'关联保存失败。');}
    finally{if(scope.current===observed)setSaving(false);}
  };
  return <section className="task-conversation-entry" data-task-internal-conversations={taskId}>
    <ConversationAssociationPopover key={scopeKey} kind="conversation" count={loading||error?null:rows.length} loading={loading} enabled={active}>
      <strong>已关联对话</strong>{loading&&<small role="status">正在读取关联对话…</small>}
      {error&&<Alert type="warning" message={error} action={<Button size="small" onClick={()=>setReload(value=>value+1)}>重试</Button>}/>}
      {!loading&&!error&&!rows.length&&<small>暂无关联对话。</small>}
      <AssociationRows kind="conversation" items={rows} names={names} saving={saving} onOpen={item=>{context.setFull(false);context.setOpen(true);context.setView('conversation');void context.openConversation(item.workspaceId,item.id);}} onRemove={item=>void change(item,false)}/>
      <AssociationSearch kind="conversation" names={names} selected={new Set(rows.map(associationKey))} saving={saving} search={search} onAdd={item=>void change(item,true)}/>
      <Button data-association-navigate size="small" icon={<PlusOutlined/>} aria-label="新建任务对话" onClick={()=>{context.setFull(false);context.newConversation({scope:{workspaceId,taskId}});}}>新对话</Button>
    </ConversationAssociationPopover>
  </section>;
}
