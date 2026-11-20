import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Space } from 'antd';
import { SourceControlWorkbench } from '../../workbench/source-control/SourceControlWorkbench';
import { sourceControlChange, type SourceControlReader, type SourceControlRepository, type SourceControlScene } from '../../workbench/source-control/source-control-model';
import { useSourceControlRead } from '../../workbench/source-control/useSourceControlRead';
import type { DirectoryRequest, DirectoryScope, LocalStatus } from './api';

const emptyInput={};
const noTask=()=>{};
const errorMessage=(error:unknown)=>error instanceof Error ? error.message : '操作结果未确认，请刷新核对。';
export function DirectorySourceControl({scope,request,active,version,onOpenCurrent}: {
  scope:DirectoryScope;request:DirectoryRequest;active:boolean;version:number;onOpenCurrent?(path:string):void;
}) {
  const [scene,setScene]=useState<SourceControlScene>('changes');
  const [message,setMessage]=useState(''),[writing,setWriting]=useState(false);
  const [result,setResult]=useState<{type:'success'|'warning';text:string}|null>(null);
  const busy=useRef(false);
  const load=useCallback((_input:object,signal:AbortSignal)=>request<LocalStatus>('status',{},signal),[request]);
  const read=useSourceControlRead(scope.ref.id,emptyInput,load,active,String(version));
  const status=read.data;
  const reader=useMemo<SourceControlReader>(()=>({
    history:(input,signal)=>request('history',input,signal),
    commit:(input,signal)=>request('commit',input,signal),
    diff:(input,signal)=>request('diff',input,signal),
    sourceFile:(input,signal)=>request('source-file',input,signal),
  }),[request]);
  const refresh=read.refresh;
  useEffect(()=>{
    if(!active)return;
    const onFocus=()=>void refresh();
    window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus);
  },[active,refresh]);
  const run=async(action:'stage'|'unstage'|'commit',path?:string)=>{
    if(busy.current||!status?.writeRevision||read.loading||read.error||status.writeUnavailable||(action==='commit'&&status.commitUnavailable))return;
    busy.current=true;setWriting(true);setResult(null);
    try {
      const receipt=await request<{hash:string|null}>('git-write',{action,worktreeId:status.worktreeId,expectedRevision:status.writeRevision,...(path?{path}:{}),...(action==='commit'?{message}:{})});
      if(action==='commit'&&receipt.hash){setMessage('');setResult({type:'success',text:`本地提交完成 ${receipt.hash.slice(0,12)}，未推送。`});}
    } catch(error){setResult({type:'warning',text:errorMessage(error)});}
    finally{await refresh();busy.current=false;setWriting(false);}
  };
  const repositories=useMemo<SourceControlRepository[]>(()=>{
    if(!status)return [];
    const changes=status.files.map(sourceControlChange), state:SourceControlRepository['status']=status.truncated?'partial':status.fileCount?'ready':'clean';
    const diagnostics=status.truncated?['变更数量超过读取上限。']:[];
    const { location, branch, head, upstream, ahead, behind, fileCount, observedRevision }=status;
    const facts={location,branch,head,upstream,ahead,behind,fileCount,observedRevision,changes,commits:[],status:state,diagnostics};
    return [{...facts,id:status.repositoryId,code:scope.name||location.split(/[\\/]/).at(-1)||'当前目录',name:scope.name||'当前目录',branches:[],simulated:false,services:[],worktrees:[{...facts,worktreeId:status.worktreeId,name:location.split(/[\\/]/).at(-1)||location,isMain:status.isMain,isRegistered:true}],worktreeCount:1}];
  },[status,scope.name]);
  const staged=status?.files.filter(file=>file.area==='staged').length??0;
  const disabled=writing||read.loading||!!read.error||!status?.writeRevision||!!status.writeUnavailable;
  if(!status&&read.error)return <Alert type="warning" showIcon message="源代码管理暂不可用" description={read.error} action={<Button onClick={()=>void refresh()}>重新读取</Button>} />;
  return <div className="harness-directory-source-control" aria-label="源代码管理">
    {result&&<Alert type={result.type} showIcon message={result.text} closable onClose={()=>setResult(null)}/>}
    <SourceControlWorkbench sidebarOnRight separateChangeLayers onOpenCurrentInExplorer={onOpenCurrent?target=>onOpenCurrent(target.path):undefined} active={active} repositories={repositories} scene={scene} reader={reader}
      readKey={scope.ref.id+':'+scope.revision} observation={{loading:read.loading,error:read.error,readAt:status?.readAt||'',diagnostics:status?.writeUnavailable?[status.writeUnavailable]:[],truncated:status?.truncated}}
      onRefresh={()=>refresh()} onRetry={()=>refresh()} onScene={setScene} onOpenTask={noTask}
      onViewCurrent={onOpenCurrent?target=>onOpenCurrent(target.path):undefined}
      renderChangeFileAction={(_repository,_worktree,file)=>{
        const action=file.area==='staged'?'unstage':'stage', label=action==='stage'?'暂存':'取消暂存';
        if(!['staged','unstaged','untracked'].includes(file.area))return null;
        return <Button type="text" size="small" disabled={disabled} aria-label={`${label} ${file.path}`} onClick={()=>void run(action,file.path)}>{label}</Button>;
      }}
      renderChangeActions={()=>status?<div className="harness-local-commit">
        <Input.TextArea autoSize={{minRows:2,maxRows:4}} maxLength={4096} aria-label="本地提交说明" placeholder="填写本地提交说明" value={message} disabled={writing} onChange={event=>setMessage(event.target.value)}/>
        <Space wrap><Button type="primary" disabled={disabled||!!status.commitUnavailable||!message.trim()} loading={writing} onClick={()=>void run('commit')}>提交暂存内容（{staged}）</Button>
          <span title={status.commitUnavailable||undefined}>{status.commitUnavailable??'只提交暂存内容，不推送'}</span></Space>
      </div>:null} />
  </div>;
}
