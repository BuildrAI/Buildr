import {useNavigate,useLocation} from 'react-router-dom';
import {codeApi} from '../code/api/code-api';
import {conversationFileTarget} from './conversation-files';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Alert,Button,Modal,Select,Space} from 'antd';
import {useAgentConversations} from './AgentConversationsContext';
import {ConversationTaskLink} from './ConversationTaskLink';
import {BuildrParticipation} from './BuildrParticipation';
import {conversationTaskLinks} from './conversation-associations';
import './harness-ui.css';
type Workspace={id:string;name:string;rootPath:string};
export function ConversationWorkspace({portalTarget,defaultWorkspaceId,workspaces}:{portalTarget?:HTMLElement|null;defaultWorkspaceId:string|null;workspaces:Workspace[]}){
 const navigate=useNavigate(),locationState=useLocation();
 const navigation=useRef({navigate,locationState});navigation.current={navigate,locationState};
 const context=useAgentConversations(),frame=useRef<HTMLIFrameElement>(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<string>();
 const configuration=JSON.stringify(workspaces),lastCommand=useRef(-1),selection=useRef(0),sentSubmissions=useRef(new Set<string>());
 const contextRef=useRef(context);contextRef.current=context;
 useEffect(()=>{const listener=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow||event.origin!==location.origin)return;
   const data=event.data;if(!data||data.protocol!=='buildr.harness-frame/v1')return;
   if(data.event==='ready')setReady(true);
   if(data.event==='layout'){if(data.action==='collapse')contextRef.current.setOpen(false);if(data.action==='full')contextRef.current.setFull(value=>!value);}
   if(data.event==='choose-workspace')contextRef.current.setChoosing(true);
   if(data.event==='file'&&typeof data.requestId==='string'&&typeof data.workspaceId==='string'&&typeof data.conversationId==='string'&&typeof data.path==='string'&&['read','open'].includes(data.action)){
     const reply=(result:unknown,error?:string)=>frame.current?.contentWindow?.postMessage({protocol:'buildr.harness-frame/v1',action:'file-result',requestId:data.requestId,result,error},window.location.origin);
     void (async()=>{const current=await contextRef.current.api.read(data.workspaceId,data.conversationId);const catalog=await codeApi.repositories(current.workspaceId,current.taskId);const file=conversationFileTarget(current.cwd,data.path,catalog);if(!file)throw new Error('不能确认文件的准确工程来源。');const value=await codeApi.file(current.workspaceId,file);if(data.action==='open'){const {navigate,locationState}=navigation.current;navigate(`/workspaces/${encodeURIComponent(current.workspaceId)}/code/explorer`,{state:{codeEntry:{file,from:{pathname:locationState.pathname,search:locationState.search,hash:locationState.hash,state:locationState.state}}}});contextRef.current.setFull(false);}reply(value);})().catch(error=>reply(null,error instanceof Error?error.message:'工程文件操作未确认。'));
   }

   if(data.event==='result'&&typeof data.requestId==='string')contextRef.current.reply(data.requestId,data.result);
   if(data.event==='selection'){
     const generation=++selection.current;
     if(typeof data.workspaceId==='string'&&typeof data.conversationId==='string')void contextRef.current.api.read(data.workspaceId,data.conversationId).then(value=>{if(generation===selection.current)contextRef.current.setConversation(value);}).catch(error=>setError(error instanceof Error?error.message:'当前对话读取失败。'));
     else contextRef.current.setConversation(null);
   }
 };window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);},[]);
 useEffect(()=>{if(ready)frame.current?.contentWindow?.postMessage({protocol:'buildr.harness-frame/v1',action:'configure',workspaces:JSON.parse(configuration)},location.origin);},[ready,configuration]);
 useEffect(()=>{if(!ready||!context.command||lastCommand.current===context.sequence)return;lastCommand.current=context.sequence;if(context.command.action==='start-text'&&context.command.requestId){if(sentSubmissions.current.has(context.command.requestId))return;sentSubmissions.current.add(context.command.requestId);}frame.current?.contentWindow?.postMessage({protocol:'buildr.harness-frame/v1',...context.command},location.origin);},[ready,context.sequence,context.command]);
 const choose=()=>{const id=selected??defaultWorkspaceId??workspaces[0]?.id;if(!id)return;context.issue({action:'new',workspaceId:id,taskId:context.pendingTaskId});context.setChoosing(false);};
 const content=<><section id="agent-conversation-panel" className={'development-harness-frame'+(context.full?' is-full':'')} hidden={!context.open}>
 <header><strong>Harness</strong><Space><Button onClick={()=>context.newConversation()}>新对话</Button><Button onClick={()=>context.openHistory(null)}>全部对话</Button><Button aria-label="设置" onClick={()=>context.setSettings(true)}>设置</Button><Button aria-label={context.full?'退出专注':'专注'} onClick={()=>context.setFull(!context.full)}>{context.full?'退出专注':'专注'}</Button><Button aria-label="收起" onClick={()=>context.setOpen(false)}>收起</Button></Space></header>
 {error&&<Alert type="warning" message={error} closable onClose={()=>setError('')}/>}
 <iframe ref={frame} src="/harness/" title="Buildr Harness" onLoad={()=>{lastCommand.current=-1;}}/>
 {context.conversation&&<footer><ConversationTaskLink taskLinks={conversationTaskLinks(context.conversation)} onAssign={async links=>{const current=context.conversation;if(!current)return false;const updated=await context.api.update(current,{taskLinks:links});context.apply(updated,current.revision);return true;}}/><BuildrParticipation workspaceId={context.conversation.workspaceId} conversationId={context.conversation.id}/></footer>}
 </section><Modal title="选择新对话的工作空间" open={context.choosing} onCancel={()=>context.setChoosing(false)} onOk={choose} okText="新建对话"><Select style={{width:'100%'}} aria-label="新对话工作空间" value={selected??defaultWorkspaceId??workspaces[0]?.id} options={workspaces.map(item=>({value:item.id,label:item.name}))} onChange={setSelected}/></Modal></>;
 // The frame is never remounted for full/embedded changes: drafts and scroll remain inside Harness.
 return portalTarget?createPortal(content,portalTarget):content;
}
