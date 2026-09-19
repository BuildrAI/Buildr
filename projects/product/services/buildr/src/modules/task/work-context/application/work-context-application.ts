import crypto from 'node:crypto';
import type { TaskWorkContextResponse, TaskWorkContextsResponse, TaskWorkContextRecordRequest, TaskWorkContextRespondRequest } from '../../../../../build/generated/workbench-dto.ts';
import { validateTaskWorkContext, taskWorkContextError as error } from '../domain/work-context.ts';
import { createWorkContextRepository, type WorkContextStoreRuntime } from '../persistence/work-context-repository.ts';

export type WorkContextRuntime = WorkContextStoreRuntime & { readTask(root: string, taskId: string): unknown };
export function createTaskWorkContextApplication(runtime: WorkContextRuntime) {
  const repository = createWorkContextRepository(runtime);
  function inspectTaskWorkContext(root: string, taskId: string): TaskWorkContextResponse {
    runtime.readTask(root, taskId);
    return repository.read(root, taskId);
  }
  function inspectTaskWorkContexts(root: string, ids: string[]): TaskWorkContextsResponse {
    if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(id))) throw error('task_work_context_ids_invalid', '一次最多读取100项合法任务身份。');
    return { schemaVersion: 'buildr.task-work-context-list/v1', items: [...new Set(ids)].map((id) => inspectTaskWorkContext(root, id)) };
  }
  function recordTaskWorkContext(root: string, taskId: string, input: TaskWorkContextRecordRequest): TaskWorkContextResponse {
    validateTaskWorkContext('TaskWorkContextRecordRequest', input);
    runtime.readTask(root, taskId);
    return repository.mutate(root, taskId, input.expectedContextDigest, (current) => {
      const now = new Date().toISOString();
      return { progress: input.progress.trim(), nextStep: input.nextStep.trim(), updatedAt: now, attention: input.attention === undefined ? current?.attention || null : input.attention === null ? null : { id: crypto.randomUUID(), kind: input.attention.kind, reason: input.attention.reason.trim(), state: 'pending', createdAt: now, response: null } };
    });
  }
  function respondTaskWorkContext(root: string, taskId: string, input: TaskWorkContextRespondRequest): TaskWorkContextResponse {
    validateTaskWorkContext('TaskWorkContextRespondRequest', input);
    runtime.readTask(root, taskId);
    return repository.mutate(root, taskId, input.expectedContextDigest, (current) => {
      if (!current?.attention || current.attention.id !== input.attentionId || current.attention.state !== 'pending') throw error('task_work_context_attention_conflict', '待处理事项已改变或已有答复，请重新读取。', 409, { taskId });
      const now = new Date().toISOString();
      return { ...current, updatedAt: now, attention: { ...current.attention, state: 'resolved', response: { text: input.response.trim(), recordedAt: now } } };
    });
  }
  return Object.freeze({ inspectTaskWorkContext, inspectTaskWorkContexts, recordTaskWorkContext, respondTaskWorkContext, queryPendingTaskWorkContexts: repository.pending });
}
export type TaskWorkContextApplication = ReturnType<typeof createTaskWorkContextApplication>;
