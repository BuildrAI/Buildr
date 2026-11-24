import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { executionScopeRef } from '../execution-contracts.ts';
import type { HarnessDirectory } from './directory-host.ts';
import { codeFailure, codeGit, codeGitAsync, fallbackIgnored, relativeCodePath } from '../workbench/code-file-reader.ts';
import { normalizeFilesystemPath, sameFilesystemPath } from '../workbench/filesystem-path-identity.ts';
import { parseGitWorktreeRecord, readGitWorktreeRecords } from '../workbench/git-worktree-list.ts';
import { localGitIdentity, localGitIdentityAsync, type LocalGitIdentity } from '../workbench/local-git.ts';
import { SOURCE_CONTROL_LIMITS } from '../workbench/source-control-git-reader.ts';

const lexicalPath = (a:string,b:string) => normalizeFilesystemPath(a)===normalizeFilesystemPath(b);
const missing = () => codeFailure('code_worktree_identity_changed', '所选工作树不再属于此仓库或身份已变化；未切换到其他目录。', 409);

/** Additional build/IDE artifact directories excluded only during repository discovery, never from explorer directory listings. */
const discoveryIgnored = new Set([
  ...fallbackIgnored,
  'target', '.gradle', '.idea', '.vscode', '.next', '.nuxt', '.cache',
  '__pycache__', '.venv', 'venv', 'Pods', 'DerivedData', 'coverage', 'logs',
]);

const checkoutCommonDirs = new WeakMap<object, string>();
export function observedCheckoutCommonDir(checkouts: object): string | undefined {
  return checkoutCommonDirs.get(checkouts);
}

function checkMember(location: string, anchor: LocalGitIdentity) {
  const root = fs.realpathSync(location);
  if (!lexicalPath(root, location)) throw missing();
  const git = localGitIdentity(root);
  if (!sameFilesystemPath(git.commonDir, anchor.commonDir)) throw missing();
  return { root, git };
}

async function checkMemberAsync(location: string, anchor: LocalGitIdentity) {
  const root = await fs.promises.realpath(location);
  if (!lexicalPath(root, location)) throw missing();
  const git = await localGitIdentityAsync(root);
  if (!sameFilesystemPath(git.commonDir, anchor.commonDir)) throw missing();
  return { root, git };
}

export function observeDirectoryCheckouts(root: string) {
  let anchor: LocalGitIdentity;
  try { anchor = localGitIdentity(root); }
  catch (error) { return { defaultId: null, members: [], truncated: false, diagnostic: (error as Error).message }; }
  const records = readGitWorktreeRecords(root);
  if (!records.some(record => sameFilesystemPath(record.declared, root))) throw missing();
  // Keep the current checkout even if the rest of the repository exceeds the catalog bound.
  const ordered = [records.find(record => sameFilesystemPath(record.declared, root))!, ...records.filter(record => !sameFilesystemPath(record.declared, root))];
  const members = ordered.slice(0, SOURCE_CONTROL_LIMITS.worktrees).flatMap(record => {
    try {
      if (sameFilesystemPath(record.declared, root)) {
        const location = fs.realpathSync(record.declared);
        if (!lexicalPath(location, record.declared)) throw missing();
        return [{ id: anchor.id, location, name: path.basename(location), branch: record.branch, head: record.head, isMain: anchor.isMain }];
      }
      const { root: location, git } = checkMember(record.declared, anchor);
      return [{ id: git.id, location, name: path.basename(location), branch: record.branch, head: record.head, isMain: git.isMain }];
    } catch { return []; }
  });
  if (localGitIdentity(root).id !== anchor.id || !members.some(member => member.id === anchor.id)) throw missing();
  const result = { defaultId: anchor.id, members, truncated: ordered.length > SOURCE_CONTROL_LIMITS.worktrees,
    diagnostic: members.length < Math.min(ordered.length, SOURCE_CONTROL_LIMITS.worktrees) ? '部分 Git 工作树目录已失效或暂不可读。' : null };
  checkoutCommonDirs.set(result, anchor.commonDir);
  return result;
}

