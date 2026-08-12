import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function syntax(message, usage) { const error = new Error(message); Object.assign(error, { code: 'parent_coordination_cli.syntax', status: 400, usage }); return error; }
function parse(operation, args) {
  const usage = {
    inspect: 'buildr task parent inspect <task-id> [--target <canonical-workspace>] [--json]',
    record: 'buildr task parent record <task-id> --input <parent-plan.json> [--target <canonical-workspace>] [--json]',
    reconcile: 'buildr task parent reconcile <task-id> --expected-plan <identity> --input <parent-plan.json> --reason <text> [--target <canonical-workspace>] [--json]',
    bind: 'buildr task parent bind-child <child-task-id> --parent <parent-task-id> --contribution <id> ... [--target <canonical-workspace>] [--json]',
    accept: 'buildr task parent accept <task-id> --expected-plan <identity> --summary <text> [--target <canonical-workspace>] [--json]',
  }[operation];
  const allowed = { inspect: ['--target', '--json'], record: ['--input', '--target', '--json'], reconcile: ['--expected-plan', '--input', '--reason', '--target', '--json'], bind: ['--parent', '--contribution', '--target', '--json'], accept: ['--expected-plan', '--summary', '--target', '--json'] }[operation];
  const repeatable = new Set(['--contribution']); const boolean = new Set(['--json']); const values = new Map(); const positions = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]; if (!arg.startsWith('--')) { positions.push(arg); continue; }
    if (!allowed.includes(arg)) throw syntax(`Unknown argument: ${arg}`, usage);
    const list = values.get(arg) || []; if (!repeatable.has(arg) && list.length) throw syntax(`Argument may only be provided once: ${arg}`, usage);
    if (boolean.has(arg)) list.push(true); else { const value = args[++index]; if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`, usage); list.push(value); }
    values.set(arg, list);
  }
  if (positions.length !== 1) throw syntax(`${operation} requires exactly one task id.`, usage);
  const one = (name) => values.get(name)?.[0]; const many = (name) => values.get(name) || [];
  if (operation === 'record' && !one('--input')) throw syntax('record requires --input.', usage);
  if (operation === 'reconcile' && (!one('--input') || !one('--expected-plan') || !one('--reason'))) throw syntax('reconcile requires --input, --expected-plan and --reason.', usage);
  if (operation === 'bind' && (!one('--parent') || !many('--contribution').length)) throw syntax('bind-child requires --parent and at least one --contribution.', usage);
  if (operation === 'accept' && (!one('--expected-plan') || !one('--summary'))) throw syntax('accept requires --expected-plan and --summary.', usage);
  return { taskId: positions[0], targetRoot: path.resolve(one('--target') || process.cwd()), json: Boolean(one('--json')), one, many, usage };
}

function plan(file) { const value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); return value.parentPlan || value; }
function print(payload, json) { if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); else console.log(`Parent coordination ${payload.taskId}: ${payload.status} (${payload.mode})`); return payload; }

export function parentCoordinationCommand(runtime, operation, args) {
  const parsed = parse(operation, args);
  try {
    let payload;
    if (operation === 'inspect') payload = runtime.inspectParentCoordination(parsed.targetRoot, parsed.taskId);
    else if (operation === 'record') payload = runtime.recordParentPlan(parsed.targetRoot, parsed.taskId, { plan: plan(parsed.one('--input')) });
    else if (operation === 'reconcile') payload = runtime.reconcileParentPlan(parsed.targetRoot, parsed.taskId, { expectedPlanIdentity: parsed.one('--expected-plan'), plan: plan(parsed.one('--input')), reason: parsed.one('--reason') });
    else if (operation === 'bind') payload = runtime.bindChildContributions(parsed.targetRoot, parsed.taskId, { parentTaskId: parsed.one('--parent'), contributionIds: parsed.many('--contribution') });
    else payload = runtime.acceptParentCoordination(parsed.targetRoot, parsed.taskId, { expectedPlanIdentity: parsed.one('--expected-plan'), summary: parsed.one('--summary') });
    return print(payload, parsed.json);
  } catch (error) {
    if (!error.parentCoordinationBusiness) throw error;
    const payload = { schemaVersion: 'buildr.parent-coordination-result/v1', operation, status: 'blocked', taskId: parsed.taskId, mode: 'unknown', parentPlan: null, children: [], contributions: [], prerequisitesSatisfied: false, effects: [], diagnostic: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }, nextActions: [error.nextAction || '重新inspect Parent coordination后重试。'] };
    print(payload, parsed.json); process.exitCode = 1; return payload;
  }
}
