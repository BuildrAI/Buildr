import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  createGitNoContributionProof,
  inspectGitCarrierContainment,
  inspectGitTaskContributionContainment,
} from './git-task-contribution.mjs';
import { createFinishRun, finishResult } from './task-finish-run.mjs';
import { completeTaskDeliveryTerminal } from './task-finish-delivery-terminal.mjs';
import { removeFinishRunCarriers } from './task-finish-occupancy-release.mjs';
import {
  taskFinishCarrierSetIdentity,
  taskFinishDeliverySetIdentity,
} from './task-finish-repository-set.mjs';

const PHASE_STATUS = Object.freeze({
  preflight: 'passed',
  prepare: 'not-applicable',
  verify: 'not-applicable',
  deliver: 'passed',
  cleanup: 'not-applicable',
});

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function digest(value) { return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }

function command(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}

function text(root, args) {
  const observed = command(root, args);
  return observed.status === 0 ? String(observed.stdout || '').trim() : null;
}

function deliveredGate(gate, type) {
  if (!gate) return null;
  if (gate.disposition) return {
    status: 'gate-disposition',
    disposition: gate.disposition,
    targetIdentity: gate.targetIdentity,
    summary: gate.summary,
    source: gate.source,
  };
  return {
    status: type === 'verification' ? 'verified-at-delivery' : 'adopted-at-delivery',
    targetIdentity: gate.targetIdentity,
    resultDigest: gate.resultDigest,
    outcome: gate.outcome,
  };
}

function terminalAssociation(handoff, observedAt) {
  return {
    schemaVersion: 'buildr.task-terminal-delivery-associations/v1',
    handoffIdentity: handoff.identity,
    candidateIdentity: handoff.candidate.identity,
    candidateGeneration: handoff.candidate.generation,
    gates: {
      planning: deliveredGate(handoff.gates?.planning, 'planning'),
      completion: deliveredGate(handoff.gates?.completion, 'completion'),
      verification: deliveredGate(handoff.gates?.verification, 'verification'),
    },
    observedAt,
    source: 'task-finish-delivery-reconciliation',
  };
}

function reconciliationError(code, message, details = null) {
  const error = new Error(message);
  Object.assign(error, {
    code,
    details,
    nextAction: 'Resolve only the reported repository identity or containment gap, then run task finish reconcile again.',
  });
  return error;
}

function runIdentityMismatches(run, identity) {
  const fields = ['task', 'handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity', 'repositorySetIdentity'];
  return fields.filter((field) => run.identity?.[field] !== identity?.[field]);
}

function untouchedPhase(phase) {
  return Boolean(phase && phase.status === 'pending' && phase.attempts === 0);
}

function staleRunRecoveryEligibility(persistence, identity) {
  const run = persistence?.run;
  const mismatches = runIdentityMismatches(run, identity);
  const preflight = run?.phases?.find((phase) => phase.id === 'preflight');
  const prepare = run?.phases?.find((phase) => phase.id === 'prepare');
  const downstream = (run?.phases || []).filter((phase) => ['verify', 'deliver', 'cleanup'].includes(phase.id));
  const repositoryStates = run?.repositories || [];
  const carriers = repositoryStates.filter((repository) => repository.deliveryCarrier?.root);
  const facts = {
    identityBoundary: Boolean(run?.identity?.task === identity?.task
      && run?.identity?.repositorySetIdentity === identity?.repositorySetIdentity
      && mismatches.length > 0
      && mismatches.every((field) => ['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity'].includes(field))),
    terminalPrepareFailure: Boolean(run?.status === 'failed'
      && preflight?.status === 'passed'
      && preflight.attempts > 0
      && prepare?.status === 'failed'
      && prepare.attempts > 0
      && downstream.length === 3
      && downstream.every(untouchedPhase)),
    carrier: carriers.length > 0 || Boolean(run?.deliveryCarrier?.root),
    resume: Boolean(run?.resume),
    lease: Boolean(persistence?.lease),
    delivery: Boolean(run?.delivery || repositoryStates.some((repository) => repository.delivery)),
    retained: Boolean(run?.delivery?.remoteAfterRef
      || run?.delivery?.finalRemoteRef
      || run?.delivery?.activation
      || repositoryStates.some((repository) => repository.delivery?.remoteAfterRef
        || repository.delivery?.finalRemoteRef
        || repository.delivery?.activation)),
    completion: Boolean(persistence?.preparedCompletion || run?.completion),
    cleanup: Boolean(repositoryStates.some((repository) => repository.cleanupProof)
      || (run?.phases || []).find((phase) => phase.id === 'cleanup' && !untouchedPhase(phase))),
    occupancyReleased: Boolean(run?.occupancy?.status === 'released'),
  };
  const blockers = Object.entries(facts)
    .filter(([key, value]) => ['identityBoundary', 'terminalPrepareFailure', 'carrier'].includes(key) ? !value : value)
    .map(([key]) => key);
  return { eligible: blockers.length === 0, mismatches, facts, blockers };
}