export async function observeDirectoryCheckoutsAsync(
  root: string,
  preObserved?: { anchor?: LocalGitIdentity; worktreeOutput?: Buffer },
) {
  let anchor: LocalGitIdentity;
  try { anchor = preObserved?.anchor ?? await localGitIdentityAsync(root); }
  catch (error) { return { defaultId: null, members: [], truncated: false, diagnostic: (error as Error).message }; }
  const rawWorktrees = preObserved?.worktreeOutput ?? await codeGitAsync(root, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024);
  const records = rawWorktrees.toString('utf8').split('\0\0').filter(Boolean).map(parseGitWorktreeRecord);
  if (!records.some(record => sameFilesystemPath(record.declared, root))) throw missing();
  const ordered = [records.find(record => sameFilesystemPath(record.declared, root))!, ...records.filter(record => !sameFilesystemPath(record.declared, root))];
  const bounded = ordered.slice(0, SOURCE_CONTROL_LIMITS.worktrees);
  const slots: Array<{ id: string; location: string; name: string; branch: string | null; head: string | null; isMain: boolean } | null> = new Array(bounded.length).fill(null);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, bounded.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= bounded.length) return;
      const record = bounded[index]!;
      try {
        if (sameFilesystemPath(record.declared, root)) {
          const location = await fs.promises.realpath(record.declared);
          if (!lexicalPath(location, record.declared)) throw missing();
          slots[index] = { id: anchor.id, location, name: path.basename(location), branch: record.branch, head: record.head, isMain: anchor.isMain };
        } else {
          const { root: location, git } = await checkMemberAsync(record.declared, anchor);
          slots[index] = { id: git.id, location, name: path.basename(location), branch: record.branch, head: record.head, isMain: git.isMain };
        }
      } catch { slots[index] = null; }
    }
  }));
  const members = slots.filter((item): item is NonNullable<typeof item> => item !== null);
  if ((await localGitIdentityAsync(root)).id !== anchor.id || !members.some(member => member.id === anchor.id)) throw missing();
  const result = { defaultId: anchor.id, members, truncated: ordered.length > SOURCE_CONTROL_LIMITS.worktrees,
    diagnostic: members.length < bounded.length ? '部分 Git 工作树目录已失效或暂不可读。' : null };
  checkoutCommonDirs.set(result, anchor.commonDir);
  return result;
}

export function resolveDirectoryCheckout(root: string, id: string) {
  const anchor = localGitIdentity(root), records = readGitWorktreeRecords(root);
  if (!records.some(record => sameFilesystemPath(record.declared, root))) throw missing();
  const ranked = [root, ...records.filter(record => !sameFilesystemPath(record.declared, root)).slice(0, SOURCE_CONTROL_LIMITS.worktrees - 1).map(record => record.declared)];
  for (const location of ranked) {
    const member = (() => { try { return checkMember(location, anchor); } catch { return null; } })();
    if (member?.git.id === id) {
      if (localGitIdentity(root).id !== anchor.id) throw missing();
      return member;
    }
  }
  throw missing();
}

export async function resolveDirectoryCheckoutAsync(root: string, id: string, preObservedAnchor?: LocalGitIdentity) {
  const anchor = preObservedAnchor ?? await localGitIdentityAsync(root);
  if (anchor.id === id) {
    const real = await fs.promises.realpath(root);
    if (!lexicalPath(real, root)) throw missing();
    return { root: real, git: anchor };
  }
  const rawWorktrees = await codeGitAsync(root, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024);
  const records = rawWorktrees.toString('utf8').split('\0\0').filter(Boolean).map(parseGitWorktreeRecord);
  if (!records.some(record => sameFilesystemPath(record.declared, root))) throw missing();
  const ranked = records.filter(record => !sameFilesystemPath(record.declared, root)).slice(0, SOURCE_CONTROL_LIMITS.worktrees - 1).map(record => record.declared);
  for (const location of ranked) {
    const member = await checkMemberAsync(location, anchor).catch(() => null);
    if (member?.git.id === id) {
      if ((await localGitIdentityAsync(root)).id !== anchor.id) throw missing();
      return member;
    }
  }
  throw missing();
}

const maxDirectories = 2048;

function parseCandidateDirectories(statusOutput: string, indexOutput: string): string[] {
  const candidates = new Set<string>();
  for (const record of statusOutput.split('\0')) {
    if (!record || (!record.startsWith('? ') && !record.startsWith('! '))) continue;
    const entry = record.slice(2);
    if (entry.endsWith('/')) candidates.add(entry.slice(0, -1));
  }
  for (const record of indexOutput.split('\0')) {
    if (!record.startsWith('160000 ')) continue;
    const tab = record.indexOf('\t');
    if (tab > 0) candidates.add(record.slice(tab + 1));
  }
  return [...candidates].filter(Boolean);
}

