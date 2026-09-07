import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

import { createRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { createTaskListRepository } from '../../src/modules/task/persistence/task-list-repository.ts';
import { TASK_QUERY_APPLICATION } from '../../src/modules/task/module.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_TASK_SUPPORT } from '../../src/modules/workspace/module.ts';

const DEFAULT_ROWS = 1_000_000;
const RUNS = 9;
const CREATED_AT = '2025-01-01T00:00:00.000Z';
const UPDATED_AT = '2026-01-01T00:00:00.000Z';
const STATUS = ['active', 'todo', 'completed', 'abandoned'] as const;
const RETROSPECTIVE_DIGEST = `sha256-${'a'.repeat(64)}`;

function argument(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Expected a positive integer, received ${raw}.`);
  return value;
}

function percentile(values: number[], ratio: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)];
}

function timed<T>(action: () => T): { value: T; elapsedMs: number } {
  const started = performance.now();
  const value = action();
  return { value, elapsedMs: performance.now() - started };
}

function sample(name: string, action: () => unknown, runs = RUNS, observedColdMs?: number) {
  const coldMs = observedColdMs ?? timed(action).elapsedMs;
  action();
  const values = Array.from({ length: runs }, () => timed(action).elapsedMs);
  return {
    name,
    runs,
    coldMs: Number(coldMs.toFixed(3)),
    p50Ms: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    minMs: Number(Math.min(...values).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}

function taskId(index: number): string {
  return `benchmark-task-${String(index).padStart(7, '0')}`;
}

const rows = positiveInteger(argument('--rows'), DEFAULT_ROWS);
const keep = process.argv.includes('--keep');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-query-million-'));
const workspaceRoot = path.join(temporaryRoot, 'workspace');
const runtime: any = createRuntime();
const workspace: any = runtimeProvide(runtime, WORKSPACE_APPLICATION);
const workspaceTaskSupport: any = runtimeProvide(runtime, WORKSPACE_TASK_SUPPORT);
const taskQuery: any = runtimeProvide(runtime, TASK_QUERY_APPLICATION);
let databasePath = '';

try {
  workspace.initializeWorkspace({ targetRoot: workspaceRoot, name: 'task-query-benchmark', description: 'Disposable standalone Task query performance fixture', profile: 'personal', agent: null });
  const opened: any = workspaceTaskSupport.openWorkspaceStructuredStore(workspaceRoot, { writable: true });
  const database: any = opened.database;
  if (!database) throw new Error('Benchmark workspace did not provide SQLite.');
  databasePath = path.join(workspaceRoot, '.buildr', 'local', 'workspace.sqlite');
  database.exec('PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -131072;');
  const insertTask: any = database.prepare(`
    INSERT INTO tasks(
      task_id, title, intent, status, result_summary, created_at, updated_at,
      parent_task_id, is_parent, retrospective_state, retrospective_document_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertProject: any = database.prepare('INSERT INTO task_projects(task_id, project) VALUES (?, ?)');
  const insertService: any = database.prepare('INSERT INTO task_services(task_id, project, service) VALUES (?, ?, ?)');
  const preparation = timed(() => {
    for (let start = 0; start < rows; start += 100_000) {
      const end = Math.min(rows, start + 100_000);
      database.exec('BEGIN IMMEDIATE');
      for (let index = start; index < end; index += 1) {
        const id = taskId(index);
        const status = STATUS[index % STATUS.length];
        const terminal = status === 'completed' || status === 'abandoned';
        const retrospective = terminal && index % 10_000 === 2;
        const parent = index % 20_000 === 0;
        const childOf = index % 20_000 === 1 ? taskId(index - 1) : null;
        const searchMarker = index % 10_000 === 4 ? ' indexedneedle' : '';
        insertTask.run(
          id,
          `百万级查询任务 ${index}${searchMarker}`,
          `验证 standalone SQLite 有界分页 ${index}${searchMarker}`,
          status,
          terminal ? '性能基准夹具' : null,
          CREATED_AT,
          UPDATED_AT,
          childOf,
          parent ? 1 : 0,
          retrospective ? 'pending-decision' : null,
          retrospective ? RETROSPECTIVE_DIGEST : null,
        );
        if (index % 10_000 === 0) {
          insertProject.run(id, 'benchmark');
          insertService.run(id, 'benchmark', 'sparse');
        }
      }
      database.exec('COMMIT');
      process.stderr.write(`[task-query-million] prepared ${end}/${rows}\n`);
    }
    database.prepare("INSERT INTO task_search(task_search) VALUES('optimize')").run();
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  });
  database.close();

  const firstRead: any = timed(() => taskQuery.queryTasks(workspaceRoot, { status: 'all', pageSize: 50 }));
  const first: any = firstRead.value;
  if (!first.nextCursor) throw new Error('Benchmark first page did not return a cursor.');
  const deepIndex = Math.min(rows - 1, Math.floor(rows * 0.6 / 4) * 4 + 3);
  const deepCursor = { statusRank: 3, updatedAt: UPDATED_AT, taskId: taskId(deepIndex) };
  const repository = createTaskListRepository();
  const metrics = [
    sample('default-first-page', () => taskQuery.queryTasks(workspaceRoot, { status: 'all', pageSize: 50 }), RUNS, firstRead.elapsedMs),
    sample('cursor-next-page', () => taskQuery.queryTasks(workspaceRoot, { status: 'all', pageSize: 50, cursor: first.nextCursor })),
    sample('single-status-first-page', () => taskQuery.queryTasks(workspaceRoot, { status: 'completed', pageSize: 50 })),
    sample('project-service-filter', () => taskQuery.queryTasks(workspaceRoot, { status: 'all', project: 'benchmark', service: 'benchmark/sparse', pageSize: 50 })),
    sample('has-children-filter', () => taskQuery.queryTasks(workspaceRoot, { status: 'all', hasChildren: 'yes', pageSize: 50 })),
    sample('without-children-filter', () => taskQuery.queryTasks(workspaceRoot, { status: 'all', hasChildren: 'no', pageSize: 50 })),
    sample('retrospective-filter', () => taskQuery.queryTasks(workspaceRoot, { status: 'all', retrospectiveState: 'pending-decision', pageSize: 50 })),
    sample('keyword-filter', () => taskQuery.queryTasks(workspaceRoot, { status: 'all', q: 'indexedneedle', pageSize: 50 })),
    sample('deep-keyset-page', () => workspaceTaskSupport.runWorkspaceSqliteRead(workspaceRoot, (context: any) => repository.readPage(context, { status: 'all', cursor: deepCursor, limit: 51 }))),
  ];
  const plans = workspaceTaskSupport.runWorkspaceSqliteRead(workspaceRoot, (context: any) => ({
    default: repository.explain(context, { status: 'all', limit: 51 }),
    status: repository.explain(context, { status: 'completed', limit: 51 }),
    structured: repository.explain(context, { status: 'all', project: 'benchmark', service: { project: 'benchmark', service: 'sparse' }, hasChildren: 'yes', limit: 51 }),
    keyword: repository.explain(context, { status: 'all', search: { kind: 'fts', expression: '"indexedneedle"' }, limit: 51 }),
  }));
  const databaseBytes = fs.statSync(databasePath).size;
  const rssBytes = process.memoryUsage().rss;
  process.stdout.write(`${JSON.stringify({
    schema: 'buildr.task-query-benchmark/v1',
    mode: rows === DEFAULT_ROWS ? 'acceptance' : 'development-sample',
    rows,
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length, memoryBytes: os.totalmem() },
    preparationMs: Number(preparation.elapsedMs.toFixed(3)),
    databaseBytes,
    rssBytes,
    targets: { defaultAndStructuredWarmP95Ms: 200, keywordWarmP95Ms: 500 },
    metrics,
    plans,
    workspaceRoot: keep ? workspaceRoot : null,
  }, null, 2)}\n`);
} finally {
  if (!keep) fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
