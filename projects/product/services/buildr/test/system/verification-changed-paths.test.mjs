import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { collectChangedProductPaths, resolveVerificationBase } from '../../test/verification/changed-paths.mjs';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('changed path collector 合并 base diff、staged、unstaged 与 untracked Product paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-changed-paths-'));
  try {
    const productRoot = path.join(root, 'projects', 'product');
    fs.mkdirSync(path.join(productRoot, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(productRoot, 'docs', 'tracked.md'), 'base\n');
    fs.writeFileSync(path.join(productRoot, 'docs', 'staged.md'), 'base\n');
    fs.writeFileSync(path.join(root, 'outside', 'ignored.md'), 'base\n');
    git(root, ['init']);
    git(root, ['config', 'user.email', 'verification@example.com']);
    git(root, ['config', 'user.name', 'Verification Fixture']);
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'base']);

    fs.writeFileSync(path.join(productRoot, 'docs', 'tracked.md'), 'unstaged\n');
    fs.writeFileSync(path.join(productRoot, 'docs', 'staged.md'), 'staged\n');
    git(root, ['add', 'projects/product/docs/staged.md']);
    fs.writeFileSync(path.join(productRoot, 'docs', 'untracked.md'), 'new\n');
    fs.writeFileSync(path.join(root, 'outside', 'ignored.md'), 'outside\n');

    const changed = collectChangedProductPaths({ productRoot, base: 'HEAD' });
    assert.equal(changed.base, 'HEAD');
    assert.equal(changed.source, 'git');
    assert.deepEqual(changed.paths, ['docs/staged.md', 'docs/tracked.md', 'docs/untracked.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('显式 paths 不读取 Git 且 base 解析失败时 fail closed', () => {
  const explicit = collectChangedProductPaths({ productRoot: process.cwd(), explicitPaths: ['./docs/a.md', 'docs/a.md'] });
  assert.deepEqual(explicit, { base: null, paths: ['docs/a.md'], source: 'explicit' });
  assert.throws(() => resolveVerificationBase(process.cwd(), 'missing-verification-base'), /Unknown Git base/);
});
