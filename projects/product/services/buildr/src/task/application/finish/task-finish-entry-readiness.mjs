import { spawnSync } from 'node:child_process';

import { observeGitTaskContribution } from './git-task-contribution.mjs';
import { resolveTaskFinishDeliveryRemote } from './task-finish-delivery-remote.mjs';
import { resolveTaskFinishTargetBranch } from './task-finish-delivery-target.mjs';
import { normalizeTaskFinishDeliveryCommit } from './task-finish-delivery-commit.mjs';
import { resolveTaskFinishReconciliationContext } from './task-finish-reconciliation-context.mjs';
import {
  normalizeTaskFinishRepositorySet,
  singletonApplicableTaskFinishRepository,
  taskFinishRepositorySetIdentity,
} from './task-finish-repository-set.mjs';
import { projectTaskFinishCurrentFacts } from './task-finish-current-facts.mjs';
import { inspectStaleFinishRunRolloverEligibility } from './task-finish-recovery-primitives.mjs';

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

function gitText(root, args) {
  const observed = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return observed.status === 0 ? String(observed.stdout || '').trim() : null;
}

function repositoryGap(error, repository) {
  return gap(
    'delivery',
    error.code || 'task_finish.repository_unavailable',
    error.message,
    {
      selector: repository?.selector || null,
      ...(error.details ? { details: error.details } : {}),
    },
  );
}

function observeRepositoryPlan(repository, context) {
  const retainedRoot = repository.sourceRepository || context.workspaceRoot;
  const taskRoot = repository.checkoutPath || context.validationRoot;
  const deliveryTarget = resolveTaskFinishTargetBranch({ root: retainedRoot });
  const targetHead = gitText(retainedRoot, ['rev-parse', `${deliveryTarget.targetBranch}^{commit}`]);
  if (!targetHead) {
    const error = new Error(`Retained target ref is unavailable for ${repository.selector}: ${deliveryTarget.targetBranch}.`);
    Object.assign(error, { code: 'task_finish.target_ref_missing' });
    throw error;
  }
  const taskContribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: targetHead });
  const noContribution = taskContribution.originalBaseline.tree === taskContribution.source.tree;
  return {
    selector: repository.selector,
    sourcePath: repository.sourcePath || '.',
    retainedRoot,
    taskRoot,
    environmentBranch: repository.branch || gitText(taskRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    targetBranch: deliveryTarget.targetBranch,
    remote: null,
    disposition: noContribution ? 'not-applicable' : 'applicable',
    reason: noContribution ? 'no-contribution' : null,
    taskContribution,
  };
}

function resolveRepositoryPlans({ context, requestedTargetBranch, requestedRemote, gaps }) {
  const observed = [];
  for (const repository of context.repositories || []) {
    try {
      observed.push(observeRepositoryPlan(repository, context));
    } catch (error) {
      pushGap(gaps, repositoryGap(error, repository));
    }
  }
  if (observed.length === 0 && (context.repositories || []).length === 0) {
    pushGap(gaps, gap('delivery', 'task_finish.repository_set_missing', 'Task Finish requires at least one Git repository in the Task Environment.'));
    return [];
  }
  const applicable = observed.filter((repository) => repository.disposition === 'applicable');
  if ((requestedTargetBranch || requestedRemote) && applicable.length !== 1) {
    pushGap(gaps, gap(
      'delivery',
      'task_finish.repository_override_ambiguous',
      'Single-value target branch or remote overrides require exactly one contributing repository.',
      { contributingRepositories: applicable.map((repository) => repository.selector) },
    ));
  }
  for (const repository of applicable) {
    try {
      const target = resolveTaskFinishTargetBranch({
        root: repository.retainedRoot,
        requestedTargetBranch: applicable.length === 1 ? requestedTargetBranch : null,
      });
      repository.targetBranch = target.targetBranch;
      const environment = (context.repositories || []).find((entry) => entry.selector === repository.selector);
      repository.remote = resolveTaskFinishDeliveryRemote({
        root: repository.retainedRoot,
        targetBranch: repository.targetBranch,
        requestedRemote: applicable.length === 1 ? requestedRemote : null,
        environmentRemote: environment?.remote || null,
      }).remote;
    } catch (error) {
      pushGap(gaps, repositoryGap(error, repository));
    }
  }
  try {
    return normalizeTaskFinishRepositorySet(observed);
  } catch (error) {
    pushGap(gaps, gap('delivery', 'task_finish.repository_set_invalid', error.message));
    return [];
  }
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
  allowEnvironmentless = false,
}) {
  const gaps = emptyGaps();
  let context = runtime.resolveTaskEnvironmentExecution(root, task);
  const environmentReady = Boolean(context?.ready);
  let agent = requestedAgent;
  let handoff = null;
  let repositories = [];
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

  if (!environmentReady && !allowEnvironmentless) {
    pushGap(gaps, gap(
      'environment',
      context?.blocked?.code || 'task_finish.not_task_environment',
      context?.blocked?.message || 'Task Finish requires a ready Task Environment.',
    ));
  } else if (environmentReady) {
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

  if (!environmentReady && allowEnvironmentless && resolved.current) {
    try {
      context = resolveTaskFinishReconciliationContext({ runtime, root, task, receipt: resolved.receipt, requestedTargetBranch, requestedRemote });
      agent = requestedAgent || 'agent-led-reconciliation';
      repositories = context.repositories;
    } catch (error) {
      pushGap(gaps, gap('delivery', error.code || 'task_finish.reconciliation_context_unavailable', error.message, error.details ? { details: error.details } : {}));
      context = null;
    }
  } else if (environmentReady) {
    repositories = resolveRepositoryPlans({ context, requestedTargetBranch, requestedRemote, gaps });
  }

  const total = TASK_FINISH_ENTRY_GAP_MODULES.reduce((count, module) => count + gaps[module].length, 0);
  const nextWorkflow = gaps.development.length > 0 ? 'task-development' : null;
  const singleton = repositories.length ? singletonApplicableTaskFinishRepository({ repositories }) : null;

  const observation = {
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
      targetBranch: singleton?.targetBranch || null,
      remote: singleton?.remote || null,
      repositories,
      repositorySetIdentity: taskFinishRepositorySetIdentity(repositories),
      environmentRoot: context.validationRoot,
      workspaceRoot: context.workspaceRoot,
      contextSource: environmentReady ? 'task-environment' : context.source,
      environmentAvailable: environmentReady,
      deliveryCommitIdentity: deliveryCommit?.identity || null,
    } : null,
  };
  let readModel = null;
  try { readModel = runtime.inspectTaskFinishReadModel?.({ root, taskId: task }) || null; }
  catch { /* entry facts remain available from current authority observations */ }
  let recovery = null;
  try {
    const current = runtime.readTaskFinishRunPersistence?.(root, { taskId: task }, { optional: true }) || null;
    if (current && observation.identityParts) recovery = inspectStaleFinishRunRolloverEligibility(current, observation.identityParts);
  } catch { /* inability to prove rollover remains unavailable */ }
  return {
    ...observation,
    facts: projectTaskFinishCurrentFacts({
      taskId: task,
      operation: 'entry-readiness',
      readiness: observation,
      result: readModel?.result || null,
      diagnostics: readModel?.diagnostics || [],
      recovery,
    }),
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
