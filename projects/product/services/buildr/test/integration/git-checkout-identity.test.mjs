import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { normalizeFilesystemPath, sameFilesystemPath, sameGitCheckoutIdentity } from '../../src/infrastructure/git/checkout-identity.ts';

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

test('Git checkout identity 使用文件系统事实而非路径拼写', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-checkout-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gitDirectory = path.join(root, 'git-directory');
  const commonDirectory = path.join(root, 'common-directory');
  fs.mkdirSync(gitDirectory);
  fs.mkdirSync(commonDirectory);
  fs.mkdirSync(path.join(root, 'alias-segment'));
  const gitAlias = path.join(root, 'alias-segment', '..', 'git-directory');
  const commonAlias = path.join(root, 'alias-segment', '..', 'common-directory');

  assert.equal(sameFilesystemPath(gitDirectory, gitAlias), true);
  assert.equal(sameGitCheckoutIdentity(
    { gitDirectory, gitCommonDirectory: commonDirectory, linkedWorktree: true },
    { gitDirectory: gitAlias, gitCommonDirectory: commonAlias, linkedWorktree: true },
  ), true);
});
