import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  TASK_ENVIRONMENT_PLAN_REQUEST_EXAMPLE,
  TASK_ENVIRONMENT_PLAN_REQUEST_INPUT_SCHEMA,
} from '../../domain/task-environment-plan.mjs';

function syntax(operation, message) {
  const usage = operation === 'prepare'
    ? 'buildr task environment prepare <task-id> --agent <adapter> [--plan <json-file>] [--branch <branch>] [--start-point <ref>] [--shared] [--target <canonical-workspace>] [--json]'
    : operation === 'plan-record'
      ? 'buildr task environment plan record <task-id> --input <json-file> [--target <canonical-workspace>] [--json] | --schema | --example'
      : operation === 'plan-inspect'
        ? 'buildr task environment plan inspect <task-id> [--target <canonical-workspace>] [--json]'
    : operation === 'cleanup' ? 'buildr task environment cleanup <task-id> [--expected-source <selector>=<commit> --delivered-ref <selector>=<commit>] [--target <canonical-workspace>] [--json]'
    : `buildr task environment ${operation} <task-id> [--target <canonical-workspace>] [--json]`;
  const error = new Error(message);
  error.code = 'task_environment_cli.syntax';
  error.status = 400;
  error.usage = usage;
  return error;
}

function parse(operation, args) {
  const allowed = operation === 'prepare'
    ? new Set(['--plan', '--agent', '--branch', '--start-point', '--shared', '--target', '--json'])
    : operation === 'plan-record'
      ? new Set(['--input', '--target', '--json', '--schema', '--example'])
    : operation === 'cleanup' ? new Set(['--target', '--json', '--expected-source', '--delivered-ref']) : new Set(['--target', '--json']);
  const boolean = new Set(['--json', '--shared', '--schema', '--example']);
  const values = new Map();
  const cleanup = { expectedSources: {}, deliveredRefs: {} };
  const positions = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positions.push(arg);
      continue;
    }
    if (!allowed.has(arg)) throw syntax(operation, `Unknown argument: ${arg}`);
    if (arg === '--expected-source' || arg === '--delivered-ref') {
      const entry = args[++index];
      const separator = entry?.indexOf('=') ?? -1;
      if (separator < 1 || !entry.slice(separator + 1)) throw syntax(operation, `${arg} requires <selector>=<full-commit>.`);
      const selector = entry.slice(0, separator);
      const refs = arg === '--expected-source' ? cleanup.expectedSources : cleanup.deliveredRefs;
      if (Object.hasOwn(refs, selector)) throw syntax(operation, `Duplicate repository selector: ${selector}`);
      Object.defineProperty(refs, selector, { value: entry.slice(separator + 1), enumerable: true });
      continue;
    }
    if (values.has(arg)) throw syntax(operation, `Argument may only be provided once: ${arg}`);
    if (boolean.has(arg)) values.set(arg, true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(operation, `Missing value for ${arg}`);
      values.set(arg, value);
      index += 1;
    }
  }
  const discovery = operation === 'plan-record' && (values.has('--schema') || values.has('--example'));
  if (discovery) {
    if (values.has('--schema') && values.has('--example')) throw syntax(operation, 'Discovery accepts exactly one of --schema or --example.');
    if (positions.length || [...values.keys()].some((name) => !['--schema', '--example', '--json'].includes(name))) throw syntax(operation, 'Discovery accepts only --schema or --example, optionally with --json.');
    return { taskId: null, targetRoot: null, json: true, discovery: values.has('--schema') ? 'schema' : 'example', plan: null };
  }
  if (positions.length !== 1) throw syntax(operation, `task environment ${operation} requires exactly one <task-id>.`);
  if (operation === 'prepare' && !values.has('--agent')) throw syntax(operation, '--agent is required.');
  if (operation === 'plan-record' && !values.has('--input')) throw syntax(operation, '--input is required.');
  const readJson = (flag) => {
    if (!values.has(flag)) return null;
    const file = path.resolve(values.get(flag));
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw syntax(operation, `Cannot read ${flag} JSON: ${error.message}`); }
  };
  return {
    taskId: positions[0],
    targetRoot: path.resolve(values.get('--target') || process.cwd()),
    json: values.get('--json') === true,
    adapter: values.get('--agent') || null,
    branch: values.get('--branch') || null,
    startPoint: values.get('--start-point') || null,
    shared: values.get('--shared') === true,
    discovery: null,
    cleanup,
    plan: readJson(operation === 'plan-record' ? '--input' : '--plan'),
  };
}

function print(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else {
    console.log(`Task Environment ${payload.operation}: ${payload.status}`);
    console.log(`Task: ${payload.taskId}`);
    if (payload.environment) console.log(`执行根: ${payload.environment.scopes.map((scope) => scope.executionRoot).join(', ')}`);
    if (payload.diagnostic) console.error(payload.diagnostic.message);
    for (const action of payload.nextActions) console.log(`Next: ${action}`);
  }
  if (payload.status === 'blocked') process.exitCode = 1;
  return payload;
}

export async function taskEnvironmentCommand(runtime, operation, args) {
  const parsed = parse(operation, args);
  let payload;
  if (operation === 'prepare') {
    payload = runtime.prepareTaskEnvironment(parsed.targetRoot, parsed.taskId, {
      adapter: parsed.adapter,
      branch: parsed.branch,
      startPoint: parsed.startPoint,
      useGit: parsed.shared ? false : undefined,
      plan: parsed.plan,
    });
  } else if (operation === 'inspect') payload = runtime.inspectTaskEnvironment(parsed.targetRoot, parsed.taskId);
  else payload = await runtime.cleanupTaskEnvironment(parsed.targetRoot, parsed.taskId, null, parsed.cleanup);
  return print(payload, parsed.json);
}

export async function taskEnvironmentPlanCommand(runtime, operation, args) {
  const parsed = parse(`plan-${operation}`, args);
  if (parsed.discovery) {
    const payload = parsed.discovery === 'schema'
      ? { schemaVersion: 'buildr.task-environment-plan-request-input-schema/v1', operation: 'discover-schema', status: 'ready', inputSchema: TASK_ENVIRONMENT_PLAN_REQUEST_INPUT_SCHEMA, effects: [] }
      : { schemaVersion: 'buildr.task-environment-plan-request-example/v1', operation: 'discover-example', status: 'ready', input: TASK_ENVIRONMENT_PLAN_REQUEST_EXAMPLE, effects: [] };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
  const payload = operation === 'record'
    ? runtime.recordTaskEnvironmentPlan(parsed.targetRoot, parsed.taskId, parsed.plan)
    : runtime.inspectTaskEnvironmentPlan(parsed.targetRoot, parsed.taskId);
  return print(payload, parsed.json);
}
