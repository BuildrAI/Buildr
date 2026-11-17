import {scopeDisplayName} from './workspace-scopes';
import {FrameSubmissions} from './frame-submissions';
import {useHarnessDirectoryFiles} from './directory-files';
import {engineeringFile} from './engineering-files';
import {useCallback,useEffect,useMemo,useState,useRef} from 'react';
import {Alert,Button,Input,Modal} from 'antd';
import {AgentConversationsProvider,AgentConnectionSettings,ConversationWorkspace,HarnessDirectoryFilesProvider,useAgentConversations,type HarnessDirectoryFiles} from './index';
import {MarkdownReader} from './components/MarkdownReader';
import {api} from './api/index';
import type {ConversationWorkspace as ScopeView} from './features/agent-conversations/ConversationHistory';
import type {ConversationView} from './features/agent-conversations/types';

type Ref={sourceId:string;id:string};
type Directory={ref:Ref;rootPath:string;revision:string;name?:string};
type Catalog={scopes:Array<{key:string;ref:Ref;authority:'builtin'|'registered'|'offline';name?:string;rootPath?:string}>};
type Preview={kind:string;content:string;truncated:boolean};
const key=(ref:Ref)=>'scope:'+btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([ref.sourceId,ref.id])))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const request=<T,>(path:string,input?:unknown)=>api(path,input===undefined?{headers:{'x-buildr-session':''}}:{method:'POST',body:JSON.stringify(input)}) as Promise<T>;

