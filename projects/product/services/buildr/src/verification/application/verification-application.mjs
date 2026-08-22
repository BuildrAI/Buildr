import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSourceRoot } from '../../workspace/domain/source-root.mjs';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';
import { parseProjectVerification, validateProjectVerification } from './project-verification-diagnostics.mjs';
import {
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
} from '../../task/domain/project-environment-preparation.mjs';
import { runVerificationCapabilities } from '../infrastructure/capability-runner.mjs';
import { verificationPreparationAdmission } from '../infrastructure/preparation-admission.mjs';
import { executeVerificationCommand } from '../infrastructure/process-executor.mjs';
import { createVerificationResourceCoordinator, resolveVerificationCoordinationRoot } from '../infrastructure/resource-coordinator.mjs';
import { cleanupAbsentVerificationEvidence, cleanupVerificationEvidence, createVerificationEvidenceLifecycle } from '../infrastructure/evidence-lifecycle.mjs';
import {
  VERIFICATION_EXECUTION_RECORD_KIND,
  VERIFICATION_EXECUTION_RECORD_OWNER,
  VERIFICATION_EXECUTION_RECORD_PRODUCER,
  createVerificationExecutionRecordFiles,
  publicVerificationExecutionRecord,
  verificationExecutionRecordOutcome,
  verificationInvocationIdentity,
} from '../infrastructure/execution-record.mjs';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')}`;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function sameFilesystemPath(left, right) {
  if (!left || !right) return false;
  const canonical = (value) => {
    try { return fs.realpathSync(path.resolve(value)); } catch { return path.resolve(value); }
  };
  return canonical(left) === canonical(right);
}

function readPreparationDeclaration(projectRoot, projectCode, services) {
  const declarationPath = path.join(projectRoot, 'preparation.yml');
  if (!fs.existsSync(declarationPath)) return null;
  return normalizeProjectEnvironmentPreparation(
    parseProjectEnvironmentPreparation(fs.readFileSync(declarationPath, 'utf8'), declarationPath),
    { projectCode, services: Object.keys(services) },
  );
}

function formalExecutionEnvironment(context, resourceEnvironment) {
  const env = { ...process.env, ...resourceEnvironment };
  if (context?.runtimeInvocation?.kind === 'node') {
    env.BUILDR_NODE = context.runtimeInvocation.executable;
    env.PATH = [context.runtimeInvocation.searchPrefix, process.env.PATH].filter(Boolean).join(path.delimiter);
  }
  return env;
}

function admissionError(code, message, category, owner, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.verificationAdmission = {
    status: 'blocked',
    identity: null,
    binding: null,
    requirements: [],
    gaps: [{ category, owner, recoverable: false, diagnostic: message, ...details }],
    recovery: null,
  };
  return error;
}

function runVerificationThroughRetainedController(context, args) {
  const invocation = context?.controllerInvocation;
  if (!invocation?.command || !Array.isArray(invocation.argsPrefix)) {
    const error = new Error('Task Environment Receipt 未提供可执行的 retained controller invocation。');
    error.code = 'verification.retained_controller_missing';
    throw error;
  }
  const result = spawnSync(invocation.command, [...invocation.argsPrefix, 'verification', 'run', ...args], {
    cwd: context.workspaceRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
  if (!args.includes('--json')) return null;
  try { return JSON.parse(result.stdout); }
  catch {
    const error = new Error('Retained controller 未返回合法 Verification JSON。');
    error.code = 'verification.retained_controller_invalid_output';
    throw error;
  }
}

function gitOutput(cwd, args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

function gitPathList(cwd, args) {
  return (gitOutput(cwd, args) || '').split('\0').filter(Boolean).sort();
}

function filesystemSnapshot(root) {
  const entries = [];
  const visit = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) entries.push([relative, 'symlink', fs.readlinkSync(file)]);
      else if (stat.isDirectory()) {
        entries.push([relative, 'directory']);
        visit(file);
      } else if (stat.isFile()) entries.push([relative, 'file', digest(fs.readFileSync(file))]);
      else entries.push([relative, 'other', stat.mode]);
    }
  };
  visit(root);
  return entries;
}

