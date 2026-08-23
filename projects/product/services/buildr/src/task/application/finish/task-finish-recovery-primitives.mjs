import crypto from 'node:crypto';

import { removeFinishRunCarriers } from './task-finish-occupancy-release.mjs';
import { verifyGitCarrierDisposabilityProof } from './git-task-contribution.mjs';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function repositoryTopology(repositories) {
  return (repositories || [])
    .map((repository) => ({
      selector: repository.selector,
      sourcePath: repository.sourcePath,
      retainedRoot: repository.retainedRoot,
      taskRoot: repository.taskRoot,
      environmentBranch: repository.environmentBranch,
      targetBranch: repository.targetBranch,
      remote: repository.remote,
      disposition: repository.disposition,
      reason: repository.reason,
    }))
    .sort((left, right) => left.selector.localeCompare(right.selector));
}

function sameRepositoryTopology(left, right) {
  return JSON.stringify(repositoryTopology(left)) === JSON.stringify(repositoryTopology(right));
}

function untouchedPhase(phase) {
  return Boolean(phase && phase.status === 'pending' && phase.attempts === 0);
}

function runIdentityMismatches(run, identity) {
  const fields = ['task', 'handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity', 'repositorySetIdentity'];
  return fields.filter((field) => run?.identity?.[field] !== identity?.[field]);
}