export function HarnessApp(){
  const [file,setFile]=useState<{path:string;value:Preview}|null>(null);
  const host=useMemo<HarnessDirectoryFiles>(()=>({
    scopeRequired:true,
    readFile:(conversation:ConversationView,path:string,signal:AbortSignal)=>window.parent!==window?engineeringFile('read',conversation.workspaceId,conversation.id,path,signal):request<Preview>('/api/v1/harness/files',{conversationId:conversation.id,path}),
    async openFile(conversation,path){if(window.parent!==window){await engineeringFile('open',conversation.workspaceId,conversation.id,path);return;}const value=await request<Preview>('/api/v1/harness/files',{conversationId:conversation.id,path});setFile({path,value});},
  }),[]);
  return <HarnessDirectoryFilesProvider host={host}><AgentConversationsProvider><Workspace/></AgentConversationsProvider><Modal open={!!file} title={file?.path} footer={null} width="min(1000px, 94vw)" onCancel={()=>setFile(null)}>{file&&(file.value.kind==='markdown'?<MarkdownReader content={file.value.content} path={file.path}/>:<pre className="harness-source">{file.value.content}</pre>)}{file?.value.truncated&&<Alert type="info" message="内容超过预览上限，仅显示前 1 MiB。"/>}</Modal></HarnessDirectoryFilesProvider>;
}
function Workspace(){
  const embedded=window.parent!==window;
  const context=useAgentConversations();
  const files=useHarnessDirectoryFiles();
  const submissions=useRef(new FrameSubmissions<unknown>());
  const [scopes,setScopes]=useState<ScopeView[]>([]),[selected,setSelected]=useState<string>(),[error,setError]=useState(''),[choosing,setChoosing]=useState(false),[path,setPath]=useState(''),[busy,setBusy]=useState(false),[name,setName]=useState('');
  const refresh=useCallback(async()=>{
    const [catalog,listed]=await Promise.all([request<Catalog>('/api/v1/harness/scopes'),request<{directories:Directory[]}>('/api/v1/harness/directories')]);
    setScopes(catalog.scopes.map(scope=>{const directory=listed.directories.find(value=>key(value.ref)===scope.key);return {id:scope.key,name:scopeDisplayName({...scope,name:directory?.name??scope.name},directory?.rootPath),rootPath:directory?.rootPath??scope.rootPath??''};}));
    setSelected(previous=>previous&&listed.directories.some(value=>key(value.ref)===previous)?previous:listed.directories[0]?key(listed.directories[0].ref):undefined);
  },[]);
  useEffect(()=>{if(!embedded)void refresh().catch(failure=>setError(failure instanceof Error?failure.message:'工作范围读取失败。'));context.setOpen(true);if(!embedded)context.setFull(true);},[embedded,refresh]);
  useEffect(()=>{
    if(!embedded)return;
    const listener=(event:MessageEvent)=>{
      if(event.source!==window.parent||event.origin!==location.origin)return;
      const message=event.data;
      if(!message||message.protocol!=='buildr.harness-frame/v1')return;
      if(message.action==='configure'&&Array.isArray(message.workspaces)){setScopes(message.workspaces.filter((value:ScopeView)=>typeof value?.id==='string'&&typeof value.name==='string'&&typeof value.rootPath==='string'));context.setFull(message.full===true);if(typeof message.defaultWorkspaceId==='string')setSelected(message.defaultWorkspaceId);}
      if(message.action==='new')context.newConversation(typeof message.workspaceId==='string'?{scope:{workspaceId:message.workspaceId,...(typeof message.taskId==='string'?{taskId:message.taskId}:{})}}:{});
      if(message.action==='open'&&typeof message.workspaceId==='string'&&typeof message.conversationId==='string')void context.openConversation(message.workspaceId,message.conversationId);
      if(message.action==='history')context.openHistory(null);
      if(message.action==='settings')context.setSettings(true);
      if(message.action==='start-text'&&typeof message.requestId==='string'&&message.input&&typeof message.input.workspaceId==='string'&&typeof message.input.cwd==='string'&&typeof message.input.text==='string'){
        const reply=(result:unknown)=>window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'result',requestId:message.requestId,result},location.origin);
        if(context.startTextConversation)void submissions.current.once(message.requestId,message.input,()=>context.startTextConversation!(message.input)).then(reply).catch(()=>reply({status:'recovering',reason:'submission-unknown',message:'原提交结果未确认，请核对原对话。'}));
        else reply({status:'unavailable',message:'Harness 尚未准备工程操作入口。'});
      }
    };
    window.addEventListener('message',listener);
    window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'ready'},location.origin);
    return()=>window.removeEventListener('message',listener);
  },[embedded,context.newConversation,context.openConversation,context.openHistory,context.setSettings,context.startTextConversation]);
  useEffect(()=>{
    if(embedded)window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'selection',workspaceId:context.conversation?.workspaceId??null,conversationId:context.conversation?.id??null},location.origin);
  },[embedded,context.conversation?.workspaceId,context.conversation?.id]);
  useEffect(()=>{if(embedded)window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'view',view:context.view},location.origin);},[embedded,context.view]);
  const chooseDirectory=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{const result=await request<{path:string|null}>('/api/v1/harness/directories/choose',{});if(result.path)setPath(result.path);}
    catch(failure){setError(failure instanceof Error?failure.message:'无法打开本机目录选择器，请重试。');}
    finally{setBusy(false);}
  };
  const create=async()=>{
    if(!path.trim()||busy)return;setBusy(true);setError('');
    try{const directory=await request<Directory>('/api/v1/harness/directories',{path,name:name.trim()});await refresh();const scope=key(directory.ref);setSelected(scope);context.newConversation({scope:{workspaceId:scope},preserveHistoryView:context.view==='history'});context.setFull(true);setChoosing(false);setPath('');setName('');}
    catch(failure){setError(failure instanceof Error?failure.message:'目录未登记，输入已保留。');}finally{setBusy(false);}
  };
  return <div className="harness-shell">{error&&!choosing&&<Alert type="warning" closable onClose={()=>setError('')} message={error}/>}<main className="harness-main"><HarnessDirectoryFilesProvider host={{...files,...(!embedded?{chooseWorkspace:()=>{setPath('');setName('');setError('');setChoosing(true);}}:{})}}><ConversationWorkspace workspaces={scopes} defaultWorkspaceId={selected??null}/></HarnessDirectoryFilesProvider></main><AgentConnectionSettings/><Modal open={choosing} title="添加工作空间" confirmLoading={busy} okButtonProps={{'aria-label':'创建并使用',disabled:!path.trim()}} onOk={()=>void create()} onCancel={()=>{if(!busy)setChoosing(false);}} okText="创建并使用"><p>填写工作空间名称并选择本机目录，创建后直接使用。名称留空时使用目录名。</p>{error&&<Alert type="warning" message={error}/>}<label htmlFor="harness-workspace-name">工作空间名称（可选）</label><Input id="harness-workspace-name" aria-label="工作空间名称" placeholder="留空时使用目录名" maxLength={160} autoFocus disabled={busy} value={name} onChange={event=>setName(event.target.value)} onPressEnter={()=>void create()}/><label>工作空间目录</label><Button aria-label={path?'重新选择目录':'选择本机目录'} onClick={()=>void chooseDirectory()} loading={busy}>{path?'重新选择目录':'选择本机目录'}</Button><div aria-label="已选择的工作空间目录" title={path||undefined}>{path||'尚未选择目录'}</div></Modal></div>;
}
