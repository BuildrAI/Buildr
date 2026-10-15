import { Alert, Button } from 'antd';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';

export function TaskSummary({ context: response, error, onRespond }: {
  context:TaskWorkContextResponse|null; error:string|null; onRespond():void;
}) {
  const attention=response?.context?.attention;
  if (!error && attention?.state !== 'pending' && !attention?.response) return null;
  return <section className="task-header-context" aria-label="任务回应">
    {error && <Alert type="warning" message={error} />}
    {attention?.state==='pending' && <div id="task-attention" className="task-summary-attention"><div><strong>{attention.kind==='acceptance'?'等待你确认成果':attention.kind==='question'?'需要你的答复':'等待你的决定'}</strong><p id="task-attention-reason">{attention.reason}</p></div><Button id="task-attention-respond" type="primary" size="small" onClick={onRespond}>{attention.kind==='acceptance'?'记录验收意见':'记录答复'}</Button></div>}
    {attention?.response && <div className="task-summary-response"><strong>你的意见</strong><p id="task-attention-response">{attention.response.text}</p></div>}
  </section>;
}
