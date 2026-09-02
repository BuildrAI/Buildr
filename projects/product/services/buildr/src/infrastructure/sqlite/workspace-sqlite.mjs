import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { observeGitCheckoutIdentity } from '../git/checkout-identity.mjs';
import { resolveControllerSourceRoot, resolveProductResource } from '../product-resources/index.mjs';

const MIGRATION_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/u;
const MIGRATIONS_ROOT = resolveProductResource('product/src/infrastructure/sqlite/migrations');
const BUSY_TIMEOUT_MS = 5_000;
const RETIRED_TASK_EXECUTION_RECORDS_PATH = ['.buildr', 'local', 'task-execution-records'];
const RETIRED_TASK_ASSET_REVIEW_PATH = ['.buildr', 'asset-review'];
let defaultMigrationScripts = null;

function digest(bytes) {
  return `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function structuredStoreError(code, message, status = 409, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  error.nextAction = nextAction;
  error.structuredStoreBusiness = true;
  return error;
}

export function loadWorkspaceSqliteMigrations(root = MIGRATIONS_ROOT) {
  const defaultRoot = path.resolve(root) === path.resolve(MIGRATIONS_ROOT);
  if (defaultRoot && defaultMigrationScripts) return defaultMigrationScripts;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    throw structuredStoreError('workspace_store_schema_assets_invalid', `SQLite migration assets 无法读取：${error.message}`, 500, { root }, '恢复随 Buildr package 交付的 migration scripts。');
  }
  const scripts = entries.map((entry) => {
    if (!entry.isFile() || entry.isSymbolicLink()) throw structuredStoreError('workspace_store_schema_assets_invalid', `SQLite migration asset 必须是普通文件：${entry.name}。`, 500, { root, name: entry.name });
    const match = entry.name.match(MIGRATION_PATTERN);
    if (!match) throw structuredStoreError('workspace_store_schema_assets_invalid', `SQLite migration 文件名不合法：${entry.name}。`, 500, { root, name: entry.name });
    const bytes = fs.readFileSync(path.join(root, entry.name));
    return { version: Number(match[1]), name: entry.name, checksum: digest(bytes), sql: bytes.toString('utf8') };
  }).sort((left, right) => left.version - right.version || left.name.localeCompare(right.name));
  if (!scripts.length || scripts[0].version !== 0) throw structuredStoreError('workspace_store_schema_assets_invalid', 'SQLite migrations 必须从 0000 开始。', 500, { root });
  for (let index = 0; index < scripts.length; index += 1) {
    if (scripts[index].version !== index) throw structuredStoreError('workspace_store_schema_assets_invalid', `SQLite migration version 必须连续；期望 ${String(index).padStart(4, '0')}，实际为 ${scripts[index].name}。`, 500, { root, expectedVersion: index, actualVersion: scripts[index].version });
    if (index > 0 && scripts[index - 1].name === scripts[index].name) throw structuredStoreError('workspace_store_schema_assets_invalid', `SQLite migration 名称重复：${scripts[index].name}。`, 500, { root });
  }
  if (defaultRoot) defaultMigrationScripts = Object.freeze(scripts.map((script) => Object.freeze(script)));
  return defaultRoot ? defaultMigrationScripts : scripts;
}

function sqliteFailure(error, details = {}) {
  const message = String(error?.message || error);
  if (/busy|locked/iu.test(message)) return structuredStoreError('workspace_store_database_busy', 'Workspace structured store 当前正被其他 writer 占用。', 409, details, '稍后重试当前操作。');
  if (/malformed|not a database|disk image/iu.test(message)) return structuredStoreError('workspace_store_database_corrupt', 'Workspace structured store 已损坏或不是有效 SQLite 数据库。', 409, details, '运行 Buildr Doctor 检查数据库；不要自动删除或从旧 Task 文件恢复。');
  return structuredStoreError('workspace_store_database_failed', `Workspace structured store 操作失败：${message}`, 500, details, '保留数据库现场并运行 Buildr Doctor。');
}

function tableNames(database) {
  return database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
}

function hasMigrationLedger(database) {
  return tableNames(database).includes('schema_migrations');
}

function appliedMigrations(database) {
  return database.prepare('SELECT version, name, checksum, applied_at AS appliedAt FROM schema_migrations ORDER BY version').all();
}

function validateAppliedMigrations(database, scripts, { allowPending }) {
  if (!hasMigrationLedger(database)) {
    const tables = tableNames(database);
    if (tables.length) throw structuredStoreError('workspace_store_schema_ledger_missing', 'Workspace structured store 已有 schema，但缺少 migration ledger。', 409, { tables }, '保留现场并检查数据库来源；Buildr 不会猜测或接管未知 schema。');
    return { applied: [], pending: scripts };
  }
  const applied = appliedMigrations(database);
  for (let index = 0; index < applied.length; index += 1) {
    const row = applied[index];
    if (row.version !== index) throw structuredStoreError('workspace_store_schema_ledger_invalid', `Migration ledger version 不连续：期望 ${index}，实际 ${row.version}。`, 409, { expectedVersion: index, actualVersion: row.version });
    const script = scripts[index];
    if (!script) throw structuredStoreError('workspace_store_database_newer_than_runtime', `数据库 migration ${row.version} 高于当前 Buildr runtime。`, 409, { databaseVersion: row.version, runtimeVersion: scripts.at(-1)?.version ?? null }, '使用创建该数据库的相同或更新 Buildr runtime。');
    if (row.name !== script.name || row.checksum !== script.checksum) throw structuredStoreError('workspace_store_migration_drift', `已应用 migration 与 package script 不一致：${script.name}。`, 409, { version: row.version, appliedName: row.name, expectedName: script.name, appliedChecksum: row.checksum, expectedChecksum: script.checksum }, '恢复原 migration script；修正 schema 只能新增连续 migration。');
  }
  const pending = scripts.slice(applied.length);
  if (pending.length && !allowPending) throw structuredStoreError('workspace_store_migration_required', `Workspace structured store 需要应用 ${pending.length} 个 migration。`, 409, { currentVersion: applied.at(-1)?.version ?? null, targetVersion: scripts.at(-1).version }, '执行一个合法 structured-store mutation 以原子升级数据库。');
  return { applied, pending };
}

export function applyWorkspaceSqliteMigration(database, script) {
  const rebuildsReferencedTable = script.sql.includes('-- buildr:foreign-keys-off');
  try {
    if (rebuildsReferencedTable) {
      database.exec('PRAGMA foreign_keys = OFF;');
      if (database.prepare('PRAGMA foreign_keys').get()?.foreign_keys !== 0) throw new Error('migration could not disable foreign keys');
    }
    database.exec('BEGIN IMMEDIATE');
    database.exec(script.sql);
    if (rebuildsReferencedTable) {
      const violations = database.prepare('PRAGMA foreign_key_check').all();
      if (violations.length) throw new Error(`migration foreign key check failed: ${JSON.stringify(violations)}`);
    }
    database.prepare('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(script.version, script.name, script.checksum, new Date().toISOString());
    database.exec('COMMIT');
    if (rebuildsReferencedTable) database.exec('PRAGMA foreign_keys = ON;');
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    if (rebuildsReferencedTable) {
      try { database.exec('PRAGMA foreign_keys = ON;'); } catch {}
    }
    if (error.structuredStoreBusiness) throw error;
    throw sqliteFailure(error, { migration: { version: script.version, name: script.name } });
  }
}

function configure(database, { writable }) {
  try {
    database.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}; PRAGMA foreign_keys = ON;`);
    if (writable) database.exec('PRAGMA journal_mode = WAL;');
    const foreignKeys = database.prepare('PRAGMA foreign_keys').get()?.foreign_keys;
    if (foreignKeys !== 1) throw structuredStoreError('workspace_store_foreign_keys_disabled', 'Workspace structured store 无法启用 foreign keys。', 500);
  } catch (error) {
    if (error.structuredStoreBusiness) throw error;
    throw sqliteFailure(error);
  }
}

