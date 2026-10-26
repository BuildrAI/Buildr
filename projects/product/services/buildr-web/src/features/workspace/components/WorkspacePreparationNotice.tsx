import { useEffect, useState } from 'react';
import { Alert, Button } from 'antd';
import { workspacePreparationApi, type WorkspacePreparation } from '../api/workspace-preparation-api';
import { AddWorkspaceDialog } from './AddWorkspaceDialog';

/** Workspace links and the switcher share the same recoverable preparation. */
export function WorkspacePreparationNotice({workspaceId}:{workspaceId:string}) {
  const [incoming,setIncoming]=useState<WorkspacePreparation|null>(null),[progress,setProgress]=useState<WorkspacePreparation|null>(null),[open,setOpen]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;setIncoming(null);setProgress(null);setOpen(false);setError('');
    void workspacePreparationApi.open(workspaceId).then(value=>{if(!active)return;if('ready' in value){if(value.resourceRefresh?.status==='failed')setError(`本机技能入口尚未刷新，其他工作可继续。${value.resourceRefresh.message||''}`);}else{setIncoming(value);setProgress(value);}}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'工作空间准备暂时无法接续。');});
    return()=>{active=false;};
  },[workspaceId,retry]);
  if(error)return <Alert showIcon type="warning" message={error} action={<Button size="small" onClick={()=>setRetry(value=>value+1)}>重试准备</Button>}/>;
  if(!incoming)return null;
  return <>
    {progress?.status!=='ready'&&<Alert showIcon type={progress?.status==='failed'?'warning':'info'} message={progress?.status==='failed'?'此工作空间尚未准备完成，已有内容已保留。':'正在为此工作空间准备新版工作内容。'} action={<Button size="small" onClick={()=>setOpen(true)}>{progress?.status==='failed'?'查看并重试':'查看进度'}</Button>}/>}
    <AddWorkspaceDialog key={workspaceId} incoming={incoming} open={open} onClose={()=>setOpen(false)} onSettled={()=>{}} onProgress={setProgress}/>
  </>;
}
