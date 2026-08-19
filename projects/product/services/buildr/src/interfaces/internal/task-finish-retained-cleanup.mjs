import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';

import { createRuntime } from '../../application/compose-runtime.mjs';
import {
  createGitNoContributionProof,
  inspectAgentReviewedZeroDeltaContainment,
  inspectGitCarrierContainment,
} from '../../application/task-finish/git-task-contribution.mjs';
import { readFinishCompletion, readFinishRun } from '../../application/task-finish/task-finish-run.mjs';
import { taskFinishCarrierSetIdentity, taskFinishDeliverySetIdentity } from '../../application/task-finish/task-finish-repository-set.mjs';

function cleanupError(code, message, details = null) {
  const error = new Error(message);
  Object.assign(error, { code, details });
  return error;
}

function resolvedPath(value) {
  const resolved = path.resolve(value);
  try { return fs.realpathSync(resolved); } catch { return resolved; }
}

function parseArgs(args) {
  const allowed = new Set(['--run', '--target']);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!allowed.has(option) || !value || value.startsWith('--') || values.has(option)) {
      throw cleanupError('task-finish.retained-cleanup-invalid-input', 'Retained cleanup requires exactly one --run and --target value.');
    }
    values.set(option, value);
  }
  if (values.size !== allowed.size) throw cleanupError('task-finish.retained-cleanup-invalid-input', 'Retained cleanup requires exactly one --run and --target value.');
  return { runId: values.get('--run'), targetRoot: path.resolve(values.get('--target')) };
}

function completedRepositoryDelivery(root, run, plan, state) {
  const carrierRef = state.deliveryCarrier?.head;
  const delivery = state.delivery;
  if (delivery?.status !== 'delivered' || delivery.carrierRef !== carrierRef
    || !delivery.remoteAfterRef || delivery.finalRemoteRef !== delivery.remoteAfterRef) return false;
  const disposition = delivery.targetDisposition || 'carrier';
  if (disposition === 'carrier') return delivery.remoteAfterRef === carrierRef;
  if (disposition !== 'already-contained') return false;
  const inspectContainment = delivery.containment?.proof === 'agent-reviewed-zero-delta' || state.deliveryCarrier?.zeroDelta === true
    ? inspectAgentReviewedZeroDeltaContainment
    : inspectGitCarrierContainment;
  const observed = inspectContainment({
    repositoryRoot: plan.retainedRoot,
    workspaceRoot: root,
    targetRef: delivery.finalRemoteRef,
    carrier: state.deliveryCarrier,
    runId: run.runId,
    repositorySelector: plan.selector || null,
  });
  return observed.status === 'contained'
    && isDeepStrictEqual(delivery.containment, observed);
}

function completedDelivery(root, run) {
  const plans = run.identity.repositories || [];
  if (plans.length === 0) {
    return completedRepositoryDelivery(root, run, {
      selector: null, retainedRoot: root,
    }, { deliveryCarrier: run.deliveryCarrier, delivery: run.delivery });
  }
  return plans.filter((plan) => plan.disposition === 'applicable').every((plan) => {
    const state = run.repositories.find((repository) => repository.selector === plan.selector);
    return state && completedRepositoryDelivery(root, run, plan, state);
  });
}

function assertPreparedCompletion(root, run, runtime) {
  const completion = readFinishCompletion({ root, runId: run.runId, runtime });
  if (!completion) throw cleanupError('task-finish.retained-cleanup-completion-missing', 'Durable prepared Finish completion is missing from Workspace SQLite.');
  const repositorySet = run.identity.repositories || [];
  const repositoryCompletionMatches = repositorySet.length > 0
    && completion.schemaVersion === 'buildr.task-finish-completion/v2'
    && completion.repositorySetIdentity === run.identity.repositorySetIdentity
    && completion.carrierSetIdentity === taskFinishCarrierSetIdentity(run.repositories)
    && completion.deliverySetIdentity === taskFinishDeliverySetIdentity(run.repositories)
    && Array.isArray(completion.repositories)
    && completion.repositories.length === repositorySet.length
    && repositorySet.every((plan) => {
      const state = run.repositories.find((repository) => repository.selector === plan.selector);
      const item = completion.repositories.find((repository) => repository.selector === plan.selector);
      return state && item
        && item.disposition === plan.disposition
        && item.taskContributionIdentity === state.taskContribution.identity
        && item.carrierIdentity === (state.deliveryCarrier?.identity || null)
        && item.carrierRef === (state.deliveryCarrier?.head || null)
        && (plan.disposition === 'applicable'
          ? item.finalRemoteRef === state.delivery?.finalRemoteRef
          : typeof item.finalRemoteRef === 'string' && item.finalRemoteRef.length > 0);
    });
  const singletonMatches = repositorySet.length === 0
    && completion.schemaVersion === 'buildr.task-finish-completion/v1'
    && completion.carrierIdentity === run.deliveryCarrier?.identity
    && completion.carrierRef === run.deliveryCarrier?.head
    && completion.finalRemoteRef === run.delivery?.finalRemoteRef
    && completion.targetBranch === run.identity.targetBranch;
  const matches = (repositoryCompletionMatches || singletonMatches)
    && completion.status === 'prepared'
    && completion.runId === run.runId
    && completion.task === run.identity.task
    && completion.handoffIdentity === run.identity.handoffIdentity
    && completion.candidateIdentity === run.identity.candidateIdentity
    && completion.contentTargetIdentity === run.identity.contentTargetIdentity;
  if (!matches) throw cleanupError('task-finish.retained-cleanup-completion-mismatch', 'Durable prepared Finish completion does not match the current run.');
  return completion;
}

