import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/infrastructure/runtime/skills/manifests.mjs';

const SERVICE_ROOT = path.resolve(import.meta.dirname, '../..');
const WORKSPACE_TARGET = path.join(SERVICE_ROOT, 'package/targets/workspace');
const read = (relative) => fs.readFileSync(path.join(SERVICE_ROOT, relative), 'utf8');
const packageManifest = YAML.parse(read('package/manifest.yml'));
const skill = read('package/targets/workspace/skills/buildr/git-operations/SKILL.md');
const contractPath = path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/git-operations/v1.md');
const contract = fs.readFileSync(contractPath, 'utf8');

test('Git Operations contract 与 Skill 保持唯一 Skill-only authority', () => {
  const parsed = parseCapabilityContract(contractPath);
  assert.equal(parsed.id, 'buildr.git-operations');
  assert.equal(parsed.version, 1);
  assert.match(contract, /不选择动作、目标或顺序/);
  assert.match(contract, /不创建 Receipt/);

  const packaged = packageManifest.builtins.skills.find((item) => item.id === 'git-operations');
  assert.deepEqual(packaged.provides, [{ capability: 'buildr.git-operations', version: 1 }]);
  assert.equal(packaged.requires, undefined);
  assert.equal(packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.git-operations').provider, 'git-operations');
});

test('Git Operations routing description 精确一致且不扩展完整命令集', () => {
  const packaged = packageManifest.builtins.skills.find((item) => item.id === 'git-operations');
  const frontmatter = skill.match(/^---\n[\s\S]*?^description:\s*(.+)$/m)?.[1];
  assert.equal(frontmatter, packaged.description);
  assert.match(packaged.description, /明确选择仓库（repository）、Git 操作（Git Operation）与相关引用（ref）/);
  assert.match(packaged.description, /commit、push、commit\+push/);
  for (const broad of ['checkout', 'reset', 'cherry-pick', 'stash', '删除分支']) {
    assert.equal(packaged.description.includes(broad), false, broad);
  }
});

test('Git Operations playbook 覆盖 commit、push 与组合边界', () => {
  for (const required of [
    '`commit`：只创建或安全 amend local commit，不 push',
    '`push`：只发布已有 commit，不把 dirty 自动 commit',
    '`commit+push`：caller 依次执行一次 commit 和一次 push',
    '保留两个独立 Result',
    '禁止使用 `git add -A`',
    '同一文件混有不同归属',
    '保留全部无关 dirty',
    'scope 外 staged 内容',
    '实际将提交的 diff',
  ]) assert.ok(skill.includes(required), required);
});

test('Git Operations playbook 覆盖完整 push range、共享冻结与拒绝', () => {
  for (const required of [
    '完整 commit range',
    '而不是只检查 tip commit',
    'scope 外 unpublished commit',
    '普通 push 被拒绝时停止',
    '不自动 force push',
    'push 或其他共享会冻结 commit',
    '后续变化创建新 commit',
  ]) assert.ok(skill.includes(required), required);
});

test('Git Operations Result 对部分失败 fail closed', () => {
  for (const required of [
    'status: succeeded | blocked',
    'treeChanged: <boolean>',
    'historyChanged: <boolean>',
    'remoteChanged: <boolean>',
    'commit 成功而后续 push 被拒绝',
    'local history 已改变、remote 未改变',
    '不得静默 stash/reset/回滚、换策略',
  ]) assert.ok(skill.includes(required), required);
});

test('旧 Git graph 只保留 migration evidence，active manifests 与文件为零', () => {
  const legacyCapabilities = new Set(['buildr.git-single-operation', 'buildr.git-task-integration', 'buildr.git-workspace-update']);
  assert.equal(packageManifest.capabilityContracts.some((item) => legacyCapabilities.has(item.id)), false);
  assert.equal(packageManifest.initialSkillBindings.some((item) => legacyCapabilities.has(item.capability)), false);
  assert.equal(packageManifest.builtins.skills.some((item) => item.id === 'git-ops'), false);
  for (const file of [
    'package/targets/workspace/skills/contracts/buildr/git-single-operation/v1.md',
    'package/targets/workspace/skills/contracts/buildr/git-task-integration/v1.md',
    'package/targets/workspace/skills/contracts/buildr/git-workspace-update/v1.md',
    'package/targets/workspace/skills/buildr/git-ops/SKILL.md',
  ]) assert.equal(fs.existsSync(path.join(SERVICE_ROOT, file)), false, file);

  const replacement = packageManifest.capabilityContracts.find((item) => item.id === 'buildr.git-operations');
  assert.deepEqual(new Set(replacement.replaces.map((item) => item.id)), legacyCapabilities);
});

test('Task Finish consumer 已迁移且 worktree provider 保持独立', () => {
  const finish = packageManifest.builtins.skills.find((item) => item.id === 'task-finish');
  assert.ok(finish.requires.some((item) => item.capability === 'buildr.git-operations' && item.mode === 'optional'));
  assert.equal(finish.requires.some((item) => item.capability === 'buildr.git-worktree-provider'), false);
  const worktree = packageManifest.builtins.skills.find((item) => item.id === 'task-worktree');
  assert.deepEqual(worktree.provides, [{ capability: 'buildr.git-worktree-provider', version: 1 }]);
  assert.equal(worktree.provides.some((item) => item.capability === 'buildr.git-operations'), false);
});
