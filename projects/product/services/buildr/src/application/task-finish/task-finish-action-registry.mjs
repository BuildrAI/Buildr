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

const executableProvider = (entry) => actionEntry({
  kind: 'provider-executable', applicability: 'selected-provider-with-product-handler',
  fallbackPolicy: 'agent-provider-required-on-provider-semantic-branch',
  ...entry,
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
    effects: [], requiredContext: ['cliInvocation'],
    resultContract: { outcome: ['passed', 'blocked'], jsonAssertion: { path: 'executionReady', equals: true } },
    evidenceProjection: { finishStep: 'context', required: ['execution binding', 'CLI identity', 'runtime identity'] },
    resolver: resolveContext,
  }),
  provider('current-knowledge', 'buildr.current-knowledge-maintenance@1', 'inspect', 'task-checkout', ['status', 'impacts', 'treeIdentity']),
  actionEntry({
    id: 'contract-convergence.openspec', step: 'contract-convergence', kind: 'product-executable',
    effects: ['canonical-spec-sync', 'archive-change', 'convergence-receipt'], requiredContext: ['cliInvocation', 'project'],
    resultContract: { outcome: ['passed', 'blocked'], processExit: 0, blockedStatuses: ['blocked', 'recovery-unprovable'], blockedReasons: ['semantic-resolution-required', 'recovery-unprovable'] },
    evidenceProjection: { finishStep: 'contract-convergence', required: ['status', 'receipt identity', 'disposition', 'duration', 'command count', 'recovery classification'] },
    fallbackPolicy: 'product-recovery-then-agent-semantic-or-evidence-repair',
    resolver: resolveOpenSpecConvergence,
  }),
  provider('candidate-commit', 'buildr.git-task-integration@1', 'commit-candidate', 'task-checkout', ['candidate commit', 'tree identity'], ['git-commit']),
  provider('target-convergence', 'buildr.git-task-integration@1', 'converge-target', 'task-checkout', ['target observation', 'candidate identity'], ['fetch', 'rebase']),
  actionEntry({
    id: 'runtime-convergence.doctor-sync', step: 'runtime-convergence', kind: 'product-executable',
    effects: ['runtime-projection-sync'], requiredContext: ['cliInvocation', 'agent'],
    resultContract: { outcome: ['passed', 'blocked'], processExit: 0 },
    evidenceProjection: { finishStep: 'runtime-convergence', required: ['doctor result', 'sync result'] },
    resolver: resolveRuntimeConvergence,
  }),
  executableProvider({
    id: 'formal-assurance.verification', step: 'formal-assurance', executionSurface: 'task-checkout',
    effects: ['verification-local-temporary'], requiredContext: ['cliInvocation', 'project', 'candidateIdentity'],
    resultContract: { outcome: ['passed', 'blocked'], processExit: 0, requiredFields: ['schemaVersion', 'status', 'evidenceIdentity', 'evidenceLifecycle'], status: 'passed' },
    evidenceProjection: { finishStep: 'formal-assurance', required: ['candidate identity', 'verification summary', 'evidence lifecycle'] },
    providerHandoff: { capability: 'buildr.task-verification@2', provider: null, action: 'verify-required', requiredEvidence: ['candidate identity', 'verification summary'] },
    resolver: resolveFormalAssurance,
  }),
  provider('asset-review', 'buildr.task-asset-review@3', 'finalize', 'task-checkout', ['review status', 'observation revision']),
  actionEntry({
    id: 'archive.legacy-provider', step: 'archive', kind: 'agent-provider', applicability: 'legacy-finish-run-only', executionSurface: 'retained-checkout',
    legacy: true,
    effects: ['archive-change'], resultContract: { outcome: ['passed', 'blocked'], evidence: ['archive path', 'post-sync result'] },
    evidenceProjection: { finishStep: 'archive', required: ['archive path', 'post-sync result'] },
    fallbackPolicy: 'legacy-run-provider-only',
    providerHandoff: { capability: null, provider: 'openspec-archive-change', action: 'archive', requiredEvidence: ['archive path', 'post-sync result'] },
  }),
  provider('integration-push', 'buildr.git-task-integration@1', 'integrate-and-push', 'retained-checkout', ['ref transition'], ['merge-or-fast-forward', 'push']),
  actionEntry({
    id: 'retained-convergence.impact-aware', step: 'retained-convergence', kind: 'product-executable', executionSurface: 'retained-checkout',
    effects: ['runtime-projection-sync'], requiredContext: ['retainedWorkspaceRoot', 'retainedCliInvocation', 'agent', 'changedPaths'],
    resultContract: { outcome: ['passed', 'blocked'], processExit: 0 },
    evidenceProjection: { finishStep: 'retained-convergence', required: ['retained identity', 'impact classification', 'doctor result', 'sync applicability'] },
    resolver: resolveRetainedConvergence,
  }),
  executableProvider({
    id: 'runtime-install.receipt-bound', step: 'runtime-install', executionSurface: 'retained-checkout',
    effects: ['runtime-install'], requiredContext: ['retainedWorkspaceRoot', 'retainedCliInvocation', 'retainedRuntimeIdentity', 'changedPaths'],
    resultContract: { outcome: ['passed', 'blocked'], processExit: 0 },
    evidenceProjection: { finishStep: 'runtime-install', required: ['retained impact', 'runtime identity', 'not-applicable reasons'] },
    providerHandoff: { capability: 'buildr.task-finish@1', provider: 'task-finish', action: 'install-affected-retained-entrypoints', requiredEvidence: ['retained impact', 'runtime identity', 'not-applicable reasons'] },
    resolver: resolveRuntimeInstall,
  }),
  provider('asset-review-late', 'buildr.task-asset-review@3', 'finalize-if-revised', 'retained-checkout', ['review status', 'observation revision']),
  provider('cleanup', 'buildr.task-worktree-lifecycle@2', 'cleanup', 'retained-checkout', ['cleanup readiness', 'durable receipt'], ['local-environment-cleanup']),
]);

