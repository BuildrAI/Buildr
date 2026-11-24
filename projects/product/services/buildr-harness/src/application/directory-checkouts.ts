import fs from 'node:fs';
import path from 'node:path';
import { codeFailure, codeGit, fallbackIgnored, relativeCodePath } from '../workbench/code-file-reader.ts';
import { normalizeFilesystemPath, sameFilesystemPath } from '../workbench/filesystem-path-identity.ts';
import { readGitWorktreeRecords } from '../workbench/git-worktree-list.ts';
import { localGitIdentity } from '../workbench/local-git.ts';
import { SOURCE_CONTROL_LIMITS } from '../workbench/source-control-git-reader.ts';

const lexicalPath = (a:string,b:string) => normalizeFilesystemPath(a)===normalizeFilesystemPath(b);
const missing = () => codeFailure('code_worktree_identity_changed', '所选工作树不再属于此仓库或身份已变化；未切换到其他目录。', 409);

function checkMember(location: string, anchor: ReturnType<typeof localGitIdentity>) {
  const root = fs.realpathSync(location);
  if (!lexicalPath(root, location)) throw missing();
  const git = localGitIdentity(root);
  if (!sameFilesystemPath(git.commonDir, anchor.commonDir)) throw missing();
  return { root, git };
}

export function observeDirectoryCheckouts(root: string) {
  let anchor: ReturnType<typeof localGitIdentity>;
  try { anchor = localGitIdentity(root); }
  catch (error) { return { defaultId: null, members: [], truncated: false, diagnostic: (error as Error).message }; }
  const records = readGitWorktreeRecords(root);
  if (!records.some(record => sameFilesystemPath(record.declared, root))) throw missing();
  // Keep the current checkout even if the rest of the repository exceeds the catalog bound.
  const ordered = [records.find(record => sameFilesystemPath(record.declared, root))!, ...records.filter(record => !sameFilesystemPath(record.declared, root))];
  const members = ordered.slice(0, SOURCE_CONTROL_LIMITS.worktrees).flatMap(record => {
    try {
      const { root: location, git } = checkMember(record.declared, anchor);
      return [{ id: git.id, location, name: path.basename(location), branch: record.branch, head: record.head, isMain: git.isMain }];
    } catch { return []; }
  });
  if (localGitIdentity(root).id !== anchor.id || !members.some(member => member.id === anchor.id)) throw missing();
  return { defaultId: anchor.id, members, truncated: ordered.length > SOURCE_CONTROL_LIMITS.worktrees,
    diagnostic: members.length < Math.min(ordered.length, SOURCE_CONTROL_LIMITS.worktrees) ? '部分 Git 工作树目录已失效或暂不可读。' : null };
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

const maxDirectories = 2048;

function discoverGitCandidateDirectories(location: string): string[] {
  const candidates = new Set<string>();
  const statusOutput = codeGit(location, ['status', '--porcelain=v2', '--ignored=matching', '--untracked-files=normal', '-z'], 16 * 1024 * 1024).toString('utf8');
  for (const record of statusOutput.split('\0')) {
    if (!record || (!record.startsWith('? ') && !record.startsWith('! '))) continue;
    const entry = record.slice(2);
    if (entry.endsWith('/')) candidates.add(entry.slice(0, -1));
  }
  const indexOutput = codeGit(location, ['ls-files', '--stage', '-z'], 32 * 1024 * 1024).toString('utf8');
  for (const record of indexOutput.split('\0')) {
    if (!record.startsWith('160000 ')) continue;
    const tab = record.indexOf('\t');
    if (tab > 0) candidates.add(record.slice(tab + 1));
  }
  return [...candidates].filter(Boolean);
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
              if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.toLowerCase() === '.git' || fallbackIgnored.has(segment))) continue;
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
          if (!entry.isDirectory() || entry.name.toLowerCase()==='.git' || fallbackIgnored.has(entry.name)) continue;
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

export function resolveDirectoryRepository(root: string, scopeId: string, repositoryPath: string) {
  const relative=relativeCodePath(repositoryPath,true), location=path.join(root,relative);
  try {
    const marker=fs.lstatSync(path.join(location,'.git'));
    if ((!marker.isFile()&&!marker.isDirectory()) || !lexicalPath(fs.realpathSync(location),location)) throw missing();
    const git=localGitIdentity(location);
    return {location, id: relative ? git.id : scopeId};
  } catch { throw missing(); }
}
