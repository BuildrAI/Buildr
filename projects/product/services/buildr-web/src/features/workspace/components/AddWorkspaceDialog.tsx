import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Result, Space, Spin, Typography } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { workspacePreparationApi, type WorkspacePreparation } from '../api/workspace-preparation-api';
import { copyText } from '../../../lib/copyText';
const storageKey = 'buildr.workspace-preparation';
export function AddWorkspaceDialog({open,onClose,onReady,onOpen,onProgress,incoming}: {open:boolean;onClose():void;onReady():void;onOpen(id:string):void;onProgress(value:WorkspacePreparation|null):void;incoming?:WorkspacePreparation|null}) {
  const [value,setValue] = useState<WorkspacePreparation|null>(null),[name,setName] = useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(true),readyCallback=useRef(onReady),progressCallback=useRef(onProgress);
  readyCallback.current=onReady;progressCallback.current=onProgress;
  const incomingRef=useRef(incoming);incomingRef.current=incoming;
  const latest=useRef<WorkspacePreparation|null>(null);
  const accept=(next:WorkspacePreparation)=>{if(!mounted.current||latest.current?.id===next.id&&latest.current.revision>=next.revision)return;latest.current=next;setValue(next);setName(next.name);progressCallback.current(next);try{localStorage.setItem(storageKey,next.id);}catch{}};
  useEffect(()=>{if(incoming)accept(incoming);},[incoming]);
  useEffect(()=>{mounted.current=true;try{const id=localStorage.getItem(storageKey);if(id)void workspacePreparationApi.inspect(id).then(next=>{if(!incomingRef.current)accept(next);}).catch(()=>{});}catch{}return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(value?.status!=='preparing')return;
    let active=true;
    const timer=setInterval(()=>{void workspacePreparationApi.inspect(value.id).then(next=>{if(!active)return;accept(next);if(next.status!=='preparing')readyCallback.current();}).catch(reason=>{if(active)setError(reason.message);});},1000);
    return()=>{active=false;clearInterval(timer);};
  },[value?.id,value?.status]);
  const choose=async()=>{setBusy(true);setError('');try{const next=await workspacePreparationApi.choose();if(!('canceled' in next))accept(next);}catch(reason){setError(reason instanceof Error?reason.message:'目录选择失败。');}finally{setBusy(false);}};
  const prepare=async(keepCustomizations=false)=>{if(!value||busy)return;setBusy(true);setError('');try{accept(await workspacePreparationApi.prepare(value,name,keepCustomizations));}catch(reason){setError(reason instanceof Error?reason.message:'准备尚未开始，请重试。');}finally{setBusy(false);}};
  const status=value?.status;
  const selecting=!value||status==='selected';
  return <Modal open={open} title={status==='preparing'?'正在准备工作空间':status==='ready'?'工作空间已准备好':status==='failed'?'工作空间尚未准备完成':'添加工作空间'} width={560} onCancel={onClose} footer={<Space wrap>
    <Button onClick={onClose}>{status==='preparing'?'收起':status==='failed'?'稍后处理':'关闭'}</Button>
    {value&&selecting&&<Button id="workspace-add-confirm" type="primary" loading={busy} disabled={!name.trim()} onClick={()=>void prepare()}>添加并打开</Button>}
    {status==='failed'&&Boolean(value?.customizations?.length)&&<Button loading={busy} onClick={()=>void prepare(true)}>保留当前定制并继续</Button>}
    {status==='failed'&&<Button id="workspace-add-retry" type="primary" loading={busy} onClick={()=>void prepare()}>重试</Button>}
    {status==='ready'&&<><Button onClick={()=>void copyText(value!.rootPath)}>复制目录</Button><Button type="primary" onClick={()=>{onClose();onOpen(value!.workspaceId!);}}>进入工作空间</Button><Button onClick={()=>{latest.current=null;setValue(null);progressCallback.current(null);}}>添加另一个</Button></>}
  </Space>}>
    <Space direction="vertical" size={20} style={{width:'100%'}}>
      {!value&&<><Typography.Paragraph type="secondary">选择你和智能体共同工作的本机目录，Buildr 会准备开始工作所需的内容。</Typography.Paragraph><Button id="workspace-choose-directory" icon={<FolderOpenOutlined/>} size="large" loading={busy} block onClick={()=>void choose()}>选择文件夹</Button></>}
      {value&&<div className="workspace-lifecycle-directory-summary"><FolderOpenOutlined/><div><Typography.Text strong>{name}</Typography.Text><Typography.Paragraph className="mono" style={{overflowWrap:'anywhere',marginBottom:0}}>{value.rootPath}</Typography.Paragraph></div>{selecting&&<Button type="link" loading={busy} onClick={()=>void choose()}>更换</Button>}</div>}
      {value&&selecting&&<><Form layout="vertical"><Form.Item label="工作空间名称"><Input id="workspace-add-name" value={name} maxLength={160} onChange={event=>setName(event.target.value)} onPressEnter={()=>void prepare()}/></Form.Item></Form><Typography.Text type="secondary">已有文件会保留。Buildr 会自动准备工作内容和智能体入口，并确认目录可用。</Typography.Text></>}
      {status==='preparing'&&<Space><Spin/><span>正在检查目录、准备工作内容并确认可用。可以收起窗口，稍后继续查看。</span></Space>}
      {status==='failed'&&<Alert showIcon type="warning" message={value!.error||'工作空间准备未完成'} description="已完成的内容会保留，重试将继续准备。"/>}
      {status==='ready'&&<Result status="success" title="现在就可以开始工作" subTitle="在智能体中选择这个目录，新开对话即可使用。"/>}
      {status==='failed'&&value?.details&&<details><summary>查看详情</summary><pre className="workspace-preparation-details">{value.details}</pre></details>}
      {error&&<Alert showIcon type="error" message={error}/>}
    </Space>
  </Modal>;
}