function cleanupRetiredLocalData(root, relativePath, label) {
  const target = path.join(root, ...relativePath);
  if (!fs.existsSync(target)) return;
  try {
    const stat = fs.lstatSync(target);
    const expected = path.join(fs.realpathSync(root), ...relativePath);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(target) !== expected) {
      throw new Error('retired path is not an owned canonical directory');
    }
    fs.rmSync(target, { recursive: true, force: false });
  } catch (error) {
    throw structuredStoreError(
      'workspace_store_retired_local_data_cleanup_failed',
      `已删除${label}数据库结构，但旧本机数据目录清理失败：${error.message}`,
      500,
      { path: relativePath.join('/') },
      '检查该目录ownership和权限后重试任意合法structured-store mutation。',
    );
  }
}

export function registerWorkspaceSqlite(runtime, { observeCheckout = observeGitCheckoutIdentity, sourceRoot = null } = {}) {
  const operationScopes = [];
  let writerSourceRoot = sourceRoot ? path.resolve(sourceRoot) : null;

  function runtimeSourceCheckout() {
    writerSourceRoot ||= path.resolve(resolveControllerSourceRoot());
    return { root: writerSourceRoot, checkout: observeCheckout(writerSourceRoot) };
  }

  function isCandidateValidationWorkspace(source, target) {
    return Boolean(
      source?.linkedWorktree
      && target?.linkedWorktree
      && source.gitCommonDirectory === target.gitCommonDirectory
      && source.checkoutRoot === target.checkoutRoot,
    );
  }

  function assertStructuredStoreWriterProvenance(root, targetCheckout) {
    if (!targetCheckout) return;
    const source = runtimeSourceCheckout();
    if (!source.checkout?.linkedWorktree || !targetCheckout || source.checkout.gitCommonDirectory !== targetCheckout.gitCommonDirectory) return;
    if (isCandidateValidationWorkspace(source.checkout, targetCheckout)) return;
    throw structuredStoreError(
      'workspace_store_writer_provenance_forbidden',
      '候选 Buildr runtime 不能写入 retained canonical Workspace structured store。',
      409,
      {
        target: root,
        caller: { checkoutRoot: source.checkout.checkoutRoot, linkedWorktree: true },
        targetCheckout: { checkoutRoot: targetCheckout.checkoutRoot, linkedWorktree: targetCheckout.linkedWorktree },
      },
      '从 retained Buildr runtime 写 canonical Workspace；候选验证请使用自身 Task Validation Workspace。',
    );
  }

  function workspaceOperationIdentity(targetRoot) {
    const root = path.resolve(targetRoot);
    try { return fs.realpathSync(root); } catch { return root; }
  }

  function activeOperationScope(targetRoot) {
    const scope = operationScopes.at(-1);
    return scope?.identity === workspaceOperationIdentity(targetRoot) ? scope : null;
  }

  function withWorkspaceStructuredStoreOperation(targetRoot, operation) {
    const root = path.resolve(targetRoot);
    const identity = workspaceOperationIdentity(root);
    const active = operationScopes.at(-1);
    if (active) {
      if (active.identity !== identity) throw structuredStoreError('workspace_store_operation_scope_mismatch', 'Workspace operation scope 不允许切换 canonical Workspace。', 409, { expected: active.root, actual: root });
      const result = operation();
      if (result && typeof result.then === 'function') throw structuredStoreError('workspace_store_operation_scope_async_forbidden', 'Workspace operation scope 当前只支持同步 Application action。', 500);
      return result;
    }
    const scope = { root, identity, canonicalRoot: null, memo: new Map() };
    operationScopes.push(scope);
    try {
      const result = operation();
      if (result && typeof result.then === 'function') throw structuredStoreError('workspace_store_operation_scope_async_forbidden', 'Workspace operation scope 当前只支持同步 Application action。', 500);
      return result;
    } finally {
      operationScopes.pop();
    }
  }

  function memoizeWorkspaceOperation(targetRoot, key, read) {
    const scope = activeOperationScope(targetRoot);
    if (!scope) return read();
    if (scope.memo.has(key)) return scope.memo.get(key);
    const value = read();
    if (value && typeof value.then === 'function') throw structuredStoreError('workspace_store_operation_scope_async_forbidden', 'Workspace operation memo 当前只支持同步 read model。', 500);
    scope.memo.set(key, value);
    return value;
  }

  function withWorkspaceStructuredStoreReadCompatibility(targetRoot, operation) {
    const root = path.resolve(targetRoot);
    const identity = workspaceOperationIdentity(root);
    const active = operationScopes.at(-1);
    if (active) {
      if (active.identity !== identity) throw structuredStoreError('workspace_store_operation_scope_mismatch', 'Workspace operation scope 不允许切换 canonical Workspace。', 409, { expected: active.root, actual: root });
      const previous = active.allowPendingRead === true;
      active.allowPendingRead = true;
      try {
        const result = operation();
        if (result && typeof result.then === 'function') throw structuredStoreError('workspace_store_operation_scope_async_forbidden', 'Workspace operation scope 当前只支持同步 Application action。', 500);
        return result;
      } finally {
        active.allowPendingRead = previous;
      }
    }
    const scope = { root, identity, canonicalRoot: null, allowPendingRead: true, memo: new Map() };
    operationScopes.push(scope);
    try {
      const result = operation();
      if (result && typeof result.then === 'function') throw structuredStoreError('workspace_store_operation_scope_async_forbidden', 'Workspace operation scope 当前只支持同步 Application action。', 500);
      return result;
    } finally {
      operationScopes.pop();
    }
  }

  function assertCanonicalStructuredWorkspace(targetRoot, { writable = false } = {}) {
    const root = path.resolve(targetRoot);
    const scope = activeOperationScope(root);
    if (scope?.canonicalRoot) return scope.canonicalRoot;
    try { runtime.assertInitializedBuildrWorkspace(root); }
    catch (error) { throw structuredStoreError('workspace_store_workspace_invalid', error.message, 409, { target: root }, '显式选择一个已初始化的 canonical Workspace。'); }
    if (writable) {
      const checkout = observeCheckout(root);
      if (checkout?.linkedWorktree && !isCandidateValidationWorkspace(runtimeSourceCheckout().checkout, checkout)) {
        throw structuredStoreError('workspace_store_workspace_not_canonical', 'Workspace structured store target 必须是 canonical Workspace，不能是 linked task worktree。', 409, { target: root }, '显式传入 retained canonical Workspace 的路径。');
      }
      assertStructuredStoreWriterProvenance(root, checkout);
    }
    if (scope) scope.canonicalRoot = root;
    return root;
  }

  function workspaceStructuredStorePathAtRoot(root) {
    return path.join(root, '.buildr', 'local', 'workspace.sqlite');
  }

  function workspaceStructuredStorePath(targetRoot) {
    return workspaceStructuredStorePathAtRoot(assertCanonicalStructuredWorkspace(targetRoot));
  }

  function openWorkspaceStructuredStore(targetRoot, { writable = false, allowPendingRead = false } = {}) {
    const root = assertCanonicalStructuredWorkspace(targetRoot, { writable });
    let candidateValidation = false;
    if (writable) {
      try { candidateValidation = isCandidateValidationWorkspace(runtimeSourceCheckout().checkout, observeCheckout(root)); } catch { /* management fence remains authoritative when checkout identity is unavailable */ }
    }
    if (!candidateValidation) {
      if (writable) runtime.ensureWorkspaceManagementClaim?.(root);
      else runtime.assertWorkspaceManagementAccess?.(root);
    }
    const file = workspaceStructuredStorePathAtRoot(root);
    const scripts = loadWorkspaceSqliteMigrations();
    if (!fs.existsSync(file) && !writable) return { root, file, present: false, database: null, version: null, scripts };
    if (writable) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    let database;
    try {
      database = new DatabaseSync(file, writable ? {} : { readOnly: true });
      if (writable) {
        try { fs.chmodSync(file, 0o600); } catch {}
      }
      configure(database, { writable });
      const state = validateAppliedMigrations(database, scripts, { allowPending: writable || allowPendingRead || activeOperationScope(root)?.allowPendingRead === true });
      if (writable) {
        for (const script of state.pending) applyWorkspaceSqliteMigration(database, script);
        validateAppliedMigrations(database, scripts, { allowPending: false });
        if (scripts.some((script) => script.name === '0025_drop_task_execution_records.sql')) cleanupRetiredLocalData(root, RETIRED_TASK_EXECUTION_RECORDS_PATH, 'Task Execution Record');
        if (scripts.some((script) => script.name === '0030_refactor_task_retrospective_documents.sql')) cleanupRetiredLocalData(root, RETIRED_TASK_ASSET_REVIEW_PATH, 'Task Retrospective');
      }
      return {
        root,
        file,
        present: true,
        database,
        version: writable ? scripts.at(-1).version : state.applied.at(-1)?.version ?? null,
        migrationRequired: state.pending.length > 0,
        scripts,
      };
    } catch (error) {
      try { database?.close(); } catch {}
      if (error.structuredStoreBusiness) throw error;
      throw sqliteFailure(error, { path: path.relative(root, file).split(path.sep).join('/') });
    }
  }

  function inspectWorkspaceStructuredStore(targetRoot) {
    const opened = openWorkspaceStructuredStore(targetRoot, { writable: false });
    if (!opened.present) return { status: 'uninitialized', version: null, integrity: null };
    try {
      const integrityRows = opened.database.prepare('PRAGMA integrity_check').all();
      const messages = integrityRows.map((row) => row.integrity_check);
      if (messages.length !== 1 || messages[0] !== 'ok') throw structuredStoreError('workspace_store_integrity_failed', 'Workspace structured store integrity check 未通过。', 409, { findings: messages.slice(0, 10) }, '保留数据库现场并从可证明的本地备份恢复或显式重置。');
      return { status: 'healthy', version: opened.version, integrity: 'ok' };
    } finally {
      opened.database.close();
    }
  }

  Object.assign(runtime, {
    assertCanonicalStructuredWorkspace,
    withWorkspaceStructuredStoreOperation,
    memoizeWorkspaceOperation,
    withWorkspaceStructuredStoreReadCompatibility,
    workspaceStructuredStorePath,
    openWorkspaceStructuredStore,
    inspectWorkspaceStructuredStore,
    loadWorkspaceSqliteMigrations,
  });
  return runtime;
}
