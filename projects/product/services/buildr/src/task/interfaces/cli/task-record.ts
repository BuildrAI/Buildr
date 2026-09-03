import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';
import type { TaskRecord, TaskRecordBusinessError } from '../../domain/task-record.ts';
import type { TaskPersistence } from '../../persistence/task-record-repository.ts';

type TaskAction = 'create' | 'inspect' | 'update' | 'activate' | 'complete' | 'abandon';
type CliValue = string | true;
type TaskCliResult = {
  status: string;
  taskId: string | null;
  diagnostic: null | { code: string; message: string; details?: unknown };
  nextActions: string[];
  [field: string]: unknown;
};
export type TaskCommandRuntime = {
  readTaskRecordPersistence(targetRoot: string, taskId: string): TaskPersistence;
  createTaskRecord(targetRoot: string, input: Record<string, unknown>): TaskCliResult;
  inspectTaskRecord(targetRoot: string, taskId: string): TaskCliResult;
  updateTaskRecord(targetRoot: string, taskId: string, input: Record<string, unknown>): TaskCliResult;
  activateTaskRecord(targetRoot: string, taskId: string, input: Record<string, unknown>): TaskCliResult;
  completeTaskRecord(targetRoot: string, taskId: string, input: Record<string, unknown>): TaskCliResult;
  abandonTaskRecord(targetRoot: string, taskId: string, input: Record<string, unknown>): TaskCliResult;
};

function syntax(message: string, usage: string) {
  return Object.assign(new Error(message), { code: 'task_record_cli.syntax', status: 400, usage });
}

function parseTaskRecordCli(action: TaskAction, args: string[]) {
  const usages = {
    create: 'buildr task create <task-id> --title <text> --intent <text> [--status <todo|active>] [--parent-task] [--parent <task-id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] [--target <canonical-workspace>] [--json]',
    inspect: 'buildr task inspect <task-id> [--target <canonical-workspace>] [--json]',
    update: 'buildr task update <task-id> --expected-record <recordDigest> [--status todo|active|completed|abandoned] [--reason <text>] [--summary <text>] [--parent-completion <json-file>] [--title <text>] [--intent <text>] [--parent <task-id> | --clear-parent] [--retrospective-state <pending-decision|decided> --retrospective-document-digest <sha256>] [--clear-retrospective] [--add-project <code> ...] [--remove-project <code> ...] [--add-service <project/service> ...] [--remove-service <project/service> ...] [--add-change <project/change> ...] [--remove-change <project/change> ...] [--target <canonical-workspace>] [--json]',
    activate: 'buildr task activate <task-id> --expected-record <recordDigest> [--target <canonical-workspace>] [--json]',
    complete: 'buildr task complete <task-id> --summary <text> --expected-record <recordDigest> [--parent-completion <evidence.json>] [--target <canonical-workspace>] [--json]',
    abandon: 'buildr task abandon <task-id> --reason <text> --expected-record <recordDigest> [--target <canonical-workspace>] [--json]',
  };
  const allowedByAction = {
    create: new Set(['--title', '--intent', '--status', '--parent-task', '--parent', '--project', '--service', '--change', '--target', '--json']),
    inspect: new Set(['--target', '--json']),
    update: new Set(['--status', '--reason', '--summary', '--parent-completion', '--title', '--intent', '--parent', '--clear-parent', '--parent-task', '--expected-record', '--retrospective-state', '--retrospective-document-digest', '--clear-retrospective', '--add-project', '--remove-project', '--add-service', '--remove-service', '--add-change', '--remove-change', '--target', '--json']),
    activate: new Set(['--expected-record', '--target', '--json']),
    complete: new Set(['--summary', '--parent-completion', '--expected-record', '--target', '--json']),
    abandon: new Set(['--reason', '--expected-record', '--target', '--json']),
  };
  const repeatable = new Set(['--project', '--service', '--change', '--add-project', '--remove-project', '--add-service', '--remove-service', '--add-change', '--remove-change']);
  const boolean = new Set(['--json', '--clear-parent', '--parent-task', '--clear-retrospective']);
  const values = new Map<string, CliValue[]>();
  const positions: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    if (!allowedByAction[action].has(arg)) throw syntax(`Unknown argument: ${arg}`, usages[action]);
    const list = values.get(arg) || [];
    if (!repeatable.has(arg) && list.length) throw syntax(`Argument may only be provided once: ${arg}`, usages[action]);
    if (boolean.has(arg)) list.push(true);
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`, usages[action]);
      list.push(value);
      index += 1;
    }
    values.set(arg, list);
  }
  if (positions.length !== 1) throw syntax(`${action} requires exactly one <task-id>.`, usages[action]);
  const one = (name: string): CliValue | undefined => values.get(name)?.[0];
  const many = (name: string): string[] => (values.get(name) || []).filter((value): value is string => typeof value === 'string');
  if (action === 'create' && (!one('--title') || !one('--intent'))) throw syntax('create requires --title and --intent.', usages[action]);
  if (action === 'complete' && !one('--summary')) throw syntax('complete requires --summary.', usages[action]);
  if (action === 'abandon' && !one('--reason')) throw syntax('abandon requires --reason.', usages[action]);
  if (action !== 'create' && action !== 'inspect' && !one('--expected-record')) throw syntax(`${action} requires --expected-record.`, usages[action]);
  if (action === 'update' && one('--parent') && one('--clear-parent')) throw syntax('update cannot use --parent and --clear-parent together.', usages[action]);
  const target = one('--target');
  return { taskId: positions[0], targetRoot: path.resolve(typeof target === 'string' ? target : process.cwd()), json: Boolean(one('--json')), one, many };
}

function digestFromDetails(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details) || !('currentRecordDigest' in details)) return null;
  return typeof details.currentRecordDigest === 'string' ? details.currentRecordDigest : null;
}

function blockedResult(runtime: TaskCommandRuntime, operation: TaskAction, taskId: string, targetRoot: string, error: TaskRecordBusinessError): TaskCliResult {
  let current: TaskPersistence | null = null;
  try { current = runtime.readTaskRecordPersistence(targetRoot, taskId); } catch {}
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRecordResult, {
    operation,
    status: 'blocked',
    taskId: taskId || null,
    record: current?.record || null,
    recordDigest: current?.recordDigest || digestFromDetails(error.details) || null,
    diagnostic: { code: error.code || 'task_record_failed', message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
    effects: [],
    nextActions: [error.nextAction || '检查 Task Record 诊断并基于当前事实重试。'],
  });
}

function printTaskRecordResult(payload: TaskCliResult, json: boolean): TaskCliResult {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.status === 'blocked' && payload.diagnostic) console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${payload.nextActions[0]}`);
  else {
    console.log(`Task ${payload.taskId} ${payload.status}`);
    for (const action of payload.nextActions) console.log(`Next: ${action}`);
  }
  return payload;
}

