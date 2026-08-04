import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { localAppDataRoot } from '../../infrastructure/filesystem/workspace-registry-repository.mjs';
import { spawnSync } from '../../infrastructure/process.mjs';
import { GIT_WORKTREE_EVIDENCE_SCHEMA } from '../worktree/git-worktree-provider.mjs';

// These identities are intentionally confined to the one-time cutover reader.
const LEGACY_RECEIPT_SCHEMA = 'buildr.task-environment-receipt/v1';
const LEGACY_ADOPTION_SCHEMA = 'buildr.task-environment-adoption-receipt/v1';
const TASK_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function git(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function gitText(cwd, args) {
  const result = git(cwd, args);
  return result.status === 0 ? result.stdout.trim() : null;
}

function sharedGitDir(root) {
  const common = gitText(root, ['rev-parse', '--git-common-dir']);
  if (!common) return null;
  return path.resolve(root, common);
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function legacyResourceBlockers(workspaceRoot, receipt, common) {
  const blockers = [];
  const previewRoot = path.join(localAppDataRoot(), 'previews');
  if (fs.existsSync(previewRoot)) {
    for (const entry of fs.readdirSync(previewRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const owner = JSON.parse(fs.readFileSync(path.join(previewRoot, entry.name, 'preview.json'), 'utf8'));
        if (owner.taskId !== receipt.taskId || path.resolve(owner.environmentRoot || '') !== path.resolve(receipt.environmentRoot)) continue;
        const instanceFile = path.join(previewRoot, entry.name, 'instance.json');
        const instance = fs.existsSync(instanceFile) ? JSON.parse(fs.readFileSync(instanceFile, 'utf8')) : null;
        const pid = instance?.pid || owner.managedProcess?.pid || null;
        blockers.push({ kind: 'preview', id: entry.name, state: processAlive(pid) ? 'running' : 'ownership-record-retained' });
      } catch { /* unrelated preview state */ }
    }
  }
  const leaseRoot = common ? path.join(common, 'buildr', 'verification-resources') : null;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(current);
      else if (entry.name === 'lease.json') {
        try {
          const lease = JSON.parse(fs.readFileSync(current, 'utf8'));
          if (lease.schemaVersion === 'buildr.verification-resource-lease/v1' && lease.taskId === receipt.taskId && Date.parse(lease.expiresAt) > Date.now()) blockers.push({ kind: 'verification-lease', id: lease.resource, state: 'active' });
        } catch { /* malformed state remains owned by verification */ }
      }
    }
  };
  if (leaseRoot && fs.existsSync(leaseRoot)) visit(leaseRoot);
  return blockers;
}

function legacyAdoptionDiagnostic(file, taskId) {
  if (!fs.existsSync(file)) return null;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return '旧 adoption state 不是普通文件。';
    const adoption = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (adoption.schemaVersion !== LEGACY_ADOPTION_SCHEMA || adoption.taskId !== taskId) return '旧 adoption state identity 冲突。';
    return null;
  } catch (error) {
    return `旧 adoption state 无法验证：${error.message}`;
  }
}

