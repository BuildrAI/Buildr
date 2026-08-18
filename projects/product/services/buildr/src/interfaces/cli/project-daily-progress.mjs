import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../application/json-contracts.mjs';

function syntax(message, usage) {
  const error = new Error(message);
  Object.assign(error, { code: 'daily_progress_cli.syntax', status: 400, usage });
  return error;
}

function parse(operation, args) {
  const usage = {
    record: 'buildr project daily-progress record --project <code> [--date <YYYY-MM-DD>] --input <payload.json> [--target <canonical-workspace>] [--json] | --schema | --example',
    inspect: 'buildr project daily-progress inspect --project <code> [--date <YYYY-MM-DD>] [--group day|person|task] [--target <canonical-workspace>] [--json]',
    list: 'buildr project daily-progress list --project <code> [--target <canonical-workspace>] [--json]',
  }[operation];
  const allowed = {
    record: ['--project', '--date', '--input', '--target', '--json', '--schema', '--example'],
    inspect: ['--project', '--date', '--group', '--target', '--json'],
    list: ['--project', '--target', '--json'],
  }[operation];
  const boolean = new Set(['--json', '--schema', '--example']);
  const values = new Map();
  const positions = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) { positions.push(arg); continue; }
    if (!allowed.includes(arg)) throw syntax(`Unknown argument: ${arg}`, usage);
    const list = values.get(arg) || [];
    if (list.length) throw syntax(`Argument may only be provided once: ${arg}`, usage);
    if (boolean.has(arg)) list.push(true);
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw syntax(`Missing value for ${arg}`, usage);
      list.push(value);
    }
    values.set(arg, list);
  }
  const one = (name) => values.get(name)?.[0];
  const discovery = Boolean(one('--schema') || one('--example'));
  if (discovery && operation !== 'record') throw syntax(`${operation} does not support discovery.`, usage);
  if (discovery && (positions.length || (one('--schema') && one('--example')) || [...values.keys()].some((name) => !['--schema', '--example', '--json'].includes(name)))) {
    throw syntax('Discovery accepts exactly one of --schema or --example, optionally with --json.', usage);
  }
  if (!discovery && positions.length) throw syntax(`${operation} does not accept positional arguments.`, usage);
  if (!discovery && !one('--project')) throw syntax(`${operation} requires --project.`, usage);
  if (!discovery && operation === 'record' && !one('--input')) throw syntax('record requires --input.', usage);
  return {
    project: one('--project') || null,
    date: one('--date') || null,
    group: one('--group') || null,
    input: one('--input') || null,
    targetRoot: path.resolve(one('--target') || process.cwd()),
    json: Boolean(one('--json')),
    discovery: one('--schema') ? 'schema' : one('--example') ? 'example' : null,
    usage,
  };
}

function payload(file) {
  const value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  return value.payload || value;
}

function print(payload, json) {
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.operation === 'list') console.log(`Project daily progress ${payload.project}: ${payload.dates.length} day(s)`);
  else if (payload.operation === 'inspect-task') console.log(`Task daily progress ${payload.taskId}: ${payload.itemCount} item(s)`);
  else console.log(`Project daily progress ${payload.project} ${payload.date}: ${payload.status}`);
  return payload;
}

function discovery(kind) {
  const text = { type: 'string', minLength: 1, maxLength: 4000 };
  const id = { ...text, pattern: '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$' };
  const example = {
    daySummary: {
      added: '新增 Git 提交驱动的日摘要。',
      updated: '更新 Task 关联为可选。',
      deleted: '删除推进项必须挂 Task 的硬边界。',
      drawbacks: '未提交改动不会进入日报。',
    },
    commits: [
      {
        sha: 'c3a91f2',
        subject: '完成项目每日演进提案。',
        authorName: '王志宏',
        authorEmail: 'wangzhihong@example.com',
        authorship: 'self',
        taskIds: ['existing-task-id'],
      },
    ],
    files: [{ path: 'README.md', kind: 'modified' }],
  };
  if (kind === 'example') {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.dailyProgressInputExample, { operation: 'discover-example', status: 'ready', payload: example, effects: [] });
  }
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.dailyProgressInputSchema, {
    operation: 'discover-schema',
    status: 'ready',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['daySummary', 'commits', 'files'],
      properties: {
        daySummary: {
          type: 'object',
          additionalProperties: false,
          required: ['added', 'updated', 'deleted', 'drawbacks'],
          properties: {
            added: text,
            updated: text,
            deleted: text,
            drawbacks: text,
          },
        },
        commits: {
          type: 'array',
          maxItems: 512,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['sha', 'subject', 'authorName', 'authorEmail', 'authorship', 'taskIds'],
            properties: {
              sha: { ...text, pattern: '^[0-9a-f]{7,40}$' },
              subject: text,
              authorName: text,
              authorEmail: text,
              authorship: { type: 'string', enum: ['self', 'other'] },
              taskIds: { type: 'array', minItems: 0, maxItems: 32, items: id },
            },
          },
        },
        files: {
          type: 'array',
          maxItems: 1024,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'kind'],
            properties: {
              path: text,
              kind: { type: 'string', enum: ['added', 'modified', 'deleted'] },
            },
          },
        },
      },
    },
    effects: [],
  });
}

export function projectDailyProgressCommand(runtime, operation, args) {
  const parsed = parse(operation, args);
  if (parsed.discovery) {
    const payload = discovery(parsed.discovery);
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
  try {
    let result;
    if (operation === 'record') {
      result = runtime.recordProjectDailyProgress(parsed.targetRoot, {
        project: parsed.project,
        date: parsed.date,
        payload: payload(parsed.input),
      });
    } else if (operation === 'inspect') {
      result = runtime.inspectProjectDailyProgress(parsed.targetRoot, {
        project: parsed.project,
        date: parsed.date,
        group: parsed.group,
      });
    } else {
      result = runtime.listProjectDailyProgress(parsed.targetRoot, { project: parsed.project });
    }
    return print(result, parsed.json);
  } catch (error) {
    if (!error.dailyProgressBusiness && error.code !== 'daily_progress_cli.syntax') throw error;
    const result = {
      schemaVersion: operation === 'list' ? 'buildr.project-daily-progress-list-result/v1' : operation === 'record' ? 'buildr.project-daily-progress-record-result/v1' : 'buildr.project-daily-progress-inspect-result/v1',
      operation,
      status: 'blocked',
      project: parsed.project,
      date: parsed.date,
      items: [],
      diagnostic: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
      effects: [],
      nextActions: [error.nextAction || '修正 Project、日期或 Task 引用后重试；失败时不要手写 YAML。'],
    };
    print(result, parsed.json);
    process.exitCode = 1;
    return result;
  }
}
