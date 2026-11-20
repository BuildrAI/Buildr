import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Empty, Spin } from 'antd';
import { ApartmentOutlined, CloseOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons';
import { directoryClient, observeWorkspaceDirectory, post, type DirectoryScope } from './api';
import { DirectoryExplorer } from './DirectoryExplorer';
import { DirectorySourceControl } from './DirectorySourceControl';
import type { FileDraft } from './DirectoryFileEditor';
import { workspaceScopeKey } from '../../workspace-scopes';
import './directory-workbench.css';

type Content = {id:string;title:string;icon?:ReactNode;render(active:boolean):ReactNode};

/** Presentation host: content can be assembled without knowing how chat or directories work. */
type ModuleTabs = {ids:string[];selected:string;home:boolean};
const emptyTabs:ModuleTabs={ids:[],selected:'',home:true};
function openModule(tabs:ModuleTabs,id:string):ModuleTabs {
  return {ids:tabs.ids.includes(id)?tabs.ids:[...tabs.ids,id],selected:id,home:false};
}
function WorkspaceContent({contents,active,tabs,setTabs,scope}: {contents:readonly Content[];active:boolean;tabs:ModuleTabs;setTabs(update:(old:ModuleTabs)=>ModuleTabs):void;scope:DirectoryScope}) {
  const prefix=useId();
  const bar=useRef<HTMLDivElement>(null);
  const homeRef=useRef<HTMLDivElement>(null);
  const {ids,selected:selectedContent,home}=tabs;
  const find=(id:string)=>contents.find(content=>content.id===id)!;
  const focus=(target:'tab'|'home'|'add')=>requestAnimationFrame(()=>{
    const button=target==='home'?homeRef.current?.querySelector('button'):bar.current?.querySelector<HTMLButtonElement>(target==='tab'?'[role="tab"][aria-selected="true"]':'button.harness-workspace-add');
    button?.focus();
  });
  const select=(id:string,moveFocus=false)=>{
    setTabs(old=>openModule(old,id));if(moveFocus)focus('tab');
  };
  const close=(id:string)=>{
    const index=ids.indexOf(id),next=ids.filter(value=>value!==id);
    const target=id===selectedContent?next[index]??next.at(-1)??'':selectedContent;
    setTabs(()=>({ids:next,selected:target,home:home||!target}));focus(home||!target?'add':'tab');
  };
  return <div className="harness-workspace-content">
    <header className="harness-workspace-bar" ref={bar}>
      {!ids.length?<span className="harness-workspace-view-label">工作区</span>:<div className="harness-workspace-tabs" role="tablist" aria-label="已打开的工作区模块">
        {ids.map((id,index)=>{
          const content=find(id), selected=id===selectedContent&&!home;
          return <div className={'harness-workspace-tab'+(selected?' is-active':'')} key={id}>
            <button type="button" role="tab" aria-label={content.title} id={prefix+'-tab-'+id} aria-controls={prefix+'-pane-'+id} aria-selected={selected} tabIndex={id===selectedContent?0:-1} onClick={()=>select(id)} onKeyDown={event=>{
              const next=event.key==='ArrowLeft'?ids[(index+ids.length-1)%ids.length]:event.key==='ArrowRight'?ids[(index+1)%ids.length]:event.key==='Home'?ids[0]:event.key==='End'?ids.at(-1):undefined;
              if(next){event.preventDefault();select(next,true);}else if(event.key==='Delete'){event.preventDefault();close(id);}
            }}><span aria-hidden="true">{content.icon}</span><span>{content.title}</span></button>
            <Button type="text" size="small" tabIndex={selected?0:-1} aria-label={'关闭'+content.title+'标签'} title={'关闭'+content.title+'标签'} icon={<CloseOutlined/>} onClick={()=>close(id)}/>
          </div>;
        })}
      </div>}
      <Button className="harness-workspace-add" type="text" size="small" aria-label="打开工作区模块" title="打开工作区模块" icon={<PlusOutlined/>} aria-expanded={home} aria-controls={home?prefix+'-home':undefined} onClick={()=>{setTabs(old=>({...old,home:true}));focus('home');}}/>
      <span className="harness-workspace-location" title={scope.rootPath}>{scope.name}</span>
    </header>
    {home&&<div className="harness-workspace-home" id={prefix+'-home'} ref={homeRef} onKeyDown={event=>{
      if(event.key==='Escape'&&selectedContent){event.preventDefault();select(selectedContent,true);}
    }}>
      <h2>对话工作区</h2><p>在同一工作空间里浏览文件、查看变更。</p>
      <nav aria-label="工作区内容">{contents.map(content=><button type="button" key={content.id} onClick={()=>select(content.id,true)}>
        <span aria-hidden="true">{content.icon}</span><strong>{content.title}</strong>{ids.includes(content.id)&&<small aria-hidden="true">已打开</small>}
      </button>)}</nav>
    </div>}
    {ids.map(id=><section className="harness-directory-workbench-pane" key={id} id={prefix+'-pane-'+id} role="tabpanel" aria-labelledby={prefix+'-tab-'+id} hidden={home||id!==selectedContent}>
      {find(id).render(active&&!home&&id===selectedContent)}
    </section>)}
  </div>;
}

export function HarnessDirectoryWorkbench({active=true,workspaceId,workspaceName,onDirectoryAdded}: {
  active?:boolean;workspaceId?:string;workspaceName?:string;onDirectoryAdded(workspaceId:string):void;
}) {
  const [observation,setObservation]=useState<{id:string;scope?:DirectoryScope;error?:string}>();
  const [attempt,retry]=useState(0), [choosing,setChoosing]=useState(false), [chooseError,setChooseError]=useState('');
  const [tabs,setTabs]=useState<ModuleTabs>(emptyTabs);
  const drafts=useRef(new Map<string,FileDraft>());
  const current=observation?.id===workspaceId?observation:undefined;
  const workspaceRef=useRef(workspaceId);workspaceRef.current=workspaceId;
  useEffect(()=>{
    if(!active||!workspaceId)return;
    const controller=new AbortController();
    void observeWorkspaceDirectory(workspaceId,controller.signal).then(scope=>{
      if(!controller.signal.aborted)setObservation({id:workspaceId,scope});
    }).catch(failure=>{
      if(!controller.signal.aborted)setObservation({id:workspaceId,error:failure instanceof Error?failure.message:'无法读取此工作空间的目录。'});
    });
    return()=>controller.abort();
  },[active,workspaceId,attempt]);
  const add=async()=>{
    if(choosing)return;setChoosing(true);setChooseError('');
    try {
      const result=await post<{path:string|null}>('/api/v1/harness/directories/choose',{});
      if(!result.path||workspaceRef.current!==undefined)return;
      const entry=await post<DirectoryScope>('/api/v1/harness/directories',{path:result.path});
      if(workspaceRef.current===undefined)onDirectoryAdded(workspaceScopeKey(entry.ref));
    } catch(failure){setChooseError(failure instanceof Error?failure.message:'目录未添加。');}
    finally{setChoosing(false);}
  };
  const observedScope=current?.scope;
  const scope=useMemo(()=>observedScope&&({...observedScope,name:workspaceName||observedScope.name||'当前工作空间'}),[observedScope,workspaceName]);
  return <div className="harness-directory-workbench">
    {!workspaceId?<Empty description="选择工作空间后即可浏览文件和变更，无需先发送消息。">
      <Button onClick={()=>void add()} loading={choosing}>添加本机目录</Button>
      {chooseError&&<Alert type="warning" message={chooseError}/>}
    </Empty>:scope?<DirectoryPanels key={workspaceId+':'+scope.revision} scope={scope} workspaceId={workspaceId} active={active} tabs={tabs} setTabs={setTabs} drafts={drafts.current}/>:current?.error?
      <Alert type="warning" showIcon message="当前工作空间目录不可用" description={current.error} action={<Button size="small" onClick={()=>retry(value=>value+1)}>重新读取</Button>}/>:<div className="harness-workspace-loading" role="status"><Spin size="small"/> 正在读取当前工作空间…</div>}
  </div>;
}

function DirectoryPanels({scope,workspaceId,active,drafts,tabs,setTabs}:{scope:DirectoryScope;workspaceId:string;active:boolean;drafts:Map<string,FileDraft>;tabs:ModuleTabs;setTabs(update:(old:ModuleTabs)=>ModuleTabs):void}){
  const [opened,setOpened]=useState<{path:string;nonce:number}>(), [version,bump]=useState(0);
  const request=useMemo(()=>directoryClient(scope,workspaceId),[scope,workspaceId]);
  const open=useCallback((path:string)=>{setOpened(previous=>({path,nonce:(previous?.nonce??0)+1}));setTabs(old=>openModule(old,'explorer'));},[setTabs]);
  return <WorkspaceContent scope={scope} active={active} tabs={tabs} setTabs={setTabs} contents={[
    {id:'explorer',title:'资源管理器',icon:<FolderOpenOutlined/>,render:active=><DirectoryExplorer scope={scope} request={request} active={active} opened={opened} drafts={drafts} onSaved={()=>bump(value=>value+1)}/>},
    {id:'source-control',title:'源代码管理',icon:<ApartmentOutlined/>,render:active=><DirectorySourceControl scope={scope} request={request} active={active} version={version} onOpenCurrent={open}/>},
  ]}/>;
}
