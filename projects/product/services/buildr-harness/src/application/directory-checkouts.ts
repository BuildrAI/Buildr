import fs from 'node:fs';
import path from 'node:path';
import { codeFailure, fallbackIgnored, relativeCodePath } from '../workbench/code-file-reader.ts';
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

/** Discover Git roots in the selected directory, not Development registrations. */
export function observeDirectoryRepositories(root: string, scopeId: string) {
  const queue = [''], seen = new Set<string>();
  const repositories: Array<{id:string;path:string;name:string;checkouts:ReturnType<typeof observeDirectoryCheckouts>}> = [];
  let visited = 0, entries = 0, truncated = false, unavailable = false;
  while (queue.length) {
    if (visited++ >= maxDirectories || repositories.length >= SOURCE_CONTROL_LIMITS.repositories || entries >= 32768) { truncated = true; break; }
    const relative = queue.shift()!, location = path.join(root, relative);
    try {
      if (!lexicalPath(fs.realpathSync(location), location)) { unavailable = true; continue; }
      const marker = fs.lstatSync(path.join(location, '.git'), {throwIfNoEntry:false});
      if (marker && (marker.isDirectory() || marker.isFile())) {
        try {
          const git = localGitIdentity(location);
          if (!seen.has(git.commonDir)) {
            seen.add(git.commonDir);
            repositories.push({id: relative ? git.id : scopeId,path:relative,name:path.basename(location),checkouts:observeDirectoryCheckouts(location)});
          }
        } catch { unavailable = true; }
      }
      const directory = fs.opendirSync(location);
      try {
        for (let entry; entries++ < 32768 && (entry = directory.readSync());) {
          if (!entry.isDirectory() || entry.name.toLowerCase()==='.git' || fallbackIgnored.has(entry.name)) continue;
          if (visited + queue.length >= maxDirectories) { truncated = true; continue; }
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
