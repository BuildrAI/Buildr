import fs from 'node:fs';
import path from 'node:path';

import { isTaskRecordId } from '../../domain/task-record/task-record.mjs';
import { normalizeTaskEnvironmentReceipt, taskEnvironmentError } from '../../domain/task-environment/task-environment.mjs';

function migrationError(code, message, details = undefined) {
  return taskEnvironmentError(code, message, 409, details, '保留旧 environment.json 与 Workspace SQLite 现场，修复冲突后重新运行 canonical buildr sync。');
}

function inventory(runtime, workspaceRoot) {
  const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
  const tasksRoot = path.join(root, '.buildr', 'tasks');
  if (!fs.existsSync(tasksRoot)) return { root, entries: [] };
  const tasksStat = fs.lstatSync(tasksRoot);
  if (!tasksStat.isDirectory() || tasksStat.isSymbolicLink()) throw migrationError('task_environment_current_inventory_invalid', 'Task Environment legacy inventory 目录必须是 canonical Workspace 下的普通目录。', { path: tasksRoot });

  const entries = [];
  for (const directory of fs.readdirSync(tasksRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!directory.name || !isTaskRecordId(directory.name)) continue;
    const taskDirectory = path.join(tasksRoot, directory.name);
    const environmentFile = path.join(taskDirectory, 'environment.json');
    if (!fs.existsSync(environmentFile)) continue;
    const base = { taskId: directory.name, file: environmentFile, classification: 'D', reason: null, receipt: null, serialized: null };
    try {
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw migrationError('task_environment_current_path_invalid', 'Task Environment legacy Task 目录必须是普通目录。', { taskId: directory.name, path: taskDirectory });
      const fileStat = fs.lstatSync(environmentFile);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw migrationError('task_environment_current_file_invalid', '旧 environment.json 必须是普通文件，不能是 symlink。', { taskId: directory.name, path: environmentFile });
      const task = runtime.readTaskRecordPersistence(root, directory.name);
      const raw = JSON.parse(fs.readFileSync(environmentFile, 'utf8'));
      const receipt = normalizeTaskEnvironmentReceipt(raw, { expectedTaskId: directory.name, expectedWorkspaceRoot: root });
      const serialized = JSON.stringify(receipt);
      entries.push({ ...base, classification: 'A', receipt, serialized, task });
    } catch (error) {
      if (error.code === 'task_record_not_found') entries.push({ ...base, classification: 'C', inert: true, reason: '没有 matching Task Record，保留为 inert legacy，不导入。' });
      else entries.push({ ...base, reason: error.message });
    }
  }
  return { root, entries };
}

function currentRows(runtime, root) {
  let opened;
  try {
    opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
    if (!opened.present || opened.version < 8) return new Map();
    return new Map(opened.database.prepare('SELECT task_id, status, receipt_json, updated_at FROM task_environment_current').all().map((row) => [row.task_id, row]));
  } catch (error) {
    if (error.code === 'workspace_store_migration_required') return new Map();
    throw error;
  } finally {
    try { opened?.database?.close(); } catch {}
  }
}

export function registerTaskEnvironmentCurrentMigration(runtime) {
  function migrateTaskEnvironmentCurrentFiles(workspaceRoot, { apply = false } = {}) {
    let plan;
    try { plan = inventory(runtime, workspaceRoot); }
    catch (error) {
      return { schemaVersion: 'buildr.task-environment-current-migration/v1', status: 'blocked', workspaceRoot: path.resolve(workspaceRoot), counts: { total: 0, importable: 0, alreadyCurrent: 0, D: 1 }, entries: [], effects: [], diagnostic: { code: error.code || 'task_environment_current_inventory_invalid', message: error.message } };
    }
    const rows = currentRows(runtime, plan.root);
    const entries = plan.entries.map((entry) => {
      if (entry.classification === 'D') return { taskId: entry.taskId, path: entry.file, classification: 'D', reason: entry.reason };
      if (entry.classification === 'C') return { taskId: entry.taskId, path: entry.file, classification: 'C', inert: true, reason: entry.reason };
      const existing = rows.get(entry.taskId);
      if (!existing) return { taskId: entry.taskId, path: entry.file, classification: 'A', reason: '合法 v2 receipt 待导入 SQLite current。' };
      if (existing.status !== entry.receipt.status || existing.updated_at !== entry.receipt.updatedAt || existing.receipt_json !== entry.serialized) {
        return { taskId: entry.taskId, path: entry.file, classification: 'D', reason: '旧 environment.json 与已有 SQLite current 内容冲突。' };
      }
      return { taskId: entry.taskId, path: entry.file, classification: 'C', inert: false, reason: 'SQLite current 已包含同一 receipt。' };
    });
    const counts = {
      total: entries.length,
      importable: entries.filter((entry) => entry.classification === 'A').length,
      alreadyCurrent: entries.filter((entry) => entry.classification === 'C' && !entry.inert).length,
      inertLegacy: entries.filter((entry) => entry.inert).length,
      D: entries.filter((entry) => entry.classification === 'D').length,
    };
    const publicEntries = entries.map(({ taskId, path: file, classification, inert = false, reason }) => ({ taskId, path: file, classification, inert, reason }));
    if (!apply) return { schemaVersion: 'buildr.task-environment-current-migration/v1', status: counts.D ? 'blocked' : 'planned', workspaceRoot: plan.root, counts, entries: publicEntries, effects: [] };
    if (counts.D) return { schemaVersion: 'buildr.task-environment-current-migration/v1', status: 'blocked', workspaceRoot: plan.root, counts, entries: publicEntries, effects: [], diagnostic: { code: 'task_environment_current_migration_conflict', message: '旧 environment.json 存在 schema、identity、ownership 或 SQLite current 冲突；未执行导入。' } };

    const imports = plan.entries.filter((entry) => entries.find((candidate) => candidate.taskId === entry.taskId)?.classification === 'A');
    if (!imports.length) return { schemaVersion: 'buildr.task-environment-current-migration/v1', status: 'migrated', workspaceRoot: plan.root, counts, entries: publicEntries, effects: [] };
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(plan.root, { writable: true, writerRole: 'retained-task-state' });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      for (const entry of imports) {
        const current = database.prepare('SELECT status, receipt_json, updated_at FROM task_environment_current WHERE task_id = ?').get(entry.taskId);
        if (current && (current.status !== entry.receipt.status || current.updated_at !== entry.receipt.updatedAt || current.receipt_json !== entry.serialized)) throw migrationError('task_environment_current_migration_conflict', `Task ${entry.taskId} 在迁移过程中出现 SQLite current 冲突。`, { taskId: entry.taskId });
        database.prepare(`INSERT INTO task_environment_current(task_id, status, receipt_json, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET status = excluded.status, receipt_json = excluded.receipt_json, updated_at = excluded.updated_at`).run(entry.taskId, entry.receipt.status, entry.serialized, entry.receipt.updatedAt);
      }
      database.exec('COMMIT');
      return { schemaVersion: 'buildr.task-environment-current-migration/v1', status: 'migrated', workspaceRoot: plan.root, counts, entries: publicEntries, effects: imports.map((entry) => ({ type: 'environment-current-imported', taskId: entry.taskId, path: entry.file, locator: `workspace-sqlite:task-environment/${entry.taskId}` })) };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (error.taskEnvironmentBusiness || error.structuredStoreBusiness) throw error;
      throw migrationError('task_environment_current_migration_failed', `Environment current 导入失败：${error.message}`);
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  Object.assign(runtime, { migrateTaskEnvironmentCurrentFiles });
  return runtime;
}
