import {useCallback, useMemo, useRef} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {HarnessConversationSurface, type HarnessConversationHost, type HarnessDirectoryFiles} from '../../../../buildr-harness-web/src/conversation';
import {resolveTaskBriefReference, taskBriefHref} from '../../lib/taskBriefLinks';
import {readExplorerFile} from '../code/code-file-read';
import {offerCodeOpen} from '../code/code-open-observation';
import {codeApi} from '../code/api/code-api';
import type {ApiError} from '../../api';
import {conversationAbsoluteFile, conversationFileTarget} from './conversation-files';
import {useAgentConversations} from './AgentConversationsContext';
import type {ConversationView} from './types';
import {ConversationTaskLink} from './ConversationTaskLink';
import {BuildrParticipation} from './BuildrParticipation';
import {conversationTaskLinks} from './conversation-associations';
import './harness-ui.css';

async function locate(workspaceId:string,cwd:string,path:string,taskId:string|undefined,signal:AbortSignal){
  const absolute=conversationAbsoluteFile(cwd,path);
  if(!absolute)throw new Error('不能确认文件的准确工程来源。');
  try {
    const catalog=await codeApi.targetRepositories(workspaceId,absolute,signal);
    const target=conversationFileTarget(cwd,path,catalog);
    if(target)return {target,catalog,partial:true};
  } catch (error) {
    if((error as ApiError).code!=='code_target_unconfirmed')throw error;
  }
  const catalog=await codeApi.repositories(workspaceId,taskId,signal);
  const target=conversationFileTarget(cwd,path,catalog);
  if(!target)throw new Error('不能确认文件的准确工程来源。');
  return {target,catalog,partial:false};
}

type Workspace = {id: string; name: string; rootPath: string};
export function ConversationWorkspace({defaultWorkspaceId, workspaces}: {defaultWorkspaceId: string | null; workspaces: Workspace[]}) {
  const context = useAgentConversations();
  const navigate = useNavigate(), location = useLocation();
  const current = useRef({context, navigate, location});
  current.current = {context, navigate, location};
  const selected=useRef<string|null>(null);
  const opening=useRef<AbortController|null>(null);
  const onConversationChange=useCallback((conversation: ConversationView | null)=>{
    const key=conversation?conversation.workspaceId+':'+conversation.id:null;
    if(selected.current!==key){selected.current=key;opening.current?.abort();}
    current.current.context.setConversation(conversation);
  },[]);
  const files = useMemo<HarnessDirectoryFiles>(() => ({
    async readFile(conversation, path, signal) {
      const observed = await current.current.context.api.read(conversation.workspaceId, conversation.id, signal);
      const {target}=await locate(observed.workspaceId,observed.cwd,path,observed.taskId,signal);
      return codeApi.explorerFile(observed.workspaceId,target,signal);
    },
    async openFile(conversation, path, literal, linkSignal) {
      opening.current?.abort();
      const request = new AbortController();
      const signal = linkSignal ? AbortSignal.any([request.signal, linkSignal]) : request.signal;
      opening.current = request;
      try {
        const observed = await current.current.context.api.read(conversation.workspaceId, conversation.id, signal);
        const suffix = literal ? null : path.match(/(?::|#L)([1-9][0-9]*)$/);
        const {target,catalog,partial}=await locate(observed.workspaceId,observed.cwd,suffix ? path.slice(0,suffix.index) : path,observed.taskId,signal);
        const line = suffix ? Number(suffix[1]) : undefined;
        if (line !== undefined && !Number.isSafeInteger(line)) throw new Error('文件行号无效。');
        const file = {...target, line};
        const observation = await readExplorerFile(observed.workspaceId, file, signal, {editorFile:codeApi.editorFile,file:codeApi.explorerFile});
        signal.throwIfAborted();
        const observationId = offerCodeOpen(observed.workspaceId, file, catalog, observation, partial);
        const {navigate, location, context} = current.current;
        navigate(`/workspaces/${encodeURIComponent(observed.workspaceId)}/code/explorer`, {state: {codeEntry: {file, observationId, from: {pathname: location.pathname, search: location.search, hash: location.hash, state: location.state}}}});
        context.setFull(false);
      } finally {
        if (opening.current === request) opening.current = null;
      }
    },
  }), []);
  const host: HarnessConversationHost = {
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
    <HarnessConversationSurface workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId} open={context.open} full={context.full} view={context.view}
      command={context.command} sequence={context.sequence} files={files} host={host}
      onOpenChange={context.setOpen} onSideChange={context.setSide} onWidthChange={context.setWidth}
      onConversationChange={onConversationChange} onViewChange={context.setView} onResult={context.reply}/>
  </section>;
}