export async function executeRetainedTaskFinishCleanup({ targetRoot, runId, runtime = createRuntime() }) {
  const root = fs.realpathSync(path.resolve(targetRoot));
  const run = readFinishRun({ root, runId, runtime });
  if (resolvedPath(run.identity.workspaceRoot) !== root) throw cleanupError('task-finish.retained-cleanup-workspace-mismatch', 'Task Finish run is bound to another retained Workspace.');
  const deliver = run.phases.find((phase) => phase.id === 'deliver');
  const cleanup = run.phases.find((phase) => phase.id === 'cleanup');
  if (run.status !== 'active' || deliver?.status !== 'passed' || cleanup?.status !== 'running'
    || !completedDelivery(root, run)) {
    throw cleanupError('task-finish.retained-cleanup-run-not-ready', 'Task Finish run does not contain a completed delivery and active cleanup boundary.');
  }
  assertPreparedCompletion(root, run, runtime);
  let context = runtime.resolveTaskEnvironmentExecution(root, run.identity.task);
  if (!context?.ready && typeof runtime.resolveTaskEnvironmentCleanupContext === 'function') {
    context = runtime.resolveTaskEnvironmentCleanupContext(root, run.identity.task);
  }
  if (!context?.ready || resolvedPath(context.workspaceRoot) !== root || resolvedPath(context.environmentRoot) !== resolvedPath(run.identity.environmentRoot)) {
    throw cleanupError('task-finish.retained-cleanup-environment-mismatch', 'Current Task Environment does not match the Finish run.', context?.blocked || null);
  }
  const plans = run.identity.repositories || [];
  if (plans.length > 0) {
    const deliveries = {};
    const integratedContributions = {};
    for (const plan of plans) {
      const state = run.repositories.find((repository) => repository.selector === plan.selector);
      if (plan.disposition === 'applicable') {
        deliveries[plan.selector] = state.delivery.finalRemoteRef;
        integratedContributions[plan.selector] = state.deliveryCarrier;
        continue;
      }
      const noContribution = createGitNoContributionProof({ taskRoot: plan.taskRoot, targetRef: plan.targetBranch, taskContribution: state.taskContribution });
      if (noContribution.status !== 'equivalent') throw cleanupError(noContribution.code || 'task-finish.retained-cleanup-no-contribution-unprovable', `No-contribution cleanup proof is unavailable: ${plan.selector}.`, noContribution);
      deliveries[plan.selector] = noContribution.proof.target.head;
      integratedContributions[plan.selector] = noContribution.proof;
    }
    return runtime.cleanupTaskEnvironment(root, run.identity.task, {
      type: 'finish',
      deliveries,
      candidateRef: plans.filter((plan) => plan.disposition === 'applicable').length === 1
        ? run.repositories.find((repository) => repository.disposition === 'applicable')?.deliveryCarrier?.head
        : taskFinishDeliverySetIdentity(run.repositories),
      integratedContributions,
    });
  }
  const deliveries = Object.fromEntries((context.repositories || []).map((repository) => [repository.selector, repository.selector === 'workspace' ? run.identity.targetBranch : repository.startPoint]));
  return runtime.cleanupTaskEnvironment(root, run.identity.task, {
    type: 'finish',
    deliveries,
    candidateRef: run.delivery.carrierRef,
    integratedContributions: { workspace: run.deliveryCarrier },
  });
}

export async function runRetainedTaskFinishCleanup(args) {
  try {
    const input = parseArgs(args);
    const result = await executeRetainedTaskFinishCleanup(input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'cleaned') process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: 'blocked',
      effects: [],
      diagnostic: {
        code: error.code || 'task-finish.retained-cleanup-failed',
        message: error.message,
        details: error.details || null,
      },
    })}\n`);
    process.exitCode = 1;
  }
}
