import {Button} from 'antd';

type Props={diagnostic?:string;feedback?:string;resourcesReleased?:boolean;stopRequested?:boolean;closed?:boolean;closing?:boolean;continuing?:boolean;continueDisabled?:boolean;observing:boolean;stopping:boolean;onObserve:()=>void;onStop:()=>void;onContinue?:()=>void;onClose?:()=>void};

export function ConversationExecutionNotice({diagnostic,feedback,resourcesReleased,stopRequested,closed,closing,continuing,continueDisabled,observing,stopping,onObserve,onStop,onContinue,onClose}:Props){
  const explanation=[closed?'已结束关注，可从对话列表恢复；原执行及操作结果仍待确认。':resourcesReleased?'后台连接已释放，未取得本轮结束记录。继续工作会先核对已有成果；关闭对话只结束关注，保留记录与待确认结果。':stopRequested?'停止请求已提交，尚未取得本轮结束确认；原记录与已有操作结果保留，不会重发。':'暂时无法读取原执行状态，原记录已保留；仍可发送新的要求，不会重做原操作。',feedback,diagnostic].filter(Boolean).join('\n');
  return <div className="ac-execution-uncertain" role="status" data-run-status="unknown">
    <div className="ac-execution-uncertain-summary">
      <span className="ac-execution-uncertain-label" title={explanation}>{closed?'对话已关闭，原记录及待确认结果保留':stopping?'正在停止本轮及派生工作…':observing?'正在读取执行记录…':feedback|| (stopRequested?'停止已请求，结束状态待确认':onClose?'本轮结束状态待确认，可继续工作或关闭对话':resourcesReleased?'本轮结束状态待确认，原记录保留':'暂时无法读取执行状态')}</span>
      <div className="ac-execution-uncertain-actions">
        <Button type="text" size="small" loading={observing} disabled={stopping||closing||continuing} onClick={onObserve}>重新读取</Button>
        {onContinue&&<Button type="text" size="small" loading={continuing} disabled={continueDisabled||stopping||observing||closing} onClick={onContinue}>继续工作</Button>}
        {onClose&&!closed&&<Button type="text" size="small" loading={closing} disabled={stopping||observing||continuing} title="结束关注并从最近对话隐藏；记录和待确认结果保留，可从对话列表恢复" onClick={onClose}>关闭对话</Button>}
        {!resourcesReleased&&!stopRequested&&<Button type="text" size="small" loading={stopping} disabled={stopping||observing} onClick={onStop}>{stopping?'正在停止…':'停止'}</Button>}
      </div>
    </div>
  </div>;
}
