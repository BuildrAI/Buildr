import path from 'node:path';
import process from 'node:process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../application/json-contracts.mjs';

function syntax(message, usage) {
  const error = new Error(message);
  error.code = 'task_verification_cli.syntax';
  error.status = 400;
  error.usage = usage;
  return error;
}

function parseCapability(value, usage) {
  const first = value.indexOf('::');
  const second = first < 0 ? -1 : value.indexOf('::', first + 2);
  if (first <= 0 || second <= first + 2 || second === value.length - 2) {
    throw syntax('--capability 必须使用 <project>/<capability>::<passed|failed>::<fact>。', usage);
  }
  const reference = value.slice(0, first);
  const separator = reference.indexOf('/');
  if (separator <= 0 || separator === reference.length - 1) throw syntax('--capability reference 必须使用 <project>/<capability>。', usage);
  return {
    project: reference.slice(0, separator),
    capability: reference.slice(separator + 1),
    outcome: value.slice(first + 2, second),
    fact: value.slice(second + 2),
  };
}

function parseCoverageGap(value, usage) {
  const separator = value.indexOf('::');
  if (separator <= 0 || separator === value.length - 2) throw syntax('--coverage-gap 必须使用 <scope>::<summary>。', usage);
  return { scope: value.slice(0, separator), summary: value.slice(separator + 2) };
}

function groupCapabilities(values, usage) {
  const grouped = new Map();
  for (const value of values) {
    const item = parseCapability(value, usage);
    const key = `${item.project}/${item.capability}`;
    const current = grouped.get(key);
    if (current && current.outcome !== item.outcome) throw syntax(`同一 capability 不能同时声明不同 outcome：${key}。`, usage);
    if (current) current.facts.push(item.fact);
    else grouped.set(key, { project: item.project, capability: item.capability, outcome: item.outcome, facts: [item.fact] });
  }
  return [...grouped.values()];
}

function parseTaskVerificationCli(operation, args) {
  const usages = {
    inspect: 'buildr task verification inspect <task-id> [--target-identity <identity>] [--target <canonical-workspace>] [--json]',
    record: 'buildr task verification record <task-id> --target-identity <identity> --target-summary <text> [--capability <project>/<capability>::<passed|failed>::<fact> ...] [--coverage-gap <scope>::<summary> ...] --outcome <passed|not-passed> --summary <text> [--declaration-root <task-environment-root>] [--target <canonical-workspace>] [--json]',
  };
  const allowed = operation === 'inspect'
    ? new Set(['--target-identity', '--target', '--json'])
    : new Set(['--target-identity', '--target-summary', '--capability', '--coverage-gap', '--outcome', '--summary', '--declaration-root', '--target', '--json']);
  const repeatable = new Set(['--capability', '--coverage-gap']);
  const values = new Map();
  const positions = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    if (!allowed.has(arg)) throw syntax(`Unknown argument: ${arg}`, usages[operation]);
    const list = values.get(arg) || [];
    if (!repeatable.has(arg) && list.length) throw syntax(`Argument may only be provided once: ${arg}`, usages[operation]);
    if (arg === '--json') list.push(true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`, usages[operation]);
      list.push(value);
      index += 1;
    }
    values.set(arg, list);
  }
  if (positions.length !== 1) throw syntax(`task verification ${operation} requires exactly one <task-id>.`, usages[operation]);
  const one = (name) => values.get(name)?.[0];
  const many = (name) => values.get(name) || [];
  return {
    taskId: positions[0],
    targetRoot: path.resolve(one('--target') || process.cwd()),
    json: Boolean(one('--json')),
    one,
    capabilities: groupCapabilities(many('--capability'), usages[operation]),
    coverageGaps: many('--coverage-gap').map((value) => parseCoverageGap(value, usages[operation])),
  };
}

function emptySlot() { return { path: null, present: false, result: null, resultDigest: null, applicability: null }; }

function blockedResult(runtime, operation, taskId, targetRoot, error) {
  let resultSlot = emptySlot();
  try { resultSlot = runtime.inspectTaskVerification(targetRoot, taskId).slot; } catch {}
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskVerificationOperationResult, {
    operation,
    status: 'blocked',
    taskId: taskId || null,
    slot: resultSlot,
    diagnostic: { code: error.code || 'task_verification_failed', message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
    effects: [],
    nextActions: [error.nextAction || '检查 Task Verification 诊断并基于当前 Task、target 与 declarations 重试。'],
  });
}

function print(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.status === 'blocked') console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${payload.nextActions[0]}`);
  else console.log(`Task ${payload.taskId} verification ${payload.status}.`);
  return payload;
}

export function taskVerificationCommand(runtime, operation, args) {
  const parsed = parseTaskVerificationCli(operation, args);
  try {
    const payload = operation === 'inspect'
      ? runtime.inspectTaskVerification(parsed.targetRoot, parsed.taskId, { targetIdentity: parsed.one('--target-identity') })
      : runtime.recordTaskVerification(parsed.targetRoot, parsed.taskId, {
        targetIdentity: parsed.one('--target-identity'),
        targetSummary: parsed.one('--target-summary'),
        capabilities: parsed.capabilities,
        coverageGaps: parsed.coverageGaps,
        conclusion: { outcome: parsed.one('--outcome'), summary: parsed.one('--summary') },
        declarationRoot: parsed.one('--declaration-root'),
      });
    return print(payload, parsed.json);
  } catch (error) {
    if (!error.taskVerificationBusiness && !error.taskRecordBusiness) throw error;
    const payload = blockedResult(runtime, operation, parsed.taskId, parsed.targetRoot, error);
    print(payload, parsed.json);
    process.exitCode = 1;
    return payload;
  }
}
