import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildCommandInvocation, createExactNodeExecutionEnvironment } from '../../src/infrastructure/process.ts';
import {
  createCandidatePackage,
  CANDIDATE_PACK_METADATA_ENV,
  CANDIDATE_RELEASE_MANIFEST_ENV,
  CANDIDATE_TARBALL_ENV,
  readSharedCandidatePackage,
} from './release/candidate-package.ts';
import { runVerificationStep, writeVerificationDiagnostics } from './timing/parallel-runner.ts';
import { resolveNodeTestFiles } from './test-files.ts';

function innerConcurrencyBudget(step: any, executionContext: any = {}): any  {
  const executionProfile: any = executionContext.executionProfile ?? executionContext;
  const budget: any = executionContext.resourceGrant?.workers ?? executionProfile?.limits?.innerConcurrency?.[step.id];
  if (budget == null) return null;
  if (!Number.isInteger(budget) || budget < 1) throw new Error(`Invalid inner concurrency budget for ${step.id}`);
  return budget;
}

export function workerBudgetEnvironment(step: any, executionContext: any): any  {
  if (step.executor?.type !== 'node') return {};
  const budget: any = innerConcurrencyBudget(step, executionContext);
  if (budget == null) return {};
  return { BUILDR_VERIFICATION_WORKER_BUDGET: String(budget) };
}

export function nodeTestConcurrencyArguments(step: any, executionContext: any): any  {
  const budget: any = innerConcurrencyBudget(step, executionContext);
  if (budget == null) return [];
  return [`--test-concurrency=${budget}`];
}

export function nodeContextTestArguments(step: any, executionContext: any, options: any): any  {
  const budget: any = innerConcurrencyBudget(step, executionContext) ?? 1;
  return [options.runner, '--workers', String(budget), '--cwd', options.cwd, ...options.files];
}

export function parseNodeTestContextSummary(output: any): any  {
  const line: any = String(output ?? '').split('\n').find((item: any) => item.startsWith('# node-test-context-summary '));
  if (!line) return null;
  try {
    const summary: any = JSON.parse(line.slice('# node-test-context-summary '.length));
    if (summary?.schemaVersion !== 'node.test-context-summary/v1' || !Number.isInteger(summary.hosts) || summary.hosts < 1) return null;
    return Object.freeze(summary);
  } catch {
    return null;
  }
}

