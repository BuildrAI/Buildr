import path from 'node:path';
import process from 'node:process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.mjs';

const USAGE = 'buildr task delivery inspect <task-id> [--target <canonical-workspace>] [--json]';

function syntax(message) {
  const error = new Error(message);
  error.code = 'task_terminal_delivery_cli.syntax';
  error.status = 400;
  error.usage = USAGE;
  return error;
}

export function parseTaskTerminalDeliveryCli(args) {
  const allowed = new Set(['--target', '--json']);
  const values = new Map();
  const positions = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positions.push(arg);
      continue;
    }
    if (!allowed.has(arg)) throw syntax(`Unknown argument: ${arg}`);
    if (values.has(arg)) throw syntax(`Argument may only be provided once: ${arg}`);
    if (arg === '--json') values.set(arg, true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`);
      values.set(arg, value);
      index += 1;
    }
  }
  if (positions.length !== 1) throw syntax('inspect requires exactly one <task-id>.');
  return {
    taskId: positions[0],
    targetRoot: path.resolve(values.get('--target') || process.cwd()),
    json: values.has('--json'),
  };
}

function printable(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function printTaskTerminalDelivery(payload, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
  console.log(`Task ${payload.taskId} delivery: ${payload.status}`);
  if (payload.delivery?.runId) console.log(`Run: ${payload.delivery.runId}`);
  if (payload.delivered) {
    if (payload.delivery.finalRemoteRef) console.log(`Final remote ref: ${printable(payload.delivery.finalRemoteRef)}`);
    console.log(`Cleanup: ${payload.delivery.cleanup?.status || 'unknown'}`);
  } else {
    if (payload.delivery?.phase) console.log(`Phase: ${payload.delivery.phase}`);
    if (payload.delivery?.nextAction) console.log(`Next: ${printable(payload.delivery.nextAction)}`);
  }
  for (const diagnostic of payload.diagnostics || []) console.log(`Diagnostic: [${diagnostic.code}] ${diagnostic.message}`);
  return payload;
}

export function taskTerminalDeliveryInspectCommand(runtime, args) {
  const parsed = parseTaskTerminalDeliveryCli(args);
  const projection = runtime.inspectTaskTerminalDelivery(parsed.targetRoot, parsed.taskId);
  const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.taskTerminalDelivery, projection);
  return printTaskTerminalDelivery(payload, parsed.json);
}
