import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { codeGit, codeFailure, localPath, relativeCodePath, type CodeSource } from './code-file-reader.ts';
import { parseGitCommitObject } from '../../task/commits/domain/task-commit.ts';
import type { CodeBranch, CodeChange, CodeChangeArea, CodeHistoryCommit } from '../domain/source-control.ts';

export const SOURCE_CONTROL_LIMITS = Object.freeze({ repositories: 128, worktrees:128, totalWorktrees:128,statusReadMs:12000, files: 1000, history: 200, scan: 2000, bytes: 8 * 1024 * 1024, patchLines: 5000 });
export const codeRevision = (value: unknown) => 'scm:' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (source: CodeSource, args: string[]) => codeGit(source.location, args, SOURCE_CONTROL_LIMITS.bytes).toString('utf8');
const optional = (source: CodeSource, args: string[]) => { try { return text(source, args).trim(); } catch { return null; } };
const changed = () => codeFailure('code_source_changed', '代码来源或内容已变化，请刷新后继续读取。', 409);
export function assertCodeRevision(actual: string, expected?: string) { if (expected && actual !== expected) throw changed(); }

/** Validate even missing/deleted paths against the nearest existing parent. */
export function assertSourceControlPath(source: CodeSource, relative: string) {
  relativeCodePath(relative);
  let candidate = relative;
  while (candidate) {
    try { fs.lstatSync(path.join(source.location, candidate)); localPath(source, candidate); return; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      candidate = path.posix.dirname(candidate); if (candidate === '.') candidate = '';
    }
  }
}
function statusName(code: string): CodeChange['status'] {
  return code === 'A' ? 'added' : code === 'D' ? 'deleted' : code === 'R' || code === 'C' ? 'renamed' : code === 'U' ? 'conflicted' : 'modified';
}
function entry(source:CodeSource, area: CodeChangeArea, relative: string, code: string, previousPath: string | null = null): CodeChange {
  return { repositoryId:source.repositoryId,worktreeId:source.worktreeId||null, area, path: relative, previousPath, kind: area === 'untracked' ? 'untracked' : 'tracked', status: area === 'untracked' ? 'untracked' : statusName(code), additions: null, deletions: null, preview: null, previewTruncated: false };
}

/** Metadata only: preserve both XY columns and never pre-read patches or file contents. */
export function observeSourceControl(source: CodeSource) {
  const raw = text(source, ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--branch']);
  const records = raw.split('\0'), files: CodeChange[] = [];
  let branch: string | null = null, head: string | null = null, upstream: string | null = null, ahead: number | null = null, behind: number | null = null;
  for (let index = 0; index < records.length; index++) {
    const line = records[index];
    if (line.startsWith('# branch.head ')) { const value = line.slice(14); branch = value === '(detached)' ? null : value; continue; }
    if (line.startsWith('# branch.oid ')) { const value = line.slice(13); head = value === '(initial)' ? null : value; continue; }
    if (line.startsWith('# branch.upstream ')) { upstream = line.slice(18); continue; }
    if (line.startsWith('# branch.ab ')) { const match = /\+(\d+) -(\d+)/.exec(line); if (match) { ahead = Number(match[1]); behind = Number(match[2]); } continue; }
    if (line.startsWith('? ')) { files.push(entry(source, 'untracked', line.slice(2), '?')); continue; }
    if (line.startsWith('u ')) { files.push(entry(source, 'unstaged', line.split(' ').slice(10).join(' '), 'U')); continue; }
    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const parts = line.split(' '), xy = parts[1], relative = parts.slice(line[0] === '2' ? 9 : 8).join(' ');
      const previous = line[0] === '2' ? records[++index] || null : null;
      if (xy[0] !== '.') files.push(entry(source, 'staged', relative, xy[0], /[RC]/.test(xy[0]) ? previous : null));
      if (xy[1] !== '.') files.push(entry(source, 'unstaged', relative, xy[1], /[RC]/.test(xy[1]) ? previous : null));
    }
  }
  const ordered = files.sort((a, b) => a.path.localeCompare(b.path) || a.area.localeCompare(b.area));
  const uniquePaths = [...new Set(ordered.map(file => file.path))];
  const metadata = uniquePaths.slice(0, SOURCE_CONTROL_LIMITS.files).map(relative => {
    try { const stat = fs.lstatSync(path.join(source.location, relative), { bigint: true }); return [relative, stat.dev.toString(), stat.ino.toString(), stat.size.toString(), stat.mtimeNs.toString(), stat.ctimeNs.toString()]; }
    catch { return [relative, 'missing']; }
  });
  const observedRevision = codeRevision([source.repositoryId, source.location, raw, metadata]);
  const retained = new Set(uniquePaths.slice(0, SOURCE_CONTROL_LIMITS.files));
  return { branch, head, upstream, ahead, behind, files: ordered.filter(file => retained.has(file.path)), fileCount: uniquePaths.length, truncated: uniquePaths.length > SOURCE_CONTROL_LIMITS.files, observedRevision };
}

