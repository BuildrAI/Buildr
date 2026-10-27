import { Button } from 'antd';
import { ConversationExecutionStats, type ExecutionFilter } from '../../features/agent-conversations/ConversationExecutionStats';
import { executionOverview, type DemoConversation } from './fixtures';
export type { ExecutionFilter };
export type StatsStatus='ready'|'unknown'|'error';
type Props={rows:DemoConversation[];filter:ExecutionFilter;onFilter(value:ExecutionFilter):void;compact?:boolean;status?:StatsStatus};
/** Both prototype entries share aggregation, chips, selection, clear and availability feedback. */
export function ExecutionStats({rows,filter,onFilter,compact=false,status='ready'}:Props) {
  return <div className={'ca-execution-summary'+(compact?' is-compact':'')} data-prototype-position={compact?'activity-stats':'execution-stats'}>
    {status==='ready'?<ConversationExecutionStats stats={executionOverview(rows)} filter={filter} onFilter={onFilter} compact={compact}/>:<section className="ac-execution-stats ca-stats-unavailable" aria-label="执行统计"><strong>{status==='error'?'暂时无法读取执行统计':'执行数量暂未确认'}</strong><p>{status==='error'?'已保留活动列表，统计读取失败不代表没有执行。':'正在核对当前执行事实，不显示为零。'}</p></section>}
    {filter&&status==='ready'&&<div className="ca-execution-filter" data-prototype-position={compact?'activity-stats-filter':'execution-filter'}><span>仅看执行中 · {filter.value}</span><Button size="small" type="link" onClick={()=>onFilter(null)}>清除筛选</Button></div>}
  </div>;
}
