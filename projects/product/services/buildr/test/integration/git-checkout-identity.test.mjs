import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sameFilesystemPath, sameGitCheckoutIdentity } from '../../src/infrastructure/git/checkout-identity.mjs';

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
