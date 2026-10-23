import fs from 'node:fs';
import path from 'node:path';

import type { ArtifactRecord, ArtifactState } from '../domain/artifact.ts';
import { artifactsRoot } from '../persistence/artifact-repository.ts';

export const SCRATCH_CHILD_EXCLUDES = Object.freeze(new Set(['node_modules', '.git', '.worktrees', '.buildr']));

type DiscoveryRuntime = {
  existsDirectory(directory: string): boolean;
  toPosixRelative(root: string, file: string): string;
  assetCatalog?(targetRoot: string): any;
  readTask?(targetRoot: string, taskId: string): any;
};

export type DiscoveredArtifact = {
  path: string;
  absolutePath: string;
  kind: 'scratch' | 'evidence' | 'registered';
  symlink: boolean;
  sizeBytes: number | null;
  modifiedAt: string | null;
};

export type OwnerObservation = {
  taskId: string;
  status: string | null;
  observation: 'terminal' | 'live' | 'not-found' | 'unknown';
};

export type DisposalObservation = {
  state: ArtifactState;
  reason: string;
  owner: OwnerObservation | null;
  staleReferences: string[];
  unverifiedReferences: string[];
  registered: ArtifactRecord | null;
};

export function directorySize(root: string): { sizeBytes: number; truncated: boolean } {
  let sizeBytes = 0;
  let entries = 0;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop() as string;
    let children: fs.Dirent[] = [];
    try { children = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const child of children) {
      entries += 1;
      const location = path.join(current, child.name);
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) { stack.push(location); continue; }
      if (child.isFile()) {
        try { sizeBytes += fs.lstatSync(location).size; } catch { /* entry vanished */ }
      }
    }
    if (entries > 500000) return { sizeBytes, truncated: true };
  }
  return { sizeBytes, truncated: false };
}

