import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createAgentAssetsCliContributions } from '../../src/agent-assets/interfaces/cli/agent-assets.ts';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

function git(root: any, args: any): any  {
  const result: any = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('候选 Product checkout 只能投射自身任务验证 Workspace', (t: any) => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-authority-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const retained: any = path.join(fixture, 'retained');
  fs.mkdirSync(retained);
  git(retained, ['init', '--initial-branch=dev']);
  git(retained, ['config', 'user.email', 'buildr-test@example.com']);
  git(retained, ['config', 'user.name', 'Buildr Test']);
  fs.writeFileSync(path.join(retained, 'README.md'), '# fixture\n');
  git(retained, ['add', 'README.md']);
  git(retained, ['commit', '-m', 'fixture']);

  const candidate: any = path.join(fixture, 'candidate');
  const peer: any = path.join(fixture, 'peer');
  git(retained, ['worktree', 'add', '-b', 'codex/candidate', candidate, 'HEAD']);
  git(retained, ['worktree', 'add', '-b', 'codex/peer', peer, 'HEAD']);
  const unrelated: any = path.join(fixture, 'unrelated');
  fs.mkdirSync(unrelated);
  const isolatedUserRuntime: any = path.join(unrelated, 'user-home');
  const sharedUserRuntime: any = path.join(fixture, 'shared-user-home');

  const runtime: any = createRuntime();
  runtime.productRoot = () => candidate;
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(candidate));
  let initializationCalls: any = 0;
  runtime.assertInitializedBuildrWorkspace = () => { initializationCalls += 1; };
  let renderCalls: any = 0;
  runtime.renderRuntime = (_agent: any, _args: any, options: any) => {
    renderCalls += 1;
    assert.deepEqual(options, { productSkill: true });
    return { targetRoot: candidate, files: [], rulesActions: [], warnings: [] };
  };
  runtime.syncRuntime('codex', ['--target', candidate]);
  assert.equal(initializationCalls, 0, 'candidate source sync must stop before workspace initialization or later mutation preparation');
  assert.equal(renderCalls, 1);
  const compatibility: any = runtime.assertRuntimeSyncTarget(candidate, 'codex');
  assert.equal(compatibility.disposition, 'projection-only');
  assert.equal(sameFilesystemPath(compatibility.source.checkoutRoot, candidate), true);
  assert.equal(sameFilesystemPath(compatibility.target.checkoutRoot, candidate), true);
  assert.match(compatibility.diagnostic, /buildr render codex --product-skill/);
  assert.match(compatibility.diagnostic, /独立验证 Workspace/);
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(unrelated));
  assert.equal(runtime.assertRuntimeSyncTarget(unrelated, 'codex').disposition, 'full-sync', 'candidate source may full-sync an unrelated isolated validation Workspace');
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(unrelated, { destination: 'user', runtimeTargetRoot: isolatedUserRuntime }), 'validation Workspace may contain an isolated simulated user runtime');
  assert.throws(() => runtime.assertRuntimeProjectionTarget(candidate, { destination: 'user', runtimeTargetRoot: sharedUserRuntime }), (error: any) => error.code === 'runtime.candidate_shared_target');
  assert.throws(() => runtime.assertRuntimeProjectionTarget(retained), (error: any) => error.code === 'runtime.candidate_cross_checkout_target');
  assert.throws(() => runtime.assertRuntimeProjectionTarget(peer), (error: any) => error.code === 'runtime.candidate_cross_checkout_target');

  runtime.productRoot = () => retained;
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(retained));
  assert.equal(runtime.assertRuntimeSyncTarget(retained, 'codex').disposition, 'full-sync', 'retained Product source may full-sync its canonical Workspace');
  assert.doesNotThrow(() => runtime.assertRuntimeProjectionTarget(candidate), 'retained Product source may provision a task worktree runtime');
});

test('render --product-skill selects product Skill without changing render into source sync', () => {
  const render: any = createAgentAssetsCliContributions().find((item: any) => item.key === 'render');
  let invocation: any = null;
  const runtime: any = {
    renderRuntime(agent: any, args: any, options: any): any  {
      invocation = { agent, args, options };
      return { targetRoot: '/fixture', files: [], rulesActions: [], warnings: [] };
    },
    toPosixRelative: () => '',
  };
  render.run(runtime, {
    action: 'codex',
    argv: ['node', 'buildr', 'render', 'codex', '--product-skill', '--target', '/fixture'],
  });
  assert.equal(invocation.agent, 'codex');
  assert.deepEqual(invocation.options, { productSkill: true });
  assert.ok(invocation.args.includes('--product-skill'));
});
