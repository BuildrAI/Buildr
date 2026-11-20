import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Segmented, Select } from 'antd';
import { directoryClient, listDirectories, post, type DirectoryScope } from './api';
import { DirectoryExplorer } from './DirectoryExplorer';
import { DirectorySourceControl } from './DirectorySourceControl';
import type { FileDraft } from './DirectoryFileEditor';
import './directory-workbench.css';

type Panel='explorer'|'source-control';
const labels=[{value:'explorer' as const,label:'资源管理器'},{value:'source-control' as const,label:'源代码管理'}];

export function HarnessDirectoryWorkbench({active=true,preferredScopeId,onDirectoryAdded,modules=labels.map(item=>item.value)}: {
  active?:boolean; preferredScopeId?:string; onDirectoryAdded?():void; modules?:readonly Panel[];
}) {
  const [directories,setDirectories]=useState<DirectoryScope[]>([]),[selected,setSelected]=useState('');
  const [error,setError]=useState(''),[choosing,setChoosing]=useState(false);
  const drafts=useRef(new Map<string,FileDraft>());
  const fresh=useRef<AbortController|null>(null);
  const refresh=useCallback(async(explicit?:DirectoryScope)=>{
    fresh.current?.abort();const controller=new AbortController();fresh.current=controller;
    try {
      const result=await listDirectories(controller.signal);if(controller.signal.aborted)return;
      setDirectories(result.directories);setError('');
      setSelected(old=>explicit?.ref.id||old||result.directories.find(value=>value.ref.id===preferredScopeId)?.ref.id||result.directories[0]?.ref.id||'');
    }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'目录列表读取失败。');}
  },[preferredScopeId]);
  useEffect(()=>{if(active)void refresh();return()=>fresh.current?.abort();},[active,refresh]);
  const add=async()=>{
    if(choosing)return;setChoosing(true);setError('');
    try{
      const result=await post<{path:string|null}>('/api/v1/harness/directories/choose',{});
      if(!result.path)return;
      const existing=directories.find(item=>item.rootPath===result.path);
      const next=existing??await post<DirectoryScope>('/api/v1/harness/directories',{path:result.path});
      await refresh(next);onDirectoryAdded?.();
    }catch(failure){setError(failure instanceof Error?failure.message:'目录未登记。');}
    finally{setChoosing(false);}
  };
  const current=directories.find(value=>value.ref.id===selected);
  return <div className="harness-directory-workbench">
    <header className="harness-directory-workbench-toolbar"><Select aria-label="工作目录" placeholder="选择工作目录" value={current?.ref.id} onChange={setSelected}
      options={directories.map(dir=>({value:dir.ref.id,label:dir.name||dir.rootPath,title:dir.rootPath}))} />
      <Button loading={choosing} onClick={()=>void add()}>添加本机目录</Button>
      {current&&<code title={current.rootPath}>{current.rootPath}</code>}
    </header>
    {error&&<Alert type="warning" showIcon message={error} action={<Button size="small" onClick={()=>void refresh()}>重新读取</Button>} />}
    {current?<DirectoryPanels key={current.ref.id+':'+current.revision} scope={current} active={active} modules={modules} drafts={drafts.current}/>:<Empty description={selected?'原目录不可用，请明确选择其他已登记目录。':'选择本机目录后开始工作，不需要新建对话。'}/>}
  </div>;
}

function DirectoryPanels({scope,active,modules,drafts}:{scope:DirectoryScope;active:boolean;modules:readonly Panel[];drafts:Map<string,FileDraft>}){
  const [selected,setSelected]=useState<Panel>(modules[0]||'explorer');
  const [visited,setVisited]=useState<Panel[]>([selected]);
  const [opened,setOpened]=useState<{path:string;nonce:number}>(),[version,bump]=useState(0);
  const request=useMemo(()=>directoryClient(scope),[scope.ref.id,scope.revision]);
  const select=(value:Panel)=>{setSelected(value);setVisited(old=>old.includes(value)?old:[...old,value]);};
  return <>
    {modules.length>1&&<Segmented value={selected} options={labels.filter(item=>modules.includes(item.value))} onChange={select} aria-label="目录工作台视图" />}
    {visited.includes('explorer')&&modules.includes('explorer')&&<section className="harness-directory-workbench-pane" hidden={selected!=='explorer'}>
      <DirectoryExplorer scope={scope} request={request} active={active&&selected==='explorer'} drafts={drafts} onSaved={()=>bump(old=>old+1)} opened={opened}/>
    </section>}
    {visited.includes('source-control')&&modules.includes('source-control')&&<section className="harness-directory-workbench-pane" hidden={selected!=='source-control'}>
      <DirectorySourceControl scope={scope} request={request} active={active&&selected==='source-control'} version={version} onOpenCurrent={modules.includes('explorer')?relative=>{setOpened(old=>({path:relative,nonce:(old?.nonce??0)+1}));select('explorer');}:undefined}/>
    </section>}
  </>;
}