export function registerArtifactDiscovery(runtime: DiscoveryRuntime) {
  function scratchRoots(targetRoot: string): { roots: { path: string; owner: string }[]; diagnostics: string[] } {
    const roots: { path: string; owner: string }[] = [{ path: path.join(targetRoot, 'build'), owner: 'workspace' }];
    const diagnostics: string[] = [];
    try {
      const catalog = runtime.assetCatalog?.(targetRoot);
      const repositories = new Map<string, string>((catalog?.repositories || []).map((repository: any) => [repository.id, repository.location]));
      for (const service of catalog?.services || []) {
        const location = repositories.get(service.repositoryId);
        if (!location) continue;
        const checkoutRoot = path.join(location, service.modulePath || '.');
        const buildRoot = path.join(checkoutRoot, 'build');
        if (!roots.some((root) => root.path === buildRoot)) roots.push({ path: buildRoot, owner: `service:${service.code}` });
      }
    } catch (error: any) {
      diagnostics.push(`服务目录不可用，scratch 根只覆盖 Workspace 根 build/：${error?.message || error}`);
    }
    return { roots, diagnostics };
  }

  function discoverArtifacts(targetRoot: string, { measure = true }: { measure?: boolean } = {}): { items: DiscoveredArtifact[]; diagnostics: string[] } {
    const items: DiscoveredArtifact[] = [];
    const { roots, diagnostics } = scratchRoots(targetRoot);
    for (const root of roots) {
      let children: fs.Dirent[] = [];
      try { children = fs.readdirSync(root.path, { withFileTypes: true }); } catch { continue; }
      for (const child of children) {
        if (SCRATCH_CHILD_EXCLUDES.has(child.name)) continue;
        const absolutePath = path.join(root.path, child.name);
        const symlink = child.isSymbolicLink();
        if (!child.isDirectory() && !symlink) continue;
        let stat: fs.Stats | null = null;
        try { stat = fs.statSync(absolutePath); } catch { stat = null; }
        if (stat && !stat.isDirectory()) continue;
        items.push({
          path: runtime.toPosixRelative(targetRoot, absolutePath),
          absolutePath,
          kind: 'scratch',
          symlink,
          sizeBytes: measure && stat ? directorySize(absolutePath).sizeBytes : null,
          modifiedAt: stat ? stat.mtime.toISOString() : null,
        });
      }
    }
    const localRoot = path.join(targetRoot, '.buildr', 'local');
    const managedRoot = artifactsRoot(targetRoot);
    let localChildren: fs.Dirent[] = [];
    try { localChildren = fs.readdirSync(localRoot, { withFileTypes: true }); } catch { localChildren = []; }
    for (const child of localChildren) {
      const absolutePath = path.join(localRoot, child.name);
      if (!child.isDirectory() || absolutePath === managedRoot) continue;
      let stat: fs.Stats | null = null;
      try { stat = fs.statSync(absolutePath); } catch { stat = null; }
      items.push({
        path: runtime.toPosixRelative(targetRoot, absolutePath),
        absolutePath,
        kind: 'evidence',
        symlink: false,
        sizeBytes: measure && stat ? directorySize(absolutePath).sizeBytes : null,
        modifiedAt: stat ? stat.mtime.toISOString() : null,
      });
    }
    return { items, diagnostics };
  }

  function observeOwner(targetRoot: string, taskId: string): OwnerObservation {
    try {
      const observed = runtime.readTask?.(targetRoot, taskId);
      const status = observed?.record?.status ?? null;
      return { taskId, status, observation: status === 'completed' || status === 'abandoned' ? 'terminal' : 'live' };
    } catch (error: any) {
      if (error?.code === 'task_record_not_found') return { taskId, status: null, observation: 'not-found' };
      return { taskId, status: null, observation: 'unknown' };
    }
  }

  function observeDisposal(targetRoot: string, record: ArtifactRecord | null, item: DiscoveredArtifact | null): DisposalObservation {
    if (record === null) {
      return { state: 'unattributed', reason: 'scratch 根内未登记对象；登记或人工核对前不可处置。', owner: null, staleReferences: [], unverifiedReferences: [], registered: null };
    }
    const exists = item !== null && !item.symlink;
    if (!exists) {
      return { state: 'missing', reason: item?.symlink ? '登记目标当前是符号链接，拒绝观察。' : '登记目标已不存在；登记记录保留供复核。', owner: null, staleReferences: [], unverifiedReferences: [], registered: record };
    }
    if (record.state === 'released') {
      return { state: 'released', reason: `已显式释放${record.releaseReason ? `：${record.releaseReason}` : '。'}`, owner: null, staleReferences: [], unverifiedReferences: [], registered: record };
    }
    if (record.disposition === 'evidence') {
      return { state: 'retained', reason: 'evidence 产物按证据保留，不进入自动清扫。', owner: null, staleReferences: [], unverifiedReferences: [], registered: record };
    }
    if (record.disposition === 'retained') {
      const staleReferences: string[] = [];
      const unverifiedReferences: string[] = [];
      for (const reference of record.references) {
        if (reference.checkPath === null) { unverifiedReferences.push(reference.summary); continue; }
        const check = path.resolve(targetRoot, reference.checkPath);
        const relative = path.relative(targetRoot, check);
        const inside = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
        let present = false;
        try { present = inside && fs.existsSync(check); } catch { present = false; }
        if (!present) staleReferences.push(reference.checkPath);
      }
      if (staleReferences.length) {
        return { state: 'retained-stale', reason: `保留引用不可核验：${staleReferences.join('、')}。`, owner: null, staleReferences, unverifiedReferences, registered: record };
      }
      return { state: 'retained', reason: unverifiedReferences.length ? 'retained 引用部分为声明式、未机械核验。' : 'retained 引用当前可核验。', owner: null, staleReferences, unverifiedReferences, registered: record };
    }
    const owner = record.taskId ? observeOwner(targetRoot, record.taskId) : null;
    if (owner === null) return { state: 'active', reason: 'ephemeral 登记未绑定任务；由登记方显式释放或补登任务。', owner, staleReferences: [], unverifiedReferences: [], registered: record };
    if (owner.observation === 'terminal') return { state: 'expired', reason: `ephemeral 产物归属任务 ${owner.taskId} 已终态（${owner.status}）。`, owner, staleReferences: [], unverifiedReferences: [], registered: record };
    if (owner.observation === 'not-found') return { state: 'expired', reason: `ephemeral 产物归属任务 ${owner.taskId} 在 Task Record 中不存在。`, owner, staleReferences: [], unverifiedReferences: [], registered: record };
    if (owner.observation === 'unknown') return { state: 'active', reason: `归属任务 ${owner.taskId} 状态不可核验；按保留处理。`, owner, staleReferences: [], unverifiedReferences: [], registered: record };
    return { state: 'active', reason: `归属任务 ${owner.taskId} 仍存活（${owner.status}）。`, owner, staleReferences: [], unverifiedReferences: [], registered: record };
  }

  Object.assign(runtime, { scratchRoots, discoverArtifacts, observeOwner, observeDisposal });
  return runtime;
}
