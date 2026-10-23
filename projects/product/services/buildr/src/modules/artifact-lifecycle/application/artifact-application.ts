import fs from 'node:fs';
import path from 'node:path';

import { createMutationPathGuard } from '../../../infrastructure/filesystem/workspace-mutation.ts';
import {
  artifactError,
  artifactRecordDigest,
  createArtifactRecord,
  normalizeArtifactRecord,
  type ArtifactRecord,
  type ArtifactState,
} from '../domain/artifact.ts';
import { directorySize, type DiscoveredArtifact, type DisposalObservation } from '../infrastructure/artifact-discovery.ts';

const FIRST_SEGMENT_DENY = new Set(['.git', '.worktrees', 'node_modules']);

type ArtifactApplicationRuntime = {
  assertCanonicalStructuredWorkspace(targetRoot: string): string;
  toPosixRelative(root: string, file: string): string;
  existsFile(file: string): boolean;
  existsDirectory(directory: string): boolean;
  listArtifactRecords(targetRoot: string): { records: ArtifactRecord[]; invalid: { file: string; error: string }[] };
  readArtifactRecord(targetRoot: string, artifactId: string): ArtifactRecord | null;
  findArtifactByPath(targetRoot: string, relativePath: string): ArtifactRecord | null;
  writeArtifactRecord(targetRoot: string, record: ArtifactRecord): string;
  discoverArtifacts(targetRoot: string, options?: { measure?: boolean }): { items: DiscoveredArtifact[]; diagnostics: string[] };
  observeDisposal(targetRoot: string, record: ArtifactRecord | null, item: DiscoveredArtifact | null): DisposalObservation;
};

export type ArtifactItemView = {
  artifactId: string | null;
  path: string;
  kind: string;
  state: ArtifactState | 'evidence';
  sizeBytes: number | null;
  modifiedAt: string | null;
  taskId: string | null;
  taskStatus: string | null;
  disposition: string | null;
  reason: string;
};

function assertArtifactTarget(targetRoot: string, input: string): { absolutePath: string; relativePath: string } {
  if (typeof input !== 'string' || !input.trim()) throw artifactError('artifact_input_invalid', '产物路径必须是非空文本。', 400);
  const absolutePath = path.resolve(targetRoot, input);
  const relative = path.relative(targetRoot, absolutePath);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw artifactError('artifact_outside_workspace', `产物必须在 Workspace 内部且不能是 Workspace 根本身：${input}。`, 400);
  }
  const segments = relative.split(path.sep);
  if (FIRST_SEGMENT_DENY.has(segments[0])) throw artifactError('artifact_protected_path', `产物路径位于受保护范围 ${segments[0]}/ 内：${input}。`, 400);
  if (segments[0] === '.buildr' && !(segments[1] === 'local' && segments.length > 2 && segments[2] !== 'artifacts')) {
    throw artifactError('artifact_protected_path', `产物路径位于受保护的 .buildr 管理范围内：${input}。`, 400);
  }
  const stat = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
  if (!stat) throw artifactError('artifact_target_missing', `产物路径不存在：${input}。`, 404);
  if (stat.isSymbolicLink()) throw artifactError('artifact_target_symlink', `产物路径不能是符号链接：${input}。`, 400);
  createMutationPathGuard(targetRoot)(absolutePath);
  return { absolutePath, relativePath: relative.split(path.sep).join('/') };
}

function assertExpectedRecord(current: ArtifactRecord | null, expected: string | null | undefined, usage: string) {
  if (expected === 'absent' || expected === undefined || expected === null) {
    if (current) throw artifactError('artifact_record_conflict', `产物 ${current.artifactId} 已登记；更新需提交当前 recordDigest。`, 409, { currentRecordDigest: artifactRecordDigest(current) }, `先 list/inspect 读取当前 digest，再以 --expected-record 重试。${usage}`);
    return;
  }
  if (!current) throw artifactError('artifact_record_conflict', '目标产物尚未登记，但提交了非 absent 的 --expected-record。', 409, undefined, usage);
  if (artifactRecordDigest(current) !== expected) {
    throw artifactError('artifact_record_conflict', '已观察 recordDigest 与当前记录不一致；重新读取当前事实后再判断。', 409, { currentRecordDigest: artifactRecordDigest(current) });
  }
}

