import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function syntax(message, usage) { const error = new Error(message); Object.assign(error, { code: 'parent_coordination_cli.syntax', status: 400, usage }); return error; }
function parse(operation, args) {
  const usage = {
    inspect: 'buildr task parent inspect <task-id> [--target <canonical-workspace>] [--json]',
    record: 'buildr task parent record <task-id> --input <parent-plan.json> [--target <canonical-workspace>] [--json] | --schema | --example',
    reconcile: 'buildr task parent reconcile <task-id> --expected-plan <identity> --input <parent-plan.json> --reason <text> [--target <canonical-workspace>] [--json] | --schema | --example',
    refresh: 'buildr task parent refresh-planning <task-id> [--target <canonical-workspace>] [--json]',
    bind: 'buildr task parent bind-child <child-task-id> --parent <parent-task-id> --contribution <id> ... [--target <canonical-workspace>] [--json]',
    accept: 'buildr task parent accept <task-id> --expected-plan <identity> --summary <text> [--target <canonical-workspace>] [--json]',
  }[operation];
  const allowed = { inspect: ['--target', '--json'], record: ['--input', '--target', '--json', '--schema', '--example'], reconcile: ['--expected-plan', '--input', '--reason', '--target', '--json', '--schema', '--example'], refresh: ['--target', '--json'], bind: ['--parent', '--contribution', '--target', '--json'], accept: ['--expected-plan', '--summary', '--target', '--json'] }[operation];
  const repeatable = new Set(['--contribution']); const boolean = new Set(['--json', '--schema', '--example']); const values = new Map(); const positions = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]; if (!arg.startsWith('--')) { positions.push(arg); continue; }
    if (!allowed.includes(arg)) throw syntax(`Unknown argument: ${arg}`, usage);
    const list = values.get(arg) || []; if (!repeatable.has(arg) && list.length) throw syntax(`Argument may only be provided once: ${arg}`, usage);
    if (boolean.has(arg)) list.push(true); else { const value = args[++index]; if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`, usage); list.push(value); }
    values.set(arg, list);
  }
  const one = (name) => values.get(name)?.[0]; const many = (name) => values.get(name) || [];
  const discovery = Boolean(one('--schema') || one('--example'));
  if (discovery && operation !== 'record' && operation !== 'reconcile') throw syntax(`${operation} does not support discovery.`, usage);
  if (discovery && (positions.length || one('--schema') && one('--example') || [...values.keys()].some((name) => !['--schema', '--example', '--json'].includes(name)))) throw syntax('Discovery accepts exactly one of --schema or --example, optionally with --json.', usage);
  if (!discovery && positions.length !== 1) throw syntax(`${operation} requires exactly one task id.`, usage);
  if (!discovery && operation === 'record' && !one('--input')) throw syntax('record requires --input.', usage);
  if (!discovery && operation === 'reconcile' && (!one('--input') || !one('--expected-plan') || !one('--reason'))) throw syntax('reconcile requires --input, --expected-plan and --reason.', usage);
  if (operation === 'bind' && (!one('--parent') || !many('--contribution').length)) throw syntax('bind-child requires --parent and at least one --contribution.', usage);
  if (operation === 'accept' && (!one('--expected-plan') || !one('--summary'))) throw syntax('accept requires --expected-plan and --summary.', usage);
  return { taskId: positions[0] || null, targetRoot: path.resolve(one('--target') || process.cwd()), json: Boolean(one('--json')), discovery: one('--schema') ? 'schema' : one('--example') ? 'example' : null, one, many, usage };
}

function plan(file) { const value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); return value.parentPlan || value; }
function print(payload, json) { if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); else console.log(`Parent coordination ${payload.taskId}: ${payload.status} (${payload.mode})`); return payload; }

function discovery(kind) {
  const text = { type: 'string', minLength: 1, maxLength: 4000 };
  const id = { ...text, pattern: '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$' };
  const example = {
    outcome: 'Integrated Parent outcome.',
    architectureDecisions: ['One fact has one authority.'],
    contributions: [{
      id: 'first-contribution', priority: 'P0-1', title: 'First bounded contribution',
      objective: 'Deliver the first bounded Contribution.', directions: ['Keep the authority boundary explicit.'],
      boundaries: ['Do not change unrelated services.'], expectedChild: 'A focused implementation Child', dependencies: [],
    }],
    finalAcceptance: ['All Contributions have explicit dispositions and integration is accepted.'],
  };
  if (kind === 'example') return { schemaVersion: 'buildr.parent-plan-input-example/v2', operation: 'discover-example', status: 'ready', parentPlan: example, effects: [] };
  return { schemaVersion: 'buildr.parent-plan-input-schema/v2', operation: 'discover-schema', status: 'ready', inputSchema: { type: 'object', additionalProperties: false, required: ['outcome', 'architectureDecisions', 'contributions', 'finalAcceptance'], properties: { outcome: text, architectureDecisions: { type: 'array', minItems: 1, maxItems: 128, items: text }, contributions: { type: 'array', minItems: 1, maxItems: 128, items: { type: 'object', additionalProperties: false, required: ['id', 'priority', 'title', 'objective', 'directions', 'boundaries', 'dependencies'], properties: { id, priority: text, title: text, objective: text, directions: { type: 'array', maxItems: 128, items: text }, boundaries: { type: 'array', maxItems: 128, items: text }, expectedChild: { type: ['string', 'null'], minLength: 1, maxLength: 4000 }, dependencies: { type: 'array', maxItems: 128, items: id } } } }, finalAcceptance: { type: 'array', minItems: 1, maxItems: 128, items: text } } }, effects: [] };
}

export function parentCoordinationCommand(runtime, operation, args) {
  const parsed = parse(operation, args);
  if (parsed.discovery) {
    const payload = discovery(parsed.discovery);
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
  try {
    let payload;
    if (operation === 'inspect') payload = runtime.inspectParentCoordination(parsed.targetRoot, parsed.taskId);
    else if (operation === 'refresh') payload = runtime.refreshParentPlanning(parsed.targetRoot, parsed.taskId);
    else if (operation === 'record') payload = runtime.recordParentPlan(parsed.targetRoot, parsed.taskId, { plan: plan(parsed.one('--input')) });
    else if (operation === 'reconcile') payload = runtime.reconcileParentPlan(parsed.targetRoot, parsed.taskId, { expectedPlanIdentity: parsed.one('--expected-plan'), plan: plan(parsed.one('--input')), reason: parsed.one('--reason') });
    else if (operation === 'bind') payload = runtime.bindChildContributions(parsed.targetRoot, parsed.taskId, { parentTaskId: parsed.one('--parent'), contributionIds: parsed.many('--contribution') });
    else payload = runtime.acceptParentCoordination(parsed.targetRoot, parsed.taskId, { expectedPlanIdentity: parsed.one('--expected-plan'), summary: parsed.one('--summary') });
    return print(payload, parsed.json);
  } catch (error) {
    if (!error.parentCoordinationBusiness) throw error;
    const payload = {
      schemaVersion: 'buildr.parent-coordination-result/v3', operation, status: 'blocked', taskId: parsed.taskId, mode: 'unknown', plan: null,
      children: [], contributions: [], prerequisitesSatisfied: false, effects: [],
      diagnostic: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }), nextAction: error.nextAction || '重新inspect Parent coordination后重试。' },
    };
    print(payload, parsed.json); process.exitCode = 1; return payload;
  }
}