export function inspectStaleFinishRunRetirementEligibility(persistence, identity) {
  const run = persistence?.run;
  const mismatches = runIdentityMismatches(run, identity);
  const preflight = run?.phases?.find((phase) => phase.id === 'preflight');
  const prepare = run?.phases?.find((phase) => phase.id === 'prepare');
  const downstream = (run?.phases || []).filter((phase) => ['verify', 'deliver', 'cleanup'].includes(phase.id));
  const repositoryStates = run?.repositories || [];
  const carriers = repositoryStates.filter((repository) => repository.deliveryCarrier?.root);
  const facts = {
    identityBoundary: Boolean(run?.identity?.task === identity?.task
      && sameRepositoryTopology(run?.identity?.repositories, identity?.repositories)
      && mismatches.length > 0
      && mismatches.every((field) => ['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity', 'repositorySetIdentity'].includes(field))),
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
  return { schemaVersion: 'buildr.task-finish-run-retirement-qualification/v1', eligible: blockers.length === 0, mismatches, facts, blockers };
}

function carrierEntries(run) {
  const plans = new Map((run?.identity?.repositories || []).map((repository) => [repository.selector, repository]));
  const entries = (run?.repositories || [])
    .filter((repository) => repository.deliveryCarrier?.root)
    .map((repository) => ({
      selector: repository.selector,
      plan: plans.get(repository.selector),
      carrier: repository.deliveryCarrier,
      proof: repository.carrierDisposability || null,
    }));
  if (entries.length === 0 && run?.deliveryCarrier?.root) entries.push({
    selector: 'workspace',
    plan: { taskRoot: run.identity.environmentRoot },
    carrier: run.deliveryCarrier,
    proof: run.carrierDisposability || null,
    legacy: true,
  });
  return entries;
}

export function inspectStaleFinishRunRolloverEligibility(persistence, identity, options = {}) {
  const run = persistence?.run;
  const mismatches = runIdentityMismatches(run, identity);
  const preflight = run?.phases?.find((phase) => phase.id === 'preflight');
  const prepare = run?.phases?.find((phase) => phase.id === 'prepare');
  const downstream = (run?.phases || []).filter((phase) => ['verify', 'deliver', 'cleanup'].includes(phase.id));
  const repositoryStates = run?.repositories || [];
  const entries = carrierEntries(run);
  const knownDriftFailure = (failure) => failure?.phase === 'prepare'
    && failure?.operation === 'task-contribution'
    && failure?.code === 'task-finish.task-contribution-drift-unresolved';
  const driftBoundary = Boolean(['blocked', 'failed'].includes(run?.status)
    && preflight?.status === 'passed'
    && preflight.attempts > 0
    && prepare?.status === run.status
    && prepare.attempts > 0
    && knownDriftFailure(prepare.failure)
    && knownDriftFailure(run.primaryFailure)
    && downstream.length === 3
    && downstream.every(untouchedPhase)
    && (run.status === 'failed'
      ? run.resume == null
      : run.resume?.phase === 'prepare' && typeof run.resume?.token === 'string' && run.resume.token.length > 0));
  const verifyCarrier = options.verifyCarrier || verifyGitCarrierDisposabilityProof;
  const carrierDisposability = entries.map((entry) => {
    if (!entry.plan?.taskRoot || !entry.proof) return { selector: entry.selector, status: 'unprovable', code: 'task-finish.carrier-disposability-proof-missing', proofIdentity: entry.proof?.identity || null };
    const observed = verifyCarrier({
      repositoryRoot: entry.plan.taskRoot,
      workspaceRoot: run.identity.workspaceRoot,
      runId: run.runId,
      repositorySelector: entry.legacy ? null : entry.selector,
      carrier: entry.carrier,
      proof: entry.proof,
      handoffIdentity: run.identity.handoffIdentity,
      repositoryTopology: entry.legacy ? { taskRoot: run.identity.environmentRoot, workspaceRoot: run.identity.workspaceRoot } : entry.plan,
    });
    return { selector: entry.selector, status: observed.status, code: observed.code || null, proofIdentity: entry.proof.identity || null };
  });
  const facts = {
    identityBoundary: Boolean(run?.identity?.task === identity?.task
      && sameRepositoryTopology(run?.identity?.repositories, identity?.repositories)
      && mismatches.length > 0
      && mismatches.every((field) => ['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity', 'repositorySetIdentity'].includes(field))),
    driftBoundary,
    carrier: entries.length > 0,
    carrierDisposability: entries.length > 0 && carrierDisposability.every((item) => ['unchanged', 'not-applicable'].includes(item.status)),
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
    .filter(([key, value]) => ['identityBoundary', 'driftBoundary', 'carrier', 'carrierDisposability'].includes(key) ? !value : value)
    .map(([key]) => key);
  const qualificationIdentity = digest({
    schemaVersion: 'buildr.task-finish-run-rollover-qualification/v1',
    runId: run?.runId || null,
    runDigest: persistence?.runDigest || null,
    current: identity ? {
      task: identity.task,
      handoffIdentity: identity.handoffIdentity,
      candidateIdentity: identity.candidateIdentity,
      candidateGeneration: identity.candidateGeneration,
      contentTargetIdentity: identity.contentTargetIdentity,
      repositorySetIdentity: identity.repositorySetIdentity,
      repositoryTopology: repositoryTopology(identity.repositories),
    } : null,
    carrierProofs: carrierDisposability.map((item) => ({ selector: item.selector, proofIdentity: item.proofIdentity })),
  });
  return {
    schemaVersion: 'buildr.task-finish-run-rollover-qualification/v1',
    eligible: blockers.length === 0,
    qualificationIdentity,
    recoveryToken: blockers.length === 0 ? digest({ purpose: 'task-finish-rollover', qualificationIdentity }) : null,
    mismatches,
    facts,
    carrierDisposability,
    blockers,
  };
}

export function cleanupStaleFinishRunForRetirement({ persistence, identity, remoteContainmentProven }) {
  const qualification = inspectStaleFinishRunRetirementEligibility(persistence, identity);
  if (remoteContainmentProven !== true) return { status: 'blocked', code: 'task_finish.run_retirement_remote_containment_unproven', qualification, cleanup: null };
  if (!qualification.eligible) return { status: 'blocked', code: 'task_finish.run_retirement_ineligible', qualification, cleanup: null };
  const cleanup = removeFinishRunCarriers(persistence.run);
  return ['removed', 'not-applicable'].includes(cleanup.status)
    ? { status: 'ready', code: null, qualification, cleanup }
    : { status: 'blocked', code: cleanup.code || 'task_finish.carrier_cleanup_failed', qualification, cleanup };
}

export function cleanupStaleFinishRunForRollover({ persistence, identity, recoveryToken, verifyCarrier = undefined, removeCarriers = removeFinishRunCarriers }) {
  const qualification = inspectStaleFinishRunRolloverEligibility(persistence, identity, { verifyCarrier });
  if (!qualification.eligible) return { status: 'blocked', code: 'task_finish.run_rollover_ineligible', qualification, cleanup: null };
  if (!recoveryToken || recoveryToken !== qualification.recoveryToken) {
    return { status: 'blocked', code: 'task_finish.run_rollover_token_mismatch', qualification, cleanup: null };
  }
  const cleanup = removeCarriers(persistence.run);
  return ['removed', 'not-applicable'].includes(cleanup.status)
    ? { status: 'ready', code: null, qualification, cleanup }
    : { status: 'blocked', code: cleanup.code || 'task_finish.carrier_cleanup_failed', qualification, cleanup };
}
