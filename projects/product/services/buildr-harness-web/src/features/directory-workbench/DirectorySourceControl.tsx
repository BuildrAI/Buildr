import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Space } from 'antd';
import { SourceControlWorkbench } from '../../workbench/source-control/SourceControlWorkbench';
import { sourceControlChange, type SourceControlFileTarget, type SourceControlReader, type SourceControlRepository, type SourceControlScene } from '../../workbench/source-control/source-control-model';
import { useSourceControlRead } from '../../workbench/source-control/useSourceControlRead';
import { DirectoryGitActions } from './DirectoryGitActions';
import type { DirectoryRepositories, DirectorySelection, DirectoryRequest, DirectoryScope, LocalStatus } from './api';

const emptyInput={};
const noTask=()=>{};
const errorMessage=(error:unknown)=>error instanceof Error ? error.message : '操作结果未确认，请刷新核对。';
export function DirectorySourceControl({scope,request,active,version,onOpenCurrent,current,catalog,catalogError,catalogLoading,refreshCatalog,onSelectCheckout}: {
  scope:DirectoryScope;request:DirectoryRequest;active:boolean;version:number;onOpenCurrent?(target:SourceControlFileTarget):void;
  current:DirectorySelection|null;catalog:DirectoryRepositories|null;catalogError:string;catalogLoading:boolean;refreshCatalog():Promise<void>;onSelectCheckout(target:DirectorySelection):void;
}) {
  const checkoutId=current?.checkoutId;
  const [scene,setScene]=useState<SourceControlScene>('changes');
  const [messages,setMessages]=useState<Record<string,string>>({}),[writing,setWriting]=useState(false);
  const messageKey=checkoutId??scope.ref.id, message=messages[messageKey]??'';
  const setMessage=(text:string)=>setMessages(previous=>({...previous,[messageKey]:text}));
  const [result,setResult]=useState<{checkout:string;type:'success'|'warning';text:string}|null>(null);
  const busy=useRef(false);
  const load=useCallback((_input:object,signal:AbortSignal)=>request<LocalStatus>('status',{},signal),[request]);
  const read=useSourceControlRead(scope.ref.id+':'+(checkoutId??''),emptyInput,load,active&&Boolean(checkoutId),String(version));
  const status=read.data;
  const reader=useMemo<SourceControlReader>(()=>({
    history:(input,signal)=>request('history',input,signal),
    commit:(input,signal)=>request('commit',input,signal),
    diff:(input,signal)=>request('diff',input,signal),
    sourceFile:(input,signal)=>request('source-file',input,signal),
  }),[request]);
  const refreshStatus=read.refresh;
  const refresh=useCallback(async()=>{await Promise.all([refreshStatus(),refreshCatalog()]);},[refreshStatus,refreshCatalog]);
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
      if(action==='commit'&&receipt.hash){setMessage('');setResult({checkout:messageKey,type:'success',text:`本地提交完成 ${receipt.hash.slice(0,12)}，未推送。`});}
    } catch(error){setResult({checkout:messageKey,type:'warning',text:errorMessage(error)});}
    finally{await refresh();busy.current=false;setWriting(false);}
  };
  const repositories=useMemo<SourceControlRepository[]>(()=>{
    return (catalog?.repositories??[]).flatMap(repo=>{
      const worktrees:SourceControlRepository['worktrees']=repo.checkouts.members.map(member=>{
        const observed=status?.worktreeId===member.id?status:null;
        return {worktreeId:member.id,name:member.name,location:member.location,branch:observed?.branch??member.branch,
          head:observed?.head??member.head,isMain:member.isMain,isRegistered:member.id===repo.checkouts.defaultId,
          ahead:observed?.ahead??null,behind:observed?.behind??null,upstream:observed?.upstream??null,
          changes:observed?.files.map(sourceControlChange)??[],commits:[],fileCount:observed?.fileCount??null,
          observedRevision:observed?.observedRevision??null,status:observed?(observed.truncated?'partial':observed.fileCount?'ready':'clean'):
            (member.id===checkoutId&&read.error?'offline':'partial'),diagnostics:[]};
      });
      const registered=worktrees.find(item=>item.isRegistered);
      if(!registered)return [];
      const name=repo.path?repo.name:scope.name||repo.name;
      return [{...registered,id:repo.id,code:name,name,branches:[],simulated:false,services:[],worktrees,worktreeCount:worktrees.length}];
    });
  },[catalog,checkoutId,read.error,scope.name,status]);
  const targets=useMemo(()=>current?[current]:[],[current?.repositoryId,current?.checkoutId]);
  const staged=status?.files.filter(file=>file.area==='staged').length??0;
  const disabled=writing||read.loading||!!read.error||!status?.writeRevision||!!status.writeUnavailable;
  if(!repositories.length&&(read.error||catalogError||catalog?.diagnostic))return <Alert type="warning" showIcon message="源代码管理暂不可用" description={read.error||catalogError||catalog?.diagnostic} action={<Button onClick={()=>void refresh()}>重新读取</Button>} />;
  return <div className="harness-directory-source-control" aria-label="源代码管理">
    {result?.checkout===messageKey&&<Alert type={result.type} showIcon message={result.text} closable onClose={()=>setResult(null)}/>}
    <SourceControlWorkbench sidebarOnRight separateChangeLayers onOpenCurrentInExplorer={onOpenCurrent} active={active} suspendSelection={!current} repositories={repositories} defaultRepositories={current?repositories:[]} scene={scene} reader={reader}
      readKey={scope.ref.id+':'+scope.revision} observation={{loading:catalogLoading||read.loading,error:read.error||catalogError,readAt:status?.readAt||(catalog?'目录清单已读取':''),diagnostics:[catalog?.diagnostic,status?.writeUnavailable].filter(Boolean) as string[],truncated:catalog?.truncated||status?.truncated}}
      currentSourceSelection={checkoutId?{key:checkoutId,targets,preferredTarget:targets[0]}:null} onCurrentSourceSelect={onSelectCheckout}
      onRefresh={()=>refresh()} onRetry={()=>refresh()} onScene={setScene} onOpenTask={noTask}
      onViewCurrent={onOpenCurrent}
      renderChangeFileAction={(_repository,_worktree,file)=>{
        const action=file.area==='staged'?'unstage':'stage', label=action==='stage'?'暂存':'取消暂存';
        if(_worktree.worktreeId!==status?.worktreeId||!['staged','unstaged','untracked'].includes(file.area))return null;
        return <Button type="text" size="small" disabled={disabled} aria-label={`${label} ${file.path}`} onClick={()=>void run(action,file.path)}>{label}</Button>;
      }}
      renderChangeActions={(_repo,worktree,visible)=>status&&worktree.worktreeId===status.worktreeId?<div className="harness-local-commit">
        <DirectoryGitActions key={worktree.worktreeId} request={request} worktreeId={worktree.worktreeId} active={visible} disabled={writing||read.loading||!!read.error} onChanged={refresh}/>
        <Input.TextArea autoSize={{minRows:2,maxRows:4}} maxLength={4096} aria-label="本地提交说明" placeholder="填写本地提交说明" value={message} disabled={writing} onChange={event=>setMessage(event.target.value)}/>
        <Space wrap><Button type="primary" disabled={disabled||!!status.commitUnavailable||!message.trim()} loading={writing} onClick={()=>void run('commit')}>提交暂存内容（{staged}）</Button>
          <span title={status.commitUnavailable||undefined}>{status.commitUnavailable??'只提交暂存内容，不推送'}</span></Space>
      </div>:null} />
  </div>;
}
