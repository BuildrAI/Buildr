// @ts-nocheck -- Existing CLI migrated to the single TypeScript source in this change.
import path from 'node:path';
import process from 'node:process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';

function syntax(message, usage) {
  const error = new Error(message);
  error.code = 'task_review_cli.syntax';
  error.status = 400;
  error.usage = usage;
  return error;
}

function parseUncovered(value, usage) {
  const separator = value.indexOf('::');
  if (separator <= 0 || separator === value.length - 2) throw syntax('--uncovered 必须使用 <subject>::<reason>。', usage);
  return { subject: value.slice(0, separator), reason: value.slice(separator + 2) };
}

function parseTaskReviewCli(operation, args) {
  const usages = {
    inspect: 'buildr task review inspect <task-id> [--target <canonical-workspace>] [--json]',
    record: 'buildr task review record <task-id> --type <planning|completion> --subject-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <accepted|changes-requested> --summary <text> --expected-current <absent|sha256-digest> [--target <canonical-workspace>] [--json]',
  };
  const allowed = operation === 'inspect'
    ? new Set(['--target', '--json'])
    : new Set(['--type', '--subject-identity', '--method', '--reviewed', '--uncovered', '--finding', '--outcome', '--summary', '--expected-current', '--target', '--json']);
  const repeatable = new Set(['--reviewed', '--uncovered', '--finding']);
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
  if (positions.length !== 1) throw syntax(`task review ${operation} requires exactly one <task-id>.`, usages[operation]);
  const one = (name) => values.get(name)?.[0];
  const many = (name) => values.get(name) || [];
  return {
    taskId: positions[0],
    targetRoot: path.resolve(one('--target') || process.cwd()),
    json: Boolean(one('--json')),
    one,
    many,
    uncovered: many('--uncovered').map((value) => parseUncovered(value, usages[operation])),
  };
}

function emptySlots(runtime, targetRoot, taskId) {
  const build = (reviewType) => {
    let reviewPath = null;
    try { reviewPath = runtime.taskReviewResultPath(targetRoot, taskId, reviewType); } catch {}
    return { path: reviewPath, present: false, result: null, resultDigest: null, observedAt: null };
  };
  return { planning: build('planning'), completion: build('completion') };
}

function blockedResult(runtime, operation, taskId, targetRoot, error) {
  let reviewSlots = emptySlots(runtime, targetRoot, taskId);
  try { reviewSlots = runtime.inspectTaskReview(targetRoot, taskId).slots; } catch {}
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskReviewOperationResult, {
    operation,
    status: 'blocked',
    taskId: taskId || null,
    slots: reviewSlots,
    diagnostic: { code: error.code || 'task_review_failed', message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
    effects: [],
    nextActions: [error.nextAction || '检查 Task Review 诊断，重新观察审查对象与 current slot 后重试。'],
  });
}

function print(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.status === 'blocked') console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${payload.nextActions[0]}`);
  else console.log(`Task ${payload.taskId} review ${payload.status}.`);
  return payload;
}

export function taskReviewCommand(runtime, operation, args) {
  const parsed = parseTaskReviewCli(operation, args);
  try {
    const payload = operation === 'inspect'
      ? runtime.inspectTaskReview(parsed.targetRoot, parsed.taskId)
      : runtime.recordTaskReview(parsed.targetRoot, parsed.taskId, {
        reviewType: parsed.one('--type'),
        subjectIdentity: parsed.one('--subject-identity'),
        method: parsed.one('--method'),
        reviewed: parsed.many('--reviewed'),
        uncovered: parsed.uncovered,
        findings: parsed.many('--finding'),
        conclusion: { outcome: parsed.one('--outcome'), summary: parsed.one('--summary') },
        expectedCurrentDigest: parsed.one('--expected-current'),
      });
    return print(payload, parsed.json);
  } catch (error) {
    if (!error.taskReviewBusiness && !error.taskRecordBusiness) throw error;
    const payload = blockedResult(runtime, operation, parsed.taskId, parsed.targetRoot, error);
    print(payload, parsed.json);
    process.exitCode = 1;
    return payload;
  }
}
