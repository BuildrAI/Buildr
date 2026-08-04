import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/infrastructure/runtime/skills/manifests.mjs';
import { PORTABLE_TASK_RECORD_DECLARATIONS } from '../../package/targets/workspace/skills/buildr/task-metadata-publication/scripts/publication.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const packageManifest = YAML.parse(read('package/manifest.yml'));
const workspaceManifest = YAML.parse(read('package/targets/workspace/skills/manifest.yml'));
const skill = read('package/targets/workspace/skills/buildr/task-metadata-publication/SKILL.md');

test('Task Metadata Publication 保持唯一Skill/capability与required Git Operations binding', () => {
  const contractPath = path.join(ROOT, 'package/targets/workspace/skills/contracts/buildr/task-metadata-publication/v1.md');
  const contract = parseCapabilityContract(contractPath);
  assert.equal(contract.id, 'buildr.task-metadata-publication');
  assert.equal(contract.version, 1);

  const packaged = packageManifest.builtins.skills.find((item) => item.id === 'task-metadata-publication');
  const baseline = workspaceManifest.skills.find((item) => item.id === 'task-metadata-publication');
  assert.deepEqual(packaged.provides, [{ capability: 'buildr.task-metadata-publication', version: 1 }]);
  assert.deepEqual(packaged.requires, [{ capability: 'buildr.git-operations', version: 1, mode: 'required' }]);
  assert.deepEqual(baseline.provides, packaged.provides);
  assert.deepEqual(baseline.requires, packaged.requires);
  assert.equal(packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-metadata-publication').provider, 'task-metadata-publication');
  assert.equal(workspaceManifest.bindings.find((item) => item.capability === 'buildr.task-metadata-publication').provider, 'task-metadata-publication');
  assert.equal(packageManifest.builtins.skills.some((item) => item.id === 'metadata-publication'), false);
  assert.equal(workspaceManifest.skills.some((item) => item.id === 'metadata-publication'), false);
});

test('真实writer contracts与helper精确声明四个portable paths，Task Record保持local-only', () => {
  const expected = [
    ['buildr.task-development/v2', '.buildr/tasks/<task-id>/development.yml', 'task-development/v2.md'],
    ['buildr.task-verification/v3', '.buildr/tasks/<task-id>/verification.yml', 'task-verification/v3.md'],
    ['buildr.task-review/v1', '.buildr/tasks/<task-id>/reviews/planning.yml', 'task-review/v1.md'],
    ['buildr.task-review/v1', '.buildr/tasks/<task-id>/reviews/completion.yml', 'task-review/v1.md'],
  ];
  assert.deepEqual(PORTABLE_TASK_RECORD_DECLARATIONS.map((entry) => [entry.owner, entry.path]), expected.map(([owner, recordPath]) => [owner, recordPath]));
  for (const [owner, recordPath, contractFile] of expected) {
    const writer = read(`package/targets/workspace/skills/contracts/buildr/${contractFile}`);
    assert.ok(writer.includes(owner), owner);
    assert.ok(writer.includes(recordPath), recordPath);
  }
  const taskRecordContract = read('package/targets/workspace/skills/contracts/buildr/task-record/v1.md');
  assert.ok(taskRecordContract.includes('Task Record是local-only数据'));
  assert.equal(PORTABLE_TASK_RECORD_DECLARATIONS.some((entry) => entry.owner === 'buildr.task-record/v1'), false);
  for (const excluded of ['tasks.md', 'environment.json', '.buildr/task-finish/', '.buildr/asset-review/', '.buildr/mutations/', '.worktrees/']) {
    assert.equal(PORTABLE_TASK_RECORD_DECLARATIONS.some((entry) => entry.path.includes(excluded)), false, excluded);
  }
});

test('Skill固定snapshot、独立Git Results、部分失败、local-only与authority边界', () => {
  for (const required of [
    '不得扫描Task目录',
    '不写Receipt/history',
    '只有`verified`才可push',
    'commit与push必须保留两个独立Result',
    'local history已改变、remote未改变',
    '后续重试先走等价commit检查',
    '`local-only|not-applicable`时不调用Git Operations',
    'publication失败不得修改Task terminal status',
    '不新增公共CLI/Application',
  ]) assert.ok(skill.includes(required), required);
  for (const oldRoute of ['git-workspace-update', 'git-task-integration', 'git-single-operation']) {
    assert.ok(skill.includes(oldRoute), oldRoute);
    assert.equal(packageManifest.capabilityContracts.some((item) => item.id === `buildr.${oldRoute}`), false);
    assert.equal(workspaceManifest.contracts.some((item) => item.id === `buildr.${oldRoute}`), false);
  }
});

test('helper随Skill完整发布且只包含只读Git observations', () => {
  const helper = path.join(ROOT, 'package/targets/workspace/skills/buildr/task-metadata-publication/scripts/publication.mjs');
  const source = fs.readFileSync(helper, 'utf8');
  assert.equal(fs.statSync(helper).mode & 0o111, 0o111);
  for (const operation of ["['add'", "['commit'", "['push'", "['reset'", "['rebase'", "['merge'"]) assert.equal(source.includes(operation), false, operation);
  for (const operation of ['rev-parse', 'diff-tree', 'rev-list', 'show']) assert.ok(source.includes(operation), operation);
  assert.equal(fs.existsSync(path.join(ROOT, 'package/targets/workspace/skills/buildr/task-metadata-publication/agents/openai.yaml')), true);
});
