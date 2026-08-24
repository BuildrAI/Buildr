import path from 'node:path';
import process from 'node:process';

function syntax(message) {
  const error = new Error(message);
  error.code = 'task_entry_cli.syntax';
  error.status = 400;
  error.usage = 'buildr task next <task-id> [--execution-target <path>] [--profile] [--target <canonical-workspace>] [--json]';
  return error;
}

function parse(args) {
  const allowed = new Set(['--execution-target', '--profile', '--target', '--json']);
  const boolean = new Set(['--profile', '--json']);
  const positions = [];
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    if (!allowed.has(arg)) throw syntax(`Unknown argument: ${arg}`);
    if (values.has(arg)) throw syntax(`Argument may only be provided once: ${arg}`);
    if (boolean.has(arg)) values.set(arg, true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`);
      values.set(arg, value);
      index += 1;
    }
  }
  if (positions.length !== 1) throw syntax('task next requires exactly one <task-id>.');
  return {
    taskId: positions[0],
    targetRoot: path.resolve(values.get('--target') || process.cwd()),
    executionTarget: values.has('--execution-target') ? path.resolve(values.get('--execution-target')) : null,
    profile: values.get('--profile') === true,
    json: values.get('--json') === true,
  };
}

function print(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else {
    console.log(`Task ${payload.task?.taskId || '<unknown>'}: ${payload.status}`);
    if (payload.environment?.execution?.workdir) console.log(`Execution root: ${payload.environment.execution.workdir}`);
    if (payload.next) console.log(`${payload.next.mode === 'required' ? 'Required' : 'Recommended'}: ${payload.next.summary}`);
    if (payload.finish?.availableCapabilities?.length) console.log(`Finish capabilities: ${payload.finish.availableCapabilities.map((item) => `${item.id}:${item.status}`).join(', ')}`);
    if (payload.diagnostic) console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}`);
  }
  if (payload.status === 'blocked') process.exitCode = 1;
  return payload;
}

export function taskEntrySnapshotCommand(runtime, args) {
  const input = parse(args);
  return print(runtime.inspectTaskEntrySnapshot(input.targetRoot, input.taskId, { executionTarget: input.executionTarget, profile: input.profile }), input.json);
}
