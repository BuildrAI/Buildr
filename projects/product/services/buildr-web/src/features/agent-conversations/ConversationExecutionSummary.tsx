import type { ConversationPage } from './api/agent-conversations-api';

/** A small, read-only model/agent summary; the full history owns statistical filters. */
export function ConversationExecutionSummary({stats,stale,modelLabel}:{stats:ConversationPage['stats'];stale?:boolean;modelLabel(id:string):string}) {
  const providers:Record<string,string>={codex:'Codex',dsh:'DSH',qoder:'Qoder','未指定':'智能体未记录'};
  const count=stats?.agents.reduce((sum,row)=>sum+row.count,0);
  return <section className="ac-execution-summary" aria-label="执行中的模型">
    <header><strong>执行中 <b>{count??'—'}</b></strong>{stale&&<small>未更新</small>}</header>
    {!!count&&stats?.executions&&<div>{stats.executions.map(row=><span key={JSON.stringify([row.provider,row.model])} title={`${providers[row.provider]??row.provider} · ${modelLabel(row.model)}，${row.count} 段对话执行中`}><span>{providers[row.provider]??row.provider} · {modelLabel(row.model)}</span><b>{row.count}</b></span>)}</div>}
    {!!count&&!stats?.executions&&<small>模型与智能体明细尚未读取</small>}
  </section>;
}
