import path from 'node:path';

import { assertTaskReviewType, normalizeTaskReviewResult, taskReviewError } from '../../domain/task-review/task-review.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';

function assertObject(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskReviewError('task_review_input_invalid', `${label} 必须是对象。`);
}

function assertFields(input, fields, label) {
  assertObject(input, label);
  for (const field of Object.keys(input)) {
    if (!fields.has(field)) throw taskReviewError('task_review_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
  }
}

function currentTarget(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw taskReviewError('task_review_target_invalid', `${field} 必须是非空字符串。`, 400, { field });
  return value.trim();
}

function relative(root, file) {
  if (file.startsWith('workspace-sqlite:')) return file;
  return path.relative(root, file).split(path.sep).join('/');
}

export function registerTaskReviewApplication(runtime) {
  function slot(targetRoot, taskId, reviewType, targetIdentity) {
    const persisted = runtime.readTaskReviewResultPersistence(targetRoot, taskId, reviewType, { optional: true });
    if (!persisted) {
      return { path: runtime.taskReviewResultPath(targetRoot, taskId, reviewType), present: false, result: null, resultDigest: null, applicability: null };
    }
    const applicability = targetIdentity === undefined ? 'unknown' : persisted.targetIdentity === targetIdentity ? 'current' : 'stale';
    return { path: persisted.file, present: true, result: persisted.result, resultDigest: persisted.resultDigest, applicability, observedAt: persisted.observedAt };
  }

  function slots(targetRoot, taskId, input = {}) {
    assertFields(input, new Set(['planningTargetIdentity', 'completionTargetIdentity']), 'Task Review inspect');
    const planningTargetIdentity = currentTarget(input.planningTargetIdentity, 'planningTargetIdentity');
    const completionTargetIdentity = currentTarget(input.completionTargetIdentity, 'completionTargetIdentity');
    return {
      planning: slot(targetRoot, taskId, 'planning', planningTargetIdentity),
      completion: slot(targetRoot, taskId, 'completion', completionTargetIdentity),
    };
  }

  function operationResult(operation, status, taskId, reviewSlots, effects = []) {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskReviewOperationResult, {
      operation,
      status,
      taskId,
      slots: reviewSlots,
      diagnostic: null,
      effects,
      nextActions: [],
    });
  }

  function inspectTaskReview(targetRoot, taskId, input = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    return operationResult('inspect', 'inspected', task.record.taskId, slots(task.root, task.record.taskId, input));
  }

  function recordTaskReview(targetRoot, taskId, input) {
    assertFields(input, new Set(['reviewType', 'targetIdentity', 'method', 'reviewed', 'uncovered', 'findings', 'conclusion']), 'Task Review record');
    const task = runtime.prepareTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') {
      throw taskReviewError('task_review_task_terminal', `Task ${taskId} 已是 ${task.record.status}，不能记录新的 Review Result。`, 409, { status: task.record.status }, `运行 buildr task review inspect ${taskId} 查看已有结果。`);
    }
    const result = normalizeTaskReviewResult({
      schemaVersion: 'buildr.task-review-result/v1',
      taskId: task.record.taskId,
      reviewType: input.reviewType,
      targetIdentity: input.targetIdentity,
      method: input.method,
      reviewed: input.reviewed,
      uncovered: input.uncovered,
      findings: input.findings,
      conclusion: input.conclusion,
      completedAt: new Date().toISOString(),
    }, { expectedTaskId: task.record.taskId, expectedReviewType: input.reviewType });
    const written = runtime.writeTaskReviewResultPersistence(task.root, result);
    const inspectInput = result.reviewType === 'planning'
      ? { planningTargetIdentity: result.targetIdentity }
      : { completionTargetIdentity: result.targetIdentity };
    const reviewSlots = slots(task.root, task.record.taskId, inspectInput);
    return operationResult('record', 'recorded', task.record.taskId, reviewSlots, [{
      type: written.created ? 'created' : 'updated',
      path: relative(task.root, written.file),
    }]);
  }

  function generateTaskReviewPrompt(targetRoot, input) {
    assertFields(input, new Set(['taskId', 'reviewType', 'projectCode', 'change']), 'Task Review prompt');
    const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : '';
    if (!taskId) throw taskReviewError('task_review_task_required', 'Task Review prompt 必须提供 Task ID。');
    const reviewType = assertTaskReviewType(input.reviewType);
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') {
      throw taskReviewError('task_review_task_terminal', `Task ${taskId} 已是 ${task.record.status}，不能开始新的 Review。`, 409, { status: task.record.status });
    }

    const projectCode = typeof input.projectCode === 'string' ? input.projectCode.trim() : '';
    const changeCode = typeof input.change === 'string' ? input.change.trim() : '';
    if (Boolean(projectCode) !== Boolean(changeCode)) {
      throw taskReviewError('task_review_change_reference_incomplete', 'Task-scoped Review 必须同时提供 projectCode 与 change。');
    }
    let changeContext = null;
    if (projectCode) {
      if (!task.record.changes.some((item) => item.project === projectCode && item.change === changeCode)) {
        throw taskReviewError('task_review_change_not_linked', `Change 不属于 Task ${taskId}：${projectCode}/${changeCode}。`, 409, { project: projectCode, change: changeCode });
      }
      const resolution = runtime.resolveTaskScopedChange(task.root, taskId, { project: projectCode, change: changeCode });
      if (resolution.availability !== 'available' || resolution.workingCopy?.change?.code !== changeCode) {
        throw taskReviewError('task_review_change_unavailable', `Task-scoped Change 当前不可用：${projectCode}/${changeCode}。`, 409, resolution.diagnostic || resolution.reference);
      }
      changeContext = `${projectCode}/${changeCode}`;
    }

    const typeLabel = reviewType === 'planning' ? 'Planning Review' : 'Completion Review';
    const targetRequirement = reviewType === 'planning'
      ? '建立当前计划上下文的明确稳定 target identity；不要把文件路径或时间当 identity。'
      : '只使用上游已经形成的 current Candidate identity；没有 Candidate identity 时停止，不得从 HEAD、dirty tree、Environment 或时间伪造。';
    return {
      prompt: [
        `请对正式 Task“${task.record.title}（${task.record.taskId}）”执行 ${typeLabel}。`,
        '',
        `Task Intent：${task.record.intent}`,
        ...(changeContext ? [`限定的 Task-scoped Change：${changeContext}`] : []),
        '',
        '执行要求：',
        '1. 读取并遵循 task-review Skill 与 selected buildr.task-review/v1 contract；先 inspect 正式 Task 和已有两个 Review slots。',
        '2. 需要读取实际实现时，按 Task ID 恢复 Task Environment，并只在返回的 execution/validation root 中工作。',
        `3. ${targetRequirement}`,
        '4. 根据 Task Intent、Project authority、真实目标和风险动态选择 reviewed/uncovered；不要套用固定 OpenSpec、代码目录或测试清单。',
        '5. 如实选择 self、independent-agent 或 human，形成 findings 与 ready|changes-required 完整结论。',
        '6. 只有 Review 完整结束后才通过 Task Review Application record；中断、目标不明或结论不完整时不得覆盖已有 Result。',
        '7. 报告 target identity、method、reviewed、uncovered、findings、conclusion、resultDigest 与 applicability。',
      ].join('\n'),
      copiedMeansRecorded: false,
    };
  }

  Object.assign(runtime, { inspectTaskReview, recordTaskReview, generateTaskReviewPrompt });
  return runtime;
}