function discoverGitCandidateDirectories(location: string): string[] {
  const statusOutput = codeGit(location, ['status', '--porcelain=v2', '--ignored=matching', '--untracked-files=normal', '-z'], 16 * 1024 * 1024).toString('utf8');
  const indexOutput = codeGit(location, ['ls-files', '--stage', '-z'], 32 * 1024 * 1024).toString('utf8');
  return parseCandidateDirectories(statusOutput, indexOutput);
}

async function discoverGitCandidateDirectoriesAsync(location: string): Promise<string[]> {
  const [statusBuf, indexBuf] = await Promise.all([
    codeGitAsync(location, ['status', '--porcelain=v2', '--ignored=matching', '--untracked-files=normal', '-z'], 16 * 1024 * 1024),
    codeGitAsync(location, ['ls-files', '--stage', '-z'], 32 * 1024 * 1024),
  ]);
  return parseCandidateDirectories(statusBuf.toString('utf8'), indexBuf.toString('utf8'));
}

/** Discover Git roots in the selected directory, not Development registrations. */
export function observeDirectoryRepositories(root: string, scopeId: string) {
  const queue = [''], seen = new Set<string>(), skipLocations = new Set<string>(), queuedLocations = new Set<string>([normalizeFilesystemPath(root)]);
  const repositories: Array<{id:string;path:string;name:string;checkouts:ReturnType<typeof observeDirectoryCheckouts>}> = [];
  let visited = 0, entries = 0, truncated = false, unavailable = false;
  while (queue.length) {
    if (visited++ >= maxDirectories || repositories.length >= SOURCE_CONTROL_LIMITS.repositories || entries >= 32768) { truncated = true; break; }
    const relative = queue.shift()!, location = path.join(root, relative);
    try {
      const normalized = normalizeFilesystemPath(location);
      if (relative && skipLocations.has(normalized)) continue;
      if (!lexicalPath(fs.realpathSync(location), location)) { unavailable = true; continue; }
      const marker = fs.lstatSync(path.join(location, '.git'), {throwIfNoEntry:false});
      let handledByGit = false;
      if (marker && (marker.isDirectory() || marker.isFile())) {
        try {
          const git = localGitIdentity(location);
          handledByGit = true;
          if (!seen.has(git.commonDir)) {
            seen.add(git.commonDir);
            const checkouts = observeDirectoryCheckouts(location);
            skipLocations.add(normalized);
            for (const member of checkouts.members) skipLocations.add(normalizeFilesystemPath(member.location));
            repositories.push({id: relative ? git.id : scopeId,path:relative,name:path.basename(location),checkouts});
          }
          try {
            for (const sub of discoverGitCandidateDirectories(location)) {
              if (++entries >= 32768) { truncated = true; break; }
              const segments = sub.split('/');
              if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.toLowerCase() === '.git' || discoveryIgnored.has(segment))) continue;
              const childLocation = path.join(location, sub);
              const normalizedChild = normalizeFilesystemPath(childLocation);
              if (skipLocations.has(normalizedChild) || queuedLocations.has(normalizedChild)) continue;
              if (visited + queue.length >= maxDirectories) { truncated = true; continue; }
              queuedLocations.add(normalizedChild);
              queue.push(relative ? relative + '/' + sub : sub);
            }
          } catch {
            // Fall back to filesystem enumeration only if Git metadata cannot be inspected.
            handledByGit = false;
          }
        } catch { unavailable = true; }
      }
      if (handledByGit) continue;
      const directory = fs.opendirSync(location);
      try {
        for (let entry; entries++ < 32768 && (entry = directory.readSync());) {
          if (!entry.isDirectory() || entry.name.toLowerCase()==='.git' || discoveryIgnored.has(entry.name)) continue;
          const normalizedChild = normalizeFilesystemPath(path.join(location, entry.name));
          if (skipLocations.has(normalizedChild) || queuedLocations.has(normalizedChild)) continue;
          if (visited + queue.length >= maxDirectories) { truncated = true; continue; }
          queuedLocations.add(normalizedChild);
          queue.push(relative ? relative + '/' + entry.name : entry.name);
        }
      } finally { directory.closeSync(); }
    } catch { unavailable = true; }
  }
  if(entries>=32768) truncated = true;
  return {repositories, truncated, diagnostic:unavailable?'部分目录或仓库暂不可核对。':!repositories.length&&!truncated?'当前目录范围没有发现 Git 仓库。':null};
}

