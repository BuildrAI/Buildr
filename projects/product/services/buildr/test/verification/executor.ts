import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { buildCommandInvocation, createExactNodeExecutionEnvironment } from '../../src/infrastructure/process.ts';
import {
  createCandidatePackage,
  CANDIDATE_PACK_METADATA_ENV,
  CANDIDATE_RELEASE_MANIFEST_ENV,
  CANDIDATE_TARBALL_ENV,
  readSharedCandidatePackage,
} from '../../../../../../skills/buildr-release/scripts/candidate-package.ts';
import { runVerificationStep, writeVerificationDiagnostics } from './timing/parallel-runner.ts';
import { resolveNodeTestFiles } from './test-files.ts';
import { createIsolatedWorkspaceState } from '../../tools/development/isolated-workspace-state.ts';

const testPreload = pathToFileURL(path.resolve(import.meta.dirname, '../register-development-entry.ts')).href;

function innerConcurrencyBudget(step: any, executionContext: any = {}): any  {
  const executionProfile: any = executionContext.executionProfile ?? executionContext;
  const budget: any = executionContext.resourceGrant?.workers ?? executionProfile?.limits?.innerConcurrency?.[step.id];
  if (budget == null) return null;
  if (!Number.isInteger(budget) || budget < 1) throw new Error(`Invalid inner concurrency budget for ${step.id}`);
  return budget;
}

