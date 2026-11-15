import {useCallback,useEffect,useMemo,useState} from 'react';
import {Alert,Button,Input,Modal,Select,Space} from 'antd';
import {FolderOpenOutlined,PlusOutlined,SettingOutlined,UnorderedListOutlined} from '@ant-design/icons';
import {AgentConversationsProvider,AgentConnectionSettings,ConversationWorkspace,HarnessUiHostProvider,useAgentConversations,type HarnessUiHost} from '@buildr-ai/buildr-harness-ui';
import {MarkdownReader} from '@buildr-ai/buildr-harness-ui/components/MarkdownReader';
import {api} from '@buildr-ai/buildr-harness-ui/api/index';
import type {ConversationWorkspace as ScopeView} from '@buildr-ai/buildr-harness-ui/conversations/ConversationHistory';
import type {ConversationView} from '@buildr-ai/buildr-harness-ui/conversations/types';

type Ref={sourceId:string;id:string};
type Directory={ref:Ref;rootPath:string;revision:string};
type Catalog={scopes:Array<{key:string;ref:Ref;authority:'builtin'|'registered'|'offline'}>};
type Preview={kind:string;content:string;truncated:boolean};
const key=(ref:Ref)=>'scope:'+btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([ref.sourceId,ref.id])))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const request=<T,>(path:string,input?:unknown)=>api(path,input===undefined?{headers:{'x-buildr-session':''}}:{method:'POST',body:JSON.stringify(input)}) as Promise<T>;

export function HarnessApp(){
  const [file,setFile]=useState<{path:string;value:Preview}|null>(null);
  const host=useMemo<HarnessUiHost>(()=>({
    scopeRequired:true,
    readFile:(conversation:ConversationView,path:string,_signal:AbortSignal)=>request<Preview>('/api/v1/harness/files',{conversationId:conversation.id,path}),
    async openFile(conversation,path){const value=await request<Preview>('/api/v1/harness/files',{conversationId:conversation.id,path});setFile({path,value});},
  }),[]);
  return <HarnessUiHostProvider host={host}><AgentConversationsProvider><Workspace/></AgentConversationsProvider><Modal open={!!file} title={file?.path} footer={null} width="min(1000px, 94vw)" onCancel={()=>setFile(null)}>{file&&(file.value.kind==='markdown'?<MarkdownReader content={file.value.content} path={file.path}/>:<pre className="harness-source">{file.value.content}</pre>)}{file?.value.truncated&&<Alert type="info" message="内容超过预览上限，仅显示前 1 MiB。"/>}</Modal></HarnessUiHostProvider>;
}
function Workspace(){
  const context=useAgentConversations();
  const [scopes,setScopes]=useState<ScopeView[]>([]),[directories,setDirectories]=useState<Directory[]>([]),[selected,setSelected]=useState<string>(),[error,setError]=useState(''),[choosing,setChoosing]=useState(false),[path,setPath]=useState(''),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const [catalog,listed]=await Promise.all([request<Catalog>('/api/v1/harness/scopes'),request<{directories:Directory[]}>('/api/v1/harness/directories')]);
    setDirectories(listed.directories);
    setScopes(catalog.scopes.map(scope=>{const directory=listed.directories.find(value=>key(value.ref)===scope.key);return {id:scope.key,name:directory?directory.rootPath:`${scope.ref.sourceId} / ${scope.ref.id}${scope.authority==='offline'?'（来源离线）':''}`,rootPath:directory?.rootPath??''};}));
    setSelected(previous=>previous&&listed.directories.some(value=>key(value.ref)===previous)?previous:listed.directories[0]?key(listed.directories[0].ref):undefined);
  },[]);
  useEffect(()=>{void refresh().catch(failure=>setError(failure instanceof Error?failure.message:'工作范围读取失败。'));context.setOpen(true);context.setFull(true);},[refresh]);
  const create=async()=>{
    if(!path.trim()||busy)return;setBusy(true);setError('');
    try{const directory=await request<Directory>('/api/v1/harness/directories',{path:path.trim()});await refresh();const scope=key(directory.ref);setSelected(scope);context.newConversation({scope:{workspaceId:scope}});context.setFull(true);setChoosing(false);setPath('');}
    catch(failure){setError(failure instanceof Error?failure.message:'目录未登记，输入已保留。');}finally{setBusy(false);}
  };
  return <div className="harness-shell"><header className="harness-header"><strong>Buildr Harness</strong><Space><Select aria-label="新对话起点目录" value={selected} style={{width:'min(420px, 40vw)'}} placeholder="选择已登记目录" options={directories.map(value=>({value:key(value.ref),label:value.rootPath}))} onChange={setSelected}/><Button icon={<FolderOpenOutlined/>} onClick={()=>setChoosing(true)}>选择目录</Button><Button icon={<PlusOutlined/>} disabled={!selected} onClick={()=>{context.newConversation({scope:{workspaceId:selected!}});context.setFull(true);}}>新建对话</Button><Button icon={<UnorderedListOutlined/>} onClick={()=>context.openHistory(null)}>全部对话</Button><Button icon={<SettingOutlined/>} onClick={()=>context.setSettings(true)}>设置</Button></Space></header>{error&&<Alert type="warning" closable onClose={()=>setError('')} message={error}/>}<main className="harness-main"><ConversationWorkspace workspaces={scopes} defaultWorkspaceId={selected??null}/></main><AgentConnectionSettings/><Modal open={choosing} title="选择新对话的起点目录" confirmLoading={busy} onOk={()=>void create()} onCancel={()=>{if(!busy)setChoosing(false);}} okText="登记目录并新建"><p>输入本机已有目录的绝对路径。目录身份会被核对；它是执行起点，不是文件沙箱。</p><Input autoFocus aria-label="Harness 起点目录绝对路径" value={path} onChange={event=>setPath(event.target.value)} onPressEnter={()=>void create()}/></Modal></div>;
}
