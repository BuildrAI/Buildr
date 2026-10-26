import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createIsolatedWorkspaceState } from './isolated-workspace-state.ts';
import { spawnSupervised } from '../../test/helpers/child-process-supervisor.ts';
import { resolveVerificationCommandTimeout } from '../../test/verification/support/verification-deadline.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultScenario: any = path.join(serviceRoot, 'tools/development/workspace-lifecycle-check.ts');

function parseArguments(argv: any): any  {
  if (argv.length === 0) return { scenario: defaultScenario, scenarioArgs: [] };
  if (argv[0] !== '--script' || !argv[1]) {
    throw new Error('Usage: run-isolated-workspace-check.ts [--script <node-script> [-- <args...>]]');
  }
  const separator: any = argv[2] === '--' ? 3 : 2;
  return { scenario: path.resolve(argv[1]), scenarioArgs: argv.slice(separator) };
}

let temporaryRoot: any = null;
let cleanup: any = 'not-started';
let exitCode: any = 1;
let status: any = 'failed';
let failure: any = null;
let state: ReturnType<typeof createIsolatedWorkspaceState> | null = null;
let processCleanup: any = null;
let cancellationSignal: string | null = null;
const controller = new AbortController();
const cancel = (signal: string) => { cancellationSignal ??= signal; controller.abort(); };
const cancelInterrupt = () => cancel('SIGINT');
const cancelTerminate = () => cancel('SIGTERM');

try {
  const { scenario, scenarioArgs }: any = parseArguments(process.argv.slice(2));
  const timeoutMs = resolveVerificationCommandTimeout(process.env.BUILDR_SMOKE_TIMEOUT_MS === undefined
    ? undefined : Number(process.env.BUILDR_SMOKE_TIMEOUT_MS));
  if (!fs.statSync(scenario).isFile()) throw new Error(`Workspace scenario is not a file: ${scenario}`);

  state = createIsolatedWorkspaceState({ prefix: 'buildr-workspace-smoke-' });
  temporaryRoot = state.root;
  fs.writeFileSync(path.join(temporaryRoot, '.buildr-smoke-owner'), `${process.pid}\n`, { mode: 0o600 });
  process.on('SIGINT', cancelInterrupt);
  process.on('SIGTERM', cancelTerminate);
  const execution = spawnSupervised(process.execPath, [scenario, ...scenarioArgs], {
    cwd: serviceRoot,
    timeoutMs, signal: controller.signal, inheritOutput: true,
    env: {
      ...state.env,
      NODE_TEST_CONTEXT: undefined,
      BUILDR_NODE: process.execPath,
      BUILDR_SMOKE_ROOT: temporaryRoot,
      BUILDR_SMOKE_WORKSPACE_ROOT: path.join(temporaryRoot, 'workspace'),
      BUILDR_LOCAL_APP_NO_OPEN: '1',
    },
  });
  const child = await execution.completed;
  processCleanup = child.processCleanup;
  exitCode = child.timedOut ? 124 : child.cancelled ? (cancellationSignal === 'SIGTERM' ? 143 : 130)
    : Number.isInteger(child.exitCode) ? child.exitCode : 1;
  status = exitCode === 0 ? 'passed' : 'failed';
  if (child.error) failure = child.error;
  else if (child.timedOut) failure = `Workspace scenario exceeded ${timeoutMs} ms.`;
  else if (child.cancelled) failure = `Workspace scenario cancelled by ${cancellationSignal}.`;
  else if (child.signal) failure = `Workspace scenario terminated by ${child.signal}.`;
} catch (error: any) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  process.off('SIGINT', cancelInterrupt);
  process.off('SIGTERM', cancelTerminate);
  if (temporaryRoot && processCleanup?.status !== 'failed') {
    try {
      state!.cleanup();
      cleanup = fs.existsSync(temporaryRoot) ? 'failed' : 'cleaned';
    } catch (error: any) {
      cleanup = 'failed';
      failure = failure || (error instanceof Error ? error.message : String(error));
    }
  } else if (temporaryRoot) {
    cleanup = 'failed';
    failure = failure || `Workspace process cleanup failed; preserved files at ${temporaryRoot}.`;
  }
}

if (cleanup !== 'cleaned') {
  status = 'failed';
  exitCode = 1;
}
if (failure) process.stderr.write(`${failure}\n`);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 'buildr.workspace-smoke-run/v1',
  status,
  exitCode,
  cleanup,
  temporaryRoot,
})}\n`);
process.exitCode = exitCode;
