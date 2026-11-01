import {Alert, Button} from 'antd';
import type {FirstSubmission} from './conversation-first-submission';

export function ConversationFirstSubmissionNotice({submission, busy, onRetry}: {submission: FirstSubmission; busy: boolean; onRetry: () => void}) {
  const updating = submission.failureReason === 'backend-updating';
  return <Alert
    type={updating ? 'info' : 'warning'}
    message={updating ? '上次发送尚未受理：执行后台正在升级，新后台尚未就绪。' : '首次发送结果待核对，原内容已保留；重试将核对并沿用原提交，不发送后来编辑的内容。'}
    description={updating ? '原文字和附件已保留。升级完成后，可检查并重试原提交；不会发送后来编辑的内容。' : undefined}
    action={<Button size="small" loading={busy} onClick={onRetry}>{updating ? '检查升级并重试原提交' : '核对并重试原提交'}</Button>}
  />;
}
