import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FINISH_ACTION_REGISTRY_SCHEMA = 'buildr.task-finish-action-registry/v1';
export const FINISH_ACTION_REGISTRY_VERSION = 1;

const provider = (step, capability, action, executionSurface, evidence, effects = [], providerId = null) => actionEntry({
  id: `${step}.provider`, step, kind: 'agent-provider', applicability: 'standard-finish-step',
  executionSurface, authorization: 'current-finish-run', effects,
  resultContract: { outcome: ['passed', 'blocked'], evidence },
  evidenceProjection: { finishStep: step, required: evidence },
  fallbackPolicy: 'agent-reasoning-required-on-provider-semantic-branch',
  providerHandoff: { capability, provider: providerId, action, requiredEvidence: evidence },
});

function actionEntry(entry) {
  return Object.freeze({
    schemaVersion: FINISH_ACTION_REGISTRY_SCHEMA,
    applicability: 'standard-finish-step', executionSurface: 'task-checkout', authorization: 'current-finish-run',
    effects: [], resultContract: { outcome: ['passed', 'blocked'] }, evidenceProjection: {},
    fallbackPolicy: 'agent-reasoning-required-on-uncovered-behavior', requiredContext: [],
    ...entry,
  });
}

export const FINISH_ACTIONS = Object.freeze([
  actionEntry({
    id: 'context.verify-environment', step: 'context', kind: 'product-executable',
    effects: [], requiredContext: ['cliSource'],
    resultContract: { outcome: ['passed', 'blocked'], jsonAssertion: { path: 'executionReady', equals: true } },
    evidenceProjection: { finishStep: 'context', required: ['execution binding', 'CLI identity', 'runtime identity'] },
    resolver: resolveContext,
  }),
  provider('current-knowledge', 'buildr.current-knowledge-maintenance@1', 'inspect', 'task-checkout', ['status', 'impacts', 'treeIdentity']),
  actionEntry({
    id: 'contract-convergence.openspec', step: 'contract-convergence', kind: 'product-executable',
    effects: ['canonical-spec-sync', 'convergence-receipt'], requiredContext: ['cliSource', 'project'],
    resultContract: { outcome: ['passed', 'blocked'], processExit: 0 },
    evidenceProjection: { finishStep: 'contract-convergence', required: ['stages', 'receipt', 'change identity'] },
    resolver: resolveOpenSpecConvergence,
  }),
  provider('candidate-commit', 'buildr.git-task-integration@1', 'commit-candidate', 'task-checkout', ['candidate commit', 'tree identity'], ['git-commit']),
  provider('target-convergence', 'buildr.git-task-integration@1', 'converge-target', 'task-checkout', ['target observation', 'candidate identity'], ['fetch', 'rebase']),
  actionEntry({
    id: 'runtime-convergence.doctor-sync', step: 'runtime-convergence', kind: 'product-executable',
    effects: ['runtime-projection-sync'], requiredContext: ['cliSource', 'agent'],
    resultContract: { outcome: ['passed', 'blocked'], processExit: 0 },
    evidenceProjection: { finishStep: 'runtime-convergence', required: ['doctor result', 'sync result'] },
    resolver: resolveRuntimeConvergence,
  }),
  provider('formal-assurance', 'buildr.task-verification@2', 'verify-required', 'task-checkout', ['candidate identity', 'verification summary']),
  provider('asset-review', 'buildr.task-asset-review@3', 'finalize', 'task-checkout', ['review status', 'observation revision']),
  provider('archive', null, 'archive', 'retained-checkout', ['archive path', 'post-sync result'], ['archive-change'], 'openspec-archive-change'),
  provider('integration-push', 'buildr.git-task-integration@1', 'integrate-and-push', 'retained-checkout', ['ref transition'], ['merge-or-fast-forward', 'push']),
  provider('runtime-install', 'buildr.task-finish@1', 'install-retained-runtime', 'retained-checkout', ['runtime identity'], ['runtime-install'], 'task-finish'),
  provider('asset-review-late', 'buildr.task-asset-review@3', 'finalize-if-revised', 'retained-checkout', ['review status', 'observation revision']),
  provider('cleanup', 'buildr.task-worktree-lifecycle@2', 'cleanup', 'retained-checkout', ['cleanup readiness', 'durable receipt'], ['local-environment-cleanup']),
]);

function publicAction(entry) {
  const { resolver, ...value } = entry;
  return value;
}

function inferredCli(root, context) {
  if (context.cliSource) return path.resolve(context.cliSource);
  const local = path.resolve(root, 'projects/product/buildr');
  return fs.existsSync(local) ? local : null;
}

