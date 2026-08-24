import path from 'node:path';
import process from 'node:process';

const SCHEMA = 'buildr.task-execution-record-gc-result/v1';
const USAGE = 'buildr task execution-record gc [--target <canonical-workspace>] [--dry-run] [--limit <1..500>] [--json]';
const RECOVER_SCHEMA = 'buildr.task-execution-record-recover-result/v1';
const RECOVER_USAGE = 'buildr task execution-record recover --task <task-id> --record <record-id> [--summary <file> | --authorize-unknown-outcome] [--target <canonical-workspace>] [--json]';

function syntax(message, { code = 'task_execution_record_gc_cli.syntax', usage = USAGE } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  error.usage = usage;
  return error;
}

function recoverSyntax(message) {
  return syntax(message, { code: 'task_execution_record_recover_cli.syntax', usage: RECOVER_USAGE });
}

export function parseTaskExecutionRecordGcCli(args) {
  const allowed = new Set(['--target', '--dry-run', '--limit', '--json']);
  const flags = new Set(['--dry-run', '--json']);
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--') || !allowed.has(arg)) throw syntax(`Unknown argument: ${arg}`);
    if (values.has(arg)) throw syntax(`Argument may only be provided once: ${arg}`);
    if (flags.has(arg)) values.set(arg, true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`);
      values.set(arg, value);
      index += 1;
    }
  }
  const rawLimit = values.get('--limit');
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (rawLimit !== undefined && (!Number.isInteger(limit) || String(limit) !== rawLimit)) throw syntax('--limit must be an integer.');
  return {
    targetRoot: path.resolve(values.get('--target') || process.cwd()),
    dryRun: values.has('--dry-run'),
    limit,
    json: values.has('--json'),
  };
}

export function parseTaskExecutionRecordRecoverCli(args) {
  const allowed = new Set(['--task', '--record', '--summary', '--authorize-unknown-outcome', '--target', '--json']);
  const flags = new Set(['--authorize-unknown-outcome', '--json']);
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--') || !allowed.has(arg)) throw recoverSyntax(`Unknown argument: ${arg}`);
    if (values.has(arg)) throw recoverSyntax(`Argument may only be provided once: ${arg}`);
    if (flags.has(arg)) values.set(arg, true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw recoverSyntax(`Missing value for ${arg}`);
      values.set(arg, value);
      index += 1;
    }
  }
  if (!values.get('--task')) throw recoverSyntax('recover requires --task <task-id>.');
  if (!values.get('--record')) throw recoverSyntax('recover requires --record <record-id>.');
  if (values.has('--summary') && values.has('--authorize-unknown-outcome')) throw recoverSyntax('--summary and --authorize-unknown-outcome are mutually exclusive.');
  return {
    targetRoot: path.resolve(values.get('--target') || process.cwd()),
    taskId: values.get('--task'),
    recordId: values.get('--record'),
    summaryPath: values.has('--summary') ? path.resolve(values.get('--summary')) : null,
    authorizeUnknownOutcome: values.has('--authorize-unknown-outcome'),
    json: values.has('--json'),
  };
}

function blocked(error, parsed = null) {
  const expected = error.taskExecutionRecordBusiness || error.code === 'task_execution_record_gc_cli.syntax';
  return {
    schemaVersion: SCHEMA,
    operation: 'gc',
    status: 'blocked',
    mode: parsed?.dryRun ? 'dry-run' : 'run',
    limit: parsed?.limit ?? null,
    observedAt: new Date().toISOString(),
    counts: { scanned: 0, eligible: 0, selected: 0, cleaned: 0, purged: 0, skipped: 0, failed: 0 },
    records: [],
    diagnostic: {
      code: error.code || 'task_execution_record_gc_failed',
      message: expected ? error.message : 'ExecRecord GC failed before a safe result could be formed.',
    },
    nextActions: [error.usage ? `Usage: ${error.usage}` : '检查 canonical Workspace 与 GC 输入后重试。'],
  };
}

function print(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.status === 'blocked') console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${payload.nextActions[0]}`);
  else console.log(`ExecRecord GC ${payload.status}: selected=${payload.counts.selected}, cleaned=${payload.counts.cleaned}, purged=${payload.counts.purged}, skipped=${payload.counts.skipped}, failed=${payload.counts.failed}.`);
  return payload;
}

