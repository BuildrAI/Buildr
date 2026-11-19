import {useEffect, useLayoutEffect, useRef} from 'react';
import {AgentConversationsProvider, useAgentConversations, type TextConversationActionInput, type TextConversationActionResult} from '../features/agent-conversations/AgentConversationsContext';
import {ConversationWorkspace} from '../features/agent-conversations/ConversationWorkspace';
import type {ConversationWorkspace as Workspace} from '../features/agent-conversations/ConversationHistory';
import type {ConversationView} from '../features/agent-conversations/types';
import {HarnessDirectoryFilesProvider, type HarnessDirectoryFiles} from '../directory-files';
import {FrameSubmissions} from '../frame-submissions';
import {ConversationHostProvider, type HarnessConversationHost} from './ConversationHost';
import './conversation-surface.css';

export type HarnessConversationCommand = {
  action: 'new' | 'open' | 'history' | 'settings' | 'quota' | 'start-text';
  workspaceId?: string;
  conversationId?: string;
  taskId?: string;
  input?: TextConversationActionInput;
  requestId?: string;
};
type Props = {
  workspaces: Workspace[];
  defaultWorkspaceId: string | null;
  full: boolean;
  view: 'conversation' | 'history';
  command: HarnessConversationCommand | null;
  sequence: number;
  files: HarnessDirectoryFiles;
  host: HarnessConversationHost;
  onConversationChange(conversation: ConversationView | null): void;
  onViewChange(view: 'conversation' | 'history'): void;
  onResult(requestId: string, result: TextConversationActionResult): void;
};

/** One complete conversation implementation. Hosts never assemble its internal controls. */
export function HarnessConversationSurface(props: Props) {
  return <ConversationHostProvider host={props.host}><HarnessDirectoryFilesProvider host={props.files}>
    <AgentConversationsProvider initialLayout={{open: true, full: props.full, view: props.view}}>
      <Surface {...props}/>
    </AgentConversationsProvider>
  </HarnessDirectoryFilesProvider></ConversationHostProvider>;
}

function Surface(props: Props) {
  const context = useAgentConversations();
  const current = useRef(props);
  current.current = props;
  const lastCommand = useRef(-1);
  const submissions = useRef(new FrameSubmissions<TextConversationActionResult>());
  useLayoutEffect(() => {
    if (context.full !== props.full) context.setFull(props.full);
  }, [props.full, context.full, context.setFull]);
  useEffect(() => {
    current.current.onConversationChange(context.conversation);
  }, [context.conversation]);
  useEffect(() => {
    if (context.full === props.full) current.current.onViewChange(context.view);
  }, [context.view, context.full, props.full]);
  useEffect(() => {
    const command = props.command;
    if (!command || lastCommand.current === props.sequence) return;
    lastCommand.current = props.sequence;
    if (context.full&&command.action!=='settings'&&command.action!=='quota'&&command.action!=='start-text') context.setSettings(false);
    if (command.action === 'new') context.newConversation(command.workspaceId ? {scope: {workspaceId: command.workspaceId, ...(command.taskId ? {taskId: command.taskId} : {})}} : {});
    else if (command.action === 'open' && command.workspaceId && command.conversationId) void context.openConversation(command.workspaceId, command.conversationId);
    else if (command.action === 'history') context.openHistory(null);
    else if (command.action === 'settings') context.setSettings(true);
    else if (command.action === 'quota') context.openQuotaSettings?.();
    else if (command.action === 'start-text' && command.input && command.requestId) {
      const {requestId, input} = command;
      const submit = context.startTextConversation;
      if (!submit) return;
      void submissions.current.once(requestId, input, () => submit(input)).then(
        result => current.current.onResult(requestId, result),
        () => current.current.onResult(requestId, {status: 'recovering', reason: 'submission-unknown', message: '原提交结果未确认，请核对原对话。'}),
      );
    }
  }, [props.command, props.sequence, context.full, context.newConversation, context.openConversation, context.openHistory, context.openQuotaSettings, context.setSettings, context.startTextConversation]);
  return <div className="harness-conversation-surface">
    <ConversationWorkspace development workspaces={props.workspaces} defaultWorkspaceId={props.defaultWorkspaceId}/>
  </div>;
}
