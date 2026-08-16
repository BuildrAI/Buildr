import { resolveTaskFinishDeliveryRemote } from './task-finish-delivery-remote.mjs';
import { resolveTaskFinishTargetBranch } from './task-finish-delivery-target.mjs';
import { normalizeTaskFinishDeliveryCommit } from './task-finish-delivery-commit.mjs';

export const TASK_FINISH_ENTRY_GAP_MODULES = Object.freeze(['development', 'environment', 'delivery']);

function gap(module, code, message, extra = {}) {
  return { module, code, message, ...extra };
}

function emptyGaps() {
  return { development: [], environment: [], delivery: [] };
}

function pushGap(gaps, item) {
  gaps[item.module].push(item);
}

function resolveCurrentHandoff(development) {
  const receipt = development?.development?.receipt;
  if (!receipt || development?.development?.applicability?.handoff !== 'current') {
    return { receipt: receipt || null, handoff: null, current: false };
  }
  const handoff = [...receipt.handoffs].reverse().find((item) => item.candidate.identity === receipt.candidate?.identity
    && JSON.stringify(item.gates) === JSON.stringify(receipt.gates)
    && JSON.stringify(item.decision) === JSON.stringify(receipt.decision));
  return { receipt, handoff: handoff || null, current: Boolean(handoff) };
}

/**
 * Observe Task Finish entry readiness without short-circuiting.
 * Reuses existing Environment / Development / delivery resolvers; does not invent checkers.
 */
export function observeTaskFinishEntryReadiness({
  runtime,
  root,
  task,
  requestedAgent = null,
  requestedTargetBranch = null,
  requestedRemote = null,
  requestedCommitMessage = null,
  requireCommitMessage = false,
}) {
  const gaps = emptyGaps();
  const context = runtime.resolveTaskEnvironmentExecution(root, task);
  let deliveryRoot = root;
  let environmentRemote = null;
  let agent = requestedAgent;
  let handoff = null;
  let targetBranch = null;
  let remote = null;
  let deliveryCommit = null;

  if (requireCommitMessage || requestedCommitMessage != null) {
    try {
      deliveryCommit = normalizeTaskFinishDeliveryCommit(requestedCommitMessage, task);
    } catch (error) {
      pushGap(gaps, gap('delivery', error.code || 'task_finish.commit_message_invalid', error.message, {
        nextAction: error.nextAction,
      }));
    }
  }

  if (!context?.ready) {
    pushGap(gaps, gap(
      'environment',
      context?.blocked?.code || 'task_finish.not_task_environment',
      context?.blocked?.message || 'Task Finish requires a ready Task Environment.',
    ));
  } else {
    deliveryRoot = context.workspaceRoot || root;
    const repository = context.repositories?.find((entry) => entry.selector === 'workspace') || context.repositories?.[0] || {};
    environmentRemote = repository.remote || null;
    const defaultAgent = context.controller?.adapter || null;
    agent = requestedAgent || defaultAgent;
    if (requestedAgent && defaultAgent && requestedAgent !== defaultAgent) {
      pushGap(gaps, gap('environment', 'task_finish.environment_mismatch', 'Task Finish agent must match the Task Environment adapter.', {
        requestedAgent,
        environmentAgent: defaultAgent,
      }));
    }
  }

  const development = runtime.inspectTaskDevelopment(root, task);
  const resolved = resolveCurrentHandoff(development);
  if (!resolved.current) {
    const code = 'task_finish.development_handoff_not_current';
    const message = resolved.receipt
      ? 'Task Finish could not resolve the current immutable Development handoff snapshot.'
      : 'Task Finish requires a current formal Development handoff.';
    // Distinguish missing receipt vs unresolvable snapshot when receipt exists but handoff not found
    const detailMessage = !resolved.receipt || development?.development?.applicability?.handoff !== 'current'
      ? 'Task Finish requires a current formal Development handoff.'
      : message;
    pushGap(gaps, gap('development', code, detailMessage));
  } else {
    handoff = resolved.handoff;
  }

  try {
    const deliveryTarget = resolveTaskFinishTargetBranch({
      root: deliveryRoot,
      requestedTargetBranch,
    });
    targetBranch = deliveryTarget.targetBranch;
  } catch (error) {
    pushGap(gaps, gap(
      'delivery',
      error.code || 'task_finish.target_branch_unavailable',
      error.message,
      error.details ? { details: error.details } : {},
    ));
  }

  if (targetBranch) {
    try {
      const deliveryRemote = resolveTaskFinishDeliveryRemote({
        root: deliveryRoot,
        targetBranch,
        requestedRemote,
        environmentRemote,
      });
      remote = deliveryRemote.remote;
    } catch (error) {
      pushGap(gaps, gap(
        'delivery',
        error.code || 'task_finish.remote_unavailable',
        error.message,
        error.details ? { details: error.details } : {},
      ));
    }
  }

  const total = TASK_FINISH_ENTRY_GAP_MODULES.reduce((count, module) => count + gaps[module].length, 0);
  const nextWorkflow = gaps.development.length > 0 ? 'task-development' : null;

  return {
    ready: total === 0,
    gaps,
    nextWorkflow,
    context: context?.ready ? context : null,
    handoff,
    deliveryCommit,
    identityParts: total === 0 ? {
      task,
      handoffIdentity: handoff.identity,
      candidateIdentity: handoff.candidate.identity,
      candidateGeneration: handoff.candidate.generation,
      contentTargetIdentity: handoff.candidate.contentTargetIdentity,
      agent,
      targetBranch,
      remote,
      environmentRoot: context.validationRoot,
      workspaceRoot: context.workspaceRoot,
      deliveryCommitIdentity: deliveryCommit?.identity || null,
    } : null,
  };
}

export function taskFinishEntryGapsError(observation, action = 'run') {
  const error = new Error('Task Finish entry readiness failed with one or more module gaps.');
  const allGaps = TASK_FINISH_ENTRY_GAP_MODULES.flatMap((module) => observation.gaps[module]);
  const commitMessageOnly = allGaps.length === 1 && allGaps[0].module === 'delivery' && allGaps[0].code.startsWith('task_finish.commit_message_');
  const nextAction = commitMessageOnly
    ? allGaps[0].nextAction
    : observation.nextWorkflow === 'task-development'
    ? 'Return to task-development and restore a current formal Development handoff before Task Finish.'
    : 'Resolve the reported environment and delivery gaps, then retry Task Finish.';
  Object.assign(error, {
    code: 'task_finish.entry_gaps',
    usage: `buildr help task finish ${action}`,
    nextAction,
    details: {
      gaps: observation.gaps,
      nextWorkflow: observation.nextWorkflow,
    },
  });
  return error;
}
