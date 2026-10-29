import type { ConversationPage } from './api/agent-conversations-api';

/** Account identity owns this summary; the full history retains executor filters. */
export function ConversationExecutionSummary({stats,stale,modelLabel,sourceLabel}:{stats:ConversationPage['stats'];stale?:boolean;modelLabel(id:string,accountId?:string):string;sourceLabel(accountId:string):string}) {
  const count=stats?.agents.reduce((sum,row)=>sum+row.count,0);
  return <section className="ac-execution-summary" aria-label="执行中模型">
    <header><strong>执行中模型 <b>{count??'—'}</b></strong>{stale&&<small>未更新</small>}</header>
    {!!count&&stats?.modelExecutions&&<div>{stats.modelExecutions.map(row=><span key={JSON.stringify([row.accountId,row.model])}><span>{sourceLabel(row.accountId)} · {modelLabel(row.model,row.accountId)}</span><b>{row.count}</b></span>)}</div>}
    {!!count&&!stats?.modelExecutions&&<small>账号与模型明细尚未读取</small>}
  </section>;
}
