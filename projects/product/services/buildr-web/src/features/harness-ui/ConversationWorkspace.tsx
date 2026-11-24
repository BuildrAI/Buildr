import {useCallback, useMemo, useRef, useState, type ReactNode} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {HarnessConversationSurface, LocalFilePreviewModal, conversationFileLink, type HarnessConversationHost, type HarnessDirectoryFiles, type HarnessFileContent, type ConversationFilePreview} from '../../../../buildr-harness-web/src/conversation';
import {resolveTaskBriefReference, taskBriefHref} from '../../lib/taskBriefLinks';
import {readExplorerFile} from '../code/code-file-read';
import {offerCodeOpen} from '../code/code-open-observation';
import {codeApi} from '../code/api/code-api';
import {api, type ApiError} from '../../api';
import {conversationAbsoluteFile, conversationFileTarget} from './conversation-files';
import {useAgentConversations} from './AgentConversationsContext';
import type {ConversationView} from './types';
import {ConversationTaskLink} from './ConversationTaskLink';
import {BuildrParticipation} from './BuildrParticipation';
import {conversationTaskLinks} from './conversation-associations';
import {desktopReturnToHost, revealDesktopExplorerFile} from '../../app/dsh-desktop';
import './harness-ui.css';

const UUID_SCOPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function locate(workspaceId:string,cwd:string,path:string,taskId:string|undefined,signal:AbortSignal){
  const absolute=conversationAbsoluteFile(cwd,path);
  if(!absolute)throw new Error('不能确认文件的准确工程来源。');
  if(UUID_SCOPE.test(workspaceId)){
    try {
      const catalog=await codeApi.targetRepositories(workspaceId,absolute,signal);
      const target=conversationFileTarget(cwd,path,catalog);
      if(target)return {kind:'repo' as const,absolute,target,catalog,partial:true};
    } catch (error) {
      if((error as ApiError).code!=='code_target_unconfirmed')throw error;
    }
    const catalog=await codeApi.repositories(workspaceId,taskId,signal);
    const target=conversationFileTarget(cwd,path,catalog);
    if(target)return {kind:'repo' as const,absolute,target,catalog,partial:false};
  }
  return {kind:'local' as const,absolute};
}

function readLocalFile(path:string,cwd:string,signal?:AbortSignal){
  return api('/api/v1/conversation-file',{method:'POST',body:JSON.stringify({path,cwd}),signal}) as Promise<HarnessFileContent>;
}