function itemView(targetRoot: string, runtime: ArtifactApplicationRuntime, item: DiscoveredArtifact | null, record: ArtifactRecord | null): ArtifactItemView {
  const disposal = item?.kind === 'evidence' && !record
    ? { state: 'evidence' as const, reason: '.buildr/local 证据类目录仅作观察，不参与产物清扫。', owner: null, staleReferences: [], unverifiedReferences: [], registered: record }
    : runtime.observeDisposal(targetRoot, record, item);
  return {
    artifactId: record?.artifactId ?? null,
    path: item?.path ?? record?.path ?? 'unknown',
    kind: item?.kind ?? 'registered',
    state: disposal.state,
    sizeBytes: item?.sizeBytes ?? null,
    modifiedAt: item?.modifiedAt ?? null,
    taskId: record?.taskId ?? null,
    taskStatus: disposal.owner?.status ?? null,
    disposition: record?.disposition ?? null,
    reason: disposal.reason,
  };
}

export function registerArtifactApplication(runtime: ArtifactApplicationRuntime) {
  function workspaceRoot(targetRoot: string): string {
    const root = runtime.assertCanonicalStructuredWorkspace(targetRoot);
    return root;
  }

  function enumerate(targetRoot: string, measure = true) {
    const { items, diagnostics } = runtime.discoverArtifacts(targetRoot, { measure });
    const { records, invalid } = runtime.listArtifactRecords(targetRoot);
    const byPath = new Map(records.map((record) => [record.path, record]));
    const seen = new Set<string>();
    const views: ArtifactItemView[] = [];
    for (const item of items) {
      seen.add(item.path);
      views.push(itemView(targetRoot, runtime, item, byPath.get(item.path) ?? null));
    }
    for (const record of records) {
      if (seen.has(record.path)) continue;
      const absolutePath = path.join(targetRoot, record.path);
      const stat = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
      const item: DiscoveredArtifact | null = stat && !stat.isSymbolicLink()
        ? { path: record.path, absolutePath, kind: 'registered', symlink: false, sizeBytes: stat.isDirectory() ? directorySize(absolutePath).sizeBytes : stat.size, modifiedAt: stat.mtime.toISOString() }
        : stat?.isSymbolicLink()
          ? { path: record.path, absolutePath, kind: 'registered', symlink: true, sizeBytes: null, modifiedAt: null }
          : null;
      views.push(itemView(targetRoot, runtime, item, record));
    }
    views.sort((left, right) => left.path.localeCompare(right.path));
    return { views, diagnostics, invalid };
  }

  function registerArtifact(targetRoot: string, input: {
    path: string; purpose: string; disposition: string; taskId?: string | null;
    retainReason?: string | null; references?: { summary: string; checkPath?: string | null }[];
    registeredBy?: string; expectedRecord?: string | null;
  }) {
    const root = workspaceRoot(targetRoot);
    const target = assertArtifactTarget(root, input.path);
    const references = (input.references || []).map((reference) => {
      if (reference.checkPath) {
        const check = path.resolve(root, reference.checkPath);
        const relative = path.relative(root, check);
        if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw artifactError('artifact_reference_invalid', `reference checkPath 必须在 Workspace 内部：${reference.checkPath}。`, 400);
        }
        return { summary: reference.summary, checkPath: relative.split(path.sep).join('/') };
      }
      return { summary: reference.summary, checkPath: null };
    });
    const existing = runtime.findArtifactByPath(root, target.relativePath);
    assertExpectedRecord(existing, input.expectedRecord, `buildr artifact register ${target.relativePath} --expected-record <digest>`);
    const draft = createArtifactRecord({
      path: target.relativePath,
      registeredBy: input.registeredBy || 'agent',
      purpose: input.purpose,
      disposition: input.disposition as any,
      taskId: input.taskId ?? existing?.taskId ?? null,
      retainReason: input.retainReason ?? existing?.retainReason ?? null,
      references: references.length ? references : existing?.references ?? [],
    });
    const record = normalizeArtifactRecord(existing
      ? { ...draft, artifactId: existing.artifactId, createdAt: existing.createdAt, state: 'registered', releasedAt: null, releaseReason: null }
      : draft);
    const file = runtime.writeArtifactRecord(root, record);
    return {
      status: 'applied', artifactId: record.artifactId, path: record.path, recordDigest: artifactRecordDigest(record),
      record, updated: existing !== null,
      effects: [{ kind: 'write', path: runtime.toPosixRelative(root, file) }],
      nextActions: ['收尾时按 buildr artifact list / clean 逐项处置该产物。'],
    };
  }

  function listArtifacts(targetRoot: string, filters: { taskId?: string | null; state?: string | null } = {}) {
    const root = workspaceRoot(targetRoot);
    const { views, diagnostics, invalid } = enumerate(root);
    const filtered = views.filter((view) => {
      if (filters.taskId && view.taskId !== filters.taskId) return false;
      if (filters.state && view.state !== filters.state) return false;
      return true;
    });
    return {
      status: 'ready', workspaceRoot: root,
      artifacts: filtered,
      counts: filtered.reduce((map: Record<string, number>, view) => { map[view.state] = (map[view.state] || 0) + 1; return map; }, {}),
      diagnostics: [...diagnostics, ...invalid.map((entry) => `产物记录不可读：${entry.file}（${entry.error}）`)],
      nextActions: filtered.some((view) => view.state === 'unattributed') ? ['存在 unattributed 对象：登记归属或人工核对后再考虑处置。'] : [],
    };
  }

  function artifactStatus(targetRoot: string) {
    const root = workspaceRoot(targetRoot);
    const { views, diagnostics, invalid } = enumerate(root);
    const byState = filteredCount(views);
    const stale = views.filter((view) => view.state === 'retained-stale');
    const expired = views.filter((view) => view.state === 'expired' || view.state === 'released');
    const totalSize = views.reduce((sum, view) => sum + (view.sizeBytes || 0), 0);
    return {
      status: 'ready', workspaceRoot: root,
      counts: byState, totalArtifacts: views.length, totalSizeBytes: totalSize,
      cleanable: expired.map((view) => ({ artifactId: view.artifactId, path: view.path, state: view.state, sizeBytes: view.sizeBytes, reason: view.reason })),
      staleRetained: stale.map((view) => ({ artifactId: view.artifactId, path: view.path, sizeBytes: view.sizeBytes, reason: view.reason })),
      unattributed: views.filter((view) => view.state === 'unattributed').map((view) => ({ path: view.path, sizeBytes: view.sizeBytes })),
      registryDiagnostics: invalid,
      diagnostics,
      nextActions: [
        ...(expired.length ? [`${expired.length} 项 expired/released 产物可由 buildr artifact clean 审阅并处置。`] : []),
        ...(stale.length ? [`${stale.length} 项 retained-stale 产物引用失效：显式 release 或更新保留引用。`] : []),
        ...(views.some((view) => view.state === 'unattributed') ? ['存在 unattributed scratch 对象：先登记归属或人工核对。'] : []),
      ],
    };
  }

  function filteredCount(views: ArtifactItemView[]) {
    return views.reduce((map: Record<string, number>, view) => { map[view.state] = (map[view.state] || 0) + 1; return map; }, {});
  }

  function releaseArtifact(targetRoot: string, selector: string, input: { reason: string; expectedRecord: string }) {
    const root = workspaceRoot(targetRoot);
    const record = findRecord(root, selector);
    assertExpectedRecord(record, input.expectedRecord, `buildr artifact release ${record?.artifactId ?? selector} --expected-record <digest>`);
    if (!record) throw artifactError('artifact_not_found', `产物未登记：${selector}。`, 404);
    const updated = normalizeArtifactRecord({ ...record, state: 'released', releasedAt: new Date().toISOString(), releaseReason: input.reason.trim(), updatedAt: new Date().toISOString() });
    const file = runtime.writeArtifactRecord(root, updated);
    return {
      status: 'applied', artifactId: updated.artifactId, path: updated.path, recordDigest: artifactRecordDigest(updated),
      record: updated,
      effects: [{ kind: 'write', path: runtime.toPosixRelative(root, file) }],
      nextActions: ['运行 buildr artifact clean 审阅计划；--execute 才会删除该目标。'],
    };
  }

  function findRecord(root: string, selector: string): ArtifactRecord | null {
    const byPath = () => {
      const relative = path.isAbsolute(selector)
        ? path.relative(root, path.resolve(selector)).split(path.sep).join('/')
        : selector.split(path.sep).join('/');
      return runtime.findArtifactByPath(root, relative);
    };
    if (selector.includes('/') || path.isAbsolute(selector)) return byPath();
    let byId: ArtifactRecord | null = null;
    try { byId = runtime.readArtifactRecord(root, selector); } catch { byId = null; }
    return byId || byPath();
  }

  function cleanArtifacts(targetRoot: string, { execute = false }: { execute?: boolean } = {}) {
    const root = workspaceRoot(targetRoot);
    const assertPath = createMutationPathGuard(root);
    const { views, diagnostics, invalid } = enumerate(root);
    const plan = views.map((view) => {
      const eligible = (view.state === 'expired' || view.state === 'released') && view.artifactId !== null;
      return { ...view, eligible };
    });
    if (!execute) {
      return {
        status: 'ready', mode: 'dry-run', workspaceRoot: root,
        plan: plan.map(({ eligible, ...view }) => ({ ...view, action: eligible ? 'delete' : 'retain' })),
        totals: { candidates: plan.filter((item) => item.eligible).length, retained: plan.filter((item) => !item.eligible).length, bytes: plan.filter((item) => item.eligible).reduce((sum, item) => sum + (item.sizeBytes || 0), 0) },
        diagnostics: [...diagnostics, ...invalid.map((entry) => `产物记录不可读：${entry.file}（${entry.error}）`)],
        nextActions: plan.some((item) => item.eligible) ? ['审阅计划无误后执行 buildr artifact clean --execute。'] : [],
      };
    }
    const results: any[] = [];
    for (const item of plan) {
      if (!item.eligible) { results.push({ path: item.path, artifactId: item.artifactId, result: 'retained', reason: item.reason }); continue; }
      try {
        const current = item.artifactId ? runtime.readArtifactRecord(root, item.artifactId) : null;
        if (!current) { results.push({ path: item.path, artifactId: item.artifactId, result: 'retained', reason: '登记记录已不存在，无法复核授权。' }); continue; }
        const disposal = runtime.observeDisposal(root, current, {
          path: item.path, absolutePath: path.join(root, item.path), kind: 'scratch', symlink: false, sizeBytes: null, modifiedAt: null,
        });
        if (disposal.state !== 'expired' && disposal.state !== 'released') {
          results.push({ path: item.path, artifactId: item.artifactId, result: 'retained', reason: `删除前复核状态变为 ${disposal.state}：${disposal.reason}` });
          continue;
        }
        const absolutePath = path.resolve(root, current.path);
        assertPath(absolutePath, 'directory');
        if (!fs.existsSync(absolutePath)) { results.push({ path: item.path, artifactId: item.artifactId, result: 'already-absent', reason: '目标已不存在。' }); continue; }
        fs.rmSync(absolutePath, { recursive: true, force: true });
        if (fs.existsSync(absolutePath)) throw new Error(`删除后目标仍存在：${absolutePath}`);
        results.push({ path: item.path, artifactId: item.artifactId, result: 'deleted', sizeBytes: item.sizeBytes });
      } catch (error: any) {
        results.push({ path: item.path, artifactId: item.artifactId, result: 'error', reason: error?.message || String(error) });
      }
    }
    const deleted = results.filter((item) => item.result === 'deleted');
    return {
      status: results.some((item) => item.result === 'error') ? 'partial' : 'applied', mode: 'execute', workspaceRoot: root,
      results,
      totals: {
        deleted: deleted.length,
        bytes: deleted.reduce((sum, item) => sum + (item.sizeBytes || 0), 0),
        retained: results.filter((item) => item.result === 'retained').length,
        absent: results.filter((item) => item.result === 'already-absent').length,
        errors: results.filter((item) => item.result === 'error').length,
      },
      diagnostics: [...diagnostics, ...invalid.map((entry) => `产物记录不可读：${entry.file}（${entry.error}）`)],
      nextActions: results.some((item) => item.result === 'error') ? ['存在逐项失败：按各项 reason 复核后重试，不影响已删除项。'] : [],
    };
  }

  Object.assign(runtime, { registerArtifact, listArtifacts, artifactStatus, releaseArtifact, cleanArtifacts });
  return runtime;
}