function recoverySummary(run, cleanup) {
  return {
    schemaVersion: 'buildr.task-finish-reconciliation-recovery/v1',
    supersededRunId: run.runId,
    frozenHandoffIdentity: run.identity.handoffIdentity,
    carrierCleanup: {
      status: cleanup.status,
      repositories: (cleanup.repositories || []).map((repository) => ({
        selector: repository.selector,
        carrierIdentity: repository.carrierIdentity || null,
        status: repository.status,
        code: repository.code || null,
      })),
    },
  };
}

function observeRemote(plan) {
  const remote = command(plan.retainedRoot, ['ls-remote', '--heads', plan.remote, plan.targetBranch]);
  if (remote.status !== 0) {
    return {
      status: 'unproven',
      code: 'task-finish.reconciliation-remote-unreadable',
      diagnostic: String(remote.stderr || remote.stdout || '').trim(),
    };
  }
  const observedTargetRef = String(remote.stdout || '').trim().split(/\s+/)[0] || null;
  if (!observedTargetRef) return { status: 'unproven', code: 'task-finish.reconciliation-target-missing' };
  const fetched = command(plan.retainedRoot, ['fetch', plan.remote, plan.targetBranch]);
  const fetchedTargetRef = fetched.status === 0
    ? text(plan.retainedRoot, ['rev-parse', `${plan.remote}/${plan.targetBranch}^{commit}`])
    : null;
  if (fetched.status !== 0 || fetchedTargetRef !== observedTargetRef) {
    return {
      status: 'unproven',
      code: 'task-finish.reconciliation-target-race',
      observedTargetRef,
      fetchedTargetRef,
      diagnostic: String(fetched.stderr || fetched.stdout || '').trim(),
    };
  }
  return { status: 'observed', observedTargetRef };
}

function reconcileRepository(plan, state) {
  if (plan.disposition === 'not-applicable') {
    const targetRef = text(plan.retainedRoot, ['rev-parse', `${plan.targetBranch}^{commit}`]);
    const proof = targetRef
      ? createGitNoContributionProof({ taskRoot: plan.taskRoot, targetRef, taskContribution: state.taskContribution })
      : { status: 'stale', code: 'task-finish.no-contribution-target-unavailable' };
    if (proof.status !== 'equivalent') return { status: 'unproven', selector: plan.selector, proof };
    return {
      status: 'not-applicable',
      selector: plan.selector,
      state: { ...state, cleanupProof: proof.proof },
      finalRemoteRef: targetRef,
    };
  }

  const remote = observeRemote(plan);
  if (remote.status !== 'observed') return { ...remote, selector: plan.selector };
  const finalRemoteRef = remote.observedTargetRef;
  let targetDisposition = null;
  let containment = null;

  if (state.deliveryCarrier?.head && finalRemoteRef === state.deliveryCarrier.head) {
    targetDisposition = 'carrier';
  } else if (state.deliveryCarrier?.head) {
    const carrierContainment = inspectGitCarrierContainment({
      repositoryRoot: plan.retainedRoot,
      targetRef: finalRemoteRef,
      carrier: state.deliveryCarrier,
    });
    if (carrierContainment.status === 'contained') {
      targetDisposition = 'already-contained';
      containment = carrierContainment;
    }
  }

  if (!targetDisposition) {
    const contributionContainment = inspectGitTaskContributionContainment({
      repositoryRoot: plan.retainedRoot,
      targetRef: finalRemoteRef,
      taskContribution: state.taskContribution,
    });
    if (contributionContainment.status !== 'contained') {
      return {
        status: 'unproven',
        selector: plan.selector,
        code: contributionContainment.code,
        observedTargetRef: finalRemoteRef,
        containment: contributionContainment,
      };
    }
    targetDisposition = 'contained';
    containment = contributionContainment;
  }

  const delivery = {
    schemaVersion: 'buildr.task-delivery-evidence/v1',
    status: 'delivered',
    source: 'reconciliation',
    targetDisposition,
    observedTargetRef: finalRemoteRef,
    remoteAfterRef: finalRemoteRef,
    finalRemoteRef,
    carrierRef: state.deliveryCarrier?.head || null,
    taskContributionIdentity: state.taskContribution.identity,
    containment,
    activationPaths: containment?.changedPaths
      || state.deliveryCarrier?.activationPaths
      || state.deliveryCarrier?.changedPaths
      || [],
    activation: plan.selector === 'workspace'
      ? { status: 'attention', code: 'task-finish.activation-pending' }
      : { status: 'not-applicable' },
    retainedDoctor: 'not-applicable',
    reconciledAt: new Date().toISOString(),
  };
  return { status: 'delivered', selector: plan.selector, state: { ...state, delivery }, finalRemoteRef };
}