type Workspace = {id: string; name: string; rootPath: string};
export function ConversationWorkspace({defaultWorkspaceId, workspaces, headerAction}: {defaultWorkspaceId: string | null; workspaces: Workspace[]; headerAction?: ReactNode}) {
  const context = useAgentConversations();
  const navigate = useNavigate(), location = useLocation();
  const [previewFile, setPreviewFile] = useState<ConversationFilePreview | null>(null);
  const current = useRef({context, navigate, location});
  current.current = {context, navigate, location};
  const selected=useRef<string|null>(null);
  const opening=useRef<AbortController|null>(null);
  const onConversationChange=useCallback((conversation: ConversationView | null)=>{
    const key=conversation?conversation.workspaceId+':'+conversation.id:null;
    if(selected.current!==key){selected.current=key;opening.current?.abort();setPreviewFile(null);}
    current.current.context.setConversation(conversation);
  },[]);
  const files = useMemo<HarnessDirectoryFiles>(() => ({
    async readFile(conversation, path, signal) {
      const observed = await current.current.context.api.read(conversation.workspaceId, conversation.id, signal);
      const located = await locate(observed.workspaceId,observed.cwd,path,observed.taskId,signal);
      if (located.kind === 'repo') return codeApi.explorerFile(observed.workspaceId,located.target,signal);
      return readLocalFile(located.absolute,observed.cwd,signal);
    },
    async findExplorerFile(conversation,reference,signal) {
      const {path,line}=conversationFileLink(reference,false);
      const resolve=async()=>{
        const observed=await current.current.context.api.read(conversation.workspaceId,conversation.id,signal);
        const located=await locate(observed.workspaceId,observed.cwd,path,observed.taskId,signal);
        if(located.kind!=='repo')return null;
        const file={...located.target,line};
        const observation=await readExplorerFile(observed.workspaceId,file,signal,{editorFile:codeApi.editorFile,file:codeApi.explorerFile});
        return {observed,located,file,observation};
      };
      const known=await resolve();
      if(!known)return null;
      return async()=>{
        const latest=await resolve();
        if(!latest||latest.located.absolute!==known.located.absolute||latest.file.checkoutId!==known.file.checkoutId||latest.file.repositoryId!==known.file.repositoryId)throw new Error('文件来源已变化，请重新定位。');
        signal.throwIfAborted();
        const {observed,located,file,observation}=latest;
        if (revealDesktopExplorerFile(observed.workspaceId, { path: file.path, line: file.line, checkout: { repositoryId: file.repositoryId, checkoutId: file.checkoutId } })) return;
        const observationId=offerCodeOpen(observed.workspaceId,file,located.catalog,observation,located.partial);
        const {navigate,location,context}=current.current;
        navigate(`/workspaces/${encodeURIComponent(observed.workspaceId)}/code/explorer`,{state:{revealFileTree:true,codeEntry:{taskId:observed.taskId,file,observationId,from:{pathname:location.pathname,search:location.search,hash:location.hash,state:location.state}}}});
        context.setFull(false);
      };
    },
    async openFile(conversation, reference, literal, linkSignal) {
      opening.current?.abort();
      const request = new AbortController();
      const signal = linkSignal ? AbortSignal.any([request.signal, linkSignal]) : request.signal;
      opening.current = request;
      try {
        const observed = await current.current.context.api.read(conversation.workspaceId, conversation.id, signal);
        const {path,fragment,line} = conversationFileLink(reference,literal);
        const located = await locate(observed.workspaceId,observed.cwd,path,observed.taskId,signal);
        const value = located.kind==='repo' && !/\.html?$/i.test(path)
          ? await readExplorerFile(observed.workspaceId, located.target, signal, {editorFile:codeApi.editorFile,file:codeApi.explorerFile})
          : await readLocalFile(located.absolute, observed.cwd, signal);
        signal.throwIfAborted();
        setPreviewFile({path:located.absolute,value:{...value,path:located.kind==='repo'&&!/\.html?$/i.test(path)?located.absolute:value.path},fragment,line});
        return false;
      } finally {
        if (opening.current === request) opening.current = null;
      }
    },
  }), []);
  const host: HarnessConversationHost = {
    modeSwitchInHost: true,
    diagramRendererPath: '/mermaid-renderer.html',
    requestLayout(action, full) {
      if (action === 'collapse') context.setOpen(false);
      else context.setFull(full ?? !context.full);
    },
    openObject(reference, scopePath) {
      if (!/^\/workspaces\/[a-f0-9-]{36}$/i.test(scopePath)) return;
      const id = resolveTaskBriefReference(reference);
      if (id) {navigate(taskBriefHref(id, scopePath)); context.setFull(false);}
    },
    renderContext(conversation, apply) {
      return <><ConversationTaskLink onNavigate={() => context.setFull(false)} taskLinks={conversationTaskLinks(conversation)} onAssign={async links => {
        try {const updated = await context.api.update(conversation, {taskLinks: links}); apply(updated, conversation.revision); return true;}
        catch (error) {const latest = await context.api.read(conversation.workspaceId, conversation.id); apply(latest, conversation.revision); throw error;}
      }}/><BuildrParticipation workspaceId={conversation.workspaceId} conversationId={conversation.id}/></>;
    },
  };
  return <section data-selected-workspace={context.conversation?.workspaceId} data-selected-conversation={context.conversation?.id}
    className={'development-harness-frame in-shell' + (context.full ? ' is-full' : '') + (!context.open ? ' is-collapsed' : '')}>
    <HarnessConversationSurface headerAction={headerAction} onReturnToHost={desktopReturnToHost()} workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId} open={context.open} full={context.full} view={context.view}
      command={context.command} sequence={context.sequence} files={files} host={host}
      onOpenChange={context.setOpen} onSideChange={context.setSide} onWidthChange={context.setWidth}
      onConversationChange={onConversationChange} onViewChange={context.setView} onResult={context.reply}/>
    <LocalFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)}/>
  </section>;
}
