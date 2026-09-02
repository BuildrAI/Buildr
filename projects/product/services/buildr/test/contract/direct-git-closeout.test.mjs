import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/agent-assets/infrastructure/runtime/skills/manifests.mjs';

const SERVICE_ROOT = path.resolve(import.meta.dirname, '../..');
const WORKSPACE_TARGET = path.join(SERVICE_ROOT, 'resources', 'workspace');
const manifest = YAML.parse(fs.readFileSync(path.join(SERVICE_ROOT, 'resources/manifest.yml'), 'utf8'));

test('直接 Git 与 Formal Task Finish 保持两个可解析 capability 入口', () => {
  const git = manifest.builtins.skills.find((item) => item.id === 'git-operations');
  const finish = manifest.builtins.skills.find((item) => item.id === 'task-finish');
  assert.deepEqual(git.provides, [{ capability: 'buildr.git-operations', version: 1 }]);
  assert.deepEqual(finish.provides, [{ capability: 'buildr.task-finish', version: 1 }]);
  assert.equal(parseCapabilityContract(path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/git-operations/v1.md')).id, 'buildr.git-operations');
  assert.equal(parseCapabilityContract(path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/task-finish/v1.md')).id, 'buildr.task-finish');
  assert.ok(finish.requires.some((item) => item.capability === 'buildr.git-operations' && item.mode === 'optional'));
});

test('Task Triage 的正式 owner 依赖保持 optional，直接工作不被结构性绑定扩大为通用许可', () => {
  const triage = manifest.builtins.skills.find((item) => item.id === 'task-triage');
  for (const capability of [
    'buildr.task-record',
    'buildr.git-operations',
    'buildr.git-worktree-provider',
  ]) {
    assert.ok(triage.requires.some((item) => item.capability === capability && item.mode === 'optional'), capability);
  }
  assert.equal(triage.requires.some((item) => item.capability === 'buildr.task-environment'), false);
});