export function workerBudgetEnvironment(step: any, executionContext: any): any  {
  if (!['node', 'command'].includes(step.executor?.type)) return {};
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
  const minimumVersion: any = options.minimumNodeVersion === null
    ? undefined
    : options.minimumNodeVersion ?? (fs.statSync(nodeVersionPath, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(nodeVersionPath, 'utf8').trim() : undefined);
  const exactNode: any = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env: { ...process.env, ...options.env }, requireNpm: true, minimumVersion });
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
    BUILDR_NPM_ENTRY_PATH: inheritedEnv.BUILDR_NPM_ENTRY_PATH || path.join(productRoot, 'bin', 'buildr.mjs'),
  };
  // These paths belong to the parent preparation operation. Nested test
  // fixtures must not overwrite its timing receipt through process.env.
  delete baseEnv.BUILDR_CANDIDATE_PREPARATION_OUTPUT;
  delete baseEnv.BUILDR_CANDIDATE_PREPARATION_ID;
  const sharedCandidate: any = readSharedCandidatePackage(baseEnv);
  const artifacts: any = sharedCandidate ? { candidate: sharedCandidate } : {};
  const preparations: Map<string, Promise<any>> = options.preparations ?? new Map();
  const browserWebDist = path.join(options.diagnosticsDirectory ?? artifactDirectoryForBrowser(), 'browser-web-dist');
  function artifactDirectoryForBrowser() { return path.join(options.artifactDirectory ?? path.join(productRoot, 'build/verification'), 'prepared'); }
  const prepareOnce = (definition: any): Promise<any> => {
    const command = definition.file === process.execPath || definition.file === 'node' ? exactNode.nodeExecutable : definition.file;
    const args = definition.args ?? [], cwd = definition.cwd ?? productRoot;
    const key = JSON.stringify([command, args, cwd]);
    if (!preparations.has(key)) {
      const id = `prepare-${preparations.size + 1}`;
      preparations.set(key, (async () => {
        options.stream?.write(`[verify] ${id}: ${command} ${args.join(' ')} (cwd=${cwd})\n`);
        const startedAt = Date.now();
        let state: ReturnType<typeof createIsolatedWorkspaceState> | null = null;
        let result: any;
        try {
          state = createIsolatedWorkspaceState({ env: baseEnv });
          result = await runVerificationStep({ id, diagnosticId: id, name: args.join(' '), command, args, cwd, env: state.env, timeoutMs: 300_000, diagnosticsDirectory: options.diagnosticsDirectory }, { signal: options.signal });
        } catch (error: any) {
          result = { status: 'failed', exitCode: 1, durationMs: Date.now() - startedAt, stdout: '', stderr: error.message,
            errorCode: error.code ?? 'preparation-error' };
        } finally {
          try { state?.cleanup(); }
          catch (error: any) { result = { ...result, status: 'failed', exitCode: 1, durationMs: Date.now() - startedAt,
            stderr: `${result?.stderr ?? ''}\nPreparation cleanup failed: ${error.message}`, errorCode: 'preparation-cleanup-failed' }; }
        }
        if (result.stdout) options.stream?.write(result.stdout);
        if (result.stderr) options.errorStream?.write(result.stderr);
        options.stream?.write(`[verify] ${id}: ${result.status} (${result.durationMs} ms)\n`);
        return { ...result, id, command, args, cwd };
      })());
    }
    return preparations.get(key)!;
  };
  const nodeTestFile: any = (file: any) => {
    const relative: any = path.relative(productRoot, file).split(path.sep).join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  };

  const commandFor: any = (step: any, executionContext: any) => {
    const executor: any = step.executor;
    if (executor.type === 'command') {
      const executable = executor.file === process.execPath || executor.file === 'node' ? exactNode.nodeExecutable : executor.file;
      return { command: executable, args: executor.args ?? [], cwd: executor.cwd ?? productRoot, shell: false };
    }
    if (executor.type === 'node') return { command: exactNode.nodeExecutable, args: [path.join(productRoot, executor.file), ...(executor.args ?? [])] };
    if (executor.type === 'node-test') {
      const files: any = resolveNodeTestFiles(productRoot, executor.files, `verification step ${step.id}`);
      return {
        command: exactNode.nodeExecutable,
        // Preserve case names and timings in the normal diagnostic log. A
        // focused execution uses this same executor and produces reusable
        // proof, so diagnosis need not be followed by a duplicate formal run.
        args: ['--import', testPreload, '--test', ...nodeTestConcurrencyArguments(step, executionContext), ...(executor.args ?? [])
          .filter((argument: any) => !argument.startsWith('--test-concurrency') && !argument.startsWith('--test-reporter')),
          '--test-reporter=spec',
          '--test-reporter-destination=stdout',
          `--test-reporter=${pathToFileURL(path.join(import.meta.dirname, 'integration-progress-reporter.ts')).href}`, '--test-reporter-destination=stderr', ...files.map(nodeTestFile)],
      };
    }
    if (executor.type === 'node-context-test') {
      const files: any = resolveNodeTestFiles(productRoot, executor.files, `verification step ${step.id}`);
      return {
        command: exactNode.nodeExecutable,
        args: nodeContextTestArguments(step, executionContext, {
          runner: path.join(productRoot, 'build/test-context/node-runner-cli.js'),
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

  const requiredPreparationsFor = (step: any) => [
    ...(step.preparations ?? []),
    ...(step.browserSelector ? [
      { file: process.execPath, args: [path.join(productRoot, 'tools/development/run-development-npm.ts'), '--prefix', productRoot, 'run', 'artifacts:prepare'], cwd: productRoot },
      { file: process.execPath, args: [path.join(productRoot, 'test/verification/web-dist.ts'), '--output', browserWebDist], cwd: productRoot },
    ] : []),
  ];
  const executeVerificationStep: any = async (step: any, executionContext: any = {}): Promise<any> => {
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
    const preparationResults: any[] = [];
    const requiredPreparations = requiredPreparationsFor(step);
    for (const preparation of requiredPreparations) {
      const result = await prepareOnce(preparation);
      preparationResults.push({ id: result.id, status: result.status, durationMs: result.durationMs, command: result.command, args: result.args, cwd: result.cwd,
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        ...(result.stderrPath ? { stderrPath: result.stderrPath } : {}),
        ...(result.status !== 'passed' ? { error: result.stderr || 'Preparation did not complete successfully.' } : {}) });
      if (result.status !== 'passed') return { status: 'blocked', exitCode: 1, durationMs: 0, stdout: '', stderr: '', reason: `Required preparation ${result.id} failed: ${result.stderr || result.status}`, preparations: preparationResults };
    }
    const resolved: any = commandFor(step, executionContext);
    const artifactEnv: any = step.executor.consumesArtifact && artifacts.candidate ? {
      [CANDIDATE_TARBALL_ENV]: artifacts.candidate.tarball,
      [CANDIDATE_PACK_METADATA_ENV]: artifacts.candidate.metadataPath,
      [CANDIDATE_RELEASE_MANIFEST_ENV]: artifacts.candidate.manifestPath,
    } : {};
    const state = createIsolatedWorkspaceState({
      env: { ...baseEnv, ...executionContext.resourceEnvironment, ...artifactEnv, ...workerBudgetEnvironment(step, executionContext), ...(step.browserSelector ? { BUILDR_BROWSER_WEB_DIST_ROOT: browserWebDist } : {}) },
    });
    let result: any;
    try {
      result = await runVerificationStep({
        ...step,
        ...resolved,
        cwd: resolved.cwd ?? productRoot,
        env: state.env,
        diagnosticsDirectory: options.diagnosticsDirectory,
      }, {
        signal: options.signal,
        onSpawn: (processIdentity: any) => options.onProcessStart?.(step, processIdentity),
      });
    } finally {
      state.cleanup();
    }
    const testContextRuntime: any = step.executor.type === 'node-context-test' ? parseNodeTestContextSummary(result.stdout) : null;
    return { ...result, ...(testContextRuntime ? { testContextRuntime } : {}), ...(preparationResults.length ? { preparations: preparationResults } : {}) };
  };
  executeVerificationStep.prepareSteps = async (steps: any[]) => {
    for (const step of steps) for (const preparation of requiredPreparationsFor(step)) await prepareOnce(preparation);
  };
  return executeVerificationStep;
}