export function createVerificationExecutor(options: any): any  {
  const productRoot: any = path.resolve(options.productRoot);
  const projectRoot: any = path.resolve(options.projectRoot ?? productRoot);
  const nodeVersionPath: any = path.join(projectRoot, '.node-version');
  const expectedVersion: any = options.expectedNodeVersion === null
    ? undefined
    : options.expectedNodeVersion ?? (fs.statSync(nodeVersionPath, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(nodeVersionPath, 'utf8').trim() : undefined);
  const exactNode: any = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env: { ...process.env, ...options.env }, requireNpm: true, expectedVersion });
  const nodeBin: any = exactNode.audit.bin;
  const nodeModulesBin: any = path.join(productRoot, 'node_modules', '.bin');
  const npmExecutable: any = exactNode.npmExecutable;
  const openspecExecutable: any = path.join(nodeModulesBin, process.platform === 'win32' ? 'openspec.cmd' : 'openspec');
  const inheritedEnv: any = exactNode.env;
  const baseEnv: any = {
    ...inheritedEnv,
    BUILDR_PROJECT_ROOT: projectRoot,
    BUILDR_SERVICE_ROOT: productRoot,
    PATH: [nodeBin, nodeModulesBin, ...(inheritedEnv.PATH || '').split(path.delimiter).filter(Boolean).filter((entry: any) => path.resolve(entry) !== path.resolve(nodeBin))].join(path.delimiter),
    BUILDR_NODE_EXECUTABLE: exactNode.nodeExecutable,
    BUILDR_NODE_IDENTITY: exactNode.audit.identity,
  };
  const sharedCandidate: any = readSharedCandidatePackage(baseEnv);
  const artifacts: any = sharedCandidate ? { candidate: sharedCandidate } : {};
  const nodeTestFile: any = (file: any) => {
    const relative: any = path.relative(productRoot, file).split(path.sep).join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  };

  const commandFor: any = (step: any, executionContext: any) => {
    const executor: any = step.executor;
    if (executor.type === 'node') return { command: exactNode.nodeExecutable, args: [path.join(productRoot, executor.file), ...(executor.args ?? [])] };
    if (executor.type === 'node-test') {
      const files: any = resolveNodeTestFiles(productRoot, executor.files, `verification step ${step.id}`);
      return {
        command: exactNode.nodeExecutable,
        args: ['--test', ...nodeTestConcurrencyArguments(step, executionContext), ...(executor.args ?? []).filter((argument: any) => !argument.startsWith('--test-concurrency')), ...files.map(nodeTestFile)],
      };
    }
    if (executor.type === 'node-context-test') {
      const files: any = resolveNodeTestFiles(productRoot, executor.files, `verification step ${step.id}`);
      return {
        command: exactNode.nodeExecutable,
        args: nodeContextTestArguments(step, executionContext, {
          runner: path.join(productRoot, 'package/targets/test-context/node-runner-cli.js'),
          cwd: productRoot,
          files: files.map(nodeTestFile),
        }),
      };
    }
    if (executor.type === 'npm') {
      const invocation: any = buildCommandInvocation(npmExecutable, executor.args ?? []);
      return { command: invocation.executable, args: invocation.args, shell: invocation.shell };
    }
    if (executor.type === 'openspec') {
      const invocation: any = buildCommandInvocation(openspecExecutable, executor.args ?? []);
      return { command: invocation.executable, args: invocation.args, cwd: projectRoot, shell: invocation.shell };
    }
    if (executor.type === 'package-selector') return { command: exactNode.nodeExecutable, args: [path.join(productRoot, 'test/verification/package/run.ts'), executor.selector] };
    if (executor.type === 'workspace-suite') return { command: exactNode.nodeExecutable, args: [path.join(productRoot, 'test/verification/workspace', `${executor.selector}.ts`)] };
    throw new Error(`Executor ${executor.type} does not resolve to a command`);
  };

  return async function executeVerificationStep(step: any, executionContext: any = {}): Promise<any>  {
    if (step.executor.type === 'candidate-artifact') {
      const startedAt: any = Date.now();
      let error: any = null;
      try {
        if (!sharedCandidate) {
          const artifactDirectory: any = path.resolve(options.artifactDirectory);
          fs.mkdirSync(artifactDirectory, { recursive: true });
          const candidate: any = await createCandidatePackage(productRoot, artifactDirectory, { npmExecutable });
          artifacts.candidate = candidate;
        }
      } catch (caught: any) {
        error = caught;
      }
      const stdout: any = '';
      const stderr: any = error ? `${error.stack || error.message}\n` : '';
      const diagnostics: any = writeVerificationDiagnostics({ ...step, diagnosticsDirectory: options.diagnosticsDirectory }, stdout, stderr);
      return {
        status: error ? 'failed' : 'passed',
        exitCode: error ? 1 : 0,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        ...diagnostics,
      };
    }
    const resolved: any = commandFor(step, executionContext);
    const artifactEnv: any = step.executor.consumesArtifact && artifacts.candidate ? {
      [CANDIDATE_TARBALL_ENV]: artifacts.candidate.tarball,
      [CANDIDATE_PACK_METADATA_ENV]: artifacts.candidate.metadataPath,
      [CANDIDATE_RELEASE_MANIFEST_ENV]: artifacts.candidate.manifestPath,
    } : {};
    const result: any = await runVerificationStep({
      ...step,
      ...resolved,
      cwd: resolved.cwd ?? productRoot,
      env: { ...baseEnv, ...executionContext.resourceEnvironment, ...artifactEnv, ...workerBudgetEnvironment(step, executionContext) },
      diagnosticsDirectory: options.diagnosticsDirectory,
    }, {
      signal: options.signal,
      onSpawn: (processIdentity: any) => options.onProcessStart?.(step, processIdentity),
    });
    const testContextRuntime: any = step.executor.type === 'node-context-test' ? parseNodeTestContextSummary(result.stdout) : null;
    return testContextRuntime ? { ...result, testContextRuntime } : result;
  };
}
