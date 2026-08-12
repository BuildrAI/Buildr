import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildCommandInvocation } from '../../src/infrastructure/process.mjs';
import { createCandidatePackage, CANDIDATE_PACK_METADATA_ENV, CANDIDATE_TARBALL_ENV } from './release/candidate-package.mjs';
import { runVerificationStep, writeVerificationDiagnostics } from './timing/parallel-runner.mjs';

export function workerBudgetEnvironment(step, executionProfile) {
  const budget = executionProfile?.limits?.innerConcurrency?.[step.id];
  if (budget == null) return {};
  if (!Number.isInteger(budget) || budget < 1) throw new Error(`Invalid inner concurrency budget for ${step.id}`);
  return { BUILDR_VERIFICATION_WORKER_BUDGET: String(budget) };
}

export function createVerificationExecutor(options) {
  const productRoot = path.resolve(options.productRoot);
  const projectRoot = path.resolve(options.projectRoot ?? productRoot);
  const nodeBin = path.dirname(process.execPath);
  const nodeModulesBin = path.join(productRoot, 'node_modules', '.bin');
  const npmExecutable = path.join(nodeBin, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const openspecExecutable = path.join(nodeModulesBin, process.platform === 'win32' ? 'openspec.cmd' : 'openspec');
  const inheritedEnv = { ...process.env, ...options.env };
  const baseEnv = {
    ...inheritedEnv,
    BUILDR_PROJECT_ROOT: projectRoot,
    BUILDR_SERVICE_ROOT: productRoot,
    PATH: [nodeBin, nodeModulesBin, inheritedEnv.PATH].filter(Boolean).join(path.delimiter),
  };
  const artifacts = {};
  const nodeTestFile = (file) => {
    const relative = path.relative(productRoot, file).split(path.sep).join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  };

  const commandFor = (step) => {
    const executor = step.executor;
    if (executor.type === 'node') return { command: process.execPath, args: [path.join(productRoot, executor.file), ...(executor.args ?? [])] };
    if (executor.type === 'node-test') return {
      command: process.execPath,
      args: ['--test', ...(executor.args ?? []), ...executor.files.map((file) => nodeTestFile(path.join(productRoot, file)))],
    };
    if (executor.type === 'npm') {
      const invocation = buildCommandInvocation(npmExecutable, executor.args ?? []);
      return { command: invocation.executable, args: invocation.args, shell: invocation.shell };
    }
    if (executor.type === 'openspec') {
      const invocation = buildCommandInvocation(openspecExecutable, executor.args ?? []);
      return { command: invocation.executable, args: invocation.args, cwd: projectRoot, shell: invocation.shell };
    }
    if (executor.type === 'package-selector') return { command: process.execPath, args: [path.join(productRoot, 'test/verification/package/run.mjs'), executor.selector] };
    if (executor.type === 'workspace-suite') return { command: process.execPath, args: [path.join(productRoot, 'test/verification/workspace', `${executor.selector}.mjs`)] };
    throw new Error(`Executor ${executor.type} does not resolve to a command`);
  };

  return async function executeVerificationStep(step, executionContext = {}) {
    if (step.executor.type === 'candidate-artifact') {
      const startedAt = Date.now();
      let error = null;
      try {
        const artifactDirectory = path.resolve(options.artifactDirectory);
        fs.mkdirSync(artifactDirectory, { recursive: true });
        const candidate = createCandidatePackage(productRoot, artifactDirectory, { npmExecutable });
        artifacts.candidate = candidate;
      } catch (caught) {
        error = caught;
      }
      const stdout = '';
      const stderr = error ? `${error.stack || error.message}\n` : '';
      const diagnostics = writeVerificationDiagnostics({ ...step, diagnosticsDirectory: options.diagnosticsDirectory }, stdout, stderr);
      return {
        status: error ? 'failed' : 'passed',
        exitCode: error ? 1 : 0,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        ...diagnostics,
      };
    }
    const resolved = commandFor(step);
    const artifactEnv = step.executor.consumesArtifact && artifacts.candidate ? {
      [CANDIDATE_TARBALL_ENV]: artifacts.candidate.tarball,
      [CANDIDATE_PACK_METADATA_ENV]: artifacts.candidate.metadataPath,
    } : {};
    return runVerificationStep({
      ...step,
      ...resolved,
      cwd: resolved.cwd ?? productRoot,
      env: { ...baseEnv, ...executionContext.resourceEnvironment, ...artifactEnv, ...workerBudgetEnvironment(step, executionContext.executionProfile) },
      diagnosticsDirectory: options.diagnosticsDirectory,
    });
  };
}
