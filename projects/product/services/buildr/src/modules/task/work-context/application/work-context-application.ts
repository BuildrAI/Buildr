import crypto from 'node:crypto';
import type { SqliteReadContext } from '../../../../infrastructure/sqlite/transaction.ts';
import type { TaskWorkContextResponse, TaskWorkContextsResponse, TaskWorkContextRecordRequest, TaskWorkContextRespondRequest, TaskWorkContext } from '../../../../../build/generated/workbench-dto.ts';
import { validateTaskWorkContext, taskWorkContextError as error } from '../domain/work-context.ts';
import { createWorkContextRepository, type WorkContextStoreRuntime } from '../persistence/work-context-repository.ts';

export type WorkContextRuntime = WorkContextStoreRuntime & {
  assertTaskExists(root: string, taskId: string): void;
  assertCanonicalTaskWorkspace(root: string): string;
  assertTaskExistsInContext(context: SqliteReadContext, root: string, taskId: string): void;
  readTask(root: string, taskId: string): { record: { status: string } };
};
export function createTaskWorkContextApplication(runtime: WorkContextRuntime) {
  const repository = createWorkContextRepository(runtime);
  function inspectTaskWorkContext(root: string, taskId: string): TaskWorkContextResponse {
    runtime.assertTaskExists(root, taskId);
    return repository.read(root, taskId);
  }
  function inspectTaskWorkContexts(root: string, ids: string[]): TaskWorkContextsResponse {
    if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(id))) throw error('task_work_context_ids_invalid', '一次最多读取100项合法任务身份。');
    if (!ids.length) return { schemaVersion: 'buildr.task-work-context-list/v1', items: [] };
    const canonicalRoot = runtime.assertCanonicalTaskWorkspace(root);
    return runtime.runWorkspaceSqliteRead(canonicalRoot, context => ({
      schemaVersion: 'buildr.task-work-context-list/v1',
      items: [...new Set(ids)].map(id => {
        runtime.assertTaskExistsInContext(context, canonicalRoot, id);
        return repository.readIn(context, id);
      }),
    }));
  }
  function recordTaskWorkContext(root: string, taskId: string, input: TaskWorkContextRecordRequest): TaskWorkContextResponse {
    validateTaskWorkContext('TaskWorkContextRecordRequest', input);
    runtime.assertTaskExists(root, taskId);
    if (input.checks !== undefined && runtime.readTask(root, taskId).record.status !== 'active') throw error('task_work_context_task_terminal', `Task ${taskId} 已不在进行中，不能修改检查适用性结论。`, 409, { taskId });
    return repository.mutate(root, taskId, input.expectedContextDigest, (current) => {
      const now = new Date().toISOString();
      const checks: TaskWorkContext['checks'] | undefined = input.checks === undefined ? current?.checks
        : input.checks === null ? undefined
          : (() => { const merged = new Map((current?.checks || []).map(item => [item.check, item])); for (const item of input.checks) merged.set(item.check, { check: item.check, status: item.status, reason: item.reason.trim() }); return [...merged.values()] as TaskWorkContext['checks']; })();
      return { ...(input.stage !== undefined ? { stage: input.stage } : current?.stage !== undefined ? { stage: current.stage } : {}), progress: input.progress.trim(), nextStep: input.nextStep.trim(), updatedAt: now, attention: input.attention === undefined ? current?.attention || null : input.attention === null ? null : { id: crypto.randomUUID(), kind: input.attention.kind, reason: input.attention.reason.trim(), state: 'pending', createdAt: now, response: null }, ...(checks === undefined || checks === null ? {} : { checks }) };
    });
  }
  function respondTaskWorkContext(root: string, taskId: string, input: TaskWorkContextRespondRequest): TaskWorkContextResponse {
    validateTaskWorkContext('TaskWorkContextRespondRequest', input);
    runtime.assertTaskExists(root, taskId);
    return repository.mutate(root, taskId, input.expectedContextDigest, (current) => {
      if (!current?.attention || current.attention.id !== input.attentionId || current.attention.state !== 'pending') throw error('task_work_context_attention_conflict', '待处理事项已改变或已有答复，请重新读取。', 409, { taskId });
      const now = new Date().toISOString();
      return { ...current, updatedAt: now, attention: { ...current.attention, state: 'resolved', response: { text: input.response.trim(), recordedAt: now } } };
    });
  }
  return Object.freeze({ inspectTaskWorkContext, inspectTaskWorkContexts, recordTaskWorkContext, respondTaskWorkContext, queryPendingTaskWorkContexts: repository.pending });
}
export type TaskWorkContextApplication = ReturnType<typeof createTaskWorkContextApplication>;
