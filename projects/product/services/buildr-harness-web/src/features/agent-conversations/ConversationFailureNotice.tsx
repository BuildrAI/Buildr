import { WarningOutlined } from '@ant-design/icons';
import type { ConversationEntry, ConversationRun } from './types.ts';
import { conversationFailureImpact, conversationFailureReason } from './conversation-notices.ts';

type Props = {
  run: Pick<ConversationRun, 'status' | 'accepted' | 'tools' | 'diagnostic' | 'fault'>;
  inputStatus?: ConversationEntry['status'];
};

/** 失败轮次先说明可理解的原因和下一步，原始诊断只放在可展开的技术详情中。 */
export function ConversationFailureNotice({ run, inputStatus }: Props) {
  if (run.status !== 'failed') return null;
  const reason = conversationFailureReason(run.diagnostic, run.fault);
  return <div className="ac-failure-notice">
    <p className="ac-failure-reason">
      <WarningOutlined aria-hidden="true" />
      <span>{reason.summary}</span>
    </p>
    {reason.action && <p className="ac-failure-action">{reason.action}</p>}
    <p className="ac-failure-impact">{conversationFailureImpact(run,inputStatus)}</p>
    {run.diagnostic && <details className="ac-failure-diagnostic">
      <summary>技术详情</summary>
      <p>{run.diagnostic}</p>
    </details>}
  </div>;
}
