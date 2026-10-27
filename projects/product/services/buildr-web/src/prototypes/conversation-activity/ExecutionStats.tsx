import { ConversationExecutionStats, type ExecutionFilter } from '../../features/agent-conversations/ConversationExecutionStats';
import { isRunning, type DemoConversation } from './fixtures';
export type { ExecutionFilter };
type Props={rows:DemoConversation[];filter:ExecutionFilter;onFilter(value:ExecutionFilter):void};
/** Only aggregation is simulated; statistics UI and filtering controls are shared. */
export function ExecutionStats({rows,filter,onFilter}:Props) {
  const group=(field:'agent'|'model')=>{const counts=new Map<string,number>();for(const row of rows.filter(isRunning))counts.set(row[field],(counts.get(row[field])??0)+1);return [...counts].map(([label,count])=>({label,count}));};
  return <div data-prototype-position="execution-stats"><ConversationExecutionStats stats={{agents:group('agent'),models:group('model')}} filter={filter} onFilter={onFilter}/></div>;
}
