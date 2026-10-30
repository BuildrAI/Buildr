import {useCallback,useEffect,useImperativeHandle,useRef,useState,type Ref} from 'react';
import {createPortal} from 'react-dom';
import {Alert,Badge,Button,Tooltip} from 'antd';
import {CommentOutlined,LoadingOutlined,MoreOutlined,ReloadOutlined} from '@ant-design/icons';
import {AgentConversationsViewProvider,useAgentConversations} from './AgentConversationsContext';
import {ConversationPanel} from './ConversationPanel';
import type {ConversationWorkspace} from './ConversationHistory';
import {useChildConversation} from './useChildConversation';
import {childConversationStatus,childCreationStorageKey,mergeChildConversations,readChildCreation,type ChildCreation} from './conversation-children';
import type {ConversationView} from './types';
import type {ApiError} from '../../api';
import './conversation-children.css';

export type ConversationChildActions={create:()=>void};
type Props={parent:ConversationView;workspaces:ConversationWorkspace[];ref?:Ref<ConversationChildActions>};
function ChildWindow({summary,visible,workspaces,onClose,onUpdate}:{summary:ConversationView;visible:boolean;workspaces:ConversationWorkspace[];onClose:()=>void;onUpdate:(value:ConversationView)=>void}) {
  const host=useAgentConversations(),value=useChildConversation(host,summary,visible,onClose,onUpdate);
  return <div className="ac-child-window" hidden={!visible} role="dialog" aria-modal="false" aria-label={'子对话：'+(value.conversation?.title||summary.title)} data-child-window={summary.id}
    onKeyDown={event=>{if(event.key==='Escape'&&event.target===event.currentTarget){event.stopPropagation();onClose();}}} tabIndex={-1}>
    <AgentConversationsViewProvider value={value}><ConversationPanel embedded defaultWorkspaceId={summary.workspaceId} workspaces={workspaces}/></AgentConversationsViewProvider>
  </div>;
}

