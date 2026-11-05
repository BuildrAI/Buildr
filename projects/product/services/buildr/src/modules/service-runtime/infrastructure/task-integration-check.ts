import process from 'node:process';
import { spawnSync } from '../../../infrastructure/process.ts';

export type TaskIntegrationCheck = {
  checkedAt: string;
  complete: boolean;
  repositories: Array<{ repositoryId: string; label: string; branch: string | null; head: string | null; checked: number; contained: number; status: 'contained' | 'not-contained' | 'unknown'; message: string }>;
  diagnostics: string[];
};
type CommitRead = { status: string; repositories: Array<{ id: string; root: string; label: string; status: string }>; commits: Array<{ repositoryId: string; hash: string }>; coverage: { truncated: boolean }; diagnostics: Array<{ message: string }> };

/** Only proves ancestry of discovered task commits in the actual primary checkout, never business verification. */
export function checkTaskIntegration(read: CommitRead): TaskIntegrationCheck {
  const deadline = Date.now() + 5000;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (root: string, args: string[]) => {
    const timeout = deadline - Date.now();
    if (timeout <= 0) throw new Error('集成快检达到时间上限。');
    const result = spawnSync('git', ['--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', root, ...args], {
      env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }, timeout, maxBuffer: 1024 * 1024,
    });
    if (result.error) throw new Error('主工作库 Git 读取失败或超时。');
    return { status: result.status, text: result.stdout.toString('utf8').trim() };
  };
  const text = (root: string, args: string[]) => { const result = git(root, args); if (result.status !== 0) throw new Error('主工作库 Git 读取失败。'); return result.text; };
  const repositories: TaskIntegrationCheck['repositories'] = read.repositories.map(repository => {
    const row: TaskIntegrationCheck['repositories'][number] = { repositoryId: repository.id, label: repository.label, branch: null, head: null, checked: 0, contained: 0, status: 'unknown', message: '' };
    try {
      const primary = text(repository.root, ['worktree', 'list', '--porcelain', '-z']).split('\0')[0];
      if (!primary?.startsWith('worktree ')) throw new Error('无法确认主工作库位置。');
      const root = primary.slice('worktree '.length);
      row.head = text(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
      const branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
      row.branch = branch.status === 0 ? branch.text : null;
      const hashes = [...new Set(read.commits.filter(commit => commit.repositoryId === repository.id).map(commit => commit.hash))];
      for (const hash of hashes) {
        if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error('关联提交标识不可核对。');
        const result = git(root, ['merge-base', '--is-ancestor', hash, row.head]);
        if (result.status !== 0 && result.status !== 1) throw new Error('关联提交对象不可读取。');
        row.checked++; if (result.status === 0) row.contained++;
      }
      if (text(root, ['rev-parse', '--verify', 'HEAD^{commit}']) !== row.head) throw new Error('检查期间主工作库版本发生变化，请刷新。');
      row.status = row.contained < row.checked ? 'not-contained' : hashes.length && repository.status === 'complete' ? 'contained' : 'unknown';
      row.message = row.status === 'contained' ? '已发现的关联提交均已包含在主工作库当前版本。' : row.status === 'not-contained' ? '部分关联提交尚未包含在主工作库当前版本。' : hashes.length ? '已发现提交已包含，但读取不完整，不能确认全部。' : '未发现可核对的关联提交，不能确认集成状态。';
    } catch (cause) { row.status = 'unknown'; row.message = (cause as Error).message; }
    return row;
  });
  return { checkedAt: new Date().toISOString(), complete: read.status === 'complete' && !read.coverage.truncated && repositories.length > 0 && repositories.every(row => row.status === 'contained'), repositories, diagnostics: read.diagnostics.map(item => item.message) };
}