export async function observeDirectoryRepositoriesAsync(root: string, scopeId: string) {
  const queue = [''], seen = new Set<string>(), skipLocations = new Set<string>(), queuedLocations = new Set<string>([normalizeFilesystemPath(root)]);
  const repositories: Array<{id:string;path:string;name:string;checkouts:ReturnType<typeof observeDirectoryCheckouts>}> = [];
  let visited = 0, entries = 0, truncated = false, unavailable = false;
  while (queue.length && !truncated) {
    const availableSlots = Math.min(8, queue.length, maxDirectories - visited);
    if (availableSlots <= 0 || repositories.length >= SOURCE_CONTROL_LIMITS.repositories || entries >= 32768) {
      truncated = true;
      break;
    }
    const batch = queue.splice(0, availableSlots);
    visited += batch.length;
    const batchResults = await Promise.all(batch.map(async relative => {
      const location = path.join(root, relative);
      const normalized = normalizeFilesystemPath(location);
      if (relative && skipLocations.has(normalized)) return null;
      try {
        const real = await fs.promises.realpath(location);
        if (!lexicalPath(real, location)) return { kind: 'unavailable' as const };
        const marker = await fs.promises.lstat(path.join(location, '.git')).catch(() => null);
        if (marker && (marker.isDirectory() || marker.isFile())) {
          try {
            const git = await localGitIdentityAsync(location);
            const [checkouts, candidates] = await Promise.all([
              observeDirectoryCheckoutsAsync(location, { anchor: git }),
              discoverGitCandidateDirectoriesAsync(location).then(list => ({ ok: true as const, list })).catch(() => ({ ok: false as const, list: [] as string[] })),
            ]);
            if (candidates.ok) {
              return { kind: 'git' as const, relative, location, normalized, git, checkouts, subDirs: candidates.list };
            }
            const children = await readNonGitChildrenAsync(location);
            return { kind: 'git-fallback' as const, relative, location, normalized, git, checkouts, children };
          } catch {
            // Fall through to non-Git walk if Git identity failed, matching sync behavior.
          }
        }
        const children = await readNonGitChildrenAsync(location);
        return { kind: 'dir' as const, relative, location, children, unavailableMarker: Boolean(marker && (marker.isDirectory() || marker.isFile())) };
      } catch {
        return { kind: 'unavailable' as const };
      }
    }));

    for (const item of batchResults) {
      if (!item) continue;
      if (item.kind === 'unavailable') { unavailable = true; continue; }
      if (item.kind === 'dir' && item.unavailableMarker) unavailable = true;
      if (item.kind === 'git' || item.kind === 'git-fallback') {
        if (!seen.has(item.git.commonDir)) {
          if (repositories.length >= SOURCE_CONTROL_LIMITS.repositories) { truncated = true; break; }
          seen.add(item.git.commonDir);
          skipLocations.add(item.normalized);
          for (const member of item.checkouts.members) skipLocations.add(normalizeFilesystemPath(member.location));
          repositories.push({ id: item.relative ? item.git.id : scopeId, path: item.relative, name: path.basename(item.location), checkouts: item.checkouts });
        }
        if (item.kind === 'git') {
          for (const sub of item.subDirs) {
            if (++entries >= 32768) { truncated = true; break; }
            const segments = sub.split('/');
            if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.toLowerCase() === '.git' || discoveryIgnored.has(segment))) continue;
            const childLocation = path.join(item.location, sub);
            const normalizedChild = normalizeFilesystemPath(childLocation);
            if (skipLocations.has(normalizedChild) || queuedLocations.has(normalizedChild)) continue;
            if (visited + queue.length >= maxDirectories) { truncated = true; continue; }
            queuedLocations.add(normalizedChild);
            queue.push(item.relative ? item.relative + '/' + sub : sub);
          }
          continue;
        }
      }
      for (const name of item.children) {
        if (entries++ >= 32768) { truncated = true; break; }
        if (name.toLowerCase() === '.git' || discoveryIgnored.has(name)) continue;
        const normalizedChild = normalizeFilesystemPath(path.join(item.location, name));
        if (skipLocations.has(normalizedChild) || queuedLocations.has(normalizedChild)) continue;
        if (visited + queue.length >= maxDirectories) { truncated = true; continue; }
        queuedLocations.add(normalizedChild);
        queue.push(item.relative ? item.relative + '/' + name : name);
      }
    }
  }
  if (entries >= 32768) truncated = true;
  return { repositories, truncated, diagnostic: unavailable ? '部分目录或仓库暂不可核对。' : !repositories.length && !truncated ? '当前目录范围没有发现 Git 仓库。' : null };
}

