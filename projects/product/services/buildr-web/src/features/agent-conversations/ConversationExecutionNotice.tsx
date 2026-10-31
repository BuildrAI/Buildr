import {Button} from 'antd';

type Props={diagnostic?:string;feedback?:string;resourcesReleased?:boolean;observing:boolean;stopping:boolean;onObserve:()=>void;onStop:()=>void};

export function ConversationExecutionNotice({diagnostic,feedback,resourcesReleased,observing,stopping,onObserve,onStop}:Props){
  const explanation=[resourcesReleased?'后台连接已释放，未取得本轮结束记录。可发送新要求继续，不会重做原操作。':'暂时无法读取原执行状态，原记录已保留；仍可发送新的要求，不会重做原操作。',feedback,diagnostic].filter(Boolean).join('\n');
  return <div className="ac-execution-uncertain" role="status" data-run-status="unknown">
    <div className="ac-execution-uncertain-summary">
      <span className="ac-execution-uncertain-label" title={explanation}>{observing?'正在读取执行记录…':feedback?(resourcesReleased?'未读到结束记录，可继续发送':'仍无法读取原执行状态'):resourcesReleased?'回复已中断，可继续发送':'暂时无法读取执行状态'}</span>
      <div className="ac-execution-uncertain-actions">
        <Button type="text" size="small" loading={observing} disabled={stopping} onClick={onObserve}>重新读取</Button>
        {!resourcesReleased&&<Button type="text" size="small" loading={stopping} disabled={stopping||observing} onClick={onStop}>{stopping?'正在停止…':'停止'}</Button>}
      </div>
    </div>
  </div>;
}
