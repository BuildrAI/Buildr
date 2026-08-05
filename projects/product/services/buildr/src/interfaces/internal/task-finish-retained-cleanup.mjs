import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createRuntime } from '../../application/compose-runtime.mjs';
import { finishCompletionFile, readFinishRun } from '../../application/task-finish/task-finish-run.mjs';

function cleanupError(code, message, details = null) {
  const error = new Error(message);
  Object.assign(error, { code, details });
  return error;
}

function resolvedPath(value) {
  const resolved = path.resolve(value);
  try { return fs.realpathSync(resolved); } catch { return resolved; }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const allowed = new Set(['--run', '--target']);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!allowed.has(option) || !value || value.startsWith('--') || values.has(option)) {
      throw cleanupError('task-finish.retained-cleanup-invalid-input', 'Retained cleanup requires exactly one --run and --target value.');
    }
    values.set(option, value);
  }
  if (values.size !== allowed.size) throw cleanupError('task-finish.retained-cleanup-invalid-input', 'Retained cleanup requires exactly one --run and --target value.');
  return { runId: values.get('--run'), targetRoot: path.resolve(values.get('--target')) };
}

function assertPreparedCompletion(root, run) {
  const file = finishCompletionFile(root, run.runId);
  if (!fs.existsSync(file)) throw cleanupError('task-finish.retained-cleanup-completion-missing', 'Durable prepared Finish completion is missing.');
  const completion = JSON.parse(fs.readFileSync(file, 'utf8'));
  const matches = completion.schemaVersion === 'buildr.task-finish-completion/v1'
    && completion.status === 'prepared'
    && completion.runId === run.runId
    && completion.task === run.identity.task
    && completion.handoffIdentity === run.identity.handoffIdentity
    && completion.candidateIdentity === run.identity.candidateIdentity
    && completion.contentTargetIdentity === run.identity.contentTargetIdentity
    && completion.carrierIdentity === run.deliveryCarrier?.identity
    && completion.carrierRef === run.deliveryCarrier?.head
    && completion.targetBranch === run.identity.targetBranch;
  if (!matches) throw cleanupError('task-finish.retained-cleanup-completion-mismatch', 'Durable prepared Finish completion does not match the current run.');
  return completion;
}

export async function executeRetainedTaskFinishCleanup({ targetRoot, runId, runtime = createRuntime() }) {
  const root = fs.realpathSync(path.resolve(targetRoot));
  const run = readFinishRun({ root, runId });
  if (resolvedPath(run.identity.workspaceRoot) !== root) throw cleanupError('task-finish.retained-cleanup-workspace-mismatch', 'Task Finish run is bound to another retained Workspace.');
  const deliver = run.phases.find((phase) => phase.id === 'deliver');
  const cleanup = run.phases.find((phase) => phase.id === 'cleanup');
  if (run.status !== 'active' || deliver?.status !== 'passed' || cleanup?.status !== 'running'
    || run.delivery?.status !== 'delivered' || run.delivery?.carrierRef !== run.deliveryCarrier?.head
    || run.delivery?.remoteAfterRef !== run.deliveryCarrier?.head
    || typeof run.delivery?.finalRemoteRef !== 'string'
    || !run.delivery.finalRemoteRef) {
    throw cleanupError('task-finish.retained-cleanup-run-not-ready', 'Task Finish run does not contain a completed delivery and active cleanup boundary.');
  }
  assertPreparedCompletion(root, run);
  const context = runtime.resolveTaskEnvironmentExecution(root, run.identity.task);
  if (!context?.ready || resolvedPath(context.workspaceRoot) !== root || resolvedPath(context.environmentRoot) !== resolvedPath(run.identity.environmentRoot)) {
    throw cleanupError('task-finish.retained-cleanup-environment-mismatch', 'Current Task Environment does not match the Finish run.', context?.blocked || null);
  }
  const deliveries = Object.fromEntries((context.repositories || []).map((repository) => [
    repository.selector,
    repository.selector === 'workspace' ? run.identity.targetBranch : repository.startPoint,
  ]));
  return runtime.cleanupTaskEnvironment(root, run.identity.task, {
    type: 'finish',
    deliveries,
    candidateRef: run.delivery.carrierRef,
    integratedContributions: { workspace: run.deliveryCarrier },
  });
}

async function main() {
  try {
    const input = parseArgs(process.argv);
    const result = await executeRetainedTaskFinishCleanup(input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'cleaned') process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: 'blocked',
      effects: [],
      diagnostic: {
        code: error.code || 'task-finish.retained-cleanup-failed',
        message: error.message,
        details: error.details || null,
      },
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
