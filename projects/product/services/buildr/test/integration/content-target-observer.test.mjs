import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  FILESYSTEM_CONTENT_OBSERVER,
  GIT_CONTENT_OBSERVER,
  observeContentScope,
} from '../../src/infrastructure/content/content-target-observer.mjs';

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function scope(root) {
  return { selector: 'project:docs', kind: 'project', sourcePath: 'projects/docs', executionRoot: root };
}

test('non-Git filesystem identity 与绝对根无关，并忽略 Buildr control metadata', (t) => {
  const left = temporary(t, 'buildr-content-left-');
  const right = temporary(t, 'buildr-content-right-');
  for (const root of [left, right]) {
    fs.mkdirSync(path.join(root, 'guide'), { recursive: true });
    fs.writeFileSync(path.join(root, 'guide', 'start.md'), 'portable content\n');
    fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
    fs.writeFileSync(path.join(root, '.buildr', 'receipt.yml'), root);
    fs.mkdirSync(path.join(root, 'package', 'targets', 'workspace', '.buildr'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package', 'targets', 'workspace', '.buildr', 'workspace.yml'), 'product content\n');
  }
  const first = observeContentScope(scope(left));
  const second = observeContentScope(scope(right));
  assert.equal(first.observer, FILESYSTEM_CONTENT_OBSERVER);
  assert.equal(first.identity, second.identity);
  fs.writeFileSync(path.join(right, 'package', 'targets', 'workspace', '.buildr', 'workspace.yml'), 'changed product content\n');
  assert.notEqual(observeContentScope(scope(right)).identity, first.identity);
  fs.writeFileSync(path.join(right, 'package', 'targets', 'workspace', '.buildr', 'workspace.yml'), 'product content\n');
  fs.writeFileSync(path.join(right, 'guide', 'start.md'), 'changed content\n');
  assert.notEqual(observeContentScope(scope(right)).identity, first.identity);
});

test('Git observer includes tracked edits and untracked non-ignored content', (t) => {
  const root = temporary(t, 'buildr-content-git-');
  spawnSync('git', ['init', '-q'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.txt\n');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'one\n');
  spawnSync('git', ['add', '.gitignore', 'tracked.txt'], { cwd: root });
  const initial = observeContentScope(scope(root));
  assert.equal(initial.observer, GIT_CONTENT_OBSERVER);
  fs.writeFileSync(path.join(root, 'ignored.txt'), 'ignored\n');
  assert.equal(observeContentScope(scope(root)).identity, initial.identity);
  fs.writeFileSync(path.join(root, 'untracked.txt'), 'included\n');
  const untracked = observeContentScope(scope(root));
  assert.notEqual(untracked.identity, initial.identity);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'two\n');
  assert.notEqual(observeContentScope(scope(root)).identity, untracked.identity);
});

test('Git tracking carrier与Buildr control metadata不改变Content Target identity', (t) => {
  const root = temporary(t, 'buildr-content-git-carrier-');
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Buildr Test'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'buildr@example.com'], { cwd: root });
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'one\n');
  fs.mkdirSync(path.join(root, '.buildr', 'tasks', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'tasks', 'demo', 'task.yml'), 'status: active\n');
  spawnSync('git', ['add', 'tracked.txt', '.buildr/tasks/demo/task.yml'], { cwd: root });
  const staged = observeContentScope(scope(root));
  spawnSync('git', ['commit', '-qm', 'initial'], { cwd: root });
  assert.equal(observeContentScope(scope(root)).identity, staged.identity);
  fs.writeFileSync(path.join(root, '.buildr', 'tasks', 'demo', 'task.yml'), 'status: completed\n');
  assert.equal(observeContentScope(scope(root)).identity, staged.identity);
  fs.unlinkSync(path.join(root, 'tracked.txt'));
  const deleted = observeContentScope(scope(root));
  assert.notEqual(deleted.identity, staged.identity);
  spawnSync('git', ['add', '-A'], { cwd: root });
  assert.equal(observeContentScope(scope(root)).identity, deleted.identity);
});

test('Git observer纳入普通嵌套 .buildr 内容并排除OpenSpec Change receipt', (t) => {
  const root = temporary(t, 'buildr-content-git-nested-');
  spawnSync('git', ['init', '-q'], { cwd: root });
  const productContent = path.join(root, 'package', 'targets', 'workspace', '.buildr', 'workspace.yml');
  const changeReceipt = path.join(root, 'openspec', 'changes', 'demo', '.buildr', 'convergence-receipt.json');
  fs.mkdirSync(path.dirname(productContent), { recursive: true });
  fs.mkdirSync(path.dirname(changeReceipt), { recursive: true });
  fs.writeFileSync(productContent, 'product content\n');
  fs.writeFileSync(changeReceipt, '{"status":"pending"}\n');
  spawnSync('git', ['add', '-A'], { cwd: root });
  const initial = observeContentScope(scope(root));

  fs.writeFileSync(changeReceipt, '{"status":"changed"}\n');
  assert.equal(observeContentScope(scope(root)).identity, initial.identity);
  fs.writeFileSync(productContent, 'changed product content\n');
  assert.notEqual(observeContentScope(scope(root)).identity, initial.identity);
});
