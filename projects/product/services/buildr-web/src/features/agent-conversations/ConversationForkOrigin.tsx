import { Button } from 'antd';
import { ForkOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import type { ConversationView } from './types';

export function ConversationForkOrigin({ conversation }: { conversation: ConversationView }) {
  const context = useAgentConversations(), origin = conversation.forkedFrom;
  if (!origin) return null;
  return <div className="ac-fork-origin" data-forked-from={origin.conversationId} data-forked-entry={origin.entryId}>
    <div><ForkOutlined aria-hidden="true" /><span>分支自</span><Button type="link" size="small" title={`原对话：${origin.conversationId}`} onClick={() => void context.openConversation(origin.workspaceId, origin.conversationId, {preserveVisibility:true})}>{origin.title}</Button></div>
    <small>已继承截至所选答复的对话；文件和工作环境保持当前状态。</small>
    {conversation.forkState && conversation.forkState.status !== 'ready' && <small role="status">{conversation.forkState.reason || '正在创建分叉，尚不能发送新指令。'}</small>}
  </div>;
}