export function ConversationChildWindows({parent,workspaces,ref}:Props) {
  const host=useAgentConversations(),{api}=host;
  const [rows,setRows]=useState<ConversationView[]>([]),[cursor,setCursor]=useState<string>();
  const [active,setActive]=useState<string|null>(null),[visited,setVisited]=useState<string[]>([]);
  const [creating,setCreating]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [windowTarget,setWindowTarget]=useState<HTMLElement|null>(null);
  // Keep floating panels out of the header's layout and descendant styles.
  const attach=useCallback((node:HTMLDivElement|null)=>setWindowTarget(node?.closest<HTMLElement>('.ac-panel')??null),[]);
  const busy=useRef(false),live=useRef(true),paging=useRef(false),parentRef=useRef(parent);parentRef.current=parent;
  const profile=document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content')||'local';
  const storageKey=childCreationStorageKey(parent,profile);
  const [attempt,setAttempt]=useState<ChildCreation|undefined>(()=>{try{return readChildCreation(sessionStorage,storageKey);}catch{return;}});
  const update=useCallback((value:ConversationView)=>setRows(previous=>previous.some(row=>row.id===value.id&&row.revision===value.revision&&row.activity?.seenThrough===value.activity?.seenThrough)?previous:mergeChildConversations(previous,[value])),[]);
  const read=useCallback(async(signal?:AbortSignal)=>{
    const result=await api.children(parent.workspaceId,parent.id,{signal});
    if(!live.current||signal?.aborted)return;
    setRows(previous=>mergeChildConversations(previous,result.conversations));
    // Poll the newest rows without resetting an already advanced pagination position.
    if(!paging.current)setCursor(result.nextCursor);
  },[api,parent.workspaceId,parent.id]);
  useEffect(()=>{
    live.current=true;const controller=new AbortController();
    void read(controller.signal).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'子对话暂时无法读取。');});
    const interval=setInterval(()=>{if(document.visibilityState==='visible')void read(controller.signal).catch(()=>{});},5000);
    return()=>{live.current=false;controller.abort();clearInterval(interval);};
  },[read]);
  const choose=(id:string)=>{setVisited(previous=>previous.includes(id)?previous:[...previous,id]);setActive(previous=>previous===id?null:id);};
  const clearAttempt=()=>{setAttempt(undefined);try{sessionStorage.removeItem(storageKey);}catch{/* The current-page state remains correct. */}};
  const create=async()=>{
    if(busy.current)return;busy.current=true;setCreating(true);setError('');
    const input=attempt??{expectedRevision:parentRef.current.revision,clientRequestId:crypto.randomUUID()};
    setAttempt(input);try{sessionStorage.setItem(storageKey,JSON.stringify(input));}catch{/* Keep the same identity in memory. */}
    try{
      const result=await api.createChild(parentRef.current,input);
      if(!live.current)return;
      clearAttempt();update(result);setVisited(previous=>[...new Set([...previous,result.id])]);setActive(result.id);
    }catch(failure){
      if(!live.current)return;
      const error=failure as ApiError;
      // Only explicit pre-admission failures permit a fresh attempt. A lost reply retries the same request.
      if(error.status&&error.status<500&&error.code!=='agent_request_conflict')clearAttempt();
      setError(error instanceof Error?error.message:'创建子对话失败，请重试核对原请求。');
    }finally{busy.current=false;if(live.current)setCreating(false);}
  };
  const more=async()=>{
    if(!cursor||loading)return;paging.current=true;setLoading(true);
    try{const result=await api.children(parent.workspaceId,parent.id,{cursor});if(live.current){setRows(previous=>mergeChildConversations(previous,result.conversations));setCursor(result.nextCursor);}}
    catch(failure){if(live.current)setError(failure instanceof Error?failure.message:'更多子对话读取失败。');}
    finally{if(live.current)setLoading(false);}
  };
  useImperativeHandle(ref,()=>({create:()=>void create()}));
  const collapse=useCallback(()=>setActive(null),[]);
  return <div ref={attach} className="ac-children" aria-label="主对话的子对话">
    <div className="ac-child-entries">
      {rows.map((row,index)=>{
        const label=(row.title==='新对话'?'子对话 '+(index+1):row.title)+' · '+childConversationStatus(row);
        const attention=['waiting-approval','waiting-question','unknown','tools-active','failed'].includes(row.run?.status||'');
        const unread=Boolean(row.activity&&row.activity.version>row.activity.seenThrough);
        return <Tooltip key={row.id} title={label} trigger={['hover','focus']}>
          <Button size="small" type={active===row.id?'primary':'text'} className="ac-child-entry"
            icon={<Badge dot={attention||unread} color={attention?'var(--ac-attention-ink,#796747)':'var(--soft-primary,#397d74)'}><CommentOutlined/></Badge>}
            data-child-entry={row.id} aria-label={label} aria-expanded={active===row.id} aria-controls={'agent-child-conversation-panel-'+row.id} onClick={()=>choose(row.id)}/>
        </Tooltip>;
      })}
      {cursor&&<Tooltip title="更多子对话" trigger={['hover','focus']}><Button size="small" type="text" icon={<MoreOutlined/>} loading={loading} aria-label="更多子对话" onClick={()=>void more()}/></Tooltip>}
      {creating&&<LoadingOutlined className="ac-child-creating" role="status" aria-label="正在创建子对话"/>}
    </div>
    {windowTarget&&createPortal(<>
      {error&&<Alert className="ac-child-error" type="warning" message={error} closable onClose={()=>setError('')} action={<Button type="text" size="small" icon={<ReloadOutlined/>} aria-label={attempt?'重试创建子对话':'刷新子对话'} onClick={()=>attempt?void create():void read().then(()=>setError('')).catch(()=>{})}/>}/>}
      {rows.filter(row=>visited.includes(row.id)).map(row=><ChildWindow key={row.id} summary={row} visible={active===row.id&&host.open&&host.view==='conversation'} workspaces={workspaces} onClose={collapse} onUpdate={update}/>)}
    </>,windowTarget)}
  </div>;
}