export function taskExecutionRecordGcCommand(runtime, args) {
  let parsed;
  try {
    parsed = parseTaskExecutionRecordGcCli(args);
    const payload = runtime.gcTaskExecutionRecords(parsed.targetRoot, {
      dryRun: parsed.dryRun,
      ...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
    });
    return print(payload, parsed.json);
  } catch (error) {
    const json = parsed?.json || args.includes('--json');
    const payload = blocked(error, parsed);
    print(payload, json);
    process.exitCode = 1;
    return payload;
  }
}

function blockedRecovery(error, parsed = null) {
  const expected = error.taskExecutionRecordBusiness || error.code === 'task_execution_record_recover_cli.syntax';
  return {
    schemaVersion: RECOVER_SCHEMA,
    operation: 'recover',
    status: 'blocked',
    mode: parsed?.summaryPath ? 'terminal-evidence' : parsed?.authorizeUnknownOutcome ? 'authorized-unknown' : 'unknown-unconfirmed',
    taskId: parsed?.taskId || null,
    recordId: parsed?.recordId || null,
    record: null,
    transientCleanup: null,
    diagnostic: { code: error.code || 'task_execution_record_recovery_failed', message: expected ? error.message : 'Execution Record recover failed before a safe result could be formed.' },
    effects: [],
    nextActions: [error.usage ? `Usage: ${RECOVER_USAGE}` : error.nextAction || '检查matching Task、record与recovery evidence后重试。'],
  };
}

function printRecovery(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.status === 'recovered') console.log(`Execution Record recovered: ${payload.recordId} (${payload.record.outcome}/${payload.record.lifecycleStatus}).`);
  else if (payload.status === 'attention') console.log(`Execution Record retained with unknown outcome: ${payload.recordId}.`);
  else console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${payload.nextActions[0]}`);
  return payload;
}

export function taskExecutionRecordRecoverCommand(runtime, args) {
  let parsed;
  try {
    parsed = parseTaskExecutionRecordRecoverCli(args);
    const payload = runtime.recoverTaskExecutionRecord(parsed.targetRoot, parsed.taskId, parsed.recordId, {
      ...(parsed.summaryPath ? { summaryPath: parsed.summaryPath } : {}),
      ...(parsed.authorizeUnknownOutcome ? { authorizeUnknownOutcome: true } : {}),
    });
    printRecovery(payload, parsed.json);
    if (payload.status === 'authorization-required') process.exitCode = 1;
    return payload;
  } catch (error) {
    const json = parsed?.json || args.includes('--json');
    const payload = blockedRecovery(error, parsed);
    printRecovery(payload, json);
    process.exitCode = 1;
    return payload;
  }
}

function parseReadCli(operation, args) {
  const allowed = operation === 'list' ? new Set(['--task', '--view', '--target', '--json']) : new Set(['--task', '--record', '--target', '--json']);
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--') || !allowed.has(arg)) throw syntax(`Unknown argument: ${arg}`);
    if (values.has(arg)) throw syntax(`Argument may only be provided once: ${arg}`);
    if (arg === '--json') values.set(arg, true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`);
      values.set(arg, value);
      index += 1;
    }
  }
  if (!values.get('--task')) throw syntax(`${operation} requires --task <task-id>.`);
  if (operation === 'inspect' && !values.get('--record')) throw syntax('inspect requires --record <record-id>.');
  return {
    targetRoot: path.resolve(values.get('--target') || process.cwd()),
    taskId: values.get('--task'),
    recordId: values.get('--record') || null,
    view: values.get('--view') || 'verification',
    json: values.has('--json'),
  };
}

function printRead(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.records) {
    for (const record of payload.records) console.log(`${record.recordId}\t${record.lifecycleStatus}\t${record.outcome}\t${record.runIdentity}`);
  } else {
    console.log(`${payload.record.recordId}: ${payload.record.lifecycleStatus}/${payload.record.outcome}`);
    if (payload.execution.status === 'available') console.log(`Duration: ${payload.execution.durationMs} ms; failures: ${payload.execution.failures.length}`);
    else console.log(`Execution summary: ${payload.execution.reason}`);
  }
  return payload;
}

export function taskExecutionRecordListCommand(runtime, args) {
  const parsed = parseReadCli('list', args);
  return printRead(runtime.listTaskExecutionRecordView(parsed.targetRoot, parsed.taskId, { view: parsed.view }), parsed.json);
}

export function taskExecutionRecordInspectCommand(runtime, args) {
  const parsed = parseReadCli('inspect', args);
  return printRead(runtime.inspectTaskExecutionRecordCompactView(parsed.targetRoot, parsed.taskId, parsed.recordId), parsed.json);
}