function publicAction(entry) {
  const { resolver, ...value } = entry;
  return value;
}

function declaredCliInvocation(context) {
  if (context.cliInvocation?.command) {
    return {
      command: path.resolve(context.cliInvocation.command),
      argsPrefix: [...(context.cliInvocation.argsPrefix || [])],
    };
  }
  if (context.cliSource) return { command: path.resolve(context.cliSource), argsPrefix: [] };
  return null;
}

function executablePlan({ root, action, command, args, safeHandler, evidenceId, sharedMutation = false, jsonAssertion = null, jsonRequired = [], stages = [] }) {
  return {
    cwd: path.resolve(root), command, commandSource: path.resolve(command).startsWith(`${path.resolve(root)}${path.sep}`) ? 'environment-local' : 'external-declared',
    args, sharedMutation, safeAuto: true, safeHandler, evidenceId, jsonAssertion, jsonRequired, stages,
    actionId: action.id, registryVersion: FINISH_ACTION_REGISTRY_VERSION, planSource: 'registry',
  };
}

function resolveContext({ root, action, context }) {
  const invocation = declaredCliInvocation(context);
  if (!invocation) return { missing: ['cliInvocation'] };
  return { plan: executablePlan({ root, action, command: invocation.command, args: [...invocation.argsPrefix, 'worktree', 'context', '--target', path.resolve(root), '--json'], safeHandler: 'buildr-worktree-context', evidenceId: 'registry-context-ready', jsonAssertion: action.resultContract.jsonAssertion }) };
}

function resolveOpenSpecConvergence({ root, run, action, context }) {
  const invocation = declaredCliInvocation(context);
  const missing = [...(!invocation ? ['cliInvocation'] : []), ...(!context.project ? ['project'] : []), ...(!run.change ? ['change'] : [])];
  if (missing.length) return { missing };
  return { plan: executablePlan({
    root, action, command: invocation.command, sharedMutation: true, safeHandler: 'buildr-openspec-converge', evidenceId: `registry-openspec-${run.change}`,
    args: [...invocation.argsPrefix, 'openspec', 'converge', run.change, '--project', context.project, '--target', path.resolve(root), '--json'],
  }) };
}

