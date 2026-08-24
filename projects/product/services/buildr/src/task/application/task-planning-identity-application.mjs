import {
  createTaskPlanningIdentity,
  TASK_PLANNING_IDENTITY_RESULT_SCHEMA,
} from '../domain/task-planning-identity.mjs';

function artifactContent(change, name) {
  const value = change.artifacts?.[name];
  if (!value?.exists || typeof value.content !== 'string' || !value.content.trim()) {
    const error = new Error(`OpenSpec变更（Change）缺少可读的${name}规划产物（artifact）：${change.project.code}/${change.code}。`);
    error.code = 'task_planning_identity_artifact_missing';
    error.details = { project: change.project.code, change: change.code, artifact: name };
    error.nextAction = `补全${change.project.code}/${change.code}的${name}规划产物（artifact）并通过严格校验（strict validation）后重新解析。`;
    error.taskPlanningIdentityBusiness = true;
    throw error;
  }
  return value.content;
}

function changeInput(resolution) {
  if (resolution.availability !== 'available' || !resolution.workingCopy?.change) {
    const error = new Error(`OpenSpec变更（Change）当前不可解析：${resolution.reference.project}/${resolution.reference.change}。`);
    error.code = resolution.diagnostic?.code || 'task_planning_identity_change_unavailable';
    error.details = resolution.reference;
    error.nextAction = `恢复${resolution.reference.project}/${resolution.reference.change}的匹配任务环境（matching Task Environment）或保留变更（retained Change）后重新解析。`;
    error.taskPlanningIdentityBusiness = true;
    throw error;
  }
  if (!['task-environment-candidate', 'retained-archive'].includes(resolution.workingCopy.provenance)) {
    const error = new Error(`OpenSpec变更（Change）缺少匹配任务环境（matching Task Environment）或保留归档（retained archive）：${resolution.reference.project}/${resolution.reference.change}。`);
    error.code = 'task_planning_identity_change_authority_unavailable';
    error.details = { ...resolution.reference, provenance: resolution.workingCopy.provenance || null };
    error.nextAction = `准备${resolution.reference.project}/${resolution.reference.change}的匹配任务环境（matching Task Environment），或在已证明收敛后从保留归档（retained archive）重新解析。`;
    error.taskPlanningIdentityBusiness = true;
    throw error;
  }
  const change = resolution.workingCopy.change;
  const specs = change.artifacts?.specs || [];
  if (specs.length === 0) {
    const error = new Error(`OpenSpec变更（Change）缺少增量规范（delta spec）：${change.project.code}/${change.code}。`);
    error.code = 'task_planning_identity_artifact_missing';
    error.details = { project: change.project.code, change: change.code, artifact: 'specs' };
    error.nextAction = `补全${change.project.code}/${change.code}的增量规范（delta specs）并通过严格校验（strict validation）后重新解析。`;
    error.taskPlanningIdentityBusiness = true;
    throw error;
  }
  return {
    project: resolution.reference.project,
    change: resolution.reference.change,
    proposal: artifactContent(change, 'proposal'),
    design: artifactContent(change, 'design'),
    tasks: artifactContent(change, 'tasks'),
    specs: specs.map((spec) => {
      if (!spec.exists || typeof spec.content !== 'string' || !spec.content.trim()) {
        const error = new Error(`OpenSpec增量规范（delta spec）不可读：${change.project.code}/${change.code}/${spec.capability || '<unknown>'}。`);
        error.code = 'task_planning_identity_artifact_missing';
        error.details = { project: change.project.code, change: change.code, artifact: 'spec', capability: spec.capability || null };
        error.nextAction = `补全${change.project.code}/${change.code}的增量规范（delta spec）并通过严格校验（strict validation）后重新解析。`;
        error.taskPlanningIdentityBusiness = true;
        throw error;
      }
      return { capability: spec.capability, content: spec.content };
    }),
  };
}

function result(taskId, status, values = {}) {
  return {
    schemaVersion: TASK_PLANNING_IDENTITY_RESULT_SCHEMA,
    operation: 'inspect',
    status,
    taskId,
    target: values.target || null,
    semanticProjection: values.semanticProjection || null,
    planningNodes: values.planningNodes || [],
    ignoredFacts: values.ignoredFacts || [],
    diagnostic: values.diagnostic || null,
    effects: [],
    nextActions: values.nextActions || [],
  };
}

function diagnostic(error) {
  return {
    code: error.code || 'task_planning_identity_unavailable',
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

export function registerTaskPlanningIdentityApplication(runtime) {
  function inspectTaskPlanningIdentity(targetRoot, taskId) {
    try {
      const task = runtime.inspectTaskRecord(targetRoot, taskId).record;
      const changes = task.changes.map((reference) => changeInput(runtime.resolveTaskScopedChange(
        targetRoot,
        task.taskId,
        reference,
        { includeContent: true },
      )));
      const resolved = createTaskPlanningIdentity({
        task: { intent: task.intent, scope: task.scope },
        changes,
      });
      return result(task.taskId, 'resolved', {
        target: resolved.target,
        semanticProjection: {
          authority: '任务记录（Task Record）+ 任务限定的OpenSpec变更（Task-scoped OpenSpec Change）',
          changeCount: resolved.projection.changes.length,
          artifactCount: resolved.planningNodes.length,
          summary: resolved.target.summary,
        },
        planningNodes: resolved.planningNodes,
        ignoredFacts: resolved.ignoredFacts,
      });
    } catch (error) {
      return result(taskId, 'blocked', {
        diagnostic: diagnostic(error),
        nextActions: [error.nextAction || '恢复任务（Task）与全部关联OpenSpec规划产物（planning artifacts）的可解析事实后重新调用；不要猜测目标（target）。'],
      });
    }
  }

  Object.assign(runtime, { inspectTaskPlanningIdentity });
  return runtime;
}
