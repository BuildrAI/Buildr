import { WarningOutlined } from '@ant-design/icons';
import type { ConversationRun } from './types';
import { conversationFailureImpact, conversationFailureReason } from './conversation-notices';

type Props = {
  run: Pick<ConversationRun, 'status' | 'accepted' | 'tools' | 'diagnostic' | 'fault'>;
};

/** 失败轮次先说明可理解的原因和下一步，原始诊断只放在可展开的技术详情中。 */
export function ConversationFailureNotice({ run }: Props) {
  if (run.status !== 'failed') return null;
  const reason = conversationFailureReason(run.diagnostic, run.fault);
  return <div className="ac-failure-notice">
    <p className="ac-failure-reason">
      <WarningOutlined aria-hidden="true" />
      <strong>失败原因</strong>
      <span>{reason.summary}</span>
    </p>
    {reason.action && <p className="ac-failure-action">{reason.action}</p>}
    <p className="ac-failure-impact">{conversationFailureImpact(run)}</p>
    {run.diagnostic && <details className="ac-failure-diagnostic">
      <summary>技术详情</summary>
      <p>{run.diagnostic}</p>
    </details>}
  </div>;
}
