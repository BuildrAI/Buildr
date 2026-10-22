import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import { ExclamationCircleOutlined, SyncOutlined, DownloadOutlined } from '@ant-design/icons';
import { useUpdateFlow } from '../hooks/useUpdateFlow';
import { buildUpdateView, updateEntryVisible } from '../lib/update-view';
import { copyText } from '../../../lib/copyText';
import { UpdateDialog } from './UpdateDialog';

export type UpdateEntryHandle = { check():void };
type Props = { enabled:boolean; openAgentAction(action?:string,context?:Record<string,unknown>):void; onCompleted?():void };
const storageKey='buildr.pending-update';
function pendingUpdate():{id:string;version:string}|null {try{const value=JSON.parse(sessionStorage.getItem(storageKey)||'null');return typeof value?.id==='string'&&typeof value?.version==='string'?value:null;}catch{return null;}}
export const UpdateEntry=forwardRef<UpdateEntryHandle,Props>(function UpdateEntry({enabled,openAgentAction,onCompleted},ref){
  const {notification,message}=App.useApp();
  const flow=useUpdateFlow({enabled,onCompleted});
  const [open,setOpen]=useState(()=>Boolean(pendingUpdate())),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[selectedTrack,setSelectedTrack]=useState('');
  const [showCompleted,setShowCompleted]=useState(()=>Boolean(pendingUpdate()));
  const previousStatus=useRef<string|null>(null),actionPending=useRef(false);
  const check=useCallback(()=>{setOpen(true);setActionError('');setShowCompleted(false);void flow.check();},[flow.check]);
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
  const active=['downloading','installing','launcher-updating','restarting','verifying'].includes(view.phase);
  return <>
    {visible&&<Tooltip title={view.phase.endsWith('error')?'更新有待恢复的事项':view.phase==='ready'?'更新已准备好':active?'更新正在进行':'有新版本可更新'}><Button id="update-entry" className={'shell-update-entry'+(view.phase.endsWith('error')?' has-warning':'')} aria-label="软件更新" type="text" icon={active?<SyncOutlined spin/>:view.phase.endsWith('error')?<ExclamationCircleOutlined/>:<DownloadOutlined/>} onClick={()=>{setOpen(true);setActionError('');}}/></Tooltip>}
    <UpdateDialog open={open} view={view} busy={busy||flow.checking} actionError={actionError} disconnected={flow.connection==='timed-out'} onClose={close} onCheck={check} onTargetChange={setSelectedTrack}
      onDownload={()=>{if(view.target)void run(()=>flow.prepare(view.target!.track,view.target!.version));}}
      onInstall={()=>{remember();if(flow.job?.version)void run(()=>flow.apply(flow.job!.version!));}}
      onRecover={action=>{remember();void run(()=>flow.recover(action));}}
      onReconnect={()=>void flow.reconnect()}
      onCopy={command=>void (async()=>{if(await copyText(command))void message.success('命令已复制。');else void message.warning('复制失败，请选中命令手动复制。');})()}
      onAgent={()=>{if(!view.target)return;const command=`buildr update --track ${view.target.track}`;openAgentAction('release-update',{track:view.target.track,version:view.target.version,command,prompt:`用户选择更新 Buildr 到 ${view.target.label} ${view.target.version}。先检查 buildr update check --json，确认该通道版本仍一致，再执行 ${command}。不要更换通道或降级；完成后核实实际安装、启动入口和网页运行版本。`});setOpen(false);}}/>
  </>;
});
