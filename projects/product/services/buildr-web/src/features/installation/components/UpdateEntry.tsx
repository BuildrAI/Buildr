import { AgentProgramUpdates } from '../../agent-conversations/AgentProgramUpdates';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { App, Button, Space, Tag, Tooltip } from 'antd';
import { ExclamationCircleOutlined, SyncOutlined, DownloadOutlined } from '@ant-design/icons';
import { useUpdateFlow } from '../hooks/useUpdateFlow';
import { buildUpdateView, updateEntryVisible } from '../lib/update-view';
import { UpdateDialog } from './UpdateDialog';

export type UpdateEntryHandle = { check():void };
type Props = { enabled:boolean; checkOnly?:boolean; openAgentAction(action?:string,context?:Record<string,unknown>):void; onCompleted?():void };
const storageKey='buildr.pending-update';
function pendingUpdate():{id:string;version:string}|null {try{const value=JSON.parse(sessionStorage.getItem(storageKey)||'null');return typeof value?.id==='string'&&typeof value?.version==='string'?value:null;}catch{return null;}}
export const UpdateEntry=forwardRef<UpdateEntryHandle,Props>(function UpdateEntry({enabled,checkOnly=false,onCompleted},ref){
  const {notification}=App.useApp();
  const flow=useUpdateFlow({enabled,onCompleted});
  const [open,setOpen]=useState(()=>Boolean(pendingUpdate())),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[selectedTrack,setSelectedTrack]=useState('');
  const [agentCheckRequest,setAgentCheckRequest]=useState(0);
  const [showCompleted,setShowCompleted]=useState(()=>Boolean(pendingUpdate()));
  const previousStatus=useRef<string|null>(null),actionPending=useRef(false);
  const check=useCallback(()=>{setOpen(true);setActionError('');setShowCompleted(false);setAgentCheckRequest(value=>value+1);void flow.check();},[flow.check]);
  useImperativeHandle(ref,()=>({check}),[check]);
  useEffect(()=>{
    const previous=previousStatus.current;previousStatus.current=flow.job?.status??null;
    if(previous==='preparing'&&flow.job?.status==='ready'&&!open)notification.info({message:'更新包已准备好',description:'点击后可确认安装并重启。',onClick:()=>setOpen(true)});
  },[flow.job?.status,notification,open]);
  useEffect(()=>{
    const pending=pendingUpdate();
    if(flow.job&&pending&&(flow.job.id!==pending.id||flow.job.version!==pending.version)){
      try{sessionStorage.removeItem(storageKey);}catch{}
      setShowCompleted(false);
    }
  },[flow.job?.id,flow.job?.version]);
  const run=async(action:()=>Promise<unknown>)=>{
    if(actionPending.current)return;
    actionPending.current=true;setBusy(true);setActionError('');
    try{await action();}catch(error){setActionError(error instanceof Error?error.message:'操作失败，请重试。');}finally{actionPending.current=false;setBusy(false);}
  };
  const view=buildUpdateView({...flow,selectedTrack,showCompleted});
  const remember=()=>{const current=flow.job;if(current?.id&&current.version){try{sessionStorage.setItem(storageKey,JSON.stringify({id:current.id,version:current.version}));}catch{}}setShowCompleted(true);};
  const close=()=>{setOpen(false);if(['completed','latest'].includes(view.phase)){try{sessionStorage.removeItem(storageKey);}catch{}setShowCompleted(false);}};
  if(!enabled)return null;
  const visible=updateEntryVisible(flow.awareness,flow.job,flow.connection);
  const active=['downloading','installing','launcher-updating','restarting','verifying','workspaces-updating'].includes(view.phase);
  return <>
    {visible&&<Tooltip title={view.phase.endsWith('error')?'更新有待恢复的事项':view.phase==='ready'?'更新已准备好':active?'更新正在进行':'有新版本可更新'}><Button id="update-entry" className={'shell-update-entry'+(view.phase.endsWith('error')?' has-warning':'')} aria-label="软件更新" type="text" icon={active?<SyncOutlined spin/>:view.phase.endsWith('error')?<ExclamationCircleOutlined/>:<DownloadOutlined/>} onClick={()=>{setOpen(true);setActionError('');}}/></Tooltip>}
    <UpdateDialog footerContent={checkOnly?<><p className="page-copy">预览实例仅检查版本，安装更新请回到日常使用的 Buildr。</p><Button onClick={close}>关闭</Button></>:undefined} allowBackground extraContent={<><AgentProgramUpdates scope="global" active={open} checkRequest={agentCheckRequest}/>{flow.job?.workspaces?.length?<div className="buildr-update-workspaces" aria-label="工作空间更新结果"><h2>工作空间</h2>{flow.job.workspaces.map(entry=><div key={entry.rootPath} className="buildr-update-workspace"><Space wrap><strong>{entry.name}</strong><Tag color={entry.status==='done'?'success':entry.status==='failed'?'warning':'default'}>{entry.status==='done'?'可使用新版':entry.status==='failed'?'待完成':entry.status==='running'?'准备中':entry.status==='skipped'?'已移除':'等待中'}</Tag>{!checkOnly&&entry.status==='failed'&&Boolean(entry.customizations?.length)&&<Button size="small" disabled={busy||flow.job?.status==='applying'} onClick={()=>{remember();void run(()=>flow.recover('workspaces',entry.rootPath,true));}}>保留当前定制并继续</Button>}{!checkOnly&&entry.status==='failed'&&<Button size="small" disabled={busy||flow.job?.status==='applying'} onClick={()=>{remember();void run(()=>flow.recover('workspaces',entry.rootPath));}}>重试</Button>}</Space><div className="mono">{entry.rootPath}</div>{entry.error&&<p role="alert">{entry.error}</p>}{entry.status==='failed'&&entry.details&&<details><summary>查看详情</summary><pre className="workspace-preparation-details">{entry.details}</pre></details>}</div>)}</div>:null}</>} open={open} view={view} busy={busy||flow.checking} actionError={actionError} disconnected={flow.connection==='timed-out'} onClose={close} onCheck={check} onTargetChange={setSelectedTrack}
      onDownload={()=>{if(view.target)void run(async()=>{const next=await flow.prepare(view.target!.track,view.target!.version);setShowCompleted(true);try{sessionStorage.setItem(storageKey,JSON.stringify({id:next.id,version:next.version}));}catch{}});}}
      onInstall={()=>{remember();if(flow.job?.version)void run(()=>flow.apply(flow.job!.version!));}}
      onRecover={action=>{remember();void run(()=>flow.recover(action));}}
      onReconnect={()=>void flow.reconnect()}
      onAgent={()=>{}}/>
  </>;
});