function resolveRuntimeConvergence({ root, action, context }) {
  const invocation = declaredCliInvocation(context);
  const missing = [...(!invocation ? ['cliInvocation'] : []), ...(!context.agent ? ['agent'] : [])];
  if (missing.length) return { missing };
  const child = (id, args, safeHandler) => executablePlan({ root, action, command: invocation.command, args: [...invocation.argsPrefix, ...args], safeHandler, evidenceId: id, sharedMutation: args[0] === 'sync' });
  return { plan: executablePlan({
    root, action, command: invocation.command, args: [...invocation.argsPrefix], sharedMutation: true, safeHandler: 'runtime-convergence', evidenceId: `registry-runtime-${context.agent}`,
    stages: [
      { id: 'doctor-before', commands: [child('doctor-before', ['doctor', '--agent', context.agent, '--target', path.resolve(root), '--json'], 'buildr-doctor')] },
      { id: 'runtime-sync', commands: [child('runtime-sync', ['sync', context.agent, '--target', path.resolve(root)], 'buildr-runtime-sync')] },
      { id: 'doctor-after', commands: [child('doctor-after', ['doctor', '--agent', context.agent, '--target', path.resolve(root), '--json'], 'buildr-doctor')] },
    ],
  }) };
}

function resolveFormalAssurance({ root, run, action, context }) {
  const invocation = declaredCliInvocation(context);
  const missing = [...(!invocation ? ['cliInvocation'] : []), ...(!context.project ? ['project'] : []), ...(!context.candidateIdentity ? ['candidateIdentity'] : [])];
  if (missing.length) return { missing };
  const level = context.requiredAssurance === 'candidate' ? 'candidate' : 'affected';
  const args = [...invocation.argsPrefix, 'verification', 'run', '--project', context.project, '--level', level, '--target', path.resolve(root), '--candidate-fingerprint', context.candidateIdentity, '--json'];
  if (run.task && context.agent) args.push('--environment', run.task, '--owner', context.agent);
  return { fingerprint: context.candidateIdentity, plan: executablePlan({
    root, action, command: invocation.command, args, safeHandler: 'buildr-verification-run', evidenceId: `registry-verification-${context.candidateIdentity}`,
    jsonAssertion: { path: 'status', equals: 'passed' }, jsonRequired: action.resultContract.requiredFields,
  }) };
}

const stripProductPrefix = (value) => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^projects\/product\//, '');

export function classifyRetainedConvergencePaths(paths = []) {
  const result = { runtime: [], cli: [], localApp: [], unknown: [] };
  const normalized = [...new Set(paths.map(stripProductPrefix).filter(Boolean))].sort();
  const runtimePattern = /^(?:rules\/|skills\/|components\/|commands\/|capabilities\.yml$|commands\.yml$|services\/buildr\/package\/targets\/workspace\/|services\/buildr\/package\/manifest\.yml$)/;
  const cliPattern = /^(?:buildr$|services\/buildr\/(?:bin\/|src\/.*\.mjs$|scripts\/(?:install|uninstall)-buildr-cli$|package\.json$|package-lock\.json$))/;
  const localAppPattern = /^services\/buildr\/(?:src\/interfaces\/local-app\/(?:runtime|http)\/|src\/application\/local-app|scripts\/(?:install|uninstall)-local-app)/;
  for (const candidate of normalized) {
    let matched = false;
    if (runtimePattern.test(candidate)) { result.runtime.push(candidate); matched = true; }
    if (cliPattern.test(candidate)) { result.cli.push(candidate); matched = true; }
    if (localAppPattern.test(candidate)) { result.localApp.push(candidate); matched = true; }
    if (!matched) result.unknown.push(candidate);
  }
  return { ...result, requiresRuntimeSync: result.runtime.length > 0, requiresCliInstall: result.cli.length > 0, requiresLocalAppInstall: result.localApp.length > 0 };
}

