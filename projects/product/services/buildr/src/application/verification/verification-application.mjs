import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';
import { parseProjectVerification, validateProjectVerification } from '../doctor/project-verification-diagnostics.mjs';
import { createProjectVerificationPlan } from './project-plan.mjs';
import { runVerificationDag } from './dag-scheduler.mjs';
import { executeVerificationCommand } from './process-executor.mjs';
import { createVerificationResourceCoordinator, resolveVerificationCoordinationRoot } from './resource-coordinator.mjs';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function gitOutput(cwd, args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

function candidateIdentity(root) {
  const top = gitOutput(root, ['rev-parse', '--show-toplevel'])?.trim();
  if (!top) return { kind: 'filesystem', root, reusable: false, fingerprint: null };
  const status = gitOutput(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']) || '';
  const diff = gitOutput(root, ['diff', '--binary', 'HEAD', '--']) || '';
  const untracked = status.split('\0').filter((line) => line.startsWith('?? ')).map((line) => line.slice(3)).sort();
  const untrackedContent = untracked.map((relative) => {
    const file = path.join(top, relative);
    try { return [relative, fs.statSync(file).isFile() ? digest(fs.readFileSync(file)) : 'non-file']; } catch { return [relative, 'missing']; }
  });
  return {
    kind: 'git-worktree',
    root: path.resolve(top),
    head: gitOutput(root, ['rev-parse', 'HEAD'])?.trim() || null,
    tree: gitOutput(root, ['rev-parse', 'HEAD^{tree}'])?.trim() || null,
    fingerprint: digest({ status, diff, untrackedContent }),
    reusable: true,
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
    blockedBy: result.blockedBy || null,
    reason: result.reason || null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    resourceCoordination: result.resourceCoordination || null,
  };
}

function resolveEvidencePath(output) {
  const file = output || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-run-')), 'summary.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

export function registerVerificationApplication(runtime) {
  async function verificationRun(args) {
    const json = args.includes('--json');
    const level = runtime.optionValue(args, '--level', null);
    const projectCode = runtime.optionValue(args, '--project', null);
    const targetRoot = fs.realpathSync(path.resolve(runtime.optionValue(args, '--target', process.cwd())));
    const requestedEnvironment = runtime.optionValue(args, '--environment', null);
    const requestedOwner = runtime.optionValue(args, '--owner', null);
    const output = runtime.optionValue(args, '--output', null);
    const taskFinishFingerprint = runtime.optionValue(args, '--candidate-fingerprint', null);
    const includeAdvisory = args.includes('--include-advisory');
    const authorizedResources = optionValues(args, '--authorize-resource');
    const concurrency = Number(runtime.optionValue(args, '--concurrency', '4'));
    runtime.assertNoUnknownOptions(args, new Set(['--project', '--level', '--target', '--environment', '--owner', '--output', '--candidate-fingerprint', '--authorize-resource', '--concurrency', '--include-advisory', '--json']), new Set(['--include-advisory', '--json']));
    if (runtime.positionalArgs(args).length) throw new Error('verification run does not accept positional arguments.');
    if (!projectCode) throw new Error('verification run requires --project <code>.');
    if (!['affected', 'candidate'].includes(level)) throw new Error('verification run requires --level affected or candidate.');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('--concurrency must be an integer from 1 to 32.');

    const registry = runtime.readProjectRegistryPersistence(targetRoot).registry.projects;
    const project = registry[projectCode];
    if (!project) throw new Error(`Project is not registered in projects/manifest.yml: ${projectCode}`);
    const projectRoot = fs.realpathSync(path.resolve(targetRoot, project.source.path));
    if (!inside(targetRoot, projectRoot)) throw new Error(`Project source escapes the execution Workspace: ${project.source.path}`);
    const declarationPath = path.join(projectRoot, 'verification.yml');
    if (!fs.existsSync(declarationPath)) throw new Error(`Project verification policy is missing: ${path.relative(targetRoot, declarationPath)}`);
    const declarationContent = fs.readFileSync(declarationPath, 'utf8');
    const declaration = parseProjectVerification(declarationContent, declarationPath);
    const validationErrors = validateProjectVerification(declaration);
    if (validationErrors.length) throw new Error(`Project verification policy is invalid:\n- ${validationErrors.join('\n- ')}`);

    const context = runtime.resolveTaskEnvironmentContext?.(targetRoot) || null;
    if (requestedEnvironment || requestedOwner) {
      if (!context?.executionReady) throw new Error('Requested task environment binding is not execution-ready.');
      if (requestedEnvironment && requestedEnvironment !== context.taskId) throw new Error(`Task environment identity mismatch: ${requestedEnvironment}.`);
      if (requestedOwner && requestedOwner !== context.owner) throw new Error(`Task environment owner mismatch: ${requestedOwner}.`);
    }
    if (context && !context.executionReady) throw new Error(context.blocked?.message || 'Task environment is not execution-ready.');

    const plan = createProjectVerificationPlan(declaration, { level, includeAdvisory });
    if (plan.uncoveredRequired.length) throw new Error(`Required verification capabilities are not selected: ${plan.uncoveredRequired.join(', ')}`);
    if (plan.steps.length === 0) throw new Error(`No executable ${level} capabilities are declared for Project ${projectCode}.`);
    for (const step of plan.steps) {
      const cwd = path.resolve(projectRoot, step.command.cwd);
      if (!inside(projectRoot, cwd) || !fs.existsSync(cwd)) throw new Error(`Verification command cwd is unavailable or escapes Project: ${step.id}`);
      step.executionCwd = cwd;
    }

    const runId = `verification-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const before = context?.repositories?.map((repository) => ({ selector: repository.selector, ...candidateIdentity(repository.checkoutPath) })) || [{ selector: 'project', ...candidateIdentity(projectRoot) }];
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
    const results = await runVerificationDag(plan, {
      concurrency,
      resourceCoordinator: coordinator,
      authorizedResources,
      execute: (step, execution) => executeVerificationCommand(step, { cwd: step.executionCwd, env: execution.resourceEnvironment }),
    });
    const after = context?.repositories?.map((repository) => ({ selector: repository.selector, ...candidateIdentity(repository.checkoutPath) })) || [{ selector: 'project', ...candidateIdentity(projectRoot) }];
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    const checks = results.map(sanitizeCheck);
    const candidateStable = digest(before) === digest(after);
    const passed = candidateStable && checks.every((check) => check.status === 'passed');
    const candidateCompleteness = level === 'candidate' && passed && plan.required.every((id) => checks.some((check) => check.id === id && check.status === 'passed') || plan.superseded.some((entry) => entry.capability === id)) ? 'confirmed' : level === 'candidate' ? 'incomplete' : 'not-requested';
    const identityMaterial = { schemaVersion: PUBLIC_JSON_SCHEMAS.verificationRun, project: projectCode, policy: digest(declarationContent), level, environment: context ? { taskId: context.taskId, owner: context.owner, environmentRoot: context.environmentRoot } : null, candidates: after, checks: checks.map((check) => ({ id: check.id, status: check.status, exitCode: check.exitCode })) };
    const evidenceIdentity = digest(identityMaterial);
    const base = {
      operation: 'execute',
      status: passed ? 'passed' : 'failed',
      requiredAssurance: level,
      project: { code: projectCode, root: projectRoot },
      policy: { mode: declaration.mode, path: declarationPath, fingerprint: digest(declarationContent) },
      environment: context ? { taskId: context.taskId, owner: context.owner, root: context.environmentRoot, allowedExecutionRoots: context.allowedExecutionRoots } : null,
      candidateIdentity: after,
      plan: { selected: plan.steps.map((step) => ({ id: step.id, reasons: step.reasons, dependsOn: step.dependsOn || [], resourceClaims: step.resourceClaims || [] })), required: plan.required, superseded: plan.superseded },
      checks,
      candidateCompleteness,
      durationMs,
      timingSource: 'wrapper-measured',
      startedAt,
      finishedAt: new Date().toISOString(),
      failures: checks.filter((check) => check.status === 'failed').map((check) => check.id),
      skips: checks.filter((check) => check.status === 'blocked').map((check) => ({ id: check.id, reason: check.reason })),
      evidenceIdentity,
      evidenceRetention: output ? 'caller-managed' : 'transient',
      cleanupAfter: output ? 'caller' : 'all-consumers-complete',
      cleanupStatus: 'retained',
      cleanupReference: null,
      candidateStable,
      runId,
      source: taskFinishFingerprint ? { candidateFingerprint: taskFinishFingerprint } : null,
      totalDurationMs: durationMs,
      run: { id: runId },
      summaryPath: null,
    };
    const evidenceReference = resolveEvidencePath(output ? path.resolve(output) : null);
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationRun, { ...base, evidenceReference, summaryPath: evidenceReference, cleanupReference: output ? null : evidenceReference });
    runtime.atomicWriteFile(evidenceReference, `${JSON.stringify(payload, null, 2)}\n`);
    if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else {
      console.log(`${level === 'candidate' ? '完整候选验证' : '受影响验证'}: ${payload.status}`);
      console.log(`Project: ${projectCode}; checks: ${checks.length}; duration: ${durationMs} ms`);
      console.log(`Evidence: ${evidenceReference}`);
    }
    if (!passed) process.exitCode = 1;
    return payload;
  }

  async function verificationRunCommand(args) {
    try {
      return await verificationRun(args);
    } catch (error) {
      if (!args.includes('--json')) throw error;
      const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.verificationRun, {
        operation: 'execute',
        status: 'failed',
        requiredAssurance: runtime.optionValue(args, '--level', null),
        project: runtime.optionValue(args, '--project', null),
        checks: [],
        failures: [],
        skips: [],
        evidenceIdentity: null,
        evidenceReference: null,
        evidenceRetention: null,
        cleanupStatus: 'not-started',
        error: { code: error.code || 'verification.invalid_request', message: error.message },
      });
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      process.exitCode = 2;
      return payload;
    }
  }

  Object.assign(runtime, { verificationRun: verificationRunCommand });
  return runtime;
}
