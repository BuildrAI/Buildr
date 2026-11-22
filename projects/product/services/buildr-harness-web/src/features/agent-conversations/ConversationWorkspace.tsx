import {useRef,type ReactNode} from 'react';
import {ConversationPanel} from './ConversationPanel.tsx';
import {ConversationChildWindows,type ConversationChildActions} from './ConversationChildWindows.tsx';
import {useAgentConversations} from './AgentConversationsContext.tsx';
import type {ConversationWorkspace as Workspace} from './ConversationHistory.tsx';

type Props={workspaces:Workspace[];defaultWorkspaceId:string|null;portalTarget?:HTMLElement|null;development?:boolean;headerAction?:ReactNode};
/** The main selection stays owned by the shell; child windows get isolated view bindings. */
export function ConversationWorkspace(props:Props) {
  const context=useAgentConversations(),parent=context.conversation;
  const children=useRef<ConversationChildActions>(null);
  return <ConversationPanel {...props} accessory={parent&&!parent.childOf
    ?(visible=><ConversationChildWindows ref={children} key={parent.workspaceId+':'+parent.id} parent={parent} parentVisible={visible} workspaces={props.workspaces}/>)
    :undefined} onCreateChild={parent&&!parent.childOf?()=>children.current?.create():undefined}/>;
}
