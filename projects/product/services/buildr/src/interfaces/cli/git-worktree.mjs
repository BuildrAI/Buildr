import path from 'node:path';
import process from 'node:process';

function syntax(operation, message) {
  const options = operation === 'create'
    ? '[--branch <branch>] [--start-point <ref>] [--include <selector> ...]'
    : operation === 'cleanup'
      ? '[--integrated-ref <selector>=<ref> ...]'
      : '';
  const error = new Error(message);
  error.code = 'git_worktree_cli.syntax';
  error.status = 400;
  error.usage = `buildr worktree ${operation} <task-id> ${options} [--target <canonical-workspace>] [--json]`.replace('  ', ' ');
  return error;
}

function parse(operation, args) {
  const allowed = operation === 'create'
    ? new Set(['--branch', '--start-point', '--include', '--target', '--json'])
    : operation === 'cleanup'
      ? new Set(['--integrated-ref', '--target', '--json'])
      : new Set(['--target', '--json']);
  const repeatable = new Set(['--include', '--integrated-ref']);
  const values = new Map();
  const positions = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positions.push(arg);
      continue;
    }
    if (!allowed.has(arg)) throw syntax(operation, `Unknown argument: ${arg}`);
    const list = values.get(arg) || [];
    if (!repeatable.has(arg) && list.length) throw syntax(operation, `Argument may only be provided once: ${arg}`);
    if (arg === '--json') list.push(true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(operation, `Missing value for ${arg}`);
      list.push(value);
      index += 1;
    }
    values.set(arg, list);
  }
  if (positions.length !== 1) throw syntax(operation, `worktree ${operation} requires exactly one <task-id>.`);
  const one = (name) => values.get(name)?.[0];
  return {
    taskId: positions[0],
    targetRoot: path.resolve(one('--target') || process.cwd()),
    json: one('--json') === true,
    branch: one('--branch') || null,
    startPoint: one('--start-point') || 'HEAD',
    includes: values.get('--include') || [],
    integratedRefValues: values.get('--integrated-ref') || [],
  };
}

function print(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else {
    console.log(`Git worktree ${payload.operation}: ${payload.status}`);
    console.log(`Task: ${payload.taskId}`);
    for (const repository of payload.repositories) console.log(`${repository.selector}: ${repository.state} ${repository.checkoutPath}`);
    if (payload.diagnostic) console.error(payload.diagnostic.message);
  }
  if (payload.status === 'blocked') process.exitCode = 1;
  return payload;
}

export function gitWorktreeCommand(runtime, operation, args) {
  const parsed = parse(operation, args);
  if (operation === 'create') {
    return print(runtime.prepareGitWorktrees({
      workspaceRoot: parsed.targetRoot,
      taskId: parsed.taskId,
      branch: parsed.branch,
      startPoint: parsed.startPoint,
      includes: parsed.includes,
    }), parsed.json);
  }
  if (operation === 'inspect') return print(runtime.inspectGitWorktrees({ workspaceRoot: parsed.targetRoot, taskId: parsed.taskId }), parsed.json);
  const integratedRefs = {};
  for (const value of parsed.integratedRefValues) {
    const separator = value.indexOf('=');
    if (separator < 1 || separator === value.length - 1) throw syntax(operation, '--integrated-ref must use <selector>=<ref>.');
    const selector = value.slice(0, separator);
    if (integratedRefs[selector]) throw syntax(operation, `Duplicate integrated ref selector: ${selector}`);
    integratedRefs[selector] = value.slice(separator + 1);
  }
  return print(runtime.cleanupGitWorktrees({ workspaceRoot: parsed.targetRoot, taskId: parsed.taskId, integratedRefs }), parsed.json);
}
