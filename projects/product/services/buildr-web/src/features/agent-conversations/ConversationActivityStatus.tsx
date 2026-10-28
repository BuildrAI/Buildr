import type { ActivityState } from './conversation-activity';
export function ConversationActivityStatus({state}:{state:ActivityState}) {
  if(!state)return null;
  return <span className={'ac-activity-status is-'+state}><i aria-hidden="true"/>{state==='running'?'执行中':state==='waiting'?'待决策':state==='unknown'?'状态待确认':'待查看'}</span>;
}
