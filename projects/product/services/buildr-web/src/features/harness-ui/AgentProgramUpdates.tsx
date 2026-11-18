import {Button} from 'antd';import {useOptionalAgentConversations} from './AgentConversationsContext';
export function AgentProgramUpdates(_props:{scope?:string;active?:boolean;checkRequest?:number}){const context=useOptionalAgentConversations();return <Button disabled={!context} onClick={()=>context?.setSettings(true)}>在 Harness 中管理智能体更新</Button>;}
