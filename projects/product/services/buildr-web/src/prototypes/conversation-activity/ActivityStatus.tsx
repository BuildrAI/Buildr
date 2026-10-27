import type { DemoConversation } from './fixtures';
import { ConversationActivityStatus } from '../../features/agent-conversations/ConversationActivityStatus';
export function ActivityStatus({row}:{row:DemoConversation}) {
  return <ConversationActivityStatus state={row.status==='waiting'?'waiting':row.status==='running'?'running':row.unseen?'unseen':null}/>;
}
