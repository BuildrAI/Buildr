import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.mjs';

function syntax(message, usage) {
  const error = new Error(message);
  error.code = 'task_record_cli.syntax';
  error.status = 400;
  error.usage = usage;
  return error;
}

function parseTaskRecordCli(action, args) {
  const usages = {
    create: 'buildr task create <task-id> --title <text> --intent <text> [--status <todo|active>] [--parent-task] [--retrospective-source <task-id> ...] [--parent <task-id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] [--target <canonical-workspace>] [--json]',
    inspect: 'buildr task inspect <task-id> [--target <canonical-workspace>] [--json]',
    update: 'buildr task update <task-id> [--title <text>] [--intent <text>] [--parent <task-id> | --clear-parent] [--add-retrospective-source <task-id> ...] [--remove-retrospective-source <task-id> ...] [--add-project <code> ...] [--remove-project <code> ...] [--add-service <project/service> ...] [--remove-service <project/service> ...] [--add-change <project/change> ...] [--remove-change <project/change> ...] [--target <canonical-workspace>] [--json]',
    activate: 'buildr task activate <task-id> [--target <canonical-workspace>] [--json]',
    complete: 'buildr task complete <task-id> --summary <text> [--no-change] [--parent-completion <evidence.json>] [--expected-record <recordDigest>] [--target <canonical-workspace>] [--json]',
    abandon: 'buildr task abandon <task-id> --reason <text> [--target <canonical-workspace>] [--json]',
  };
  const allowedByAction = {
    create: new Set(['--title', '--intent', '--status', '--parent-task', '--retrospective-source', '--parent', '--project', '--service', '--change', '--target', '--json']),
    inspect: new Set(['--target', '--json']),
    update: new Set(['--title', '--intent', '--parent', '--clear-parent', '--parent-task', '--expected-record', '--add-retrospective-source', '--remove-retrospective-source', '--add-project', '--remove-project', '--add-service', '--remove-service', '--add-change', '--remove-change', '--target', '--json']),
    activate: new Set(['--target', '--json']),
    complete: new Set(['--summary', '--no-change', '--parent-completion', '--expected-record', '--target', '--json']),
    abandon: new Set(['--reason', '--target', '--json']),
  };
  const repeatable = new Set(['--project', '--service', '--change', '--retrospective-source', '--add-retrospective-source', '--remove-retrospective-source', '--add-project', '--remove-project', '--add-service', '--remove-service', '--add-change', '--remove-change']);
  const boolean = new Set(['--json', '--no-change', '--clear-parent', '--parent-task']);
  const values = new Map();
  const positions = [];
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
  const one = (name) => values.get(name)?.[0];
  const many = (name) => values.get(name) || [];
  if (action === 'create' && (!one('--title') || !one('--intent'))) throw syntax('create requires --title and --intent.', usages[action]);
  if (action === 'complete' && !one('--summary')) throw syntax('complete requires --summary.', usages[action]);
  if (action === 'abandon' && !one('--reason')) throw syntax('abandon requires --reason.', usages[action]);
  if (action === 'update' && one('--parent') && one('--clear-parent')) throw syntax('update cannot use --parent and --clear-parent together.', usages[action]);
  return { taskId: positions[0], targetRoot: path.resolve(one('--target') || process.cwd()), json: Boolean(one('--json')), one, many };
}

function blockedResult(runtime, operation, taskId, targetRoot, error) {
  let current = null;
  try { current = runtime.readTaskRecordPersistence(targetRoot, taskId); } catch {}
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRecordResult, {
    operation,
    status: 'blocked',
    taskId: taskId || null,
    record: current?.record || null,
    recordDigest: current?.recordDigest || error.details?.currentRecordDigest || null,
    diagnostic: { code: error.code || 'task_record_failed', message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
    effects: [],
    nextActions: [error.nextAction || '检查 Task Record 诊断并基于当前事实重试。'],
  });
}

function printTaskRecordResult(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.status === 'blocked') console.error(`[${payload.diagnostic.code}] ${payload.diagnostic.message}\nNext: ${payload.nextActions[0]}`);
  else {
    console.log(`Task ${payload.taskId} ${payload.status}`);
    for (const action of payload.nextActions) console.log(`Next: ${action}`);
  }
  return payload;
}

export function taskRecordCommand(runtime, action, args) {
  const parsed = parseTaskRecordCli(action, args);
  try {
    let payload;
    if (action === 'create') payload = runtime.createTaskRecord(parsed.targetRoot, { taskId: parsed.taskId, title: parsed.one('--title'), intent: parsed.one('--intent'), status: parsed.one('--status'), isParent: parsed.one('--parent-task'), retrospectiveSourceTaskIds: parsed.many('--retrospective-source'), parentTaskId: parsed.one('--parent'), projects: parsed.many('--project'), services: parsed.many('--service'), changes: parsed.many('--change') });
    else if (action === 'inspect') payload = runtime.inspectTaskRecord(parsed.targetRoot, parsed.taskId);
    else if (action === 'update') payload = runtime.updateTaskRecord(parsed.targetRoot, parsed.taskId, { ...(parsed.one('--expected-record') ? { expectedRecordDigest: parsed.one('--expected-record') } : {}), ...(parsed.one('--parent-task') ? { isParent: true } : {}), title: parsed.one('--title'), intent: parsed.one('--intent'), ...(parsed.one('--clear-parent') ? { parentTaskId: null } : parsed.one('--parent') ? { parentTaskId: parsed.one('--parent') } : {}), addProjects: parsed.many('--add-project'), removeProjects: parsed.many('--remove-project'), addServices: parsed.many('--add-service'), removeServices: parsed.many('--remove-service'), addChanges: parsed.many('--add-change'), removeChanges: parsed.many('--remove-change'), addRetrospectiveSources: parsed.many('--add-retrospective-source'), removeRetrospectiveSources: parsed.many('--remove-retrospective-source') });
    else if (action === 'activate') payload = runtime.activateTaskRecord(parsed.targetRoot, parsed.taskId);
    else if (action === 'complete') payload = runtime.completeTaskRecord(parsed.targetRoot, parsed.taskId, { ...(parsed.one('--parent-completion') ? { parentCompletion: JSON.parse(fs.readFileSync(path.resolve(parsed.one('--parent-completion')), 'utf8')) } : {}), summary: parsed.one('--summary'), noChange: parsed.one('--no-change') === true, ...(parsed.one('--expected-record') ? { expectedRecordDigest: parsed.one('--expected-record') } : {}) });
    else payload = runtime.abandonTaskRecord(parsed.targetRoot, parsed.taskId, { reason: parsed.one('--reason') });
    return printTaskRecordResult(payload, parsed.json);
  } catch (error) {
    if (!error.taskRecordBusiness) throw error;
    const payload = blockedResult(runtime, action, parsed.taskId, parsed.targetRoot, error);
    printTaskRecordResult(payload, parsed.json);
    process.exitCode = 1;
    return payload;
  }
}
