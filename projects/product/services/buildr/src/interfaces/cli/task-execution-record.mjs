import path from 'node:path';
import process from 'node:process';

const SCHEMA = 'buildr.task-execution-record-gc-result/v1';
const USAGE = 'buildr task execution-record gc [--target <canonical-workspace>] [--dry-run] [--limit <1..500>] [--json]';

function syntax(message) {
  const error = new Error(message);
  error.code = 'task_execution_record_gc_cli.syntax';
  error.status = 400;
  error.usage = USAGE;
  return error;
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