function executionContentObservation(root) {
  const top = gitOutput(root, ['rev-parse', '--show-toplevel'])?.trim();
  if (!top) {
    const snapshot = filesystemSnapshot(root);
    return {
      kind: 'filesystem',
      root,
      changedPaths: snapshot.map(([relative]) => relative),
      fingerprint: digest(snapshot),
      reusable: false,
    };
  }
  const status = gitOutput(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']) || '';
  const diff = gitOutput(root, ['diff', '--binary', 'HEAD', '--']) || '';
  const changedPaths = [...new Set([
    ...gitPathList(root, ['diff', '--name-only', '-z', 'HEAD', '--']),
    ...gitPathList(root, ['ls-files', '--others', '--exclude-standard', '-z', '--']),
  ])];
  const untracked = changedPaths.filter((relative) => status.split('\0').some((line) => line === `?? ${relative}`));
  const untrackedContent = untracked.map((relative) => {
    const file = path.join(top, relative);
    try { return [relative, fs.statSync(file).isFile() ? digest(fs.readFileSync(file)) : 'non-file']; } catch { return [relative, 'missing']; }
  });
  return {
    kind: 'git-worktree',
    root: path.resolve(top),
    head: gitOutput(root, ['rev-parse', 'HEAD'])?.trim() || null,
    tree: gitOutput(root, ['rev-parse', 'HEAD^{tree}'])?.trim() || null,
    changedPaths,
    fingerprint: digest({ status, diff, untrackedContent }),
    reusable: false,
  };
}

function targetDriftSummary(before, after) {
  if (!before || !after || before.fingerprint === after.fingerprint) return null;
  const beforePaths = new Set(before.changedPaths || []);
  const afterPaths = new Set(after.changedPaths || []);
  return {
    beforeFingerprint: before.fingerprint,
    afterFingerprint: after.fingerprint,
    addedPaths: [...afterPaths].filter((value) => !beforePaths.has(value)),
    removedPaths: [...beforePaths].filter((value) => !afterPaths.has(value)),
    statusChanged: before.status !== after.status,
  };
}

function optionValues(args, option) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== option) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    values.push(value);
    index += 1;
  }
  return values;
}

function executionCheck(result) {
  return {
    id: result.id,
    title: result.title,
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal || null,
    durationMs: Math.round(result.durationMs || 0),
    queuedAt: result.queuedAt || null,
    startedAt: result.startedAt || null,
    finishedAt: result.finishedAt || null,
    queueDurationMs: result.queueDurationMs || 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    resourceCoordination: result.resourceCoordination || null,
  };
}

function publicFailureSummary(check) {
  if (check.status !== 'failed') return null;
  const outcome = check.signal
    ? `signal ${check.signal}`
    : Number.isInteger(check.exitCode) ? `exit code ${check.exitCode}` : 'a non-passing process outcome';
  return {
    code: 'verification.capability_failed',
    message: `Capability ${check.id} failed with ${outcome}.`,
  };
}

function publicCheck(check) {
  return {
    id: check.id,
    title: check.title,
    status: check.status,
    exitCode: check.exitCode,
    signal: check.signal,
    durationMs: check.durationMs,
    queuedAt: check.queuedAt,
    startedAt: check.startedAt,
    finishedAt: check.finishedAt,
    queueDurationMs: check.queueDurationMs,
    resourceCoordination: check.resourceCoordination,
    failureSummary: publicFailureSummary(check),
  };
}

export function verificationExecutionIdentityMaterial({ project, declaration, target, context, observation, checks }) {
  return {
    schemaVersion: PUBLIC_JSON_SCHEMAS.verificationExecution,
    project,
    declaration,
    target,
    environment: context ? {
      taskId: context.taskId,
      environmentRoot: context.environmentRoot,
      workspaceRoot: context.workspaceRoot,
      scopes: context.scopes.map((scope) => ({
        selector: scope.selector,
        executionRoot: scope.executionRoot,
        runtimeIdentity: scope.runtime.identity,
        cliIdentity: scope.cli.identity,
        dependenciesIdentity: (scope.preparation || scope.dependencies).identity,
        projectionIdentity: scope.projection.identity,
      })),
    } : null,
    observation,
    checks: checks.map((check) => ({ id: check.id, status: check.status, exitCode: check.exitCode })),
  };
}

