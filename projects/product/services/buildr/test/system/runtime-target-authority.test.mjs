import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('候选 Product checkout 只能投射自身任务验证 Workspace', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-authority-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const retained = path.join(fixture, 'retained');
  fs.mkdirSync(retained);
  git(retained, ['init', '--initial-branch=dev']);
  git(retained, ['config', 'user.email', 'buildr-test@example.com']);
  git(retained, ['config', 'user.name', 'Buildr Test']);
  fs.writeFileSync(path.join(retained, 'README.md'), '# fixture\n');
  git(retained, ['add', 'README.md']);
  git(retained, ['commit', '-m', 'fixture']);

  const candidate = path.join(fixture, 'candidate');
  const peer = path.join(fixture, 'peer');
  git(retained, ['worktree', 'add', '-b', 'codex/candidate', candidate, 'HEAD']);
  git(retained, ['worktree', 'add', '-b', 'codex/peer', peer, 'HEAD']);
  const unrelated = path.join(fixture, 'unrelated');
  fs.mkdirSync(unrelated);
  const isolatedUserRuntime = path.join(unrelated, 'user-home');
  const sharedUserRuntime = path.join(fixture, 'shared-user-home');

  const runtime = createRuntime();
  runtime.productRoot = () => candidate;
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(candidate));
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(unrelated));
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(unrelated, { destination: 'user', runtimeTargetRoot: isolatedUserRuntime }), 'validation Workspace may contain an isolated simulated user runtime');
  assert.throws(() => runtime.assertRuntimeProjectionTarget(candidate, { destination: 'user', runtimeTargetRoot: sharedUserRuntime }), (error) => error.code === 'runtime.candidate_shared_target');
  assert.throws(() => runtime.assertRuntimeProjectionTarget(retained), (error) => error.code === 'runtime.candidate_cross_checkout_target');
  assert.throws(() => runtime.assertRuntimeProjectionTarget(peer), (error) => error.code === 'runtime.candidate_cross_checkout_target');

  runtime.productRoot = () => retained;
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(retained));
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(candidate), 'retained Product source may provision a task worktree runtime');
});
