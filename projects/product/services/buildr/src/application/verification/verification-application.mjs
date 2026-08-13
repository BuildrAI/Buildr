import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';
import { parseProjectVerification, validateProjectVerification } from '../doctor/project-verification-diagnostics.mjs';
import { runVerificationCapabilities } from './capability-runner.mjs';
import { executeVerificationCommand } from './process-executor.mjs';
import { createVerificationResourceCoordinator, resolveVerificationCoordinationRoot } from './resource-coordinator.mjs';
import { cleanupAbsentVerificationEvidence, cleanupVerificationEvidence, createVerificationEvidenceLifecycle } from './evidence-lifecycle.mjs';
import {
  VERIFICATION_EXECUTION_RECORD_KIND,
  VERIFICATION_EXECUTION_RECORD_OWNER,
  VERIFICATION_EXECUTION_RECORD_PRODUCER,
  createVerificationExecutionRecordFiles,
  publicVerificationExecutionRecord,
  verificationExecutionRecordOutcome,
  verificationInvocationIdentity,
} from './execution-record.mjs';

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

function sanitizeCheck(result) {
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

function bindWorkspaceNodeCommand(capability, workspaceNode) {
  const [command, ...args] = capability.command.argv;
  const executable = path.basename(command).toLowerCase();
  if (['node', 'node.exe'].includes(executable)) return { ...capability, command: { ...capability.command, argv: [workspaceNode.executable, ...args] } };
  if (['npm', 'npm.cmd'].includes(executable)) return { ...capability, command: { ...capability.command, argv: [workspaceNode.npmExecutable, ...args] } };
  if (['npx', 'npx.cmd'].includes(executable)) return { ...capability, command: { ...capability.command, argv: [workspaceNode.paths.npx, ...args] } };
  return capability;
}

export function verificationExecutionIdentityMaterial({ project, declaration, target, context, workspaceNodeIdentity, observation, checks }) {
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
    workspaceNode: workspaceNodeIdentity,
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
    const projectRoot = fs.realpathSync(path.resolve(targetRoot, project.source.path));
    if (!inside(targetRoot, projectRoot)) throw new Error(`Project source escapes the execution Workspace: ${project.source.path}`);
    const declarationPath = path.join(projectRoot, 'verification.yml');
    if (!fs.existsSync(declarationPath)) throw new Error(`Project verification declaration is missing: ${path.relative(targetRoot, declarationPath)}`);
    const declarationContent = fs.readFileSync(declarationPath);
    const declaration = parseProjectVerification(declarationContent.toString('utf8'), declarationPath);
    const services = runtime.readServiceRegistryPersistence(targetRoot, project, project.workspaceId).registry.services;
    const validationErrors = validateProjectVerification(declaration, { projectCode, services: Object.keys(services) });
    if (validationErrors.length) throw new Error(`Project verification declaration is invalid:\n- ${validationErrors.join('\n- ')}`);

    if (Boolean(requestedEnvironment) !== Boolean(requestedWorkspace)) throw new Error('Task Environment verification requires --environment <task-id> and --workspace <canonical-workspace> together.');
    const canonicalWorkspace = requestedWorkspace ? path.resolve(requestedWorkspace) : null;
    const context = requestedEnvironment
      ? runtime.withWorkspaceStructuredStoreReadCompatibility(canonicalWorkspace, () => runtime.resolveTaskEnvironmentExecution(canonicalWorkspace, requestedEnvironment))
      : null;
    if (context && !context.ready) throw new Error(context.blocked?.message || 'Requested Task Environment binding is not ready.');
    if (context && !context.allowedExecutionRoots.some((root) => inside(root, targetRoot))) throw new Error('Verification target is outside the requested Task Environment execution roots.');
    if (context?.controllerInvocation?.sourceRoot && !sameFilesystemPath(runtime.productRoot(), context.controllerInvocation.sourceRoot)) {
      const execute = runtime.runVerificationThroughRetainedController || runVerificationThroughRetainedController;
      return execute(context, args);
    }
    const workspaceNode = runtime.workspaceNodeExecution(targetRoot);
    if (!workspaceNode.ready) throw new Error(`Workspace Node runtime is not ready: ${workspaceNode.status}. Run buildr sync before verification.`);

    const byId = new Map(declaration.capabilities.map((capability) => [capability.id, capability]));
    const selected = requestedCapabilities.map((id) => {
      const capability = byId.get(id);
      if (!capability) throw new Error(`Project verification capability is not declared: ${id}`);
      if (capability.invocation.kind !== 'command') throw new Error(`Project verification capability requires bounded Agent execution and cannot be run by the command runner: ${id}`);
      if (capability.effects?.authorization === 'explicit' && !authorizedCapabilities.includes(id)) throw new Error(`Explicit authorization is required for verification capability effects: ${id}`);
      const executionCwd = path.resolve(projectRoot, capability.invocation.cwd || '.');
      if (!inside(projectRoot, executionCwd) || !fs.existsSync(executionCwd)) throw new Error(`Verification command cwd is unavailable or escapes Project: ${id}`);
      return {
        ...capability,
        command: { argv: capability.invocation.argv, cwd: capability.invocation.cwd || '.' },
        executionCwd,
      };
    });

    const declarationIdentity = digest(declarationContent);
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
          allowDuplicateActive: retry,
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
    if (openedExecutionRecord?.status === 'existing-active') {
      const record = openedExecutionRecord.record;
      const nextActions = [`使用 buildr task execution-record inspect --task ${context.taskId} --record ${record.recordId} 回读当前执行；仅需独立重试时显式传 --retry。`];
      const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationExecution, {
        operation: 'execute',
        status: 'active',
        target: { identity: targetIdentity, stable: null, observation: null, drift: null },
        project: { code: projectCode, root: projectRoot },
        declaration: { path: declarationPath, identity: declarationIdentity },
        environment: { taskId: context.taskId, root: context.environmentRoot, workspaceRoot: context.workspaceRoot },
        workspaceNode: { identity: workspaceNode.identity, actualVersion: workspaceNode.actualVersion },
        selectedCapabilities: selected.map((capability) => ({ id: capability.id, scope: capability.scope, proves: capability.proves, requiredForDelivery: capability.requiredForDelivery, resourceClaims: capability.resourceClaims ?? [] })),
        authorization: { capabilities: authorizedCapabilities, resources: [...new Set(authorizedResources)] },
        checks: [],
        durationMs: 0,
        timingSource: 'not-started-existing-active',
        startedAt: null,
        finishedAt: null,
        failures: [],
        executionIdentity: null,
        invocationIdentity,
        runId: record.runIdentity,
        run: { id: record.runIdentity },
        executionRecord: publicVerificationExecutionRecord('active', {
          record,
          nextActions,
        }),
        evidenceReference: null,
        evidenceLifecycle: null,
        nextActions,
      });
      if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      else console.log(`Verification execution already active: ${record.recordId} (${record.runIdentity})`);
      return payload;
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
      execute: (capability, execution) => executeVerificationCommand(bindWorkspaceNodeCommand(capability, workspaceNode), { cwd: capability.executionCwd, env: { ...workspaceNode.environment, ...execution.resourceEnvironment } }),
    });
    const after = executionContentObservation(targetRoot);
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    const finishedAt = new Date().toISOString();
    const checks = results.map(sanitizeCheck);
    const targetStable = digest(before) === digest(after);
    const targetDrift = targetDriftSummary(before, after);
    const passed = targetStable && checks.every((check) => check.status === 'passed');
    const executionRecordOutcome = verificationExecutionRecordOutcome({ passed, checks });
    const identityMaterial = verificationExecutionIdentityMaterial({
      project: projectCode,
      declaration: declarationIdentity,
      target: targetIdentity,
      context,
      workspaceNodeIdentity: workspaceNode.identity,
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
      workspaceNode: { identity: workspaceNode.identity, executable: workspaceNode.executable, npmExecutable: workspaceNode.npmExecutable, actualVersion: workspaceNode.actualVersion },
      selectedCapabilities: selected.map((capability) => ({ id: capability.id, scope: capability.scope, proves: capability.proves, requiredForDelivery: capability.requiredForDelivery, resourceClaims: capability.resourceClaims ?? [] })),
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
            workspaceNode,
            selectedCapabilities: selected,
            authorizedCapabilities,
            authorizedResources,
            checks,
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
