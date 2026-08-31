import { retiredParentCoordination, projectParentPlan } from '../domain/parent-coordination.mjs';

export function registerParentCoordinationApplication(runtime) {
  function inspectParentCoordination(targetRoot, taskId) {
    const context = runtime.readParentTaskContext(targetRoot, taskId);
    let historicalPlan = null;
    let diagnostic = context.diagnostic;
    if (context.legacyPlan) {
      try { historicalPlan = projectParentPlan(context.legacyPlan); }
      catch (error) { diagnostic = { code: error.code, message: '历史父计划不可读；当前任务关系和成果不受影响。' }; }
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
  Object.assign(runtime, {
    inspectParentCoordination,
    refreshParentPlanning: retiredParentCoordination,
    recordParentPlan: retiredParentCoordination,
    reconcileParentPlan: retiredParentCoordination,
    bindChildContributions: retiredParentCoordination,
    reconcileChildDelivery: retiredParentCoordination,
    acceptParentCoordination: retiredParentCoordination,
  });
  return runtime;
}