function completePhases(run, completedAt) {
  for (const phase of run.phases) {
    phase.status = PHASE_STATUS[phase.id];
    phase.attempts = Math.max(phase.attempts || 0, ['preflight', 'deliver'].includes(phase.id) ? 1 : 0);
    phase.startedAt ||= completedAt;
    phase.completedAt = completedAt;
    phase.failure = null;
    phase.checks = [];
    phase.operations = [];
    phase.observations = [];
    phase.output = null;
  }
}

function maintenanceProjection(repositories, diagnosticsStatus = 'not-opened', environmentAvailable = true) {
  const activationAttention = repositories.some((repository) => repository.delivery?.activation?.status === 'attention');
  return {
    delivery: 'delivered',
    activation: activationAttention ? 'attention' : 'not-applicable',
    environmentCleanup: environmentAvailable ? 'pending' : 'not-applicable',
    diagnostics: diagnosticsStatus,
  };
}

export function reconcileTaskFinishDelivery({ runtime, root, entry }) {
  const environmentAvailable = entry.identityParts.environmentAvailable !== false;
  const terminal = runtime.readTaskFinishCompletionPersistence?.(root, { taskId: entry.identityParts.task }, { optional: true });
  if (terminal?.status === 'complete' && terminal.completion?.result) {
    const result = terminal.completion.result;
    if (result.identity?.handoffIdentity !== entry.identityParts.handoffIdentity
      || result.identity?.repositorySetIdentity !== entry.identityParts.repositorySetIdentity) {
      throw reconciliationError('task_finish.reconciliation_terminal_identity_conflict', 'Existing terminal delivery belongs to another handoff or repository set.');
    }
    const taskCompletion = completeTaskDeliveryTerminal(runtime, root, entry.identityParts.task);
    return { ...result, completion: terminal.completion, taskCompletion, idempotent: true };
  }

  const current = runtime.readTaskFinishRunPersistence?.(root, { taskId: entry.identityParts.task }, { optional: true });
  let run;
  let recovery = null;
  if (current?.run) {
    const mismatches = runIdentityMismatches(current.run, entry.identityParts);
    if (mismatches.length === 0) {
      run = clone(current.run);
    } else {
      const eligibility = staleRunRecoveryEligibility(current, entry.identityParts);
      if (!eligibility.eligible) {
        throw reconciliationError(
          'task_finish.reconciliation_current_run_identity_conflict',
          'Current Task Finish run is bound to a different delivery identity and is not eligible for explicit reconciliation recovery.',
          { runId: current.run.runId, mismatches, recoveryBlockers: eligibility.blockers },
        );
      }
      const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
      run = createFinishRun({
        root,
        identity: entry.identityParts,
        developmentHandoff: entry.handoff,
        runId: `${entry.identityParts.task}-reconcile-${stamp}`,
        runtime: { ...runtime, readTaskFinishRunPersistence: () => null },
      });
      recovery = { persistence: current, eligibility };
    }
  } else {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    run = createFinishRun({
      root,
      identity: entry.identityParts,
      developmentHandoff: entry.handoff,
      runId: `${entry.identityParts.task}-reconcile-${stamp}`,
      runtime,
    });
  }

  const repositories = clone(run.repositories);
  const observations = [];
  for (const plan of run.identity.repositories) {
    const state = repositories.find((repository) => repository.selector === plan.selector);
    const observed = reconcileRepository(plan, state);
    observations.push(observed);
    if (['delivered', 'not-applicable'].includes(observed.status)) Object.assign(state, observed.state);
  }
  const unproven = observations.filter((item) => !['delivered', 'not-applicable'].includes(item.status));
  if (unproven.length) {
    const checkpointed = observations.some((item) => ['delivered', 'not-applicable'].includes(item.status));
    if (!recovery && checkpointed && runtime.writeTaskFinishRunPersistence) {
      run.repositories = repositories;
      run.updatedAt = new Date().toISOString();
      run.reconciliation = { mode: 'agent-led', status: 'partial', updatedAt: run.updatedAt };
      runtime.writeTaskFinishRunPersistence(root, run);
    }
    return {
      schemaVersion: 'buildr.task-finish-reconciliation-result/v1',
      operation: 'reconcile',
      status: 'unproven',
      taskId: run.identity.task,
      repositorySetIdentity: run.identity.repositorySetIdentity,
      repositories: observations,
      effects: !recovery && checkpointed ? [{ type: 'delivery-checkpoint-recorded', selectors: observations.filter((item) => ['delivered', 'not-applicable'].includes(item.status)).map((item) => item.selector) }] : [],
      nextActions: ['由Agent处理对应repository的目标、远端或贡献包含事实后重试；其他已交付repository无需重复push。'],
    };
  }

  if (recovery) {
    const cleanup = removeFinishRunCarriers(recovery.persistence.run);
    const summary = recoverySummary(recovery.persistence.run, cleanup);
    if (!['removed', 'not-applicable'].includes(cleanup.status)) {
      return {
        schemaVersion: 'buildr.task-finish-reconciliation-result/v1',
        operation: 'reconcile',
        status: 'unproven',
        taskId: run.identity.task,
        repositorySetIdentity: run.identity.repositorySetIdentity,
        repositories: observations,
        recovery: summary,
        effects: (cleanup.repositories || [])
          .filter((repository) => repository.status === 'removed')
          .map((repository) => ({ type: 'stale-carrier-removed', selector: repository.selector, carrierIdentity: repository.carrierIdentity || null })),
        nextActions: ['修复旧run-owned carrier的精确ownership或cleanup条件后重试；旧current run保持不变。'],
      };
    }
    recovery = summary;
  }

  const completedAt = new Date().toISOString();
  run.repositories = repositories;
  run.status = 'complete';
  run.completedAt = completedAt;
  run.updatedAt = completedAt;
  run.primaryFailure = null;
  run.resume = null;
  run.reconciliation = { mode: 'agent-led', completedAt, recovery };
  completePhases(run, completedAt);
  const applicable = run.identity.repositories.filter((repository) => repository.disposition === 'applicable');
  const singleton = applicable.length === 1
    ? repositories.find((repository) => repository.selector === applicable[0].selector)
    : null;
  const maintenance = maintenanceProjection(repositories, 'not-opened', environmentAvailable);
  const completion = {
    schemaVersion: 'buildr.task-finish-completion/v3',
    runId: run.runId,
    task: run.identity.task,
    mode: 'reconciliation',
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    repositorySetIdentity: run.identity.repositorySetIdentity,
    carrierSetIdentity: taskFinishCarrierSetIdentity(repositories),
    deliverySetIdentity: taskFinishDeliverySetIdentity(repositories),
    repositories: run.identity.repositories.map((plan) => {
      const state = repositories.find((repository) => repository.selector === plan.selector);
      return {
        selector: plan.selector,
        disposition: plan.disposition,
        carrierIdentity: state.deliveryCarrier?.identity || null,
        carrierRef: state.deliveryCarrier?.head || null,
        finalRemoteRef: state.delivery?.finalRemoteRef || observations.find((item) => item.selector === plan.selector)?.finalRemoteRef || null,
        taskContributionIdentity: state.taskContribution.identity,
        delivery: clone(state.delivery),
      };
    }),
    carrierIdentity: singleton?.deliveryCarrier?.identity || null,
    carrierRef: singleton?.deliveryCarrier?.head || null,
    finalRemoteRef: singleton?.delivery?.finalRemoteRef || null,
    taskContributionIdentity: singleton?.taskContribution?.identity || null,
    targetBranch: singleton ? applicable[0].targetBranch : null,
    status: 'complete',
    preparedAt: completedAt,
    completedAt,
    cleanup: environmentAvailable
      ? { status: 'pending', summary: 'Task delivery is complete; Environment cleanup remains an independent Agent action.' }
      : { status: 'not-applicable', summary: 'Task delivery was reconciled without a current Task Environment; no cleanup success is claimed.' },
    maintenance,
    association: terminalAssociation(entry.handoff, completedAt),
    recovery,
  };
  run.completion = completion;
  const canonical = {
    ...finishResult(run),
    deliveryResult: {
      schemaVersion: 'buildr.task-delivery-result/v1',
      status: 'delivered',
      mode: 'reconciliation',
      repositorySetIdentity: run.identity.repositorySetIdentity,
      deliverySetIdentity: completion.deliverySetIdentity,
      repositories: completion.repositories,
      identity: digest(completion.repositories),
    },
    maintenance,
    recovery,
  };
  runtime.finalizeTaskFinishPersistence(root, { run, result: canonical, completion });
  let taskCompletion;
  try {
    taskCompletion = completeTaskDeliveryTerminal(runtime, root, run.identity.task);
  } catch (error) {
    return {
      ...canonical,
      taskTerminal: { status: 'attention', code: error.code || 'task-finish.task-record-completion-failed', message: error.message },
      nextAction: 'retry-task-finish-reconcile-to-complete-task-record',
    };
  }
  return {
    ...canonical,
    taskCompletion,
    taskTerminal: { status: 'completed' },
    effects: recovery ? [{ type: 'stale-finish-run-superseded', runId: recovery.supersededRunId }] : [],
  };
}
