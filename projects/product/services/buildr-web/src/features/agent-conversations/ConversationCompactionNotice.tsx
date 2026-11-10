import { LoadingOutlined } from '@ant-design/icons';
import { ConversationExecutionIndicator } from './ConversationExecutionIndicator';
import type { ConversationRun } from './types';

type Props = { run?: ConversationRun };

/** Native phase only: silence and token usage are never treated as compaction. */
export function ConversationCompactionNotice({ run }: Props) {
  const phase = run?.contextCompaction;
  if (!phase || run.stopRequested || run.resourcesReleased || run.supersededBy ||
    !['running', 'waiting-approval', 'waiting-question'].includes(run.status)) return null;
  return <div className="ac-run-status" role="status" data-context-compaction={phase.id}>
    <LoadingOutlined spin aria-hidden="true" /> 正在压缩上下文，请等待…
    <ConversationExecutionIndicator startedAt={phase.startedAt} active />
  </div>;
}
