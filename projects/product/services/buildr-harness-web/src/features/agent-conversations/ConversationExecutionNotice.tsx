import {Button} from 'antd';
import type {ConversationRun} from './types.ts';
import {conversationLiveUnknownReason, conversationUnknownExecutionSummary} from './conversation-notices.ts';

type Props={run:Pick<ConversationRun,'status'|'diagnostic'|'stopRequested'|'resourcesReleased'|'tools'>;feedback?:string;streamError?:string;continuing?:boolean;continueDisabled?:boolean;observing:boolean;stopping:boolean;onObserve:()=>void;onStop:()=>void;onContinue?:()=>void};

/** Settled doubt states its source and what remains; only an explicit continuation leaves it. Live unknown work keeps stop and reread. */
export function ConversationExecutionNotice({run,feedback,streamError,continuing,continueDisabled,observing,stopping,onObserve,onStop,onContinue}:Props){
  const diagnostic=[run.diagnostic,streamError].filter(Boolean).join('\n');
  if(run.resourcesReleased===true||run.stopRequested===true){
    const summary=conversationUnknownExecutionSummary(run);
    return <div className="ac-execution-uncertain" role="status" data-run-status="unknown">
      <div className="ac-execution-uncertain-summary">
        <span className="ac-execution-uncertain-reason" title={[summary.detail,diagnostic].filter(Boolean).join('\n')}>{summary.reason}</span>
        {onContinue&&<div className="ac-execution-uncertain-actions"><Button type="text" size="small" loading={continuing} disabled={continueDisabled||observing} onClick={onContinue}>继续原任务</Button></div>}
      </div>
      <p className="ac-execution-uncertain-detail">{summary.detail}</p>
    </div>;
  }
  const liveReason=conversationLiveUnknownReason(run.diagnostic,streamError);
  const explanation=[feedback,diagnostic].filter(Boolean).join('\n');
  const visibleMessage=stopping?'正在停止本轮及派生工作…':observing?'正在读取执行记录…':feedback||liveReason||'暂时无法读取执行状态';
  const wrappable=Boolean(!stopping&&!observing&&(feedback||liveReason));
  return <div className="ac-execution-uncertain" role="status" data-run-status="unknown">
    <div className="ac-execution-uncertain-summary">
      <span className={wrappable?'ac-execution-uncertain-reason':'ac-execution-uncertain-label'} title={explanation}>{visibleMessage}</span>
      <div className="ac-execution-uncertain-actions">
        <Button type="text" size="small" loading={observing} disabled={stopping} onClick={onObserve}>重新读取</Button>
        <Button type="text" size="small" loading={stopping} disabled={stopping||observing} onClick={onStop}>{stopping?'正在停止…':'停止'}</Button>
      </div>
    </div>
  </div>;
}
