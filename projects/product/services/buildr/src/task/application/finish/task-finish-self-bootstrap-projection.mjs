import crypto from 'node:crypto';
import path from 'node:path';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.mjs';
import { taskFinishCarrierRoot } from './git-task-contribution.mjs';

const SUPPORTED_RESULT_SCHEMAS = new Set([
  'buildr.task-finish-result/v2',
  PUBLIC_JSON_SCHEMAS.taskFinishResult,
]);
const PHASES = new Set(['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
const REPOSITORY_DISPOSITIONS = new Set(['applicable', 'not-applicable']);

function projectionError(message, details = null) {
  const error = new Error(message);
  Object.assign(error, {
    code: 'task_finish.self_bootstrap_projection_invalid',
    usage: 'buildr help task finish inspect',
    nextAction: 'buildr help task finish inspect',
  });
  if (details) error.details = details;
  return error;
}

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function portablePath(value) {
  const normalized = optionalString(value)?.replaceAll('\\', '/').replace(/^\.\//, '') || null;
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
  if (normalized.split('/').includes('..')) return null;
  return normalized;
}

function activationPaths(carrier) {
  const source = Array.isArray(carrier?.activationPaths)
    ? carrier.activationPaths
    : Array.isArray(carrier?.changedPaths)
      ? carrier.changedPaths
      : [];
  const normalized = source.map(portablePath);
  if (normalized.some((item) => !item) || new Set(normalized).size !== normalized.length) {
    throw projectionError('Task Finish carrier has invalid or duplicate activation paths.', {
      carrierIdentity: carrier?.identity || null,
    });
  }
  return normalized.sort();
}

function cleanupCompleted(result) {
  if (result?.status !== 'complete') return false;
  if (result.completion?.cleanup?.status === 'cleaned') return true;
  return Array.isArray(result.phases)
    && result.phases.some((phase) => phase?.id === 'cleanup' && phase?.status === 'passed');
}

function projectedCarrier(selector, carrier, { allowCleanedRoot = false, fallbackRoot = null } = {}) {
  if (!carrier) return null;
  const identity = optionalString(carrier.identity);
  const root = optionalString(carrier.root) || (!allowCleanedRoot ? optionalString(fallbackRoot) : null);
  if (!identity || (root && !path.isAbsolute(root)) || (!root && !allowCleanedRoot)) {
    throw projectionError('Task Finish carrier is missing a stable identity or absolute root.', {
      selector,
      carrierIdentity: identity,
      carrierRoot: root,
    });
  }
  return {
    selector,
    identity,
    root: root ? path.resolve(root) : null,
    availability: root ? 'retained' : 'cleaned',
    activationPaths: activationPaths(carrier),
  };
}

function projectedDelivery(value) {
  if (!value) return null;
  return {
    status: optionalString(value.status),
    remoteAfterRef: optionalString(value.remoteAfterRef),
    finalRemoteRef: optionalString(value.finalRemoteRef),
    activationPaths: activationPaths({ activationPaths: value.activationPaths || [] }),
  };
}

function resultIdentity(result) {
  const context = result.resolvedContext || {};
  const identity = result.identity || {};
  return {
    taskId: optionalString(context.task?.taskId) || optionalString(identity.task),
    handoffIdentity: optionalString(context.handoff?.identity) || optionalString(result.handoff?.identity) || optionalString(identity.handoffIdentity),
    candidateIdentity: optionalString(context.candidate?.identity) || optionalString(result.candidate?.identity) || optionalString(identity.candidateIdentity),
    candidateGeneration: Number.isInteger(context.candidate?.generation)
      ? context.candidate.generation
      : Number.isInteger(result.candidate?.generation)
        ? result.candidate.generation
        : Number.isInteger(identity.candidateGeneration)
          ? identity.candidateGeneration
          : null,
    contentTargetIdentity: optionalString(context.candidate?.contentTargetIdentity) || optionalString(result.candidate?.contentTargetIdentity) || optionalString(identity.contentTargetIdentity),
    agent: optionalString(context.delivery?.agent) || optionalString(identity.agent),
    workspaceRoot: optionalString(identity.workspaceRoot) ? path.resolve(identity.workspaceRoot) : null,
    targetBranch: optionalString(context.delivery?.targetBranch) || optionalString(identity.targetBranch),
    remote: optionalString(context.delivery?.remote) || optionalString(identity.remote),
  };
}

function legacyWorkspaceProjection(result, allowCleanedRoot) {
  const carrier = projectedCarrier('workspace', result.carrier, { allowCleanedRoot });
  const targetBranch = optionalString(result.identity?.targetBranch);
  const remote = optionalString(result.identity?.remote);
  return [{
    selector: 'workspace',
    disposition: carrier ? 'applicable' : 'unavailable',
    reason: carrier ? null : 'Legacy Result does not expose a Workspace carrier.',
    targetBranch,
    remote,
    leaseTargetIdentity: remote && targetBranch ? `${remote}:${targetBranch}` : null,
    carrier,
    delivery: projectedDelivery(result.delivery),
  }];
}

function hasProjectableLegacyCarrier(result) {
  return Boolean(optionalString(result?.carrier?.identity));
}

function repositoryProjection(result, identity, runId) {
  const allowCleanedRoot = cleanupCompleted(result);
  if (result.schemaVersion === 'buildr.task-finish-result/v2') {
    return legacyWorkspaceProjection(result, allowCleanedRoot);
  }

  const plans = Array.isArray(result.identity?.repositories) ? result.identity.repositories : [];
  const states = Array.isArray(result.repositories) ? result.repositories : [];
  const planBySelector = new Map();
  const stateBySelector = new Map();
  for (const plan of plans) {
    const selector = optionalString(plan?.selector);
    if (!selector || planBySelector.has(selector)) throw projectionError('Task Finish repository plans have an invalid or duplicate selector.', { selector });
    planBySelector.set(selector, plan);
  }
  for (const state of states) {
    const selector = optionalString(state?.selector);
    if (!selector || stateBySelector.has(selector)) throw projectionError('Task Finish repository states have an invalid or duplicate selector.', { selector });
    stateBySelector.set(selector, state);
  }
  const selectors = [...new Set([...planBySelector.keys(), ...stateBySelector.keys()])].sort();
  if (selectors.length === 0 && hasProjectableLegacyCarrier(result)) {
    return legacyWorkspaceProjection(result, allowCleanedRoot);
  }
  return selectors.map((selector) => {
    const plan = planBySelector.get(selector) || {};
    const state = stateBySelector.get(selector) || {};
    const disposition = REPOSITORY_DISPOSITIONS.has(state.disposition)
      ? state.disposition
      : REPOSITORY_DISPOSITIONS.has(plan.disposition)
        ? plan.disposition
        : 'unavailable';
    return {
      selector,
      disposition,
      reason: optionalString(state.reason) || optionalString(plan.reason),
      targetBranch: optionalString(plan.targetBranch),
      remote: optionalString(plan.remote),
      leaseTargetIdentity: optionalString(plan.leaseTargetIdentity),
      carrier: projectedCarrier(selector, state.deliveryCarrier, {
        allowCleanedRoot,
        fallbackRoot: identity.workspaceRoot && runId
          ? taskFinishCarrierRoot(identity.workspaceRoot, runId, selector)
          : null,
      }),
      delivery: projectedDelivery(state.delivery),
    };
  });
}

function primaryFailure(value) {
  if (!value) return null;
  return {
    phase: PHASES.has(value.phase) ? value.phase : null,
    operation: optionalString(value.operation) || optionalString(value.check),
    code: optionalString(value.code),
    status: optionalString(value.status),
    message: optionalString(value.message),
  };
}

function resume(value) {
  if (!value) return null;
  return {
    phase: PHASES.has(value.phase) ? value.phase : null,
    token: optionalString(value.token),
    carrierIdentity: optionalString(value.carrierIdentity),
  };
}

function projectedDeliveryAdaptation(value) {
  if (!value) return null;
  const hints = value.preparationHints || {};
  return {
    expectedCommitMessage: optionalString(value.expectedCommitMessage),
    preparationHints: {
      schemaVersion: optionalString(hints.schemaVersion),
      steps: (Array.isArray(hints.steps) ? hints.steps : []).map((step) => ({
        id: optionalString(step?.id),
        scope: optionalString(step?.scope),
        recipe: optionalString(step?.recipe),
        cwd: portablePath(step?.cwd),
        executable: portablePath(step?.executable),
        args: (Array.isArray(step?.args) ? step.args : []).filter((arg) => typeof arg === 'string'),
        timeoutMs: Number.isInteger(step?.timeoutMs) ? step.timeoutMs : null,
        outputs: (Array.isArray(step?.outputs) ? step.outputs : []).map((output) => ({
          path: portablePath(output?.path),
          kind: optionalString(output?.kind),
        })).filter((output) => output.path),
      })).filter((step) => step.id && step.cwd && step.executable),
      unavailable: (Array.isArray(hints.unavailable) ? hints.unavailable : []).map((item) => ({
        id: optionalString(item?.id),
        reason: optionalString(item?.reason),
      })).filter((item) => item.id),
    },
  };
}

function completionRepositories(value) {
  return (Array.isArray(value?.repositories) ? value.repositories : []).map((repository) => ({
    selector: optionalString(repository?.selector),
    disposition: REPOSITORY_DISPOSITIONS.has(repository?.disposition) ? repository.disposition : 'unavailable',
    carrierIdentity: optionalString(repository?.carrierIdentity),
    carrierRef: optionalString(repository?.carrierRef),
    finalRemoteRef: optionalString(repository?.finalRemoteRef),
  })).filter((repository) => repository.selector).sort((left, right) => left.selector.localeCompare(right.selector));
}

function workspaceCompletion(result) {
  return completionRepositories(result.completion).find((repository) => repository.selector === 'workspace') || null;
}

function successfulDelivery(result, repositories) {
  if (repositories.some((repository) => repository.delivery?.status === 'delivered'
    || repository.delivery?.remoteAfterRef
    || repository.delivery?.finalRemoteRef)) return true;
  if (result.delivery?.status === 'delivered' || result.delivery?.remoteAfterRef || result.delivery?.finalRemoteRef) return true;
  if (result.completion?.finalRemoteRef) return true;
  return completionRepositories(result.completion).some((repository) => repository.finalRemoteRef);
}

function finishMode(result, workspaceRepository) {
  if (result.status === 'complete') return 'complete';
  const delivery = workspaceRepository?.delivery || projectedDelivery(result.delivery);
  const doctorBlocked = result.status === 'blocked'
    && result.primaryFailure?.phase === 'deliver'
    && result.primaryFailure?.operation === 'retained-doctor'
    && delivery?.status === 'activation-blocked'
    && delivery?.remoteAfterRef
    && result.resume?.phase === 'deliver'
    && result.resume?.token;
  return doctorBlocked ? 'doctor-blocked' : 'ineligible';
}

export function selfBootstrapTaskFinishResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw projectionError('Task Finish self-bootstrap projection requires a canonical Result.');
  }
  if (!SUPPORTED_RESULT_SCHEMAS.has(result.schemaVersion)) {
    throw projectionError('Task Finish self-bootstrap projection requires a supported canonical Result.', {
      schemaVersion: result.schemaVersion || null,
    });
  }
  const identity = resultIdentity(result);
  const runId = optionalString(result.runId);
  const repositories = repositoryProjection(result, identity, runId);
  const workspaceRepositories = repositories.filter((repository) => repository.selector === 'workspace');
  const workspaceRepository = workspaceRepositories.length === 1 ? workspaceRepositories[0] : null;
  const carriers = repositories.map((repository) => repository.carrier).filter(Boolean);
  let carrierContainerRoot = null;
  try { carrierContainerRoot = identity.workspaceRoot && runId ? taskFinishCarrierRoot(identity.workspaceRoot, runId) : null; } catch { /* invalid run identity remains unprojectable */ }
  const mode = finishMode(result, workspaceRepository);
  const workspaceDelivery = workspaceRepository?.delivery || projectedDelivery(result.delivery);
  const workspaceFinal = workspaceCompletion(result);
  const repositoryApplicability = workspaceRepository?.disposition === 'applicable'
    ? 'applicable'
    : workspaceRepository?.disposition === 'not-applicable'
      ? 'not-applicable'
      : 'unavailable';
  const payload = {
    detail: 'self-bootstrap',
    runId,
    status: optionalString(result.status),
    mode,
    identity: {
      ...identity,
      targetBranch: workspaceRepository?.targetBranch || identity.targetBranch,
      remote: workspaceRepository?.remote || identity.remote,
    },
    repositorySetIdentity: optionalString(result.repositorySetIdentity) || optionalString(result.identity?.repositorySetIdentity),
    carrierContainerRoot,
    repositories,
    workspaceRepository,
    carriers,
    selfBootstrap: {
      applicability: repositoryApplicability,
      reason: repositoryApplicability === 'not-applicable'
        ? workspaceRepository.reason || 'Workspace repository has no Task Contribution.'
        : repositoryApplicability === 'unavailable'
          ? 'Workspace repository facts are unavailable.'
          : null,
      activationPaths: workspaceRepository?.carrier?.activationPaths || workspaceRepository?.delivery?.activationPaths || [],
      baseRef: mode === 'complete'
        ? workspaceDelivery?.finalRemoteRef || workspaceFinal?.finalRemoteRef || optionalString(result.completion?.finalRemoteRef)
        : mode === 'doctor-blocked'
          ? workspaceDelivery?.remoteAfterRef
          : null,
    },
    primaryFailure: primaryFailure(result.primaryFailure),
    resume: resume(result.resume),
    delivery: {
      status: workspaceDelivery?.status || null,
      remoteAfterRef: workspaceDelivery?.remoteAfterRef || null,
      finalRemoteRef: workspaceDelivery?.finalRemoteRef || workspaceFinal?.finalRemoteRef || optionalString(result.completion?.finalRemoteRef),
      successful: successfulDelivery(result, repositories),
    },
    completion: result.completion ? {
      status: optionalString(result.completion.status),
      finalRemoteRef: optionalString(result.completion.finalRemoteRef),
      repositories: completionRepositories(result.completion),
    } : null,
    occupancy: result.occupancy ? { status: optionalString(result.occupancy.status) } : null,
    deliveryAdaptation: projectedDeliveryAdaptation(result.deliveryAdaptation),
  };
  const projected = withJsonSchema(PUBLIC_JSON_SCHEMAS.taskFinishSelfBootstrapInput, payload);
  return { ...projected, projectionIdentity: digest(projected) };
}