function resolveRetainedConvergence({ root, action, context }) {
  const retainedRoot = context.retainedWorkspaceRoot ? path.resolve(context.retainedWorkspaceRoot) : null;
  const invocation = context.retainedCliInvocation?.command ? {
    command: path.resolve(context.retainedCliInvocation.command), argsPrefix: [...(context.retainedCliInvocation.argsPrefix || [])],
  } : null;
  const changedPaths = Array.isArray(context.changedPaths) && context.changedPaths.every((entry) => typeof entry === 'string') ? context.changedPaths : null;
  const missing = [...(!retainedRoot ? ['retainedWorkspaceRoot'] : []), ...(!invocation ? ['retainedCliInvocation'] : []), ...(!context.agent ? ['agent'] : []), ...(!changedPaths ? ['changedPaths'] : [])];
  if (missing.length) return { missing };
  const impact = classifyRetainedConvergencePaths(changedPaths);
  const child = (id, args, safeHandler, jsonAssertion = null) => executablePlan({
    root, action, command: invocation.command, args: [...invocation.argsPrefix, ...args], safeHandler, evidenceId: id, jsonAssertion,
  });
  const stages = impact.requiresRuntimeSync ? [
    { id: 'retained-doctor-before', commands: [child('retained-doctor-before', ['doctor', '--agent', context.agent, '--target', retainedRoot, '--json'], 'buildr-doctor')] },
    { id: 'retained-runtime-sync', commands: [child('retained-runtime-sync', ['sync', context.agent, '--target', retainedRoot], 'buildr-runtime-sync')] },
    { id: 'retained-doctor-after', commands: [child('retained-doctor-after', ['doctor', '--agent', context.agent, '--target', retainedRoot, '--json'], 'buildr-doctor', { path: 'health.ready', equals: true })] },
  ] : [
    { id: 'retained-doctor', commands: [child('retained-doctor', ['doctor', '--agent', context.agent, '--target', retainedRoot, '--json'], 'buildr-doctor', { path: 'health.ready', equals: true })] },
  ];
  return { plan: {
    ...executablePlan({ root, action, command: invocation.command, args: invocation.argsPrefix, sharedMutation: impact.requiresRuntimeSync, safeHandler: 'retained-convergence', evidenceId: `registry-retained-${context.agent}`, stages }),
    metadata: { retainedWorkspaceRoot: retainedRoot, changedPaths: [...new Set(changedPaths)].sort(), impact, skipReasons: {
      runtimeSync: impact.requiresRuntimeSync ? null : 'runtime-assets-not-affected',
      cliInstall: impact.requiresCliInstall ? null : 'default-cli-not-affected',
      localAppInstall: impact.requiresLocalAppInstall ? null : 'local-app-entry-not-affected',
    } },
  } };
}

