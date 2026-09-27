import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from '../../../../infrastructure/process.ts';
import { parseGitCommitObject, type GitCommit } from '../domain/task-commit.ts';

export const TASK_COMMIT_LIMITS = Object.freeze({ repositoryLimit: 32, historyLimitPerRepository: 10000, commitLimit: 500, maxBytes: 32 * 1024 * 1024, timeoutMs: 5000, totalTimeoutMs: 20000 });
export type CommitLimits = { [Key in keyof typeof TASK_COMMIT_LIMITS]: number };
export type GitRepository = { id: string; root: string; commonDir: string };
export type GitReadFailure = { code: string; message: string; hash?: string };
const timedOut = (error: Error | undefined) => error && 'code' in error && error.code === 'ETIMEDOUT';

/** Explicit argv and a clean Git environment keep callers/config from redirecting the repository or fetching objects. */
export function createGitCommitReader(limits: CommitLimits = TASK_COMMIT_LIMITS) {
  const deadline = Date.now() + limits.totalTimeoutMs;
  function git(root: string, args: string[], input?: string) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    const timeout = Math.min(limits.timeoutMs, deadline - Date.now());
    if (timeout <= 0) throw Object.assign(new Error('提交读取已达到本次时间上限。'), { code: 'task_commits_timeout' });
    const result = spawnSync('git', ['--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', root, ...args], {
      env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C' },
      input, timeout, maxBuffer: limits.maxBytes, windowsHide: true,
    });
    return result;
  }
  function text(root: string, args: string[]): string {
    const result = git(root, args);
    if (result.status !== 0 || result.error) throw Object.assign(new Error(timedOut(result.error) ? '提交读取超时。' : '无法读取当前 Git 代码库。'), { code: timedOut(result.error) ? 'task_commits_timeout' : 'task_commits_git_unavailable' });
    return result.stdout.toString('utf8').trim();
  }
  function repository(location: string): GitRepository {
    const real = fs.realpathSync(location);
    const root = fs.realpathSync(text(real, ['rev-parse', '--show-toplevel']));
    const commonDir = fs.realpathSync(text(real, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
    return { root, commonDir, id: `sha256-${crypto.createHash('sha256').update(commonDir).digest('hex')}` };
  }
  function head(root: string): string | null {
    const result = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
    if (result.error) throw Object.assign(new Error('无法读取当前 HEAD。'), { code: 'task_commits_git_unavailable' });
    if (result.status !== 0) {
      const symbolic = git(root, ['symbolic-ref', '--quiet', 'HEAD']);
      const reference = symbolic.stdout.toString('utf8').trim();
      if (!symbolic.error && symbolic.status === 0 && reference.startsWith('refs/heads/')) {
        const exists = git(root, ['show-ref', '--verify', '--quiet', reference]);
        if (!exists.error && exists.status === 1) return null;
      }
      throw Object.assign(new Error('当前 HEAD 的提交对象不可读。'), { code: 'task_commits_head_unreadable' });
    }
    const hash = result.stdout.toString('utf8').trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(hash)) throw Object.assign(new Error('当前 HEAD 的身份无效。'), { code: 'task_commits_head_unreadable' });
    return hash;
  }
  function registeredWorktree(repositoryRoot: string, checkoutPath: string): boolean {
    const value = text(repositoryRoot, ['worktree', 'list', '--porcelain', '-z']);
    const requested = fs.realpathSync(checkoutPath);
    return value.split('\0').some(field => {
      if (!field.startsWith('worktree ')) return false;
      try { return fs.realpathSync(field.slice(9)) === requested; } catch { return false; }
    });
  }
  function read(repository: GitRepository, heads: string[]) {
    const failures: GitReadFailure[] = [];
    const snapshot = text(repository.root, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(objecttype)', 'refs/heads/', 'refs/remotes/', 'refs/tags/']).split('\n').filter(Boolean).map(line => line.split('\0'));
    const refs = snapshot.map(([name, hash]) => `${name}@${hash}`);
    const tips = new Set(heads);
    for (const [, hash, type] of snapshot) if (type === 'commit') tips.add(hash);
    const tags = snapshot.filter(([, , type]) => type === 'tag');
    if (tags.length) {
      const peeled = git(repository.root, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], tags.map(([, hash]) => `${hash}^{}\n`).join(''));
      if (peeled.error || peeled.status !== 0) failures.push({ code: 'task_commits_tag_unreadable', message: '部分标签引用未能解析；保留其他已读取引用。' });
      for (const line of peeled.stdout.toString('utf8').split('\n')) {
        const match = /^([a-f0-9]{40}|[a-f0-9]{64}) commit$/.exec(line);
        if (match) tips.add(match[1]);
        else if (line && !/^[a-f0-9]+ (?:tree|blob)$/.test(line)) failures.push({ code: 'task_commits_tag_unreadable', message: '一个标签的目标对象不可读；保留其他已读取引用。' });
      }
    }
    // Filter candidate messages in Git before reading objects; exact ownership is still decided by the terminal trailer parser.
    const listing = git(repository.root, ['rev-list', '--stdin', `--max-count=${limits.historyLimitPerRepository + 1}`, '--date-order', '--fixed-strings', '--regexp-ignore-case', '--grep=Buildr-Task:', '--'], `${[...tips].join('\n')}\n`);
    const ids = listing.stdout.toString('utf8').split('\n').filter(value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value));
    let truncated = ids.length > limits.historyLimitPerRepository;
    if (listing.error || listing.status !== 0) {
      truncated = true;
      failures.push({ code: timedOut(listing.error) ? 'task_commits_timeout' : 'task_commits_git_unavailable', message: '当前可达提交只读取到部分结果。' });
    }
    const selected = ids.slice(0, limits.historyLimitPerRepository);
    const commits: GitCommit[] = [];
    if (selected.length) {
      const objects = git(repository.root, ['cat-file', '--batch'], `${selected.join('\n')}\n`);
      const bytes = objects.stdout;
      let offset = 0;
      for (const expected of selected) {
        const end = bytes.indexOf(10, offset);
        if (end < 0) break;
        const header = bytes.subarray(offset, end).toString('ascii');
        const match = /^([a-f0-9]+) commit (\d+)$/.exec(header);
        if (!match || match[1] !== expected) { failures.push({ code: 'task_commits_object_unreadable', message: '一个可达提交对象不可读。', hash: expected }); offset = end + 1; continue; }
        const size = Number(match[2]);
        if (!Number.isSafeInteger(size) || size < 0 || end + 1 + size >= bytes.length) break;
        try { commits.push(parseGitCommitObject(expected, bytes.subarray(end + 1, end + 1 + size))); }
        catch { failures.push({ code: 'task_commits_object_invalid', message: '一个提交对象的内容或编码无效。', hash: expected }); }
        offset = end + size + 2;
      }
      if (objects.error || objects.status !== 0 || commits.length + failures.filter(item => item.hash).length < selected.length) {
        truncated = true;
        failures.push({ code: timedOut(objects.error) ? 'task_commits_timeout' : 'task_commits_output_truncated', message: '提交对象读取未完成，可能达到输出或时间上限。' });
      }
    }
    if (ids.length > limits.historyLimitPerRepository) failures.push({ code: 'task_commits_history_truncated', message: `每个代码库最多检查 ${limits.historyLimitPerRepository} 条含任务尾注关键字的候选提交；剩余历史尚未检查。` });
    return { commits, failures, truncated, scannedCommitCount: commits.length, refs: [...refs, ...heads.map(hash => `HEAD:${hash}`)] };
  }
  return { repository, head, registeredWorktree, read };
}
