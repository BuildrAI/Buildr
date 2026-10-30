import type { ReactNode } from 'react';
import { Button } from 'antd';
import type { ConversationView, ConversationRun } from './types';
import { executionLocked } from './conversation-state';
import { ConversationActiveToolsNotice } from './ConversationActiveToolsNotice';

type Props = {
  conversation:ConversationView|null;
  busy(run:ConversationRun,operation:'observe'|'stop'):boolean;
  renderRequest?(request:ConversationView['requests'][number]):ReactNode;
  onObserve(run:ConversationRun):void;
  onStop(run:ConversationRun,toolId?:string):void;
};

/** Old work stays visible and controllable, without becoming an input gate. */
export function ConversationRetainedWork({conversation,busy,onObserve,onStop,renderRequest}:Props) {
  const runs=conversation?.retainedRuns?.filter(run=>executionLocked(run)||run.tools.some(tool=>tool.status!=='completed'))??[];
  if(!runs.length)return null;
  return <details className="ac-active-tools" data-retained-work>
    <summary>保留了 {runs.length} 项原执行，不影响继续对话</summary>
    {runs.map(run=><section key={run.id} data-retained-run={run.id}>
      <strong>{conversation?.participants.find(participant=>participant.id===run.participantId)?.label} · {run.model||'默认模型'}</strong>
      {run.tools.some(tool=>tool.status!=='completed')?
        <ConversationActiveToolsNotice tools={run.tools} diagnostic={run.diagnostic} canContinue observing={busy(run,'observe')} stopping={busy(run,'stop')} onObserve={()=>onObserve(run)} onStop={toolId=>onStop(run,toolId)}/>:
        <div role="status">
          <span>{run.status==='unknown'?'原执行状态待核对':run.status==='waiting-question'||run.status==='waiting-approval'?'原执行仍在等待决定，新的要求不算回答':'原执行尚未结束'}</span>
          <Button type="text" size="small" loading={busy(run,'observe')} onClick={()=>onObserve(run)}>核对状态</Button>
          <Button type="text" size="small" loading={busy(run,'stop')} onClick={()=>onStop(run)}>停止原执行</Button>
          {run.diagnostic&&<p>{run.diagnostic}</p>}
        </div>}
      {conversation?.requests.filter(request=>request.runId===run.id&&request.participantId===run.participantId&&request.generation===run.generation).map(request=><div key={request.id}>{renderRequest?renderRequest(request):<p>未回答：{request.title}</p>}</div>)}
    </section>)}
  </details>;
}