export function registerVerificationApplication(runtime) {
  async function verificationRun(args) {
    const json = args.includes('--json');
    const projectCode = runtime.optionValue(args, '--project', null);
    const targetIdentity = runtime.optionValue(args, '--target-identity', null);
    const targetRoot = fs.realpathSync(path.resolve(runtime.optionValue(args, '--target', process.cwd())));
    const requestedCapabilities = [...new Set(optionValues(args, '--capability'))];
    const requestedEnvironment = runtime.optionValue(args, '--environment', null);
    const requestedWorkspace = runtime.optionValue(args, '--workspace', null);
    const authorizedCapabilities = [...new Set(optionValues(args, '--authorize-capability'))];
    const authorizedResources = optionValues(args, '--authorize-resource');
    const concurrency = Number(runtime.optionValue(args, '--concurrency', '4'));
    const retry = args.includes('--retry');
    if (args.includes('--declaration-root')) {
      const error = new Error('--declaration-root 仅用于 buildr task verification record；verification run 与 inspect 都不重新观察 declaration source。');
      error.code = 'verification.run_declaration_root_unsupported';
      throw error;
    }
    runtime.assertNoUnknownOptions(args, new Set(['--project', '--capability', '--target-identity', '--target', '--environment', '--workspace', '--authorize-capability', '--authorize-resource', '--concurrency', '--retry', '--json']), new Set(['--retry', '--json']));
    if (runtime.positionalArgs(args).length) throw new Error('verification run does not accept positional arguments.');
    if (!projectCode) throw new Error('verification run requires --project <code>.');
    if (requestedCapabilities.length === 0) throw new Error('verification run requires at least one --capability <id>.');
    if (!targetIdentity) throw new Error('verification run requires --target-identity <identity>.');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('--concurrency must be an integer from 1 to 32.');
    for (const id of authorizedCapabilities) if (!requestedCapabilities.includes(id)) throw new Error(`Authorized capability was not requested: ${id}`);

    const registry = runtime.readProjectRegistryPersistence(targetRoot).registry.projects;
    const project = registry[projectCode];
    if (!project) throw new Error(`Project is not registered in projects/manifest.yml: ${projectCode}`);
    const projectRoot = fs.realpathSync(resolveSourceRoot(targetRoot, project.source));
    if (project.source.root !== 'attached' && !inside(targetRoot, projectRoot)) throw new Error(`Managed Project source escapes the execution Workspace: ${project.source.path}`);
    const declarationPath = path.join(projectRoot, 'verification.yml');
    if (!fs.existsSync(declarationPath)) throw admissionError('verification.coverage_gap', `Project verification declaration is missing: ${path.relative(targetRoot, declarationPath)}`, 'coverage', 'task-verification', { project: projectCode });
    const declarationContent = fs.readFileSync(declarationPath);
    const declaration = parseProjectVerification(declarationContent.toString('utf8'), declarationPath);
    const services = runtime.readServiceRegistryPersistence(targetRoot, project, project.workspaceId).registry.services;
    const hasPreparationReferences = declaration.capabilities?.some((capability) => (capability.environment?.preparation || []).length > 0);
    const preparationDeclaration = hasPreparationReferences ? readPreparationDeclaration(projectRoot, projectCode, services) : null;
    const validationErrors = validateProjectVerification(declaration, {
      projectCode,
      services: Object.keys(services),
      ...(hasPreparationReferences ? { preparationRecipes: (preparationDeclaration?.recipes || []).map((recipe) => [recipe.id, recipe]) } : {}),
    });
    if (validationErrors.length) throw admissionError('verification.declaration_invalid', `Project verification declaration is invalid:\n- ${validationErrors.join('\n- ')}`, 'declaration-invalid', 'project-verification-declaration', { project: projectCode });

    if (Boolean(requestedEnvironment) !== Boolean(requestedWorkspace)) throw new Error('Task Environment verification requires --environment <task-id> and --workspace <canonical-workspace> together.');
    const canonicalWorkspace = requestedWorkspace ? path.resolve(requestedWorkspace) : null;
    let context = requestedEnvironment
      ? runtime.withWorkspaceStructuredStoreReadCompatibility(canonicalWorkspace, () => runtime.resolveTaskEnvironmentExecution(canonicalWorkspace, requestedEnvironment))
      : null;
    if (context && !context.ready) throw new Error(context.blocked?.message || 'Requested Task Environment binding is not ready.');
    if (context && !context.allowedExecutionRoots.some((root) => inside(root, targetRoot))) throw new Error('Verification target is outside the requested Task Environment execution roots.');
    if (context?.controllerInvocation?.sourceRoot && !sameFilesystemPath(runtime.productRoot(), context.controllerInvocation.sourceRoot)) {
      const execute = runtime.runVerificationThroughRetainedController || runVerificationThroughRetainedController;
      return execute(context, args);
    }
    const byId = new Map(declaration.capabilities.map((capability) => [capability.id, capability]));
    const selected = requestedCapabilities.map((id) => {
      const capability = byId.get(id);
      if (!capability) throw admissionError('verification.coverage_gap', `Project verification capability is not declared: ${id}`, 'coverage', 'task-verification', { project: projectCode, capability: id });
      if (capability.invocation.kind !== 'command') throw new Error(`Project verification capability requires bounded Agent execution and cannot be run by the command runner: ${id}`);
      if (capability.effects?.authorization === 'explicit' && !authorizedCapabilities.includes(id)) throw admissionError('verification.authorization_blocked', `Explicit authorization is required for verification capability effects: ${id}`, 'authorization', 'user-authorization', { project: projectCode, capability: id });
      const executionCwd = path.resolve(projectRoot, capability.invocation.cwd || '.');
      if (!inside(projectRoot, executionCwd) || !fs.existsSync(executionCwd)) throw new Error(`Verification command cwd is unavailable or escapes Project: ${id}`);
      return {
        ...capability,
        command: { argv: capability.invocation.argv, cwd: capability.invocation.cwd || '.' },
        executionCwd,
      };
    });

    const declarationIdentity = digest(declarationContent);
    let admission = verificationPreparationAdmission({ projectCode, declarationIdentity, selectedCapabilities: selected, context });
    if (admission.status !== 'ready') {
      const error = new Error('Formal Verification preparation preflight is blocked; Task Environment must apply the supplied recovery request before execution.');
      error.code = 'verification.preparation_blocked';
      error.verificationAdmission = admission;
      throw error;
    }
    if (context) {
      const refreshedContext = runtime.withWorkspaceStructuredStoreReadCompatibility(canonicalWorkspace, () => runtime.resolveTaskEnvironmentExecution(canonicalWorkspace, requestedEnvironment));
      const refreshedDeclarationIdentity = digest(fs.readFileSync(declarationPath));
      const refreshedAdmission = verificationPreparationAdmission({ projectCode, declarationIdentity: refreshedDeclarationIdentity, selectedCapabilities: selected, context: refreshedContext });
      if (!refreshedContext.ready || refreshedAdmission.status !== 'ready' || refreshedAdmission.identity !== admission.identity) {
        const error = new Error('Verification preparation facts changed before the first formal execution side effect; run preflight again.');
        error.code = 'verification.preparation_drifted';
        error.verificationAdmission = refreshedAdmission;
        throw error;
      }
      context = refreshedContext;
      admission = refreshedAdmission;
    }
    const invocationIdentity = context ? verificationInvocationIdentity({
      taskId: context.taskId,
      projectCode,
      declarationIdentity,
      targetIdentity,
      selectedCapabilities: selected,
    }) : null;
    const runId = `verification-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    let openedExecutionRecord = null;
    if (context) {
      try {
        openedExecutionRecord = runtime.openTaskExecutionRecord(path.resolve(requestedWorkspace), context.taskId, {
          owner: VERIFICATION_EXECUTION_RECORD_OWNER,
          kind: VERIFICATION_EXECUTION_RECORD_KIND,
          runIdentity: runId,
          invocationIdentity,
          targetIdentity,
          producer: VERIFICATION_EXECUTION_RECORD_PRODUCER,
          allowDuplicateInvocation: retry,
        });
      } catch (error) {
        error.verificationExecutionRecord = publicVerificationExecutionRecord('blocked', {
          outcome: 'blocked',
          diagnostic: error,
          nextActions: error.nextAction ? [error.nextAction] : [],
        });
        throw error;
      }
    }
    if (['existing-active', 'existing-terminal'].includes(openedExecutionRecord?.status)) {
      const record = openedExecutionRecord.record;
      const active = openedExecutionRecord.status === 'existing-active';
      const terminalPassed = !active && record.outcome === 'passed' && record.lifecycleStatus !== 'attention';
      const nextActions = [`使用 buildr task execution-record inspect --task ${context.taskId} --record ${record.recordId} 回读已有执行；只有明确需要独立执行时才显式传 --retry。`];
      const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationExecution, {
        operation: 'execute',
        status: active ? 'active' : terminalPassed ? 'passed' : 'failed',
        target: { identity: targetIdentity, stable: null, observation: null, drift: null },
        project: { code: projectCode, root: projectRoot },
        declaration: { path: declarationPath, identity: declarationIdentity },
        environment: { taskId: context.taskId, root: context.environmentRoot, workspaceRoot: context.workspaceRoot },
        selectedCapabilities: selected.map((capability) => ({ id: capability.id, scope: capability.scope, proves: capability.proves, requiredForDelivery: capability.requiredForDelivery, resourceClaims: capability.resourceClaims ?? [] })),
        admission,
        authorization: { capabilities: authorizedCapabilities, resources: [...new Set(authorizedResources)] },
        checks: [],
        durationMs: 0,
        timingSource: active ? 'not-started-existing-active' : 'not-started-existing-terminal',
        startedAt: null,
        finishedAt: null,
        failures: [],
        executionIdentity: null,
        invocationIdentity,
        runId: record.runIdentity,
        run: { id: record.runIdentity },
        executionRecord: publicVerificationExecutionRecord(active ? 'active' : record.lifecycleStatus === 'attention' ? 'attention' : 'retained', {
          record,
          nextActions,
        }),
        evidenceReference: null,
        evidenceLifecycle: null,
        nextActions,
      });
      if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      else console.log(active
        ? `Verification execution already active: ${record.recordId} (${record.runIdentity})`
        : `Verification execution reused terminal record: ${record.recordId} (${record.outcome}/${record.lifecycleStatus})`);
      if (!active && !terminalPassed) process.exitCode = 1;
      return payload;
    }
    if (context) {
      const sideEffectContext = runtime.withWorkspaceStructuredStoreReadCompatibility(canonicalWorkspace, () => runtime.resolveTaskEnvironmentExecution(canonicalWorkspace, requestedEnvironment));
      const sideEffectDeclarationIdentity = digest(fs.readFileSync(declarationPath));
      const sideEffectAdmission = verificationPreparationAdmission({ projectCode, declarationIdentity: sideEffectDeclarationIdentity, selectedCapabilities: selected, context: sideEffectContext });
      if (!sideEffectContext.ready || sideEffectAdmission.status !== 'ready' || sideEffectAdmission.identity !== admission.identity) {
        const error = new Error('Verification preparation facts changed after execution open and before the first capability side effect; no capability process was started.');
        error.code = 'verification.preparation_drifted';
        error.verificationAdmission = sideEffectAdmission;
        error.verificationExecutionRecord = publicVerificationExecutionRecord('attention', {
          record: openedExecutionRecord?.record,
          outcome: 'blocked',
          diagnostic: error,
          nextActions: [`回读 Execution Record ${openedExecutionRecord?.record?.recordId || 'unknown'}，恢复 Environment 后以 --retry 启动独立执行。`],
        });
        throw error;
      }
      context = sideEffectContext;
      admission = sideEffectAdmission;
    }
    const before = executionContentObservation(targetRoot);
    const startedAt = new Date().toISOString();
    const started = process.hrtime.bigint();
    const coordinator = createVerificationResourceCoordinator({
      root: resolveVerificationCoordinationRoot(targetRoot),
      resources: declaration.resources || [],
      owner: {
        workspaceId: runtime.readWorkspacePersistence(targetRoot).metadata.workspace.id,
        projectId: project.id || project.code,
        taskId: context?.taskId || 'retained-workspace',
        environmentId: context?.environmentRoot || targetRoot,
        runId,
      },
    });
    const results = await runVerificationCapabilities(selected, {
      concurrency,
      resourceCoordinator: coordinator,
      authorizedResources,
      execute: (capability, execution) => executeVerificationCommand(capability, { cwd: capability.executionCwd, env: formalExecutionEnvironment(context, execution.resourceEnvironment) }),
    });
    const after = executionContentObservation(targetRoot);
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    const finishedAt = new Date().toISOString();
    const executionChecks = results.map(executionCheck);
    const checks = executionChecks.map(publicCheck);
    const targetStable = digest(before) === digest(after);
    const targetDrift = targetDriftSummary(before, after);
    const passed = targetStable && checks.every((check) => check.status === 'passed');
    const executionRecordOutcome = verificationExecutionRecordOutcome({ passed, checks: executionChecks });
    const identityMaterial = verificationExecutionIdentityMaterial({
      project: projectCode,
      declaration: declarationIdentity,
      target: targetIdentity,
      context,
      observation: after,
      checks,
    });
    const executionIdentity = digest(identityMaterial);
    const base = {
      operation: 'execute',
      status: passed ? 'passed' : 'failed',
      target: { identity: targetIdentity, stable: targetStable, observation: after, drift: targetDrift },
      project: { code: projectCode, root: projectRoot },
      declaration: { path: declarationPath, identity: declarationIdentity },
      environment: context ? { taskId: context.taskId, root: context.environmentRoot, workspaceRoot: context.workspaceRoot, scopes: context.scopes.map((scope) => ({ selector: scope.selector, executionRoot: scope.executionRoot, sourceIdentity: scope.cli.identity, projectionIdentity: scope.projection.identity })), allowedExecutionRoots: context.allowedExecutionRoots } : null,
      selectedCapabilities: selected.map((capability) => ({ id: capability.id, scope: capability.scope, proves: capability.proves, requiredForDelivery: capability.requiredForDelivery, resourceClaims: capability.resourceClaims ?? [] })),
      admission,
      authorization: { capabilities: authorizedCapabilities, resources: [...new Set(authorizedResources)] },
      checks,
      durationMs,
      timingSource: 'wrapper-measured',
      startedAt,
      finishedAt,
      failures: checks.filter((check) => check.status === 'failed').map((check) => check.id),
      executionIdentity,
      invocationIdentity,
      runId,
      run: { id: runId },
    };
    const evidence = createVerificationEvidenceLifecycle(runId);
    let executionRecord = openedExecutionRecord
      ? publicVerificationExecutionRecord('attention', {
        record: openedExecutionRecord.record,
        outcome: executionRecordOutcome,
        diagnostic: { code: 'verification.execution_record_open', message: 'Execution record已open，等待seal。' },
      })
      : publicVerificationExecutionRecord('not-applicable');
    let payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationExecution, { ...base, executionRecord, evidenceReference: evidence.summaryPath, evidenceLifecycle: evidence.lifecycle });
    runtime.atomicWriteFile(evidence.summaryPath, `${JSON.stringify(payload, null, 2)}\n`);
    if (openedExecutionRecord) {
      let sealedExecutionRecord = null;
      try {
        sealedExecutionRecord = runtime.sealTaskExecutionRecord(path.resolve(requestedWorkspace), openedExecutionRecord.record.recordId, {
          outcome: executionRecordOutcome,
          files: createVerificationExecutionRecordFiles({
            runId,
            executionIdentity,
            invocationIdentity,
            context,
            targetRoot,
            targetIdentity,
            targetStable,
            targetDrift,
            before,
            after,
            projectCode,
            declarationPath,
            declarationIdentity,
            selectedCapabilities: selected,
            authorizedCapabilities,
            authorizedResources,
            checks: executionChecks,
            outcome: executionRecordOutcome,
            durationMs,
            startedAt,
            finishedAt,
          }),
        });
        const cleanup = cleanupVerificationEvidence(payload, { removePath: runtime.removePath });
        const cleanupAttention = !cleanup.ok;
        executionRecord = publicVerificationExecutionRecord(cleanupAttention ? 'attention' : 'retained', {
          record: sealedExecutionRecord.record,
          transientCleanup: cleanup,
          diagnostic: cleanupAttention ? { code: cleanup.code, message: cleanup.message } : null,
          nextActions: cleanupAttention ? ['保留transient evidence，检查cleanup diagnostic后重试精确清理。'] : [],
        });
        payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationExecution, {
          ...base,
          status: passed && !cleanupAttention ? 'passed' : 'failed',
          executionRecord,
          evidenceReference: evidence.summaryPath,
          evidenceLifecycle: { ...evidence.lifecycle, cleanupStatus: cleanup.status },
        });
      } catch (error) {
        executionRecord = publicVerificationExecutionRecord('attention', {
          record: sealedExecutionRecord?.record,
          recordId: openedExecutionRecord.record.recordId,
          outcome: executionRecordOutcome,
          lifecycleStatus: sealedExecutionRecord?.record.lifecycleStatus || 'open',
          diagnostic: error,
          nextActions: error.nextAction ? [error.nextAction] : ['保留open record与transient evidence，检查diagnostic后恢复seal。'],
        });
        payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationExecution, {
          ...base,
          status: 'failed',
          executionRecord,
          evidenceReference: evidence.summaryPath,
          evidenceLifecycle: evidence.lifecycle,
          error: { code: error.code || 'verification.execution_record_seal_failed', message: error.message },
        });
        if (fs.existsSync(evidence.lifecycle.cleanupReference)) runtime.atomicWriteFile(evidence.summaryPath, `${JSON.stringify(payload, null, 2)}\n`);
      }
    }
    if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else {
      console.log(`Verification execution: ${payload.status}`);
      console.log(`Project: ${projectCode}; capabilities: ${checks.length}; duration: ${durationMs} ms`);
      console.log(`Evidence: ${evidence.summaryPath}`);
    }
    if (payload.status !== 'passed') process.exitCode = 1;
    return payload;
  }

  async function verificationRunCommand(args) {
    try {
      return await verificationRun(args);
    } catch (error) {
      if (!args.includes('--json')) throw error;
      const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationExecution, {
        operation: 'execute',
        status: 'failed',
        target: runtime.optionValue(args, '--target-identity', null),
        project: runtime.optionValue(args, '--project', null),
        selectedCapabilities: optionValues(args, '--capability'),
        checks: [],
        failures: [],
        executionIdentity: null,
        executionRecord: error.verificationExecutionRecord || publicVerificationExecutionRecord('not-opened', {
          diagnostic: error,
        }),
        admission: error.verificationAdmission || null,
        evidenceReference: null,
        evidenceLifecycle: null,
        error: { code: error.code || 'verification.invalid_request', message: error.message },
      });
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      process.exitCode = error.taskExecutionRecordBusiness ? 1 : 2;
      return payload;
    }
  }

  function verificationCleanup(args) {
    const json = args.includes('--json');
    const summaryPath = runtime.optionValue(args, '--summary', null);
    runtime.assertNoUnknownOptions(args, new Set(['--summary', '--json']), new Set(['--json']));
    if (runtime.positionalArgs(args).length) throw new Error('verification cleanup does not accept positional arguments.');
    if (!summaryPath) throw new Error('verification cleanup requires --summary <file>.');
    const resolved = path.resolve(summaryPath);
    const result = fs.existsSync(resolved)
      ? cleanupVerificationEvidence(JSON.parse(fs.readFileSync(resolved, 'utf8')), { removePath: runtime.removePath })
      : cleanupAbsentVerificationEvidence(resolved);
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationEvidenceCleanup, { operation: 'cleanup', summaryPath: resolved, ...result });
    if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`Verification evidence cleanup: ${payload.status} (${payload.code})`);
    if (!result.ok) process.exitCode = 1;
    return payload;
  }

  Object.assign(runtime, { verificationRun: verificationRunCommand, verificationCleanup });
  return runtime;
}
