import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { codeFailure, codeGit, localPath, relativeCodePath, type CodeSource } from './code-file-reader.ts';
import { assertCodeRevision, codeRevision, observeSourceControl } from './source-control-git-reader.ts';

export const COMMIT_SNAPSHOT_LIMITS = Object.freeze({ files: 1000, bytes: 16 * 1024 * 1024, diffBytes: 8 * 1024 * 1024, commits: 10_000 });
export type CodeCommitSnapshotFile = { path: string; kind: 'text' | 'binary' | 'symlink' | 'deleted'; digest: string; mode: number | null; bytes: number; content?: string; untracked?: boolean; change?: 'added' | 'modified' | 'deleted' | 'type-changed'; previousBytes?: number; previousMode?: string; binaryDiff?: boolean };
export type CodeCommitSnapshot = { source: CodeSource; revision: string; head: string | null; branch: string | null; branchRef: string | null; paths: string[]; files: CodeCommitSnapshotFile[]; diff: string; indexPath: string; indexDigest: string | null; indexRevision: string; configDigest: string; hasChanges: boolean };
export type CodeCommitSnapshotOptions = { includeDiff?: boolean };
export type CodePushSnapshot = { revision: string; target: string | null; available: boolean; reason: string | null; ahead: number; head: string | null; branchRef: string | null; remote: string | null; url: string | null; destinationRef: string | null; upstreamRef: string | null; upstreamHead: string | null; commits: string[]; configurationRevision: string };
const digest = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
const gitText = (source: CodeSource, args: string[], limit?: number) => codeGit(source.location, args, limit).toString('utf8').trim();
const optional = (source: CodeSource, args: string[]) => { try { return gitText(source, args) || null; } catch { return null; } };
export function readCodeIndexDigest(indexPath: string): string | null { try { return digest(fs.readFileSync(indexPath)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }

/** No arbitrary path input: the application resolves and revalidates this registered source. */
export function readCommitSnapshot(source: CodeSource, options: CodeCommitSnapshotOptions = {}): CodeCommitSnapshot {
  if (source.commitHash) throw codeFailure('code_commit_source_invalid', '提交必须选择当前工作位置。');
  const status = observeSourceControl(source);
  if (status.truncated) throw codeFailure('code_commit_observation_incomplete', '变更超过完整读取上限，无法核对全部提交内容。', 409);
  const gitDirectory = gitText(source, ['rev-parse', '--absolute-git-dir']);
  const progress = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_START'];
  if (progress.some(name => fs.existsSync(path.join(gitDirectory, name))) || status.files.some(file => file.status === 'conflicted')) throw codeFailure('code_commit_operation_in_progress', '当前位置有未结束的 Git 操作或冲突，请处理后提交。', 409);
  const indexPath = gitText(source, ['rev-parse', '--path-format=absolute', '--git-path', 'index']);
  const indexEntries = codeGit(source.location, ['ls-files', '--stage', '-v', '-z']);
  if (indexEntries.toString().split('\0').some(entry => /^[a-zS] /.test(entry))) throw codeFailure('code_commit_index_flags_unsupported', '索引包含稀疏或忽略变化标记，无法核对全部当前内容；请在对应 Git 工具中处理。', 409);
  const indexRevision = digest(indexEntries), configDigest = digest(codeGit(source.location, ['config', '--null', '--list']));
  const paths = [...new Set(status.files.flatMap(file => [file.path, ...(file.previousPath ? [file.previousPath] : [])]))].sort();
  if (paths.length > COMMIT_SNAPSHOT_LIMITS.files) throw codeFailure('code_commit_observation_incomplete', '变更路径超过完整读取上限。', 409);
  let bytes = 0;
  const files: CodeCommitSnapshotFile[] = paths.map(relative => {
    relativeCodePath(relative);
    const absolute = path.join(source.location, relative);
    let parent = path.posix.dirname(relative);
    while (parent !== '.' && !fs.existsSync(path.join(source.location, parent))) parent = path.posix.dirname(parent);
    localPath(source, parent === '.' ? '' : parent);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(absolute); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: relative, kind: 'deleted' as const, digest: digest('deleted'), mode: null, bytes: 0 }; throw error; }
    if (!stat.isFile() && !stat.isSymbolicLink()) throw codeFailure('code_commit_file_unsupported', '变更包含无法完整核对的目录或特殊文件：' + relative, 409);
    if (stat.size + bytes > COMMIT_SNAPSHOT_LIMITS.bytes) throw codeFailure('code_commit_observation_incomplete', '本次变更内容超过 16 MiB 完整读取上限。', 409);
    const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : fs.readFileSync(absolute);
    bytes += content.length;
    if (bytes > COMMIT_SNAPSHOT_LIMITS.bytes) throw codeFailure('code_commit_observation_incomplete', '读取期间变更内容超过完整读取上限。', 409);
    let text: string | undefined;
    try { if (!content.includes(0)) text = new TextDecoder('utf-8', { fatal: true }).decode(content); } catch { /* Binary content remains represented by its exact digest. */ }
    return { path: relative, kind: stat.isSymbolicLink() ? 'symlink' as const : text === undefined ? 'binary' as const : 'text' as const, digest: digest(content), mode: stat.mode, bytes: content.length, untracked: status.files.some(file => file.path === relative && file.area === 'untracked'), ...(text === undefined ? {} : { content: text }) };
  });
  const branchRef = optional(source, ['symbolic-ref', '-q', 'HEAD']);
  let diff = '';
  if (options.includeDiff !== false) {
    try {
      const previous = new Map<string, { bytes: number; mode: string }>();
      const binaryPaths = new Set<string>();
      if (status.head && paths.length) {
        for (const entry of codeGit(source.location, ['ls-tree', '-l', '-z', status.head, '--', ...paths]).toString('utf8').split('\0').filter(Boolean)) {
          const separator = entry.indexOf('\t'), fields = entry.slice(0, separator).trim().split(/\s+/);
          previous.set(entry.slice(separator + 1), { mode: fields[0], bytes: Number(fields[3]) });
        }
        for (const entry of codeGit(source.location, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--numstat', '-z', status.head, '--', ...paths]).toString('utf8').split('\0').filter(Boolean)) {
          if (entry.startsWith('-\t-\t')) binaryPaths.add(entry.slice(4));
        }
      }
      for (const file of files) {
        const before = previous.get(file.path);
        file.change = file.kind === 'deleted' ? 'deleted' : !before ? 'added' : (before.mode === '120000') !== (file.kind === 'symlink') ? 'type-changed' : 'modified';
        if (before) { file.previousBytes = before.bytes; file.previousMode = before.mode; }
        if (binaryPaths.has(file.path)) file.binaryDiff = true;
      }
      diff = status.head ? codeGit(source.location, ['diff', '--no-ext-diff', '--no-textconv', '--full-index', status.head, '--'], COMMIT_SNAPSHOT_LIMITS.diffBytes).toString('utf8') : files.filter(file => file.kind !== 'deleted' && !file.untracked).map(file => file.content === undefined ? 'Binary file ' + JSON.stringify(file.path) + ' (' + file.bytes + ' bytes)\n' : 'diff --git ' + JSON.stringify('a/' + file.path) + ' ' + JSON.stringify('b/' + file.path) + '\n--- /dev/null\n+++ ' + JSON.stringify('b/' + file.path) + '\n' + file.content.split('\n').map(line => '+' + line).join('\n') + '\n').join('\n');
    } catch { throw codeFailure('code_commit_observation_incomplete', '无法完整读取本次差异，或差异超过 8 MiB 读取上限；请缩小变更范围，或手写提交说明。', 409); }
    if (Buffer.byteLength(diff) > COMMIT_SNAPSHOT_LIMITS.diffBytes) throw codeFailure('code_commit_observation_incomplete', '本次差异超过 8 MiB 完整读取上限；请缩小变更范围，或手写提交说明。', 409);
  }
  assertCodeRevision(observeSourceControl(source).observedRevision, status.observedRevision);
  if (digest(codeGit(source.location, ['ls-files', '--stage', '-v', '-z'])) !== indexRevision || digest(codeGit(source.location, ['config', '--null', '--list'])) !== configDigest) throw codeFailure('code_source_changed', '读取期间索引内容或配置已变化，请刷新。', 409);
  const indexDigest = readCodeIndexDigest(indexPath);
  const revision = codeRevision([source.repositoryId, source.worktreeId, source.location, branchRef, status.head, indexRevision, configDigest, status.files, files.map(({ content: _content, change: _change, previousBytes: _previousBytes, previousMode: _previousMode, binaryDiff: _binaryDiff, ...file }) => file)]);
  return { source, revision, head: status.head, branch: status.branch, branchRef, paths, files, diff, indexPath, indexDigest, indexRevision, configDigest, hasChanges: status.files.length > 0 };
}

export function readCodePushSnapshot(source: CodeSource): CodePushSnapshot {
  const branchRef = optional(source, ['symbolic-ref', '-q', 'HEAD']), head = optional(source, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const branch = branchRef?.startsWith('refs/heads/') ? branchRef.slice(11) : null;
  const remote = branch ? optional(source, ['config', '--get', 'branch.' + branch + '.remote']) : null;
  const destinationRef = branch ? optional(source, ['config', '--get', 'branch.' + branch + '.merge']) : null;
  const urls = remote && remote !== '.' ? optional(source, ['remote', 'get-url', '--push', '--all', remote])?.split('\n') || [] : [];
  const url = urls.length === 1 && !/[\0\r\n]/.test(urls[0]) ? urls[0] : null;
  const upstreamRef = branchRef ? optional(source, ['for-each-ref', '--format=%(upstream)', branchRef]) : null;
  const upstreamHead = upstreamRef ? optional(source, ['rev-parse', '--verify', upstreamRef + '^{commit}']) : null;
  let reason: string | null = !head ? '当前尚无提交。' : !branchRef ? '游离提交没有可核对的上游分支。' : !remote || !destinationRef ? '当前分支未设置上游。' : !url ? '上游远端没有唯一可核对的推送地址。' : !destinationRef.startsWith('refs/heads/') ? '上游不是明确的分支引用。' : !upstreamHead ? '上游跟踪引用当前不可核对。' : null;
  const commits = head && upstreamHead ? gitText(source, ['rev-list', '--reverse', upstreamHead + '..' + head], 2 * 1024 * 1024).split('\n').filter(Boolean) : [];
  if (commits.length > COMMIT_SNAPSHOT_LIMITS.commits) reason = '待推送范围超过完整核对上限。';
  const target = remote && destinationRef ? remote + '/' + destinationRef.replace(/^refs\/heads\//, '') : null;
  const configurationRevision = codeRevision([source.repositoryId, source.worktreeId, source.location, branchRef, remote, urls, destinationRef, upstreamRef, upstreamHead]);
  return { revision: codeRevision([configurationRevision, head, commits]), configurationRevision, head, branchRef, remote, url, destinationRef, upstreamRef, upstreamHead, commits, target, available: reason === null, reason, ahead: commits.length };
}