async function readNonGitChildrenAsync(location: string): Promise<string[]> {
  const directory = await fs.promises.opendir(location);
  const children: string[] = [];
  let closed = false;
  try {
    let count = 0;
    for await (const entry of directory) {
      if (count++ >= 32768) { closed = true; break; }
      if (entry.isDirectory()) children.push(entry.name);
    }
  } finally {
    if (!closed) { try { await directory.close(); } catch { /* already closed */ } }
  }
  return children;
}

export type DirectoryRepositoryHint = { path: string; name: string };

/** The workspace document only supplies in-scope path hints, never Git identity or permission. */
function registeredHints(directory: HarnessDirectory): DirectoryRepositoryHint[] | null {
  if (directory.ref.sourceId !== 'buildr') return null;
  try {
    const ref = executionScopeRef(directory.ref.id, directory.ref.sourceId);
    if (ref.id === '@default' || ref.sourceId !== directory.ref.sourceId) return null;
    const read = (relative: string) => {
      const file = path.join(directory.rootPath, relative);
      if (!lexicalPath(fs.realpathSync(file), file)) throw missing();
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 1024 * 1024) throw missing();
        const body = Buffer.alloc(stat.size + 1);
        let length = 0;
        while (length < body.length) {
          const count = fs.readSync(fd, body, length, body.length - length, null);
          if (!count) break;
          length += count;
        }
        if (length !== stat.size) throw missing();
        return parse(body.toString('utf8', 0, length), {maxAliasCount: 0});
      } finally { fs.closeSync(fd); }
    };
    const workspace = read('.buildr/workspace.yml');
    if (workspace?.schemaVersion !== 'buildr.workspace/v1' || workspace.id !== ref.id) return null;
    const manifest = read('repositories/manifest.yml');
    if (manifest?.schemaVersion !== 'buildr.repositories/v1' || !manifest.repositories || typeof manifest.repositories !== 'object' || Array.isArray(manifest.repositories)) return null;
    return Object.values(manifest.repositories as Record<string, {workspaceId?: string; name?: string; source?: {path?: string}}>).flatMap(item => {
      if (!item || item.workspaceId !== ref.id || typeof item.source?.path !== 'string' || path.isAbsolute(item.source.path)) return [];
      try {
        const relative = item.source.path === '.' ? '' : relativeCodePath(item.source.path, true);
        return [{path:relative, name:typeof item.name === 'string' && item.name.trim() ? item.name : path.basename(relative || directory.rootPath)}];
      } catch { return []; }
    }).sort((a, b) => Number(a.path !== '') - Number(b.path !== ''));
  } catch { return null; }
}

type ScanItem = { path: string; depth: number };
type Discovery = {
  binding: string; expiresAt: number; queue: ScanItem[]; seen: Set<string>; reported: Set<string>;
  entries: number; limited: boolean; unavailable: boolean;
};
const discoveryTtl = 5 * 60_000;
const discoveryPage = 64;
const discoveryDirectoryLimit = 8192;
const discoveryEntryLimit = 32768;

