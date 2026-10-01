import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from '../../../../infrastructure/process.ts';
import { changedFileStatus, type TaskChangedFile, type TaskCommitFile } from '../domain/task-changed-file.ts';
import type { GitRepository } from '../../commits/infrastructure/git-commit-reader.ts';

export const TASK_CHANGED_FILE_LIMITS = Object.freeze({
  fileLimit: 500,
  commitFileLimit: 200,
  previewLineLimit: 240,
  maxBytes: 32 * 1024 * 1024,
  timeoutMs: 5000,
});
export type ChangedFileLimits = { [Key in keyof typeof TASK_CHANGED_FILE_LIMITS]: number };
export type ChangedFileReadFailure = { code: string; message: string };
export type WorktreeStatusResult = {
  branch: string | null;
  upstreamAhead: number | null;
  files: TaskChangedFile[];
  failures: ChangedFileReadFailure[];
  truncated: boolean;
};
export type CommitFilesResult = { files: TaskCommitFile[]; failures: ChangedFileReadFailure[]; truncated: boolean };

const timedOut = (error: Error | undefined) => error && 'code' in error && error.code === 'ETIMEDOUT';
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Read-only Git observations for changed files: working-tree status and per-commit file lists. */
export function createGitChangesReader(limits: ChangedFileLimits = TASK_CHANGED_FILE_LIMITS) {
  function git(root: string, args: string[], input?: string) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    return spawnSync('git', ['--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', root, ...args], {
      env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C' },
      input, timeout: limits.timeoutMs, maxBuffer: limits.maxBytes, windowsHide: true,
    });
  }
  function output(root: string, args: string[], input?: string): { ok: boolean; text: string; status: number } {
    const result = git(root, args, input);
    return { ok: !result.error && result.status !== null, text: result.stdout?.toString('utf8') ?? '', status: result.status ?? -1 };
  }
  function truncate(text: string, lineLimit = limits.previewLineLimit): { value: string; truncated: boolean } {
    const lines = text.split('\n');
    if (lines.length <= lineLimit) return { value: text, truncated: false };
    return { value: `${lines.slice(0, lineLimit).join('\n')}\n`, truncated: true };
  }
  function untrackedPreview(gitRoot: string, relative: string, lineLimit = limits.previewLineLimit): { preview: string | null; truncated: boolean; additions: number | null } {
    try {
      const filename = path.join(gitRoot, relative);
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.size > limits.maxBytes) return { preview: null, truncated: true, additions: null };
      const content = fs.readFileSync(filename, 'utf8');
      const lines = content.split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      const body = lines.map(line => `+${line}`).join('\n');
      const header = `diff --git a/${relative} b/${relative}\nnew file mode 100644\n--- /dev/null\n+++ b/${relative}\n@@ -0,0 +1,${lines.length} @@\n`;
      const { value, truncated } = truncate(header + body, lineLimit);
      return { preview: value, truncated, additions: lines.length };
    } catch { return { preview: null, truncated: false, additions: null }; }
  }

  function sameFilePreview(content: string, previousPath: string, relative: string) {
    if (content.includes('\0')) return { value: null, truncated: false };
    const lines = content.split('\n'); if (lines.at(-1) === '') lines.pop();
    return truncate(`--- a/${previousPath}\n+++ b/${relative}\n@@ -1,${lines.length} +1,${lines.length} @@\n${lines.map(line => ` ${line}`).join('\n')}\n`, 5000);
  }
  function sameWorktreePreview(checkout: string, previousPath: string, relative: string) {
    try {
      const filename = path.join(checkout, relative); const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.size > limits.maxBytes) return { value: null, truncated: true };
      return sameFilePreview(fs.readFileSync(filename, 'utf8'), previousPath, relative);
    } catch { return { value: null, truncated: true }; }
  }

  function parseStatus(checkout: string, repositoryId: string, options: { filePath?: string; fullContext?: boolean; metadataOnly?: boolean } = {}): { files: TaskChangedFile[]; failures: ChangedFileReadFailure[]; truncated: boolean; branch: string | null; ahead: number | null } {
    const failures: ChangedFileReadFailure[] = [];
    const entries = new Map<string, TaskChangedFile>();
    const paths = options.filePath ? ['--', options.filePath] : [];
    const lineLimit = options.fullContext ? 5000 : limits.previewLineLimit;
    const context = options.fullContext ? ['--unified=2147483647'] : [];
    const status = output(checkout, ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--branch', ...(options.fullContext ? [] : paths)]);
    if (!status.ok || status.status !== 0) failures.push({ code: 'task_changed_files_status_failed', message: '该检出位置的工作区状态读取失败。' });
    const fields = status.text.split('\0');
    if (options.fullContext && options.filePath) {
      const renameIndex = fields.findIndex(field => field.startsWith('2 ') && field.split(' ').slice(9).join(' ') === options.filePath);
      if (renameIndex >= 0 && fields[renameIndex + 1]) paths.push(fields[renameIndex + 1]);
    }
    const branchHeader = fields.find(field => field.startsWith('# branch.head '))?.slice(14);
    const branch = branchHeader && branchHeader !== '(detached)' ? branchHeader : null;
    const aheadMatch = fields.find(field => field.startsWith('# branch.ab '))?.match(/\+(\d+)/);
    const ahead = aheadMatch ? Number(aheadMatch[1]) : null;
    if (!fields.some(field => field && !field.startsWith('#'))) return { files: [], failures, truncated: false, branch, ahead };
    const stats = new Map<string, { additions: number | null; deletions: number | null }>();
    const numstat = options.metadataOnly ? { ok: false, text: '', status: 0 } : output(checkout, ['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--numstat', '-z', ...paths]);
    if (numstat.ok) {
      const parts = numstat.text.split('\0');
      for (let index = 0; index < parts.length; index += 1) {
        const line = parts[index];
        if (!line) continue;
        const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(line);
        if (!match) continue;
        const adds = match[1] === '-' ? null : Number(match[1]);
        const dels = match[2] === '-' ? null : Number(match[2]);
        let target = match[3];
        if (target === '') { target = parts[index + 2] || ''; index += 2; }
        if (target) stats.set(target, { additions: Number.isFinite(adds) ? adds : null, deletions: Number.isFinite(dels) ? dels : null });
      }
    }
    const diffText = options.metadataOnly ? { ok: false, text: '', status: 0 } : output(checkout, ['diff', '--no-ext-diff', '--no-textconv', '--find-renames', 'HEAD', ...context, ...paths]);
    if (options.fullContext && !diffText.ok) failures.push({ code: 'task_file_diff_unavailable', message: '完整差异无法读取，可能超过读取上限。' });
    const patches = new Map<string, string>();
    if (diffText.ok) {
      let current = '';
      for (const line of `${diffText.text}\n`.split('\n')) {
        if (line.startsWith('diff --git ')) {
          const match = /^diff --git a\/(.+?) b\/(.+?)$/.exec(line);
          if (match) { current = match[2]; patches.set(current, `${line}\n`); } else current = '';
          continue;
        }
        if (current) patches.set(current, (patches.get(current) || '') + `${line}\n`);
      }
    }
    for (let index = 0; index < fields.length; index += 1) {
      const line = fields[index];
      if (!line) continue;
      if (line.startsWith('#')) continue;
      const code = line[0];
      if (code === '?') {
        const relative = line.slice(2);
        if (options.filePath && relative !== options.filePath) continue;
        const preview = options.metadataOnly ? { preview: null, truncated: false, additions: null } : untrackedPreview(checkout, relative, lineLimit);
        entries.set(relative, {
          repositoryId, path: relative, previousPath: null, kind: 'untracked', status: 'untracked',
          additions: preview.additions,
          deletions: null, preview: preview.preview, previewTruncated: preview.truncated,
        });
        continue;
      }
      if (code === 'u') {
        const parts = line.split(' ');
        const relative = parts.slice(10).join(' ') || parts.at(-1) || '';
        if (!relative) continue;
        entries.set(relative, { repositoryId, path: relative, previousPath: null, kind: 'tracked', status: 'conflicted', additions: null, deletions: null, preview: null, previewTruncated: false });
        continue;
      }
      if (code === '1' || code === '2') {
        const parts = line.split(' ');
        const staged = parts[1]?.[0] || '.';
        const unstaged = parts[1]?.[1] || '.';
        const status_ = changedFileStatus('1', staged, unstaged);
        const relative = parts.slice(code === '2' ? 9 : 8).join(' ');
        if (!status_ || !relative) continue;
        let previousPath: string | null = null;
        if (code === '2' && fields[index + 1]) { previousPath = fields[++index]; }
        if (options.filePath && relative !== options.filePath) continue;
        const stat = stats.get(relative);
        const patch = status_ === 'deleted' && !options.fullContext ? null : options.fullContext && options.filePath ? diffText.text : (patches.get(relative) || patches.get(previousPath || ''));
        const preview = patch ? truncate(patch, lineLimit) : { value: null, truncated: false };
        const pureRename = status_ === 'renamed' && (stat?.additions ?? 0) === 0 && (stat?.deletions ?? 0) === 0;
        const unchanged = pureRename && options.fullContext ? sameWorktreePreview(checkout, previousPath || relative, relative) : { value: null, truncated: false };
        entries.set(relative, {
          repositoryId, path: relative, previousPath, kind: 'tracked', status: status_,
          additions: stat?.additions ?? null, deletions: stat?.deletions ?? null,
          preview: pureRename ? unchanged.value : preview.value,
          previewTruncated: pureRename ? unchanged.truncated : preview.truncated || Boolean(options.fullContext && !diffText.ok),
        });
      }
    }
    let truncated = false;
    const files = [...entries.values()].filter(file => !options.filePath || file.path === options.filePath).sort((a, b) => a.path.localeCompare(b.path));
    if (files.length > limits.fileLimit) { truncated = true; failures.push({ code: 'task_changed_files_limit', message: `单个检出位置最多返回 ${limits.fileLimit} 个变更文件；剩余内容被截断。` }); }
    return { files: files.slice(0, limits.fileLimit), failures, truncated, branch, ahead };
  }

  function branchInfo(checkout: string): { branch: string | null; ahead: number | null } {
    const branchResult = output(checkout, ['branch', '--show-current']);
    const branch = branchResult.ok && branchResult.text.trim() ? branchResult.text.trim() : null;
    const upstream = output(checkout, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
    const ahead = upstream.ok ? (() => { const [left] = upstream.text.split(/\s+/); const count = Number(left); return Number.isFinite(count) ? count : null; })() : null;
    return { branch, ahead };
  }

  function worktreeStatus(checkout: string, repository: GitRepository, options: { filePath?: string; fullContext?: boolean; metadataOnly?: boolean } = {}): WorktreeStatusResult {
    const failures: ChangedFileReadFailure[] = [];
    let truncated = false;
    const gitRoot = (() => { const result = output(checkout, ['rev-parse', '--show-toplevel']); return result.ok && result.text.trim() ? result.text.trim() : checkout; })();
    const parsed = parseStatus(gitRoot, repository.id, options);
    failures.push(...parsed.failures);
    truncated = parsed.truncated;
    return { branch: parsed.branch, upstreamAhead: parsed.ahead, files: parsed.files, failures, truncated };
  }

  function commitFiles(repository: GitRepository, hash: string, repositoryId: string, options: { filePath?: string; fullContext?: boolean } = {}): CommitFilesResult {
    const failures: ChangedFileReadFailure[] = [];
    let truncated = false;
    const files: TaskCommitFile[] = [];
    const meta = output(repository.root, ['rev-list', '--parents', '-n', '1', hash]);
    const parents = meta.ok ? meta.text.trim().split(/\s+/).slice(1).filter(Boolean) : [];
    const base = parents[0] || EMPTY_TREE;
    const filesList = output(repository.root, ['diff-tree', '--root', '-r', '--find-renames', '--numstat', '-z', '--no-commit-id', hash]);
    const names: Array<{ path: string; previousPath: string | null; additions: number | null; deletions: number | null; status: TaskChangedFile['status'] }> = [];
    if (filesList.ok) {
      const parts = filesList.text.split('\0');
      for (let index = 0; index < parts.length; index += 1) {
        const line = parts[index];
        if (!line) continue;
        const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(line);
        if (!match) continue;
        const adds = match[1] === '-' ? null : Number(match[1]);
        const dels = match[2] === '-' ? null : Number(match[2]);
        let target = match[3];
        if (target === '') { target = parts[index + 2] || ''; index += 2; }
        if (!target) continue;
        names.push({ path: target, previousPath: null, additions: Number.isFinite(adds) ? adds : null, deletions: Number.isFinite(dels) ? dels : null, status: 'modified' });
      }
    } else failures.push({ code: 'task_changed_files_commit_files_failed', message: '该提交的文件清单读取失败。' });
    const nameStatus = output(repository.root, ['diff-tree', '--root', '-r', '--find-renames', '--name-status', '-z', '--no-commit-id', hash]);
    if (nameStatus.ok) {
      const parts = nameStatus.text.split('\0').filter(Boolean);
      for (let index = 0; index + 1 < parts.length; index += 2) {
        const code = parts[index];
        if (code.startsWith('R') || code.startsWith('C')) {
          const entry = names.find(item => item.path === parts[index + 2]);
          if (entry) { entry.status = 'renamed'; entry.previousPath = parts[index + 1] || null; }
          index += 1;
          continue;
        }
        const entry = names.find(item => item.path === parts[index + 1]);
        if (!entry) continue;
        if (code.startsWith('A')) entry.status = 'added';
        else if (code.startsWith('D')) entry.status = 'deleted';
        else if (code.startsWith('M') || code.startsWith('T')) entry.status = 'modified';
      }
    }
    const lineLimit = options.fullContext ? 5000 : limits.previewLineLimit;
    const chosen = options.filePath ? names.filter(entry => entry.path === options.filePath) : names;
    const paths = options.filePath ? ['--', ...new Set(chosen.flatMap(entry => [entry.path, ...(entry.previousPath ? [entry.previousPath] : [])]))] : [];
    const patchOutput = output(repository.root, ['diff', '--no-ext-diff', '--no-textconv', '--find-renames', `${base}..${hash}`, ...(options.fullContext ? ['--unified=2147483647'] : []), ...paths]);
    if (options.fullContext && !patchOutput.ok) failures.push({ code: 'task_file_diff_unavailable', message: '完整提交差异无法读取，可能超过读取上限。' });
    const patches = new Map<string, string>();
    if (patchOutput.ok) {
      let current = '';
      for (const line of `${patchOutput.text}\n`.split('\n')) {
        if (line.startsWith('diff --git ')) {
          const match = /^diff --git a\/(.+?) b\/(.+?)$/.exec(line);
          if (match) { current = match[2]; patches.set(current, `${line}\n`); } else current = '';
          continue;
        }
        if (current) patches.set(current, (patches.get(current) || '') + `${line}\n`);
      }
    }
    for (const entry of chosen.slice(0, limits.commitFileLimit)) {
      const patch = options.fullContext && options.filePath ? patchOutput.text : patches.get(entry.path) || patches.get(entry.previousPath || '');
      let preview = patch ? truncate(patch, lineLimit) : { value: null, truncated: false };
      if (options.fullContext && entry.status === 'renamed' && entry.additions === 0 && entry.deletions === 0) {
        const content = output(repository.root, ['show', '--no-ext-diff', '--no-textconv', `${hash}:${entry.path}`]);
        preview = content.ok && content.status === 0 ? sameFilePreview(content.text, entry.previousPath || entry.path, entry.path) : { value: null, truncated: true };
      }
      files.push({
        repositoryId, path: entry.path, previousPath: entry.previousPath, kind: 'tracked', status: entry.status,
        additions: entry.additions, deletions: entry.deletions, preview: preview.value, previewTruncated: preview.truncated || Boolean(options.fullContext && !patchOutput.ok),
      });
    }
    if (chosen.length > limits.commitFileLimit) { truncated = true; failures.push({ code: 'task_changed_files_commit_files_limit', message: `单次提交最多返回 ${limits.commitFileLimit} 个文件；剩余内容被截断。` }); }
    return { files, failures, truncated };
  }

  return { worktreeStatus, commitFiles, branchInfo };
}