function executablePlan({ root, action, command, args, safeHandler, evidenceId, sharedMutation = false, jsonAssertion = null, stages = [] }) {
  return {
    cwd: path.resolve(root), command, commandSource: path.resolve(command).startsWith(`${path.resolve(root)}${path.sep}`) ? 'environment-local' : 'external-declared',
    args, sharedMutation, safeAuto: true, safeHandler, evidenceId, jsonAssertion, stages,
    actionId: action.id, registryVersion: FINISH_ACTION_REGISTRY_VERSION, planSource: 'registry',
  };
}

function resolveContext({ root, action, context }) {
  const command = inferredCli(root, context);
  if (!command) return { missing: ['cliSource'] };
  return { plan: executablePlan({ root, action, command, args: ['worktree', 'context', '--target', path.resolve(root), '--json'], safeHandler: 'buildr-worktree-context', evidenceId: 'registry-context-ready', jsonAssertion: action.resultContract.jsonAssertion }) };
}

function resolveOpenSpecConvergence({ root, run, action, context }) {
  const command = inferredCli(root, context);
  const missing = [...(!command ? ['cliSource'] : []), ...(!context.project ? ['project'] : []), ...(!run.change ? ['change'] : [])];
  if (missing.length) return { missing };
  return { plan: executablePlan({
    root, action, command, sharedMutation: true, safeHandler: 'buildr-openspec-converge', evidenceId: `registry-openspec-${run.change}`,
    args: ['openspec', 'converge', run.change, '--project', context.project, '--target', path.resolve(root), '--json'],
  }) };
}

function resolveRuntimeConvergence({ root, action, context }) {
  const command = inferredCli(root, context);
  const missing = [...(!command ? ['cliSource'] : []), ...(!context.agent ? ['agent'] : [])];
  if (missing.length) return { missing };
  const child = (id, args, safeHandler) => executablePlan({ root, action, command, args, safeHandler, evidenceId: id, sharedMutation: args[0] === 'sync' });
  return { plan: executablePlan({
    root, action, command, args: [], sharedMutation: true, safeHandler: 'runtime-convergence', evidenceId: `registry-runtime-${context.agent}`,
    stages: [
      { id: 'doctor-before', commands: [child('doctor-before', ['doctor', '--agent', context.agent, '--target', path.resolve(root), '--json'], 'buildr-doctor')] },
      { id: 'runtime-sync', commands: [child('runtime-sync', ['sync', context.agent, '--target', path.resolve(root)], 'buildr-runtime-sync')] },
      { id: 'doctor-after', commands: [child('doctor-after', ['doctor', '--agent', context.agent, '--target', path.resolve(root), '--json'], 'buildr-doctor')] },
    ],
  }) };
}

function fingerprint({ run, action, plan, context }) {
  return `registry-v${FINISH_ACTION_REGISTRY_VERSION}-${crypto.createHash('sha256').update(JSON.stringify({
    run: { runId: run.runId, task: run.task, change: run.change, target: run.target }, action: action.id, plan, context,
  })).digest('hex').slice(0, 24)}`;
}

export function listFinishActions() {
  return { schemaVersion: FINISH_ACTION_REGISTRY_SCHEMA, registryVersion: FINISH_ACTION_REGISTRY_VERSION, actions: FINISH_ACTIONS.map(publicAction) };
}

export function resolveFinishAction({ root, run, step, context = {}, actions = FINISH_ACTIONS }) {
  const matches = actions.filter((entry) => entry.step === step);
  if (matches.length !== 1) return {
    schemaVersion: 'buildr.task-finish-action-resolution/v1', registryVersion: FINISH_ACTION_REGISTRY_VERSION,
    status: 'agent-reasoning-required', step, reason: matches.length ? 'ambiguous-registry-match' : 'registry-action-uncovered',
    checkedActionIds: matches.map((entry) => entry.id), unexecutedEffects: matches.flatMap((entry) => entry.effects),
  };
  const action = matches[0];
  if (action.kind === 'agent-provider') return {
    schemaVersion: 'buildr.task-finish-action-resolution/v1', registryVersion: FINISH_ACTION_REGISTRY_VERSION,
    status: 'agent-provider-required', step, action: publicAction(action), providerHandoff: action.providerHandoff, planSource: 'registry',
  };
  const resolved = action.resolver({ root, run, action, context });
  if (resolved.missing?.length) return {
    schemaVersion: 'buildr.task-finish-action-resolution/v1', registryVersion: FINISH_ACTION_REGISTRY_VERSION,
    status: 'input-required', step, action: publicAction(action), requiredInputs: [...new Set(resolved.missing)], planSource: 'registry',
  };
  return {
    schemaVersion: 'buildr.task-finish-action-resolution/v1', registryVersion: FINISH_ACTION_REGISTRY_VERSION,
    status: 'ready', step, action: publicAction(action), plan: resolved.plan,
    fingerprint: fingerprint({ run, action, plan: resolved.plan, context }), planSource: 'registry',
  };
}
