import {resolveTaskBriefReference,taskBriefHref} from '../../lib/taskBriefLinks';
import {useNavigate,useLocation} from 'react-router-dom';
import {codeApi} from '../code/api/code-api';
import {conversationFileTarget} from './conversation-files';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Alert,Button} from 'antd';
import {CommentOutlined,PlusOutlined,SettingOutlined,UnorderedListOutlined} from '@ant-design/icons';
import {SplitDivider} from '../../components/SplitDivider';
import {readOptionalPreference,writeOptionalPreference} from '../../lib/optional-preferences';
import {useAgentConversations} from './AgentConversationsContext';
import {ConversationTaskLink} from './ConversationTaskLink';
import {BuildrParticipation} from './BuildrParticipation';
import {conversationTaskLinks} from './conversation-associations';
import {MarkdownDiagramPreview} from '../../components/MarkdownDiagramPreview';
import {sanitizeDiagramSvg} from '../../lib/markdownDiagramSvg';
import './harness-ui.css';
type Workspace={id:string;name:string;rootPath:string};
export function ConversationWorkspace({portalTarget,defaultWorkspaceId,workspaces}:{portalTarget?:HTMLElement|null;defaultWorkspaceId:string|null;workspaces:Workspace[]}){
 const navigate=useNavigate(),locationState=useLocation();
 const navigation=useRef({navigate,locationState});navigation.current={navigate,locationState};
 const context=useAgentConversations(),frame=useRef<HTMLIFrameElement>(null),[ready,setReady]=useState(0),[error,setError]=useState(''),[width,setWidth]=useState(()=>Math.min(800,Math.max(560,Number(readOptionalPreference('buildr.agent-conversation-width'))||620)));
 const [anchor,setAnchor]=useState<{x:number;y:number;width:number;height:number}|null>(null);
 const [diagramPreview,setDiagramPreview]=useState<{svg:string;source:string}|null>(null);
 const configuration=JSON.stringify(workspaces),configured=useRef(false),lastCommand=useRef(-1),selection=useRef(0),selectionRetry=useRef<ReturnType<typeof setTimeout>|null>(null),sentSubmissions=useRef(new Set<string>());
 const contextRef=useRef(context);contextRef.current=context;
 useEffect(()=>{if(!context.open)setDiagramPreview(null);},[context.open,context.conversation?.workspaceId,context.conversation?.id]);
 useEffect(()=>{let active=true;const clearSelectionRetry=()=>{if(selectionRetry.current!==null){clearTimeout(selectionRetry.current);selectionRetry.current=null;}};const listener=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow||event.origin!==location.origin)return;
   const data=event.data;if(!data||data.protocol!=='buildr.harness-frame/v1')return;
   if(data.event==='ready'){configured.current=false;setReady(value=>value+1);}
   if(configured.current&&data.event==='view'&&(data.view==='conversation'||data.view==='history'))contextRef.current.setView(data.view);
   if(data.event==='context-anchor'&&['x','y','width','height'].every(key=>typeof data[key]==='number'&&Number.isFinite(data[key])))setAnchor(data.width>0&&data.height>0?{x:data.x,y:data.y,width:data.width,height:data.height}:null);
   if(data.event==='layout'){if(data.action==='collapse')contextRef.current.setOpen(false);if(data.action==='full')contextRef.current.setFull(typeof data.full==='boolean'?data.full:value=>!value);}
   if(data.event==='diagram-preview'&&typeof data.svg==='string'&&typeof data.source==='string'){const safeSvg=sanitizeDiagramSvg(data.svg);if(safeSvg)setDiagramPreview({svg:safeSvg,source:data.source});}
   if(data.event==='choose-workspace')contextRef.current.newConversation();
   if(data.event==='work-object'&&typeof data.reference==='string'&&typeof data.scopePath==='string'&&/^\/workspaces\/[a-f0-9-]{36}$/i.test(data.scopePath)){const id=resolveTaskBriefReference(data.reference);if(id){navigation.current.navigate(taskBriefHref(id,data.scopePath));contextRef.current.setFull(false);}}

   if(data.event==='file'&&typeof data.requestId==='string'&&typeof data.workspaceId==='string'&&typeof data.conversationId==='string'&&typeof data.path==='string'&&['read','open'].includes(data.action)){
     const reply=(result:unknown,error?:string)=>frame.current?.contentWindow?.postMessage({protocol:'buildr.harness-frame/v1',action:'file-result',requestId:data.requestId,result,error},window.location.origin);
     const observedSelection=selection.current;
     void (async()=>{const current=await contextRef.current.api.read(data.workspaceId,data.conversationId);const catalog=await codeApi.repositories(current.workspaceId,current.taskId);const file=conversationFileTarget(current.cwd,data.path,catalog);if(!file)throw new Error('不能确认文件的准确工程来源。');const value=await codeApi.file(current.workspaceId,file);if(data.action==='open'){if(observedSelection!==selection.current)throw new Error('对话选择已变化，未跳转原文件。');const {navigate,locationState}=navigation.current;navigate(`/workspaces/${encodeURIComponent(current.workspaceId)}/code/explorer`,{state:{codeEntry:{file,from:{pathname:locationState.pathname,search:locationState.search,hash:locationState.hash,state:locationState.state}}}});contextRef.current.setFull(false);}reply(value);})().catch(error=>reply(null,error instanceof Error?error.message:'工程文件操作未确认。'));
   }

   if(data.event==='result'&&typeof data.requestId==='string')contextRef.current.reply(data.requestId,data.result);
   if(data.event==='selection'){
     setDiagramPreview(null);
     const generation=++selection.current;
     clearSelectionRetry();
     if(typeof data.workspaceId==='string'&&typeof data.conversationId==='string'){
       const workspaceId=data.workspaceId,conversationId=data.conversationId;
       const scheduleRetry=()=>{
         clearSelectionRetry();
         selectionRetry.current=setTimeout(()=>{
           selectionRetry.current=null;
           if(!active||generation!==selection.current)return;
           if(typeof document==='undefined'||document.visibilityState!=='hidden')loadSelection();
           else scheduleRetry();
         },5000);
       };
       const loadSelection=()=>{
         void contextRef.current.api.read(workspaceId,conversationId).then(value=>{
           if(!active||generation!==selection.current)return;
           clearSelectionRetry();
           contextRef.current.setConversation(value);
           setError('');
         }).catch(error=>{
           if(!active||generation!==selection.current)return;
           setError(error instanceof Error?error.message:'当前对话读取失败。');
           scheduleRetry();
         });
       };
       loadSelection();
     }else{
       contextRef.current.setConversation(null);
       setError('');
     }
   }
 };window.addEventListener('message',listener);return()=>{active=false;clearSelectionRetry();window.removeEventListener('message',listener);};},[]);
 useEffect(()=>{if(ready>0){configured.current=true;frame.current?.contentWindow?.postMessage({protocol:'buildr.harness-frame/v1',action:'configure',workspaces:JSON.parse(configuration),full:context.full,view:contextRef.current.view,defaultWorkspaceId:defaultWorkspaceId??'@default'},location.origin);}},[ready,configuration,context.full,defaultWorkspaceId]);
 useEffect(()=>{if(ready<=0||!context.command||lastCommand.current===context.sequence)return;lastCommand.current=context.sequence;if(context.command.action==='start-text'&&context.command.requestId){if(sentSubmissions.current.has(context.command.requestId))return;sentSubmissions.current.add(context.command.requestId);}frame.current?.contentWindow?.postMessage({protocol:'buildr.harness-frame/v1',...context.command},location.origin);},[ready,context.sequence,context.command]);
 const resize=(next:number)=>{const value=Math.min(800,Math.max(560,next));setWidth(value);writeOptionalPreference('buildr.agent-conversation-width',String(value));};
 const drag=useRef<{x:number;width:number}|null>(null);
 const content=<>{context.open&&!context.full&&<SplitDivider className="development-harness-divider" aria-label="调整对话宽度" aria-valuemin={560} aria-valuemax={800} aria-valuenow={width} onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,width};}} onPointerMove={event=>{if(drag.current)resize(drag.current.width+drag.current.x-event.clientX);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();resize(width+(event.key==='ArrowLeft'?16:-16));}}} onDoubleClick={()=>resize(620)}/>}
 <section data-selected-workspace={context.conversation?.workspaceId} data-selected-conversation={context.conversation?.id} id="agent-conversation-panel" className={'development-harness-frame'+(context.full?' is-full':'')} style={{width}} hidden={!context.open}>
 {error&&<Alert type="warning" message={error} closable onClose={()=>setError('')}/>}
 <iframe ref={frame} src="/harness/" title="Buildr Harness" onLoad={()=>{configured.current=false;lastCommand.current=-1;}}/>
 {context.conversation&&anchor&&(context.full||context.view!=='history')&&<footer style={{left:anchor.x,top:anchor.y,width:anchor.width,height:anchor.height}}><ConversationTaskLink onNavigate={()=>context.setFull(false)} taskLinks={conversationTaskLinks(context.conversation)} onAssign={async links=>{const current=context.conversation;if(!current)return false;try{const updated=await context.api.update(current,{taskLinks:links});context.apply(updated,current.revision);return true;}catch(error){const latest=await context.api.read(current.workspaceId,current.id);context.apply(latest,current.revision);throw error;}}}/><BuildrParticipation workspaceId={context.conversation.workspaceId} conversationId={context.conversation.id}/></footer>}
 </section>{!context.open&&<aside className="development-harness-rail" aria-label="当前对话与所有对话"><Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" onClick={()=>context.newConversation()}/><Button type="text" icon={<CommentOutlined/>} aria-label="展开当前对话" onClick={()=>context.setOpen(true)}/><Button type="text" icon={<UnorderedListOutlined/>} aria-label="全部对话" onClick={()=>context.openHistory(null)}/><Button type="text" className="development-harness-settings" icon={<SettingOutlined/>} aria-label="智能体与模型设置" onClick={()=>context.setSettings(true)}/></aside>}{diagramPreview&&<MarkdownDiagramPreview svg={diagramPreview.svg} source={diagramPreview.source} onClose={()=>setDiagramPreview(null)}/>}</>;

 // The frame is never remounted for full/embedded changes: drafts and scroll remain inside Harness.
 return portalTarget?createPortal(content,portalTarget):content;
}
