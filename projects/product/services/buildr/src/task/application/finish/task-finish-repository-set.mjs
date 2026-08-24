import crypto from 'node:crypto';
import path from 'node:path';

export const TASK_FINISH_REPOSITORY_DISPOSITIONS = Object.freeze(['applicable', 'not-applicable']);

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Task Finish repository requires ${field}.`);
  return value;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizedPath(value, field) {
  return path.resolve(requiredString(value, field));
}

function portablePath(value) {
  const normalized = requiredString(value, 'sourcePath').replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || path.posix.normalize(normalized) !== normalized || normalized.startsWith('../')) {
    throw new Error(`Task Finish repository sourcePath is invalid: ${value}.`);
  }
  return normalized;
}

export function taskFinishRepositoryIdentity(repository) {
  return digest({
    selector: repository.selector,
    sourcePath: repository.sourcePath,
    retainedRoot: path.resolve(repository.retainedRoot),
    taskRoot: path.resolve(repository.taskRoot),
  });
}

export function taskFinishRepositoryLeaseIdentity(repository) {
  if (repository.disposition !== 'applicable') return null;
  return digest({
    retainedRoot: path.resolve(repository.retainedRoot),
    remote: repository.remote,
    targetBranch: repository.targetBranch,
  });
}

export function normalizeTaskFinishRepositoryPlan(input) {
  const disposition = requiredString(input?.disposition, 'disposition');
  if (!TASK_FINISH_REPOSITORY_DISPOSITIONS.includes(disposition)) throw new Error(`Task Finish repository disposition is unsupported: ${disposition}.`);
  const normalized = {
    selector: requiredString(input?.selector, 'selector'),
    sourcePath: portablePath(input?.sourcePath),
    retainedRoot: normalizedPath(input?.retainedRoot, 'retainedRoot'),
    taskRoot: normalizedPath(input?.taskRoot, 'taskRoot'),
    environmentBranch: requiredString(input?.environmentBranch, 'environmentBranch'),
    targetBranch: requiredString(input?.targetBranch, 'targetBranch'),
    remote: optionalString(input?.remote),
    disposition,
    reason: disposition === 'not-applicable' ? requiredString(input?.reason, 'reason') : null,
    taskContribution: input?.taskContribution && typeof input.taskContribution === 'object'
      ? JSON.parse(JSON.stringify(input.taskContribution))
      : null,
  };
  if (!normalized.taskContribution?.identity || !normalized.taskContribution?.originalBaseline?.tree || !normalized.taskContribution?.source?.tree) {
    throw new Error(`Task Finish repository Task Contribution is unavailable: ${normalized.selector}.`);
  }
  if (disposition === 'applicable' && !normalized.remote) throw new Error(`Task Finish applicable repository requires remote: ${normalized.selector}.`);
  if (disposition === 'not-applicable' && normalized.taskContribution.originalBaseline.tree !== normalized.taskContribution.source.tree) {
    throw new Error(`Task Finish no-contribution repository trees do not match: ${normalized.selector}.`);
  }
  normalized.repositoryIdentity = taskFinishRepositoryIdentity(normalized);
  normalized.leaseTargetIdentity = taskFinishRepositoryLeaseIdentity(normalized);
  return normalized;
}

export function normalizeTaskFinishRepositorySet(input) {
  if (!Array.isArray(input) || input.length === 0) throw new Error('Task Finish requires at least one Environment repository.');
  const repositories = input.map(normalizeTaskFinishRepositoryPlan)
    .sort((left, right) => left.selector.localeCompare(right.selector));
  const selectors = new Set();
  for (const repository of repositories) {
    if (selectors.has(repository.selector)) throw new Error(`Task Finish repository selector is duplicated: ${repository.selector}.`);
    selectors.add(repository.selector);
  }
  return repositories;
}

export function taskFinishRepositorySetIdentity(repositories) {
  return digest(normalizeTaskFinishRepositorySet(repositories));
}

export function createTaskFinishRepositoryStates(repositories) {
  return normalizeTaskFinishRepositorySet(repositories).map((repository) => ({
    selector: repository.selector,
    disposition: repository.disposition,
    reason: repository.reason,
    taskContribution: JSON.parse(JSON.stringify(repository.taskContribution)),
    deliveryCarrier: null,
    carrierDisposability: null,
    equivalence: null,
    delivery: null,
    cleanupProof: null,
  }));
}

export function applicableTaskFinishRepositories(identity) {
  return (identity?.repositories || []).filter((repository) => repository.disposition === 'applicable');
}

export function singletonApplicableTaskFinishRepository(identity) {
  const repositories = applicableTaskFinishRepositories(identity);
  return repositories.length === 1 ? repositories[0] : null;
}

export function singletonTaskFinishRepositoryState(run) {
  const applicable = applicableTaskFinishRepositories(run?.identity);
  if (applicable.length !== 1) return null;
  return (run?.repositories || []).find((repository) => repository.selector === applicable[0].selector) || null;
}

export function taskFinishCarrierSetIdentity(repositories) {
  const carriers = (repositories || [])
    .filter((repository) => repository.deliveryCarrier?.identity)
    .map((repository) => ({ selector: repository.selector, identity: repository.deliveryCarrier.identity }));
  return carriers.length ? digest(carriers) : null;
}

export function taskFinishDeliverySetIdentity(repositories) {
  const deliveries = (repositories || [])
    .filter((repository) => repository.delivery?.finalRemoteRef)
    .map((repository) => ({ selector: repository.selector, finalRemoteRef: repository.delivery.finalRemoteRef }));
  return deliveries.length ? digest(deliveries) : null;
}
