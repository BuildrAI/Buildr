import {Button} from 'antd';import {useAgentConversations} from './AgentConversationsContext';
export function ConversationActivity(_props:{open?:boolean;onOpenChange?:(open:boolean)=>void;workspaces:{id:string;name:string;rootPath:string}[]}){const context=useAgentConversations();return <Button aria-label="全部对话" onClick={()=>context.openHistory(null)}>对话</Button>;}
