import fs from 'node:fs';
import path from 'node:path';

import type { GitWorktreeObservedCheckout } from '../domain/git-worktree.ts';
import { sameFilesystemPath } from '../../../infrastructure/git/checkout-identity.ts';

type CommandResult = { status: number | null; stdout: string; stderr: string };
type Git = (cwd: string, args: readonly string[]) => CommandResult;
type Registration = { path: string; branch: string | null; locked?: boolean };
type Repository = GitWorktreeObservedCheckout & { sourcePath: string };

function fail(message: string): never {
  throw Object.assign(new Error(message), { code: 'git_worktree_identity_mismatch' });
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

// Resolve existing ancestors as well: a missing checkout below a symlink must not
// be mistaken for a safe, absent target during a retry.
function assertLiteralPath(value: string): void {
  if (!path.isAbsolute(value) || path.normalize(value) !== value) fail(`路径必须为规范绝对路径：${value}`);
  let current = value;
  while (true) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) fail(`路径不能经过符号链接：${value}`);
    } catch (error) {
      if (!(error instanceof Error) || Reflect.get(error, 'code') !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function assertObservedCheckoutSet(observed: GitWorktreeObservedCheckout[], repositories: Repository[]): void {
  const root = observed.find((item) => item.selector === 'workspace');
  if (!root || observed.length !== repositories.length) fail('当前对象必须精确包含 workspace 及全部选定的独立仓库。');
  const paths = new Set<string>();
  for (const item of observed) {
    assertLiteralPath(item.sourceRepository);
    assertLiteralPath(item.checkoutPath);
    const expected = repositories.find((entry) => entry.selector === item.selector);
    if (!expected || !sameFilesystemPath(expected.sourceRepository, item.sourceRepository)) fail(`来源与当前声明不符：${item.selector}`);
    if (item.checkoutPath !== path.resolve(root.checkoutPath, expected.sourcePath)) fail(`嵌套路径与当前来源不符：${item.selector}`);
    if (paths.has(item.checkoutPath)) fail(`检出路径重复：${item.checkoutPath}`);
    paths.add(item.checkoutPath);
    for (const source of repositories) {
      if (contains(item.checkoutPath, source.sourceRepository)) fail(`目标包含保留的来源仓库：${item.selector}`);
    }
  }
}

export function assertCurrentCheckoutIdentity(
  record: GitWorktreeObservedCheckout,
  git: Git,
  parseList: (text: string) => Registration[],
  { cleanup = false }: { cleanup?: boolean } = {},
): void {
  assertLiteralPath(record.sourceRepository);
  assertLiteralPath(record.checkoutPath);
  const read = (cwd: string, args: string[]): string => {
    const result = git(cwd, args);
    if (result.status !== 0) fail(`无法核对 ${record.selector}：${result.stderr.trim() || args.join(' ')}`);
    return result.stdout.trim();
  };
  if (git(record.sourceRepository, ['check-ref-format', `refs/heads/${record.branch}`]).status !== 0) fail(`无效分支：${record.branch}`);
  const sourceRoot = read(record.sourceRepository, ['rev-parse', '--show-toplevel']);
  if (!sameFilesystemPath(sourceRoot, record.sourceRepository)) fail(`来源不是独立仓库：${record.selector}`);
  const common = path.resolve(record.sourceRepository, read(record.sourceRepository, ['rev-parse', '--git-common-dir']));
  if (contains(record.checkoutPath, record.sourceRepository) || contains(record.checkoutPath, common) || contains(common, record.checkoutPath)) fail(`目标与保留仓库或 Git 元数据重叠：${record.selector}`);
  const sourceBranch = git(record.sourceRepository, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (sourceBranch.status === 0 && sourceBranch.stdout.trim() === record.branch) fail(`不能清理来源当前分支：${record.branch}`);
  const entries = parseList(read(record.sourceRepository, ['worktree', 'list', '--porcelain']));
  const registration = entries.find((entry) => sameFilesystemPath(entry.path, record.checkoutPath));
  if (entries.some((entry) => entry.branch === record.branch && !sameFilesystemPath(entry.path, record.checkoutPath))) fail(`分支仍被其他位置使用：${record.branch}`);
  if (cleanup && registration?.locked) fail(`工作树已锁定：${record.checkoutPath}`);
  if (!fs.existsSync(record.checkoutPath)) {
    if (registration) fail(`路径缺失但仍有 Git 登记：${record.checkoutPath}`);
    return;
  }
  if (!registration || registration.branch !== record.branch) fail(`Git 登记与当前对象不符：${record.selector}`);
  const actualRoot = read(record.checkoutPath, ['rev-parse', '--show-toplevel']);
  const actualCommon = path.resolve(record.checkoutPath, read(record.checkoutPath, ['rev-parse', '--git-common-dir']));
  const actualBranch = read(record.checkoutPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const gitDir = path.resolve(record.checkoutPath, read(record.checkoutPath, ['rev-parse', '--git-dir']));
  if (!sameFilesystemPath(actualRoot, record.checkoutPath) || !sameFilesystemPath(actualCommon, common) || actualBranch !== record.branch || sameFilesystemPath(gitDir, common)) fail(`当前 Git 身份与来源不符或目标是主目录：${record.selector}`);
}

export function assertNoUnlistedNestedRepositories(repositories: GitWorktreeObservedCheckout[], git: Git): void {
  const known = new Set(repositories.map((item) => item.checkoutPath));
  const roots = repositories.filter((item) => !repositories.some((parent) => parent !== item && contains(parent.checkoutPath, item.checkoutPath)));
  const pending = roots.map((item) => item.checkoutPath).filter((entry) => fs.existsSync(entry));
  while (pending.length) {
    const directory = pending.pop()!;
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.name === '.git') && !known.has(directory)) fail(`清理集合遗漏嵌套 Git 仓库：${directory}`);
    if (['HEAD', 'objects', 'refs'].every((name) => entries.some((entry) => entry.name === name))) {
      const bare = git(directory, ['rev-parse', '--is-bare-repository']);
      if (bare.status === 0 && bare.stdout.trim() === 'true') fail(`清理集合包含嵌套裸 Git 仓库：${directory}`);
    }
    for (const entry of entries) {
      if (entry.name !== '.git' && entry.isDirectory() && !entry.isSymbolicLink()) pending.push(path.join(directory, entry.name));
    }
  }
}
