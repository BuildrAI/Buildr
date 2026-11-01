import {useRef} from 'react';
import {ConversationPanel} from './ConversationPanel';
import {ConversationChildWindows,type ConversationChildActions} from './ConversationChildWindows';
import {useAgentConversations} from './AgentConversationsContext';
import type {ConversationWorkspace as Workspace} from './ConversationHistory';

type Props={workspaces:Workspace[];defaultWorkspaceId:string|null;portalTarget?:HTMLElement|null};
/** The main selection stays owned by the shell; child windows get isolated view bindings. */
export function ConversationWorkspace(props:Props) {
  const context=useAgentConversations(),parent=context.conversation;
  const children=useRef<ConversationChildActions>(null);
  return <ConversationPanel {...props} accessory={parent&&!parent.childOf
    ?<ConversationChildWindows ref={children} key={parent.workspaceId+':'+parent.id} parent={parent} workspaces={props.workspaces}/>
    :undefined} onCreateChild={parent&&!parent.childOf?()=>children.current?.create():undefined}/>;
}