export function readIndexEntry(source: CodeSource, relative: string) {
  assertSourceControlPath(source, relative);
  const rows = text(source, ['ls-files', '--stage', '-z', '--', relative]).split('\0').filter(Boolean);
  const row = rows.map(value => /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]*)$/.exec(value)).find(value => value?.[3] === '0' && value[4] === relative);
  if (!row) throw codeFailure('code_index_file_missing', '所选文件没有唯一可读取的暂存版本，可能仍有冲突。', 404);
  if (!['100644', '100755'].includes(row[1])) throw codeFailure('code_file_type_unsupported', '暂存版本不是可读取的普通文件。', 415);
  return { hash: row[2], mode: row[1], revision: `index:${row[2]}:${row[1]}` };
}

export function readSourceControlRefs(source: CodeSource) {
  const raw = text(source, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(*objectname)%00%(objecttype)%00%(upstream:short)%00%(*objecttype)', 'refs/heads/', 'refs/remotes/', 'refs/tags/']);
  const rows = raw.split('\n').filter(Boolean).map(line => line.split('\0'));
  const current = optional(source, ['symbolic-ref', '--short', 'HEAD']);
  const branches: CodeBranch[] = rows.filter(row => row[0].startsWith('refs/heads/')).map(row => ({ name: row[0].slice(11), hash: row[1], current: row[0].slice(11) === current, upstream: row[4] || null }));
  const head = optional(source, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const tips = [...new Set([...rows.filter(row => row[3] === 'commit' || row[3] === 'tag' && row[5] === 'commit').map(row => row[2] || row[1]), ...(head ? [head] : [])])];
  return { branches, rows, tips, revision: codeRevision([source.repositoryId, source.location, raw, head]) };
}

export function readRawCodeCommit(source: CodeSource, hash: string): CodeHistoryCommit {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(hash)) throw codeFailure('code_commit_invalid', '必须提供完整提交标识。');
  const bytes = codeGit(source.location, ['cat-file', 'commit', hash], SOURCE_CONTROL_LIMITS.bytes);
  const parsed = parseGitCommitObject(hash, bytes);
  const parents = bytes.subarray(0, bytes.indexOf('\n\n')).toString('utf8').split('\n').filter(line => line.startsWith('parent ')).map(line => line.slice(7));
  return { repositoryId: source.repositoryId,worktreeId:source.worktreeId||null, ...parsed, parents, branches: [], tags: [], taskId: null, taskTitle: null, taskDiagnostic: null };
}

export function readRawCodeCommits(source: CodeSource, hashes: string[]) {
  if (!hashes.length) return {commits:[] as CodeHistoryCommit[],truncated:false};
  const sizes=codeGit(source.location,['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],SOURCE_CONTROL_LIMITS.bytes,hashes.join('\n')+'\n').toString().trim().split('\n');
  const selected:string[]=[];let retainedBytes=0;
  for(const [index,hash] of hashes.entries()){
    const match=/^([a-f0-9]+) commit (\d+)$/.exec(sizes[index]||'');if(!match||match[1]!==hash)throw codeFailure('code_commit_unavailable','提交对象当前不可读取。',404);
    const size=Number(match[2]);if(!Number.isSafeInteger(size)||size<0||retainedBytes+size+128>SOURCE_CONTROL_LIMITS.bytes)continue;
    selected.push(hash);retainedBytes+=size+128;
  }
  if(!selected.length)return {commits:[] as CodeHistoryCommit[],truncated:true};
  const bytes = codeGit(source.location, ['cat-file', '--batch'], SOURCE_CONTROL_LIMITS.bytes, selected.join('\n') + '\n');
  const commits: CodeHistoryCommit[] = []; let offset = 0;
  for (const hash of selected) {
    const end = bytes.indexOf(10, offset), header = end < 0 ? null : /^([a-f0-9]+) commit (\d+)$/.exec(bytes.subarray(offset, end).toString('ascii'));
    if (!header || header[1] !== hash) throw codeFailure('code_commit_unavailable', '提交对象当前不可读取。', 404);
    const size = Number(header[2]); if (!Number.isSafeInteger(size) || end + size + 2 > bytes.length) throw codeFailure('code_history_limit', '提交说明达到读取上限，请缩小历史范围。', 413);
    const content = bytes.subarray(end + 1, end + 1 + size), parsed = parseGitCommitObject(hash, content);
    const parents = content.subarray(0, content.indexOf('\n\n')).toString('utf8').split('\n').filter(line => line.startsWith('parent ')).map(line => line.slice(7));
    commits.push({ repositoryId: source.repositoryId,worktreeId:source.worktreeId||null, ...parsed, parents, branches: [], tags: [], taskId: null, taskTitle: null, taskDiagnostic: null });
    offset = end + size + 2;
  }
  return {commits,truncated:selected.length!==hashes.length};
}

export function listCodeCommitIds(source: CodeSource, tips: string[]) {
  if (!tips.length) return { ids: [] as string[], truncated: false };
  const raw = text(source, ['rev-list', '--date-order', '--topo-order', `--max-count=${SOURCE_CONTROL_LIMITS.scan + 1}`, ...tips, '--']);
  const ids = raw.trim().split('\n').filter(Boolean);
  return { ids: ids.slice(0, SOURCE_CONTROL_LIMITS.scan), truncated: ids.length > SOURCE_CONTROL_LIMITS.scan };
}

export function readCodeCommitFiles(source: CodeSource, hash: string, baseHash: string | null) {
  const arguments_ = baseHash ? ['diff', '--no-ext-diff', '--no-textconv', '--find-renames', '--name-status', '-z', baseHash, hash, '--'] : ['diff-tree', '--root', '--no-commit-id', '-r', '--find-renames', '--name-status', '-z', hash, '--'];
  const values = text(source, arguments_).split('\0').filter(Boolean), files: CodeChange[] = [];
  for (let index = 0; index < values.length;) {
    const code = values[index++], previous = /^(R|C)/.test(code) ? values[index++] : null, relative = values[index++];
    if (relative) files.push(entry(source, 'commit', relative, code[0], previous));
  }
  return { files: files.slice(0, SOURCE_CONTROL_LIMITS.files), truncated: files.length > SOURCE_CONTROL_LIMITS.files };
}

export function readCodePatch(source: CodeSource, file: CodeChange, baseHash: string | null, hash?: string) {
  if (file.area === 'commit') relativeCodePath(file.path); else assertSourceControlPath(source, file.path);
  if (file.previousPath) relativeCodePath(file.previousPath);
  const paths = ['--', ...new Set([file.path, ...(file.previousPath ? [file.previousPath] : [])])];
  const common = ['--no-ext-diff', '--no-textconv', '--find-renames', '--unified=2147483647'];
  const args = file.area === 'commit' ? baseHash ? ['diff', ...common, baseHash, hash!, ...paths] : ['diff-tree', '--root', '--no-commit-id', '-r', '-p', ...common, hash!, ...paths]
    : ['diff', ...common, ...(file.area === 'staged' ? ['--cached'] : []), ...paths];
  const patch = text(source, args);
  const lines = patch.split('\n'), truncated = lines.length > SOURCE_CONTROL_LIMITS.patchLines;
  const binary = /(?:^|\n)(?:Binary files |GIT binary patch)/.test(patch);
  const stat = text(source, file.area === 'commit' ? baseHash ? ['diff', '--no-ext-diff', '--no-textconv', '--numstat', '-z', baseHash, hash!, ...paths] : ['diff-tree', '--root', '--no-commit-id', '-r', '--no-ext-diff', '--no-textconv', '--numstat', '-z', hash!, ...paths] : ['diff', '--no-ext-diff', '--no-textconv', '--numstat', '-z', ...(file.area === 'staged' ? ['--cached'] : []), ...paths]);
  const match = /^(\d+|-)\t(\d+|-)\t/.exec(stat);
  return { patch: binary ? null : truncated ? lines.slice(0, SOURCE_CONTROL_LIMITS.patchLines).join('\n') + '\n' : patch, binary, truncated,
    additions: match && match[1] !== '-' ? Number(match[1]) : null, deletions: match && match[2] !== '-' ? Number(match[2]) : null };
}
