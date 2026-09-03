import path from 'node:path';
import process from 'node:process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';
import type { TaskReviewType } from '../../domain/task-review.ts';

type ReviewOperation = 'inspect' | 'record';
type ReviewSlot = { path: string | null; present: boolean; result: unknown; resultDigest: string | null; observedAt: string | null };
type ReviewSlots = { planning: ReviewSlot; completion: ReviewSlot };
type ReviewCliResult = { taskId: string | null; status: string; slots: ReviewSlots; diagnostic?: { code: string; message: string } | null; nextActions?: string[] } & Record<string, unknown>;
export type TaskReviewCliRuntime = {
  taskReviewResultPath(targetRoot: string, taskId: string, reviewType: TaskReviewType): string;
  inspectTaskReview(targetRoot: string, taskId: string): ReviewCliResult;
  recordTaskReview(targetRoot: string, taskId: string, input: unknown): ReviewCliResult;
};
type ParsedReviewCli = {
  taskId: string; targetRoot: string; json: boolean;
  one(name: string): string | undefined; many(name: string): string[];
  uncovered: Array<{ subject: string; reason: string }>;
};
type ReviewErrorFields = { code: string; message: string; details?: unknown; nextAction?: string; taskReviewBusiness?: boolean; taskRecordBusiness?: boolean };

function errorFields(error: unknown): ReviewErrorFields {
  if (!(error instanceof Error)) return { code: 'task_review_failed', message: String(error) };
  const fields = Object.fromEntries(Object.entries(error));
  return { code: typeof fields.code === 'string' ? fields.code : 'task_review_failed', message: error.message,
    ...(fields.details === undefined ? {} : { details: fields.details }), ...(typeof fields.nextAction === 'string' ? { nextAction: fields.nextAction } : {}),
    ...(fields.taskReviewBusiness === true ? { taskReviewBusiness: true } : {}), ...(fields.taskRecordBusiness === true ? { taskRecordBusiness: true } : {}) };
}
function syntax(message: string, usage: string) {
  return Object.assign(new Error(message), { code: 'task_review_cli.syntax', status: 400, usage });
}

function parseUncovered(value: string, usage: string) {
  const separator = value.indexOf('::');
  if (separator <= 0 || separator === value.length - 2) throw syntax('--uncovered 必须使用 <subject>::<reason>。', usage);
  return { subject: value.slice(0, separator), reason: value.slice(separator + 2) };
}

function parseTaskReviewCli(operation: ReviewOperation, args: string[]): ParsedReviewCli {
  const usages = {
    inspect: 'buildr task review inspect <task-id> [--target <canonical-workspace>] [--json]',
    record: 'buildr task review record <task-id> --type <planning|completion> --subject-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <accepted|changes-requested> --summary <text> --expected-current <absent|sha256-digest> [--target <canonical-workspace>] [--json]',
  };
  const allowed = operation === 'inspect'
    ? new Set(['--target', '--json'])
    : new Set(['--type', '--subject-identity', '--method', '--reviewed', '--uncovered', '--finding', '--outcome', '--summary', '--expected-current', '--target', '--json']);
  const repeatable = new Set(['--reviewed', '--uncovered', '--finding']);
  const values = new Map<string, Array<string | boolean>>();
  const positions: string[] = [];
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
  const one = (name: string) => { const value = values.get(name)?.[0]; return typeof value === 'string' ? value : undefined; };
  const many = (name: string) => (values.get(name) || []).filter((value): value is string => typeof value === 'string');
  return {
    taskId: positions[0],
    targetRoot: path.resolve(one('--target') || process.cwd()),
    json: values.get('--json')?.[0] === true,
    one,
    many,
    uncovered: many('--uncovered').map((value) => parseUncovered(value, usages[operation])),
  };
}

function emptySlots(runtime: TaskReviewCliRuntime, targetRoot: string, taskId: string): ReviewSlots {
  const build = (reviewType: TaskReviewType): ReviewSlot => {
    let reviewPath = null;
    try { reviewPath = runtime.taskReviewResultPath(targetRoot, taskId, reviewType); } catch {}
    return { path: reviewPath, present: false, result: null, resultDigest: null, observedAt: null };
  };
  return { planning: build('planning'), completion: build('completion') };
}

function blockedResult(runtime: TaskReviewCliRuntime, operation: ReviewOperation, taskId: string, targetRoot: string, error: ReviewErrorFields): ReviewCliResult {
  let reviewSlots = emptySlots(runtime, targetRoot, taskId);
  try { reviewSlots = runtime.inspectTaskReview(targetRoot, taskId).slots; } catch {}
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskReviewOperationResult, {
    operation,
    status: 'blocked',
    taskId: taskId || null,
    slots: reviewSlots,
    diagnostic: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
    effects: [],
    nextActions: [error.nextAction || '检查 Task Review 诊断，重新观察审查对象与 current slot 后重试。'],
  });
}

function print<T extends ReviewCliResult>(payload: T, json: boolean): T {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.status === 'blocked' && payload.diagnostic) console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${payload.nextActions?.[0] || ''}`);
  else console.log(`Task ${payload.taskId} review ${payload.status}.`);
  return payload;
}

export function taskReviewCommand(runtime: TaskReviewCliRuntime, operation: ReviewOperation, args: string[]) {
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
  } catch (error: unknown) {
    const failure = errorFields(error);
    if (!failure.taskReviewBusiness && !failure.taskRecordBusiness) throw error;
    const payload = blockedResult(runtime, operation, parsed.taskId, parsed.targetRoot, failure);
    print(payload, parsed.json);
    process.exitCode = 1;
    return payload;
  }
}
