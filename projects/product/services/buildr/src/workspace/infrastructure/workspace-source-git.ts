import fs from 'node:fs';
import path from 'node:path';

import { execFileSync, spawnSync } from '../../infrastructure/process.ts';
import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.ts';

export type WorkspaceSourceGitRuntime = {
  readGitRemote(root: string, remote: string): string | null;
  existsDirectory(directory: string): boolean;
  gitignoreLines(root: string): string[];
  appendGitignoreEntries(file: string, patterns: string[]): boolean;
  toPosixRelative(root: string, file: string): string;
};

export type AttachedGitRoot = {
  rootPath: string;
  url: string;
  integrationBranch: string;
};

export function gitOutput(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

export function gitCurrentBranch(repoPath: string) {
  try { return gitOutput(['symbolic-ref', '--short', 'HEAD'], repoPath) || 'HEAD'; } catch { return 'HEAD'; }
}

export function gitDefaultBranch(runtime: Pick<WorkspaceSourceGitRuntime, 'readGitRemote'>, repoPath: string, remote = 'origin') {
  const remoteUrl = runtime.readGitRemote(repoPath, remote);
  if (remoteUrl) {
    const result = spawnSync('git', ['ls-remote', '--symref', remoteUrl, 'HEAD'], { cwd: repoPath, encoding: 'utf8', timeout: 30000 });
    if (result.status === 0) {
      const match = result.stdout.match(/^ref:\s+refs\/heads\/(.+)\s+HEAD$/m);
      if (match) return match[1];
    }
  }
  try {
    const reference = gitOutput(['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`], repoPath);
    return reference.startsWith(`${remote}/`) ? reference.slice(remote.length + 1) : reference;
  } catch { return gitCurrentBranch(repoPath); }
}

export function assertGitBranch(value: string | null | undefined) {
  if (!value) return;
  const result = spawnSync('git', ['check-ref-format', '--branch', value], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Invalid Git branch: ${value}`);
}

export function inferRepoKind(assetRoot: string) {
  return fs.existsSync(path.join(assetRoot, '.git')) ? 'git' : 'workspace';
}

function pathInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function inspectAttachedGitRoot(
  runtime: Pick<WorkspaceSourceGitRuntime, 'readGitRemote' | 'existsDirectory'>,
  rawPath: string,
  targetRoot: string,
  remote: string,
  integrationBranch: string | null,
  label: string,
): AttachedGitRoot {
  const requested = path.resolve(rawPath);
  if (!path.isAbsolute(rawPath) || path.normalize(rawPath) !== rawPath) throw new Error(`${label} --attach must be a normalized absolute path.`);
  if (!runtime.existsDirectory(requested)) throw new Error(`${label} attached root does not exist: ${rawPath}`);
  const actual = fs.realpathSync(requested);
  const workspace = fs.realpathSync(targetRoot);
  if (pathInside(workspace, actual) || pathInside(actual, workspace)) throw new Error(`${label} attached root must be external to and must not contain the canonical Workspace.`);
  let topLevel;
  try { topLevel = fs.realpathSync(gitOutput(['rev-parse', '--show-toplevel'], actual)); }
  catch { throw new Error(`${label} attached root is not a Git repository: ${rawPath}`); }
  if (!sameFilesystemPath(topLevel, actual)) throw new Error(`${label} attached root must be the independent Git top-level: ${rawPath}`);
  const url = runtime.readGitRemote(actual, remote);
  if (!url) throw new Error(`${label} attached root is missing declared remote ${remote}: ${rawPath}`);
  const branch = integrationBranch || gitDefaultBranch(runtime, actual, remote) || gitCurrentBranch(actual);
  assertGitBranch(branch);
  return { rootPath: actual, url, integrationBranch: branch };
}

export function gitBoundaryFor(runtime: Pick<WorkspaceSourceGitRuntime, 'existsDirectory'>, targetRoot: string, item: any) {
  if (!runtime.existsDirectory(path.join(item.assetRoot, '.git'))) return null;
  const projectRoot = path.join(targetRoot, 'projects', item.project);
  if (item.type === 'project') {
    if (runtime.existsDirectory(path.join(targetRoot, '.git'))) return { repoRoot: targetRoot, pattern: `/projects/${item.project}/` };
    return null;
  }
  if (runtime.existsDirectory(path.join(projectRoot, '.git'))) return { repoRoot: projectRoot, pattern: `/services/${item.service}/` };
  if (runtime.existsDirectory(path.join(targetRoot, '.git'))) return { repoRoot: targetRoot, pattern: `/projects/${item.project}/services/${item.service}/` };
  return null;
}

export function ensureGitBoundaries(runtime: WorkspaceSourceGitRuntime, targetRoot: string, items: any[]) {
  const changed: string[] = [];
  for (const item of items) {
    const boundary = gitBoundaryFor(runtime, targetRoot, item);
    if (!boundary) continue;
    if (runtime.appendGitignoreEntries(path.join(boundary.repoRoot, '.gitignore'), [boundary.pattern])) {
      changed.push(runtime.toPosixRelative(targetRoot, path.join(boundary.repoRoot, '.gitignore')));
    }
  }
  return [...new Set(changed)];
}

export function gitBoundaryIgnored(runtime: Pick<WorkspaceSourceGitRuntime, 'gitignoreLines'>, boundary: { repoRoot: string; pattern: string } | null) {
  return !boundary || runtime.gitignoreLines(boundary.repoRoot).includes(boundary.pattern);
}

export function registerWorkspaceSourceGit(runtime: WorkspaceSourceGitRuntime) {
  return Object.assign(runtime, {
    gitOutput,
    isGitUrl, isProjectGitUrl, cloneSourceRepository,
    gitCurrentBranch,
    gitDefaultBranch: (repoPath: string, remote = 'origin') => gitDefaultBranch(runtime, repoPath, remote),
    assertGitBranch,
    inferRepoKind,
    inspectAttachedGitRoot: (rawPath: string, targetRoot: string, remote: string, integrationBranch: string | null, label: string) => inspectAttachedGitRoot(runtime, rawPath, targetRoot, remote, integrationBranch, label),
    gitBoundaryFor: (targetRoot: string, item: any) => gitBoundaryFor(runtime, targetRoot, item),
    ensureGitBoundaries: (targetRoot: string, items: any[]) => ensureGitBoundaries(runtime, targetRoot, items),
    gitBoundaryIgnored: (boundary: { repoRoot: string; pattern: string } | null) => gitBoundaryIgnored(runtime, boundary),
  });
}

export function isGitUrl(value: string) {
  return /^(https?:\/\/|ssh:\/\/|git@)/.test(value) || /\.git$/.test(value);
}

export function isProjectGitUrl(value: string) {
  return /^(https?:\/\/|ssh:\/\/|git@|file:\/\/)/.test(value);
}

export function cloneSourceRepository(repo: string, destination: string, branch: string | null = null) {
  const args = ['clone'];
  if (branch) args.push('--branch', branch, '--single-branch');
  execFileSync('git', [...args, repo, destination], { stdio: 'inherit' });
}