function resolveRuntimeInstall({ root, action, context }) {
  const retainedRoot = context.retainedWorkspaceRoot ? path.resolve(context.retainedWorkspaceRoot) : null;
  const invocation = context.retainedCliInvocation?.command ? { command: path.resolve(context.retainedCliInvocation.command), argsPrefix: [...(context.retainedCliInvocation.argsPrefix || [])] } : null;
  const identity = context.retainedRuntimeIdentity;
  const changedPaths = Array.isArray(context.changedPaths) && context.changedPaths.every((entry) => typeof entry === 'string') ? context.changedPaths : null;
  const missing = [...(!retainedRoot ? ['retainedWorkspaceRoot'] : []), ...(!invocation ? ['retainedCliInvocation'] : []), ...(!identity ? ['retainedRuntimeIdentity'] : []), ...(!changedPaths ? ['changedPaths'] : [])];
  if (missing.length) return { missing };
  const expectedSource = path.join(retainedRoot, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
  const nodeExecutable = path.resolve(identity.nodeExecutable || '');
  const cliSource = path.resolve(identity.cliSource || '');
  const targetRoot = path.resolve(identity.targetRoot || '');
  const invocationSource = invocation.argsPrefix[0] ? path.resolve(invocation.argsPrefix[0]) : null;
  if (!nodeExecutable || !fs.existsSync(nodeExecutable) || invocation.command !== nodeExecutable || cliSource !== expectedSource || invocationSource !== cliSource || targetRoot !== retainedRoot || !Number.isInteger(identity.nodeMajor) || identity.nodeMajor < 20) {
    return { handoff: { reason: 'retained-runtime-identity-mismatch', requiredEvidence: ['node executable', 'node major >= 20', 'retained CLI source', 'retained target identity'] } };
  }
  const impact = classifyRetainedConvergencePaths(changedPaths);
  if (impact.requiresLocalAppInstall) return { handoff: { reason: 'local-app-install-has-no-stable-product-handler', requiredEvidence: action.providerHandoff.requiredEvidence } };
  const nodeProbe = executablePlan({ root: retainedRoot, action, command: nodeExecutable, args: ['-e', 'process.stdout.write(JSON.stringify({nodeExecutable:process.execPath,nodeMajor:Number(process.versions.node.split(".")[0])}))'], safeHandler: 'node-runtime-identity', evidenceId: 'retained-node-identity', jsonAssertion: { path: 'nodeMajor', equals: identity.nodeMajor }, jsonRequired: ['nodeExecutable', 'nodeMajor'] });
  const stages = [{ id: 'runtime-identity-before', commands: [nodeProbe] }];
  if (impact.requiresCliInstall) {
    const installer = path.join(retainedRoot, 'projects', 'product', 'services', 'buildr', 'scripts', 'install-buildr-cli');
    const installArgs = ['--node-executable', nodeExecutable];
    if (context.cliInstallDir) installArgs.push('--install-dir', path.resolve(context.cliInstallDir));
    stages.push({ id: 'default-cli-install', commands: [executablePlan({ root: retainedRoot, action, command: installer, args: installArgs, safeHandler: 'buildr-cli-install', evidenceId: 'retained-cli-install', sharedMutation: true })] });
    stages.push({ id: 'installed-cli-check', commands: [executablePlan({ root: retainedRoot, action, command: nodeExecutable, args: [cliSource, 'version', '--json'], safeHandler: 'buildr-cli-version', evidenceId: 'retained-cli-version', jsonRequired: ['schemaVersion', 'version'] })] });
  }
  return { plan: { ...executablePlan({ root: retainedRoot, action, command: nodeExecutable, args: [], safeHandler: 'runtime-install', evidenceId: `registry-runtime-install-${identity.nodeMajor}`, sharedMutation: impact.requiresCliInstall, stages }), metadata: { retainedWorkspaceRoot: retainedRoot, impact, identity: { nodeExecutable, nodeMajor: identity.nodeMajor, cliSource, targetRoot }, skipReasons: { cliInstall: impact.requiresCliInstall ? null : 'default-cli-not-affected', localAppInstall: 'local-app-not-affected' } } } };
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
  if (resolved.handoff) return {
    schemaVersion: 'buildr.task-finish-action-resolution/v1', registryVersion: FINISH_ACTION_REGISTRY_VERSION,
    status: 'agent-provider-required', step, action: publicAction(action), providerHandoff: { ...action.providerHandoff, ...resolved.handoff }, planSource: 'registry',
  };
  if (resolved.missing?.length) return {
    schemaVersion: 'buildr.task-finish-action-resolution/v1', registryVersion: FINISH_ACTION_REGISTRY_VERSION,
    status: 'input-required', step, action: publicAction(action), requiredInputs: [...new Set(resolved.missing)], planSource: 'registry',
  };
  return {
    schemaVersion: 'buildr.task-finish-action-resolution/v1', registryVersion: FINISH_ACTION_REGISTRY_VERSION,
    status: 'ready', step, action: publicAction(action), plan: resolved.plan,
    fingerprint: resolved.fingerprint || fingerprint({ run, action, plan: resolved.plan, context }), planSource: 'registry',
  };
}
