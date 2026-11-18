import {useCallback, useMemo, useRef} from 'react';
import {Button} from 'antd';
import {CommentOutlined, PlusOutlined, SettingOutlined, UnorderedListOutlined} from '@ant-design/icons';
import {useLocation, useNavigate} from 'react-router-dom';
import {HarnessConversationSurface, type HarnessConversationHost, type HarnessDirectoryFiles} from '../../../../buildr-harness-web/src/conversation';
import {resolveTaskBriefReference, taskBriefHref} from '../../lib/taskBriefLinks';
import {codeApi} from '../code/api/code-api';
import {conversationFileTarget} from './conversation-files';
import {useAgentConversations} from './AgentConversationsContext';
import type {ConversationView} from './types';
import {ConversationTaskLink} from './ConversationTaskLink';
import {BuildrParticipation} from './BuildrParticipation';
import {conversationTaskLinks} from './conversation-associations';
import './harness-ui.css';

type Workspace = {id: string; name: string; rootPath: string};
export function ConversationWorkspace({defaultWorkspaceId, workspaces}: {defaultWorkspaceId: string | null; workspaces: Workspace[]}) {
  const context = useAgentConversations();
  const navigate = useNavigate(), location = useLocation();
  const current = useRef({context, navigate, location});
  current.current = {context, navigate, location};
  // Browse-only engineering navigation must not retarget a pending file open.
  const selection = useRef(0);
  const selected=useRef<string|null>(null);
  const onConversationChange=useCallback((conversation: ConversationView | null)=>{
    const key=conversation?conversation.workspaceId+':'+conversation.id:null;
    if(selected.current!==key){selected.current=key;selection.current++;}
    current.current.context.setConversation(conversation);
  },[]);
  const files = useMemo<HarnessDirectoryFiles>(() => ({
    scopeRequired: true,
    async readFile(conversation, path, signal) {
      const observed = await current.current.context.api.read(conversation.workspaceId, conversation.id, signal);
      const catalog = await codeApi.repositories(observed.workspaceId, observed.taskId);
      const file = conversationFileTarget(observed.cwd, path, catalog);
      if (!file) throw new Error('不能确认文件的准确工程来源。');
      signal.throwIfAborted();
      return codeApi.file(observed.workspaceId, file);
    },
    async openFile(conversation, path) {
      const generation = selection.current;
      const observed = await current.current.context.api.read(conversation.workspaceId, conversation.id);
      const catalog = await codeApi.repositories(observed.workspaceId, observed.taskId);
      const file = conversationFileTarget(observed.cwd, path, catalog);
      if (!file) throw new Error('不能确认文件的准确工程来源。');
      await codeApi.file(observed.workspaceId, file);
      if (generation !== selection.current) throw new Error('对话选择已变化，未跳转原文件。');
      const {navigate, location, context} = current.current;
      navigate(`/workspaces/${encodeURIComponent(observed.workspaceId)}/code/explorer`, {state: {codeEntry: {file, from: {pathname: location.pathname, search: location.search, hash: location.hash, state: location.state}}}});
      context.setFull(false);
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
  return <><section data-selected-workspace={context.conversation?.workspaceId} data-selected-conversation={context.conversation?.id}
    className={'development-harness-frame in-shell' + (context.full ? ' is-full' : '')} hidden={!context.open}>
    <HarnessConversationSurface workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId} full={context.full} view={context.view}
      command={context.command} sequence={context.sequence} files={files} host={host}
      onConversationChange={onConversationChange} onViewChange={context.setView} onResult={context.reply}/>
  </section>{!context.open && <aside className="development-harness-rail" aria-label="当前对话与所有对话">
    <Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" onClick={() => context.newConversation()}/>
    <Button type="text" icon={<CommentOutlined/>} aria-label="展开当前对话" onClick={() => context.setOpen(true)}/>
    <Button type="text" icon={<UnorderedListOutlined/>} aria-label="全部对话" onClick={() => context.openHistory(null)}/>
    <Button type="text" className="development-harness-settings" icon={<SettingOutlined/>} aria-label="智能体与模型设置" onClick={() => context.setSettings(true)}/>
  </aside>}</>;
}