function readJsonFile(value: CliValue | undefined): unknown {
  if (typeof value !== 'string') throw new Error('JSON file path is required.');
  return JSON.parse(fs.readFileSync(path.resolve(value), 'utf8'));
}

export function taskRecordCommand(runtime: TaskCommandRuntime, action: TaskAction, args: string[]): TaskCliResult {
  const parsed = parseTaskRecordCli(action, args);
  try {
    let payload: TaskCliResult;
    if (action === 'create') payload = runtime.createTaskRecord(parsed.targetRoot, { taskId: parsed.taskId, title: parsed.one('--title'), intent: parsed.one('--intent'), status: parsed.one('--status'), isParent: parsed.one('--parent-task'), parentTaskId: parsed.one('--parent'), projects: parsed.many('--project'), services: parsed.many('--service'), changes: parsed.many('--change') });
    else if (action === 'inspect') payload = runtime.inspectTaskRecord(parsed.targetRoot, parsed.taskId);
    else if (action === 'update') payload = runtime.updateTaskRecord(parsed.targetRoot, parsed.taskId, { status: parsed.one('--status'), reason: parsed.one('--reason'), summary: parsed.one('--summary'), ...(parsed.one('--parent-completion') ? { parentCompletion: readJsonFile(parsed.one('--parent-completion')) } : {}), expectedRecordDigest: parsed.one('--expected-record'), ...(parsed.one('--parent-task') ? { isParent: true } : {}), title: parsed.one('--title'), intent: parsed.one('--intent'), ...(parsed.one('--clear-parent') ? { parentTaskId: null } : parsed.one('--parent') ? { parentTaskId: parsed.one('--parent') } : {}), retrospectiveState: parsed.one('--retrospective-state'), retrospectiveDocumentDigest: parsed.one('--retrospective-document-digest'), clearRetrospective: parsed.one('--clear-retrospective') === true, addProjects: parsed.many('--add-project'), removeProjects: parsed.many('--remove-project'), addServices: parsed.many('--add-service'), removeServices: parsed.many('--remove-service'), addChanges: parsed.many('--add-change'), removeChanges: parsed.many('--remove-change') });
    else if (action === 'activate') payload = runtime.activateTaskRecord(parsed.targetRoot, parsed.taskId, { expectedRecordDigest: parsed.one('--expected-record') });
    else if (action === 'complete') payload = runtime.completeTaskRecord(parsed.targetRoot, parsed.taskId, { ...(parsed.one('--parent-completion') ? { parentCompletion: readJsonFile(parsed.one('--parent-completion')) } : {}), summary: parsed.one('--summary'), expectedRecordDigest: parsed.one('--expected-record') });
    else payload = runtime.abandonTaskRecord(parsed.targetRoot, parsed.taskId, { reason: parsed.one('--reason'), expectedRecordDigest: parsed.one('--expected-record') });
    return printTaskRecordResult(payload, parsed.json);
  } catch (error) {
    if (!(error instanceof Error) || !('taskRecordBusiness' in error) || error.taskRecordBusiness !== true || !('code' in error) || typeof error.code !== 'string' || !('status' in error) || typeof error.status !== 'number') throw error;
    const taskRecordBusiness: true = true;
    const businessError = Object.assign(error, {
      code: error.code,
      status: error.status,
      taskRecordBusiness,
      ...('details' in error ? { details: error.details } : {}),
      ...('nextAction' in error && typeof error.nextAction === 'string' ? { nextAction: error.nextAction } : {}),
    });
    const payload = blockedResult(runtime, action, parsed.taskId, parsed.targetRoot, businessError);
    printTaskRecordResult(payload, parsed.json);
    process.exitCode = 1;
    return payload;
  }
}