/** One bounded read session per cursor. No filesystem handles survive a request. */
export function createDirectoryRepositoryDiscovery(now = Date.now) {
  const sessions = new Map<string, Discovery>();
  const receipts = new Map<string, {binding:string; expiresAt:number; result:{repositories:DirectoryRepositoryHint[]; nextCursor:string|null; limited:boolean; diagnostic:string|null; readAt:string}}>();
  return (directory: HarnessDirectory, cursor?: string) => {
    const time = now();
    for (const [id, scan] of sessions) if (scan.expiresAt <= time) sessions.delete(id);
    const binding = JSON.stringify([directory.ref.sourceId, directory.ref.id, directory.rootPath, directory.revision]);
    for (const [id, receipt] of receipts) if (receipt.expiresAt <= time) receipts.delete(id);
    const receipt = cursor ? receipts.get(cursor) : undefined;
    if (receipt?.binding === binding) return receipt.result;
    const resume = cursor ? sessions.get(cursor) : undefined;
    if (cursor && (!resume || resume.binding !== binding)) throw codeFailure('code_directory_discovery_expired', '查找进度已过期或不属于当前目录，请重新读取后再查找。', 409);
    const scan: Discovery = resume ?? {binding, expiresAt:time+discoveryTtl, queue:[{path:'',depth:0}], seen:new Set(['']), reported:new Set(), entries:0, limited:false, unavailable:false};
    const hints = !cursor ? registeredHints(directory) : null;
    const results: DirectoryRepositoryHint[] = [];
    const report = (hint: DirectoryRepositoryHint) => {
      if (scan.reported.has(hint.path)) return;
      if (scan.reported.size >= SOURCE_CONTROL_LIMITS.repositories) { scan.limited = true; return; }
      scan.reported.add(hint.path); results.push(hint);
    };
    for (const hint of hints ?? []) report(hint);
    const candidate = (parent: ScanItem, relative: string) => {
      if (++scan.entries >= discoveryEntryLimit) { scan.limited = true; return; }
      const pieces = relative.split('/');
      if (pieces.some(piece => !piece || piece === '.' || piece === '..' || piece.toLowerCase() === '.git' || discoveryIgnored.has(piece))) return;
      const next = parent.path ? parent.path + '/' + relative : relative;
      if (scan.seen.has(next)) return;
      if (scan.seen.size >= discoveryDirectoryLimit) { scan.limited = true; return; }
      scan.seen.add(next); scan.queue.push({path:next,depth:parent.depth+pieces.length});
    };
    if (!hints) for (let page = 0; page < discoveryPage && scan.queue.length && !scan.limited; page++) {
      const index = cursor ? 0 : scan.queue.findIndex(item => item.depth <= 1);
      if (index < 0) break;
      const [item] = scan.queue.splice(index, 1);
      const location = path.join(directory.rootPath, item.path);
      try {
        if (!lexicalPath(fs.realpathSync(location), location)) continue;
        const marker = fs.lstatSync(path.join(location, '.git'), {throwIfNoEntry:false});
        if (marker?.isDirectory() || marker?.isFile()) {
          report({path:item.path, name:path.basename(location)});
          // Do not walk tracked source trees eagerly. Defer even Git's candidate
          // inspection of the shallow repositories until the user asks for more.
          if (!cursor) { scan.queue.push({...item, depth:2}); continue; }
          try { for (const child of discoverGitCandidateDirectories(location)) { candidate(item, child); if (scan.limited) break; } }
          catch { scan.unavailable = true; }
          continue;
        }
        const dir = fs.opendirSync(location);
        try {
          for (let entry; !scan.limited && (entry = dir.readSync());) {
            if (entry.isDirectory()) candidate(item, entry.name);
            else if (++scan.entries >= discoveryEntryLimit) scan.limited = true;
          }
        } finally { dir.closeSync(); }
      } catch { scan.unavailable = true; }
    }
    const more = scan.queue.length > 0 && !scan.limited;
    const nextCursor = more ? randomUUID() : null;
    if (cursor) sessions.delete(cursor);
    if (nextCursor) {
      scan.expiresAt = time + discoveryTtl;
      sessions.set(nextCursor, scan);
      while (sessions.size > 8) sessions.delete(sessions.keys().next().value!);
    }
    const result = {repositories:results, nextCursor, limited:scan.limited,
      diagnostic:scan.unavailable ? '部分目录暂不可核对，已保留找到的仓库。' : null, readAt:new Date(time).toISOString()};
    if (cursor) {
      receipts.set(cursor,{binding,expiresAt:time+discoveryTtl,result});
      while (receipts.size > 16) receipts.delete(receipts.keys().next().value!);
    }
    return result;
  };
}

export function resolveDirectoryRepository(root: string, scopeId: string, repositoryPath: string) {
  const relative=relativeCodePath(repositoryPath,true), location=path.join(root,relative);
  try {
    const marker=fs.lstatSync(path.join(location,'.git'));
    if ((!marker.isFile()&&!marker.isDirectory()) || !lexicalPath(fs.realpathSync(location),location)) throw missing();
    const git=localGitIdentity(location);
    return {location, id: relative ? git.id : scopeId};
  } catch { throw missing(); }
}

export async function resolveDirectoryRepositoryAsync(root: string, scopeId: string, repositoryPath: string) {
  const relative = relativeCodePath(repositoryPath, true), location = path.join(root, relative);
  try {
    const marker = await fs.promises.lstat(path.join(location, '.git'));
    const real = await fs.promises.realpath(location);
    if ((!marker.isFile() && !marker.isDirectory()) || !lexicalPath(real, location)) throw missing();
    const git = await localGitIdentityAsync(location);
    return { location, id: relative ? git.id : scopeId, git };
  } catch { throw missing(); }
}
