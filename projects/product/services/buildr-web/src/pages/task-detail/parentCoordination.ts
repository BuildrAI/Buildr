import type { ParentCompletion, TaskRecord } from '../../api/generated/task-record-http-dto';

export type ParentCoordinationChild = Pick<TaskRecord, 'taskId' | 'title' | 'intent' | 'status' | 'result' | 'updatedAt'>;
export type ParentCoordinationResult = {
  taskId?: string;
  recordDigest?: string;
  mode?: 'parent' | 'child' | 'ordinary';
  isParent?: boolean;
  objective?: string;
  result?: TaskRecord['result'];
  parentStatus?: string;
  parentSource?: TaskRecord | null;
  children?: ParentCoordinationChild[];
  completion?: {
    snapshotIdentity: string;
    authorizationRequired: boolean;
    openChildTaskIds: string[];
    evidence: ParentCompletion | null;
    summary: string;
  };
  historicalPlan?: unknown;
  diagnostic?: { code?: string; message?: string } | null;
};

export type ParentCompletionDraft = { summary: string; children: Record<string, string>; confirmed: boolean };
export const emptyParentCompletionDraft = (): ParentCompletionDraft => ({ summary: '', children: {}, confirmed: false });

export function parentCompletionInput(snapshot: ParentCoordinationResult, draft: ParentCompletionDraft, taskId: string): ParentCompletion {
  if (!snapshot.isParent || !snapshot.completion?.snapshotIdentity || !draft.confirmed || !draft.summary.trim()) throw new Error('请核对整体目标、填写验收说明并明确授权完成父任务。');
  if (snapshot.completion.openChildTaskIds.length) throw new Error('仍有未结束子任务，不能完成父任务。');
  const children = (snapshot.children || []).map((child) => ({ taskId: child.taskId, summary: (draft.children[child.taskId] || '').trim() }));
  if (children.some((child) => !child.summary)) throw new Error('请逐项说明子任务成果、放弃或替代范围的处置。');
  return {
    expectedSnapshot: snapshot.completion.snapshotIdentity,
    acceptance: { summary: draft.summary.trim(), children },
    authorization: { source: 'buildr-web:explicit-parent-completion', statement: `用户在当前父任务结果确认界面明确授权完成父任务 ${taskId}。` },
  };
}
