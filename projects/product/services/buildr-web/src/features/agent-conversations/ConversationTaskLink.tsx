import {useCallback,useEffect,useState} from 'react';
import {Alert} from 'antd';
import {useNavigate} from 'react-router-dom';
import {ConversationAssociationPopover,AssociationRows,AssociationSearch} from './ConversationAssociationPopover';
import {associationKey,taskLinkKey,type AssociationItem} from './conversation-associations';
import {associationWorkspaces,linkedTaskItems,searchTaskAssociations,ASSOCIATIONS_CHANGED,type AssociationWorkspace} from './conversation-association-client';
import type {ConversationTaskLink} from './types';

type Props={taskLinks:ConversationTaskLink[];onAssign:(links:ConversationTaskLink[])=>Promise<boolean>;onNavigate?:()=>void};
export function ConversationTaskLink({taskLinks,onAssign,onNavigate}:Props){
  const navigate=useNavigate(),[open,setOpen]=useState(false),[rows,setRows]=useState<AssociationItem[]>([]),[workspaces,setWorkspaces]=useState<AssociationWorkspace[]>([]);
  const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[catalogError,setCatalogError]=useState('');
  const linksKey=JSON.stringify(taskLinks);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setLoading(true);setError('');
    void linkedTaskItems(taskLinks,controller.signal).then(value=>{if(!controller.signal.aborted)setRows(value);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);}).catch(()=>{});
    void associationWorkspaces(controller.signal).then(value=>{if(!controller.signal.aborted){setWorkspaces(value);setCatalogError('');}}).catch(failure=>{if(!controller.signal.aborted)setCatalogError(failure instanceof Error?failure.message:'工作空间读取失败。');});
    return()=>controller.abort();
  },[open,linksKey]);
  const names=Object.fromEntries(workspaces.map(item=>[item.id,item.name]));
  const search=useCallback(async(query:string,signal:AbortSignal)=>{
    const scopes=await associationWorkspaces(signal);if(!signal.aborted)setWorkspaces(scopes);
    return searchTaskAssociations(scopes,query,signal);
  },[]);
  const change=async(next:ConversationTaskLink[])=>{
    if(saving)return;setSaving(true);setError('');
    try{if(await onAssign(next))window.dispatchEvent(new Event(ASSOCIATIONS_CHANGED));else setError('关联未保存，请核对当前对话状态后重试。');}
    catch(failure){setError(failure instanceof Error?failure.message:'关联保存失败。');}
    finally{setSaving(false);}
  };
  const visible=taskLinks.map(link=>rows.find(row=>associationKey(row)===taskLinkKey(link))??{workspaceId:link.workspaceId,id:link.taskId,title:link.taskId});
  return <ConversationAssociationPopover kind="task" count={taskLinks.length} loading={loading} onOpenChange={setOpen}>
    <strong>已关联任务</strong>{error&&<Alert type="warning" message={error}/>}
    {catalogError&&<Alert type="warning" message={catalogError}/>}
    {!visible.length&&<small>暂无关联任务。</small>}
    <AssociationRows items={visible} names={names} saving={saving} onOpen={item=>{onNavigate?.();navigate(`/workspaces/${encodeURIComponent(item.workspaceId)}/tasks/${encodeURIComponent(item.id)}`);}} onRemove={item=>void change(taskLinks.filter(link=>taskLinkKey(link)!==associationKey(item)))}/>
    <AssociationSearch kind="task" names={names} selected={new Set(taskLinks.map(taskLinkKey))} saving={saving} search={search} onAdd={item=>void change([...taskLinks,{workspaceId:item.workspaceId,taskId:item.id}])}/>
  </ConversationAssociationPopover>;
}