function currentRepository(record) {
  if (!record || typeof record !== 'object' || !record.selector || !record.sourceRepository || !record.checkoutPath || !record.branch) return null;
  if (!fs.existsSync(record.sourceRepository) || !fs.existsSync(record.checkoutPath)) return null;
  const top = gitText(record.checkoutPath, ['rev-parse', '--show-toplevel']);
  const branch = gitText(record.checkoutPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = gitText(record.checkoutPath, ['rev-parse', 'HEAD']);
  const status = gitText(record.checkoutPath, ['status', '--porcelain']);
  const listed = gitText(record.sourceRepository, ['worktree', 'list', '--porcelain']) || '';
  const registered = listed.split(/\r?\n/).some((line) => line === `worktree ${path.resolve(record.checkoutPath)}`);
  if (!top || path.resolve(top) !== path.resolve(record.checkoutPath) || branch !== record.branch || !head || status === null || !registered) return null;
  return { ...record, head, clean: status === '', registered: true, state: 'ready', diagnostic: null };
}

function migrationPlanDigest(receipt, repositories) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify({ taskId: receipt.taskId, repositories: repositories.map((item) => ({ selector: item.selector, entityType: item.entityType, sourcePath: item.sourcePath, sourceRepository: item.sourceRepository, checkoutPath: item.checkoutPath, branch: item.branch, startPoint: item.startPoint, remote: item.remote, remoteUrl: item.remoteUrl })) })).digest('hex')}`;
}

function narrowRepositoryEvidence(item) {
  return {
    selector: item.selector,
    entityType: item.entityType,
    sourcePath: item.sourcePath,
    sourceRepository: item.sourceRepository,
    checkoutPath: item.checkoutPath,
    branch: item.branch,
    startPoint: item.startPoint,
    head: item.head,
    clean: item.clean,
    registered: item.registered,
    remote: item.remote ?? null,
    remoteUrl: item.remoteUrl ?? null,
    state: 'ready',
    diagnostic: null,
  };
}

function readLegacyInventory(runtime, workspaceRoot) {
  const root = fs.realpathSync(workspaceRoot);
  const common = sharedGitDir(root);
  if (!common) return { root, common: null, directory: null, entries: [] };
  const directory = path.join(common, 'buildr', 'task-environments');
  if (!fs.existsSync(directory)) return { root, common, directory, entries: [] };
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    return { root, common, directory, entries: [{ taskId: 'legacy-inventory', file: directory, adoptionFile: path.join(directory, 'adoptions'), bytes: null, receipt: null, classification: 'D', reason: '旧 Task Environment inventory 不是普通目录。', repositories: [], blockers: [] }] };
  }
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const file = path.join(directory, entry.name);
      const fileTaskId = entry.name.slice(0, -5);
      const adoptionFile = path.join(directory, 'adoptions', `${fileTaskId}.json`);
      const invalidBase = { taskId: fileTaskId, file, adoptionFile, bytes: null, receipt: null, classification: 'D', reason: null, repositories: [], blockers: [] };
      if (!entry.isFile() || entry.isSymbolicLink() || !TASK_ID.test(fileTaskId)) return { ...invalidBase, reason: '旧 receipt 路径或 Task identity 无法确认。' };
      const bytes = fs.readFileSync(file);
      let receipt = null;
      try { receipt = JSON.parse(bytes); } catch { /* classified as D */ }
      const taskId = fileTaskId;
      const base = { ...invalidBase, bytes, receipt };
      if (!receipt || receipt.schemaVersion !== LEGACY_RECEIPT_SCHEMA || receipt.taskId !== taskId) return { ...base, reason: '旧 receipt 格式、文件名或 Task identity 无法确认。' };
      const adoptionDiagnostic = legacyAdoptionDiagnostic(adoptionFile, taskId);
      if (adoptionDiagnostic) return { ...base, reason: adoptionDiagnostic };
      if (path.resolve(receipt.workspaceRoot || '') !== root || path.resolve(receipt.environmentRoot || '') !== path.join(root, '.worktrees', taskId)) return { ...base, reason: 'Workspace 或 Environment path identity 冲突。' };
      if (!Array.isArray(receipt.repositories) || receipt.repositories.length === 0) return { ...base, reason: '旧 receipt 缺少 repository set。' };
      const repositories = receipt.repositories.map(currentRepository);
      const liveCount = repositories.filter(Boolean).length;
      const blockers = legacyResourceBlockers(root, receipt, common);
      let formalTask = false;
      try { runtime.readTaskRecordPersistence(root, taskId); formalTask = true; }
      catch (error) {
        if (error.code !== 'task_record_not_found') return { ...base, repositories: repositories.filter(Boolean), blockers, reason: `正式 Task 无法验证：${error.message}` };
      }
      const newReceipt = path.join(root, '.buildr', 'tasks', taskId, 'environment.json');
      const newEvidence = path.join(common, 'buildr', 'task-worktrees', `${taskId}.json`);
      if (fs.existsSync(newReceipt) || fs.existsSync(newEvidence)) return { ...base, repositories: repositories.filter(Boolean), blockers, reason: '新旧 authority evidence 同时存在。' };
      if (blockers.length) return { ...base, repositories: repositories.filter(Boolean), blockers, reason: '旧 receipt 仍有独立 runtime resource，不能自动迁移。' };
      if (liveCount === receipt.repositories.length) return { ...base, classification: formalTask ? 'A' : 'B', reason: formalTask ? '正式 Task 与 live worktree identity 匹配。' : '无正式 Task，但 live worktree identity 匹配。', repositories, blockers };
      if (liveCount === 0 && !fs.existsSync(receipt.environmentRoot)) return { ...base, classification: 'C', reason: '没有 live worktree 或其他已知资源。', repositories: [], blockers };
      return { ...base, repositories: repositories.filter(Boolean), blockers, reason: 'Repository set 只部分存活或路径被未知内容占用。' };
    });
  const receiptTaskIds = new Set(entries.map((entry) => entry.taskId));
  const adoptionDirectory = path.join(directory, 'adoptions');
  if (fs.existsSync(adoptionDirectory)) {
    const adoptionStat = fs.lstatSync(adoptionDirectory);
    if (!adoptionStat.isDirectory() || adoptionStat.isSymbolicLink()) {
      entries.push({ taskId: 'legacy-adoption-index', file: null, adoptionFile: adoptionDirectory, bytes: null, receipt: null, classification: 'D', reason: '旧 adoption inventory 不是普通目录。', repositories: [], blockers: [] });
      return { root, common, directory, entries };
    }
    for (const entry of fs.readdirSync(adoptionDirectory, { withFileTypes: true }).filter((item) => item.name.endsWith('.json')).sort((left, right) => left.name.localeCompare(right.name))) {
      const taskId = entry.name.slice(0, -5);
      if (receiptTaskIds.has(taskId)) continue;
      const adoptionFile = path.join(adoptionDirectory, entry.name);
      const reason = !entry.isFile() || entry.isSymbolicLink() || !TASK_ID.test(taskId)
        ? '孤立 adoption state 的路径或 Task identity 无法确认。'
        : legacyAdoptionDiagnostic(adoptionFile, taskId);
      entries.push({ taskId, file: null, adoptionFile, bytes: null, receipt: null, classification: reason ? 'D' : 'C', reason: reason || '孤立 adoption state 不再对应旧 Environment Receipt。', repositories: [], blockers: [] });
    }
  }
  return { root, common, directory, entries };
}

function removeLegacy(entry, effects, removePath) {
  if (entry.file && fs.existsSync(entry.file)) { removePath(entry.file); effects.push({ type: 'legacy-receipt-removed', taskId: entry.taskId, path: entry.file }); }
  if (fs.existsSync(entry.adoptionFile)) {
    const adoption = JSON.parse(fs.readFileSync(entry.adoptionFile, 'utf8'));
    if (adoption.schemaVersion !== LEGACY_ADOPTION_SCHEMA || adoption.taskId !== entry.taskId) throw new Error(`Legacy adoption identity conflict: ${entry.taskId}`);
    removePath(entry.adoptionFile); effects.push({ type: 'legacy-adoption-removed', taskId: entry.taskId, path: entry.adoptionFile });
  }
}

export function registerTaskEnvironmentLegacyMigration(runtime) {
  function migrateLegacyTaskEnvironments(workspaceRoot, { apply = false } = {}) {
    let root;
    try { root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(workspaceRoot)); } catch { return { schemaVersion: 'buildr.task-environment-migration/v1', status: 'not-applicable', workspaceRoot: path.resolve(workspaceRoot), counts: { total: 0, A: 0, B: 0, C: 0, D: 0 }, entries: [], effects: [] }; }
    const inventory = readLegacyInventory(runtime, root);
    const counts = { total: inventory.entries.length, A: 0, B: 0, C: 0, D: 0 };
    for (const entry of inventory.entries) counts[entry.classification] += 1;
    const publicEntries = inventory.entries.map((entry) => ({ taskId: entry.taskId, classification: entry.classification, reason: entry.reason, liveRepositories: entry.repositories.map((item) => item.selector), blockers: entry.blockers }));
    if (!apply) return { schemaVersion: 'buildr.task-environment-migration/v1', status: counts.D ? 'blocked' : 'planned', workspaceRoot: root, counts, entries: publicEntries, effects: [] };
    if (counts.D) return { schemaVersion: 'buildr.task-environment-migration/v1', status: 'blocked', workspaceRoot: root, counts, entries: publicEntries, effects: [], diagnostic: { code: 'task_environment_legacy_identity_conflict', message: '旧 Task Environment 数据存在 D 类 identity/ownership 冲突；未执行迁移。' } };
    const effects = [];
    for (const entry of inventory.entries.filter((item) => item.classification === 'A')) {
      const prepared = runtime.prepareTaskEnvironment(root, entry.taskId, { adapter: entry.receipt.agent || 'codex', branch: entry.repositories[0].branch, startPoint: entry.repositories[0].startPoint || 'HEAD' });
      const evidence = runtime.readGitWorktreeEvidence(root, entry.taskId, { optional: true });
      const migratedSelectors = evidence?.evidence.repositories.map((item) => item.selector).sort() || [];
      const legacySelectors = entry.repositories.map((item) => item.selector).sort();
      if (prepared.status !== 'ready' || JSON.stringify(migratedSelectors) !== JSON.stringify(legacySelectors)) {
        runtime.removePath(path.join(root, '.buildr', 'tasks', entry.taskId, 'environment.json'));
        if (evidence?.file) runtime.removePath(evidence.file);
        return { schemaVersion: 'buildr.task-environment-migration/v1', status: 'blocked', workspaceRoot: root, counts, entries: publicEntries, effects, diagnostic: { code: 'task_environment_legacy_a_migration_blocked', message: prepared.diagnostic?.message || `A 类 repository set 无法无损迁移：${entry.taskId}。` } };
      }
      effects.push({ type: 'environment-v2-created', taskId: entry.taskId }, { type: 'git-evidence-created', taskId: entry.taskId });
      removeLegacy(entry, effects, runtime.removePath);
    }
    for (const entry of inventory.entries.filter((item) => item.classification === 'B')) {
      const evidence = {
        schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA,
        taskId: entry.taskId,
        workspaceRoot: root,
        branch: entry.repositories[0].branch,
        planDigest: migrationPlanDigest(entry.receipt, entry.repositories),
        status: 'ready',
        repositories: entry.repositories.map(narrowRepositoryEvidence),
        effects: [{ type: 'legacy-provider-evidence-migrated', taskId: entry.taskId }],
        updatedAt: new Date().toISOString(),
      };
      runtime.writeGitWorktreeEvidence(root, evidence);
      effects.push({ type: 'git-evidence-created', taskId: entry.taskId });
      removeLegacy(entry, effects, runtime.removePath);
    }
    for (const entry of inventory.entries.filter((item) => item.classification === 'C')) removeLegacy(entry, effects, runtime.removePath);
    return { schemaVersion: 'buildr.task-environment-migration/v1', status: 'migrated', workspaceRoot: root, counts, entries: publicEntries, effects };
  }

  Object.assign(runtime, { migrateLegacyTaskEnvironments });
  return runtime;
}
