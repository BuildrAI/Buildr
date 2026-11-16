import {Alert, Button} from 'antd';
import type {FirstSubmission} from './conversation-first-submission.ts';

export function ConversationFirstSubmissionNotice({submission, busy, onRetry}: {submission: FirstSubmission; busy: boolean; onRetry: () => void}) {
  const updating = submission.failureReason === 'backend-updating';
  return <Alert
    type={updating ? 'info' : 'warning'}
    message={updating ? '上次发送尚未受理：正在等待可接单的执行后台。' : '首次发送结果待核对，原内容已保留；可以核对原提交是否已受理。'}
    description={updating ? '后台恢复后会核对原提交，再接续发送。原文字和附件已保留。' : undefined}
    action={<Button size="small" loading={busy} onClick={onRetry}>{updating ? '检查并重试原提交' : '核对原提交'}</Button>}
  />;
}
