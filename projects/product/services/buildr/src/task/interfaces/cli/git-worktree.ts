import path from 'node:path';
import process from 'node:process';

import type { GitWorktreeCleanupDeliveryInput } from '../../domain/git-worktree.ts';

type GitWorktreeOperation = 'create' | 'inspect' | 'cleanup';
type GitWorktreeRepositoryResult = {
  selector: string;
  state: string;
  checkoutPath: string;
};
type GitWorktreeResult = {
  operation: string;
  status: string;
  taskId: string;
  repositories: GitWorktreeRepositoryResult[];
  diagnostic?: { message: string } | null;
};
type GitWorktreeCliRuntime = {
  prepareGitWorktrees(input: {
    workspaceRoot: string;
    taskId: string;
    branch: string | null;
    startPoint: string;
    includes: string[];
  }): GitWorktreeResult;
  inspectGitWorktrees(input: { workspaceRoot: string; taskId: string }): GitWorktreeResult;
  cleanupGitWorktrees(input: {
    workspaceRoot: string;
    taskId: string;
    cleanupDelivery: GitWorktreeCleanupDeliveryInput;
    allowCompleted: true;
  }): GitWorktreeResult;
};

type ParsedArguments = {
  taskId: string;
  targetRoot: string;
  json: boolean;
  branch: string | null;
  startPoint: string;
  includes: string[];
  cleanupDelivery: GitWorktreeCleanupDeliveryInput;
};

function syntax(operation: GitWorktreeOperation, message: string): Error {
  const options = operation === 'create'
    ? '[--branch <branch>] [--start-point <ref>] [--include <selector> ...]'
    : operation === 'cleanup'
      ? '--expected-source <selector>=<full-commit> --delivered-ref <selector>=<full-commit> [...]'
      : '';
  return Object.assign(new Error(message), {
    code: 'git_worktree_cli.syntax',
    status: 400,
    usage: `buildr worktree ${operation} <task-id> ${options} [--target <canonical-workspace>] [--json]`.replace('  ', ' '),
  });
}

function stringValue(value: string | true | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseRepositoryPairs(
  operation: GitWorktreeOperation,
  sourceValues: readonly (string | true)[],
  targetValues: readonly (string | true)[],
): GitWorktreeCleanupDeliveryInput {
  const parse = (flag: string, entries: readonly (string | true)[]): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const entry of entries) {
      if (typeof entry !== 'string') throw syntax(operation, `${flag} requires <selector>=<full-commit>.`);
      const separator = entry.indexOf('=');
      if (separator < 1 || separator === entry.length - 1) throw syntax(operation, `${flag} requires <selector>=<full-commit>.`);
      const selector = entry.slice(0, separator);
      if (Object.hasOwn(result, selector)) throw syntax(operation, `Duplicate repository selector: ${selector}`);
      result[selector] = entry.slice(separator + 1);
    }
    return result;
  };
  const expectedSources = parse('--expected-source', sourceValues);
  const deliveredRefs = parse('--delivered-ref', targetValues);
  if (!Object.keys(expectedSources).length || JSON.stringify(Object.keys(expectedSources).sort()) !== JSON.stringify(Object.keys(deliveredRefs).sort())) {
    throw syntax(operation, 'cleanup requires paired --expected-source and --delivered-ref values.');
  }
  return { expectedSources, deliveredRefs };
}

function parse(operation: GitWorktreeOperation, args: readonly string[]): ParsedArguments {
  const allowed = operation === 'create'
    ? new Set(['--branch', '--start-point', '--include', '--target', '--json'])
    : operation === 'cleanup'
      ? new Set(['--expected-source', '--delivered-ref', '--target', '--json'])
      : new Set(['--target', '--json']);
  const repeatable = new Set(['--include', '--expected-source', '--delivered-ref']);
  const values = new Map<string, Array<string | true>>();
  const positions: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positions.push(arg);
      continue;
    }
    if (!allowed.has(arg)) throw syntax(operation, `Unknown argument: ${arg}`);
    const entries = values.get(arg) ?? [];
    if (!repeatable.has(arg) && entries.length) throw syntax(operation, `Argument may only be provided once: ${arg}`);
    if (arg === '--json') entries.push(true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(operation, `Missing value for ${arg}`);
      entries.push(value);
      index += 1;
    }
    values.set(arg, entries);
  }
  if (positions.length !== 1) throw syntax(operation, `worktree ${operation} requires exactly one <task-id>.`);
  const one = (name: string): string | true | undefined => values.get(name)?.[0];
  return {
    taskId: positions[0],
    targetRoot: path.resolve(stringValue(one('--target')) ?? process.cwd()),
    json: one('--json') === true,
    branch: stringValue(one('--branch')) ?? null,
    startPoint: stringValue(one('--start-point')) ?? 'HEAD',
    includes: (values.get('--include') ?? []).filter((value): value is string => typeof value === 'string'),
    cleanupDelivery: operation === 'cleanup'
      ? parseRepositoryPairs(operation, values.get('--expected-source') ?? [], values.get('--delivered-ref') ?? [])
      : {},
  };
}

function print(payload: GitWorktreeResult, json: boolean): GitWorktreeResult {
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

export function gitWorktreeCommand(runtime: GitWorktreeCliRuntime, operation: GitWorktreeOperation, args: readonly string[]): GitWorktreeResult {
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
  if (operation === 'inspect') {
    return print(runtime.inspectGitWorktrees({ workspaceRoot: parsed.targetRoot, taskId: parsed.taskId }), parsed.json);
  }
  return print(runtime.cleanupGitWorktrees({
    workspaceRoot: parsed.targetRoot,
    taskId: parsed.taskId,
    cleanupDelivery: parsed.cleanupDelivery,
    allowCompleted: true,
  }), parsed.json);
}
