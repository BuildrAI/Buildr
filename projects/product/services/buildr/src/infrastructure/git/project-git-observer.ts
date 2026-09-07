import { spawnSync } from '../process.ts';

function runGit(cwd: any, args: any): any  {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
  return { ok: result.status === 0, value: result.status === 0 ? result.stdout.trim() : '', error: result.stderr?.trim() || '' };
}

export function observeProjectGit(projectRoot: any, remote: any): any  {
  const repository = runGit(projectRoot, ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok || repository.value !== 'true') {
    return { available: true, repository: false, currentBranch: null, head: null, dirty: null, upstream: null, ahead: null, behind: null, remoteUrl: null };
  }
  const branch = runGit(projectRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = runGit(projectRoot, ['rev-parse', 'HEAD']);
  const status = runGit(projectRoot, ['status', '--porcelain=v1']);
  const upstream = runGit(projectRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  let ahead: any = null;
  let behind: any = null;
  if (upstream.ok) {
    const counts = runGit(projectRoot, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
    const match = counts.value.match(/^(\d+)\s+(\d+)$/);
    if (counts.ok && match) {
      ahead = Number(match[1]);
      behind = Number(match[2]);
    }
  }
  const remoteUrl = runGit(projectRoot, ['remote', 'get-url', remote]);
  return {
    available: true,
    repository: true,
    currentBranch: branch.ok ? branch.value : null,
    head: head.ok ? head.value : null,
    dirty: status.ok ? Boolean(status.value) : null,
    upstream: upstream.ok ? upstream.value : null,
    ahead,
    behind,
    remoteUrl: remoteUrl.ok ? remoteUrl.value : null,
  };
}

export function registerProjectGitObserver(runtime: any): any  {
  runtime.observeProjectGit = observeProjectGit;
  return runtime;
}
