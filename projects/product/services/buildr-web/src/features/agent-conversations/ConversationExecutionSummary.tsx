import type { ConversationPage } from './api/agent-conversations-api';
import type { ExecutionFilter } from './ConversationExecutionStats';

/** Account identity owns this summary; the full history retains executor filters. */
export function ConversationExecutionSummary({stats,stale,modelLabel,sourceLabel,filter,onFilter}:{stats:ConversationPage['stats'];stale?:boolean;modelLabel(id:string,accountId?:string):string;sourceLabel(accountId:string):string;filter?:ExecutionFilter;onFilter?(value:ExecutionFilter):void}) {
  const count=stats?.agents.reduce((sum,row)=>sum+row.count,0);
  return <section className="ac-execution-summary" aria-label="执行中模型">
    <header><strong>执行中模型 <b>{count??'—'}</b></strong>{stale&&<small>未更新</small>}</header>
    {!!count&&stats?.modelExecutions&&<div>{stats.modelExecutions.map(row=>{
      const selected=filter?.kind==='model'&&filter.value===row.model;
      const label=<><span>{sourceLabel(row.accountId)} · {modelLabel(row.model,row.accountId)}</span><b>{row.count}</b></>;
      return onFilter
        ? <button key={JSON.stringify([row.accountId,row.model])} type="button" className={'ac-execution-chip'+(selected?' is-selected':'')} aria-pressed={selected} onClick={()=>onFilter(selected?null:{kind:'model',value:row.model})}>{label}</button>
        : <span key={JSON.stringify([row.accountId,row.model])}>{label}</span>;
    })}</div>}
    {!!count&&!stats?.modelExecutions&&<small>账号与模型明细尚未读取</small>}
  </section>;
}
