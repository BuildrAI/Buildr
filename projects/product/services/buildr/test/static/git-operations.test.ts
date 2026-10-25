import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/modules/agent-assets/persistence/skill-manifest.ts';

const SERVICE_ROOT: any = path.resolve(import.meta.dirname, '../..');
const WORKSPACE_TARGET: any = path.join(SERVICE_ROOT, 'resources/workspace');
const read: any = (relative: any) => fs.readFileSync(path.join(SERVICE_ROOT, relative), 'utf8');
const packageManifest: any = YAML.parse(read('resources/manifest.yml'));

const contractPath: any = path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/git-operations/v1.md');

test('Git Operations contract 与 Skill 保持唯一 Skill-only authority', () => {
  const parsed: any = parseCapabilityContract(contractPath);
  assert.equal(parsed.id, 'buildr.git-operations');
  assert.equal(parsed.version, 1);

  const packaged: any = packageManifest.builtins.skills.find((item: any) => item.id === 'git-operations');
  assert.deepEqual(packaged.provides, [{ capability: 'buildr.git-operations', version: 1 }]);
  assert.equal(packaged.requires, undefined);
  assert.equal(packageManifest.initialSkillBindings.find((item: any) => item.capability === 'buildr.git-operations').provider, 'git-operations');
});

test('旧 Git graph 只保留 migration evidence，active manifests 与文件为零', () => {
  const legacyCapabilities: any = new Set(['buildr.git-single-operation', 'buildr.git-task-integration', 'buildr.git-workspace-update']);
  assert.equal(packageManifest.capabilityContracts.some((item: any) => legacyCapabilities.has(item.id)), false);
  assert.equal(packageManifest.initialSkillBindings.some((item: any) => legacyCapabilities.has(item.capability)), false);
  assert.equal(packageManifest.builtins.skills.some((item: any) => item.id === 'git-ops'), false);
  for (const file of [
    'resources/workspace/skills/contracts/buildr/git-single-operation/v1.md',
    'resources/workspace/skills/contracts/buildr/git-task-integration/v1.md',
    'resources/workspace/skills/contracts/buildr/git-workspace-update/v1.md',
    'resources/workspace/skills/buildr/git-ops/SKILL.md',
  ]) assert.equal(fs.existsSync(path.join(SERVICE_ROOT, file)), false, file);

  const replacement: any = packageManifest.capabilityContracts.find((item: any) => item.id === 'buildr.git-operations');
  assert.deepEqual(new Set(replacement.replaces.map((item: any) => item.id)), legacyCapabilities);
});

test('Task Finish按需消费独立Git与Worktree providers', () => {
  const finish: any = packageManifest.builtins.skills.find((item: any) => item.id === 'task-finish');
  assert.ok(finish.requires.some((item: any) => item.capability === 'buildr.git-operations' && item.mode === 'optional'));
  assert.ok(finish.requires.some((item: any) => item.capability === 'buildr.git-worktree-provider' && item.mode === 'optional'));
  assert.equal(finish.requires.some((item: any) => item.capability === 'buildr.task-environment'), false);
  const worktree: any = packageManifest.builtins.skills.find((item: any) => item.id === 'task-worktree');
  assert.deepEqual(worktree.provides, [{ capability: 'buildr.git-worktree-provider', version: 1 }]);
  assert.equal(worktree.provides.some((item: any) => item.capability === 'buildr.git-operations'), false);
});
