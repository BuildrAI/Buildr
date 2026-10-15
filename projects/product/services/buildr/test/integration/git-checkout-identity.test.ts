import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { normalizeFilesystemPath, observeGitCheckoutIdentity, sameFilesystemPath, sameGitCheckoutIdentity } from '../../src/infrastructure/git/checkout-identity.ts';

test('Windows 文件系统路径统一盘符、扩展路径与 UNC 拼写', () => {
  assert.equal(
    normalizeFilesystemPath('\\\\?\\D:\\Work\\Buildr\\', 'win32'),
    normalizeFilesystemPath('d:\\work\\buildr', 'win32'),
  );
  assert.equal(
    normalizeFilesystemPath('\\\\?\\UNC\\server\\share\\repo\\', 'win32'),
    normalizeFilesystemPath('\\\\server\\share\\repo', 'win32'),
  );
});

test('Git checkout identity 优先复用 Git 自身稳定路径身份', () => {
  assert.equal(sameGitCheckoutIdentity(
    {
      gitDirectory: 'C:\\short\\repo\\.git', gitDirectoryIdentity: 'c:\\repo\\.git',
      gitCommonDirectory: 'C:\\short\\repo\\.git', gitCommonDirectoryIdentity: 'c:\\repo\\.git', linkedWorktree: false,
    },
    {
      gitDirectory: 'C:\\long-name\\repo\\.git', gitDirectoryIdentity: 'c:\\repo\\.git',
      gitCommonDirectory: 'C:\\long-name\\repo\\.git', gitCommonDirectoryIdentity: 'c:\\repo\\.git', linkedWorktree: false,
    },
  ), true);
});

test('Git checkout identity 使用文件系统事实而非路径拼写', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-checkout-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gitDirectory: any = path.join(root, 'git-directory');
  const commonDirectory: any = path.join(root, 'common-directory');
  fs.mkdirSync(gitDirectory);
  fs.mkdirSync(commonDirectory);
  fs.mkdirSync(path.join(root, 'alias-segment'));
  const gitAlias: any = path.join(root, 'alias-segment', '..', 'git-directory');
  const commonAlias: any = path.join(root, 'alias-segment', '..', 'common-directory');

  assert.equal(sameFilesystemPath(gitDirectory, gitAlias), true);
  assert.equal(sameGitCheckoutIdentity(
    { gitDirectory, gitCommonDirectory: commonDirectory, linkedWorktree: true },
    { gitDirectory: gitAlias, gitCommonDirectory: commonAlias, linkedWorktree: true },
  ), true);
});

function checkoutFixture(t: test.TestContext) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-checkout-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', [
    '-c', 'user.name=Fixture Person', '-c', 'user.email=fixture@example.com',
    '-c', 'commit.gpgSign=false', '-c', `core.hooksPath=${path.join(base, 'hooks')}`, ...args,
  ], { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { base, git };
}

function assertObservedCheckout(location: string, expected: { checkoutRoot: string; gitDirectory: string; gitCommonDirectory: string; linkedWorktree: boolean }) {
  const observed = observeGitCheckoutIdentity(location);
  assert.ok(observed, '真实 Git 检出必须提供完整身份');
  assert.deepEqual({
    checkoutRoot: observed.checkoutRoot,
    gitDirectory: observed.gitDirectory,
    gitCommonDirectory: observed.gitCommonDirectory,
    linkedWorktree: observed.linkedWorktree,
  }, expected);
}

test('无 Git、缺失目录与裸仓库没有检出身份', t => {
  const { base, git } = checkoutFixture(t);
  const plain = path.join(base, 'plain');
  const bare = path.join(base, 'bare.git');
  fs.mkdirSync(plain);
  git('init', '--bare', bare);
  assert.equal(observeGitCheckoutIdentity(plain), null);
  assert.equal(observeGitCheckoutIdentity(path.join(base, 'missing')), null);
  assert.equal(observeGitCheckoutIdentity(bare), null);
});

test('同一路径成为 Git 后重新观察；子目录和目录别名保留真实身份', t => {
  const { base, git } = checkoutFixture(t);
  const repository = path.join(base, 'repository');
  fs.mkdirSync(repository);
  assert.equal(observeGitCheckoutIdentity(repository), null);
  git('init', '--initial-branch=main', repository);
  const checkoutRoot = fs.realpathSync(repository);
  const gitDirectory = fs.realpathSync(path.join(repository, '.git'));
  const expected = { checkoutRoot, gitDirectory, gitCommonDirectory: gitDirectory, linkedWorktree: false };
  assertObservedCheckout(repository, expected);
  const subdirectory = path.join(repository, 'nested');
  fs.mkdirSync(subdirectory);
  assertObservedCheckout(subdirectory, expected);
  const alias = path.join(base, 'alias');
  fs.symlinkSync(repository, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assertObservedCheckout(alias, expected);
});

test('关联工作树保留独立检出目录和共享 Git 目录身份', t => {
  const { base, git } = checkoutFixture(t);
  const repository = path.join(base, 'repository');
  const linked = path.join(base, 'linked');
  git('init', '--initial-branch=main', repository);
  git('-C', repository, 'commit', '--allow-empty', '-m', 'fixture baseline');
  git('-C', repository, 'worktree', 'add', '-b', 'fixture-linked', linked);
  assertObservedCheckout(linked, {
    checkoutRoot: fs.realpathSync(linked),
    gitDirectory: fs.realpathSync(path.join(repository, '.git', 'worktrees', 'linked')),
    gitCommonDirectory: fs.realpathSync(path.join(repository, '.git')),
    linkedWorktree: true,
  });
});
