import { projectParentPlan, type ProjectedParentPlan } from '../domain/parent-coordination.ts';
import type { TaskPersistence, TaskRecordRepository } from '../persistence/task-record-repository.ts';

export type ParentCoordinationApplicationRuntime = Pick<TaskRecordRepository, 'readParentTaskContext' | 'readTaskRecordPersistence'> & {
  inspectParentCoordination?: (targetRoot: string, taskId: string) => unknown;
};

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return 'parent_plan_invalid';
  const value = Object.fromEntries(Object.entries(error));
  return typeof value.code === 'string' ? value.code : 'parent_plan_invalid';
}

export function registerParentCoordinationApplication<T extends ParentCoordinationApplicationRuntime>(runtime: T): T {
  function inspectParentCoordination(targetRoot: string, taskId: string) {
    const context = runtime.readParentTaskContext(targetRoot, taskId);
    let historicalPlan: ProjectedParentPlan | null = null;
    let diagnostic = context.diagnostic;
    if (context.legacyPlan) {
      try { historicalPlan = projectParentPlan(context.legacyPlan); }
      catch (error: unknown) { diagnostic = { code: errorCode(error), message: '历史父计划不可读；当前任务关系和成果不受影响。' }; }
    }
    const { parent, children, isParent } = context;
    const openChildren = children.filter((child) => ['todo', 'active'].includes(child.status));
    return {
      schemaVersion: 'buildr.parent-coordination-result/v4', operation: 'inspect', status: 'inspected', taskId, recordDigest: context.recordDigest,
      mode: isParent ? 'parent' : parent.parentTaskId ? 'child' : 'ordinary',
      parentStatus: parent.status, isParent,
      objective: parent.intent, result: parent.result,
      parentSource: parent.parentTaskId ? runtime.readTaskRecordPersistence(targetRoot, parent.parentTaskId).record : null,
      children: children.map((child) => ({ taskId: child.taskId, title: child.title, intent: child.intent, status: child.status, scope: child.scope, isParent: child.isParent === true, result: child.result, updatedAt: child.updatedAt })),
      completion: {
        snapshotIdentity: context.snapshotIdentity,
        authorizationRequired: isParent,
        openChildTaskIds: openChildren.map((child) => child.taskId),
        evidence: parent.result?.parentCompletion || null,
        summary: !isParent ? '普通独立任务。' : parent.status === 'completed' ? '父任务已记录完成；授权与验收依据单独展示。' : '子任务结果不自动完成父任务；请核对整体目标并取得明确完成授权。',
      },
      historicalPlan, diagnostic, effects: [],
    };
  }
  return Object.assign(runtime, { inspectParentCoordination });
}
