import {Button} from 'antd';

type Props={diagnostic?:string;observing:boolean;stopping:boolean;onObserve:()=>void;onStop:()=>void};

export function ConversationExecutionNotice({diagnostic,observing,stopping,onObserve,onStop}:Props){
  return <div className="ac-execution-uncertain" role="status" data-run-status="unknown">
    <div className="ac-execution-uncertain-summary">
      <span>{observing?'正在恢复连接…':'执行状态待确认'}</span>
      <div className="ac-execution-uncertain-actions">
        <Button type="text" size="small" loading={observing} disabled={stopping} onClick={onObserve}>{observing?'正在核对…':'核对状态'}</Button>
        <Button type="text" size="small" loading={stopping} disabled={stopping} onClick={onStop}>{stopping?'正在停止…':'停止'}</Button>
      </div>
    </div>
    <small>原执行状态尚待核对，不会重发；仍可发送新的要求。</small>
    {diagnostic&&<details><summary>查看原因</summary><p>{diagnostic}</p></details>}
  </div>;
}
