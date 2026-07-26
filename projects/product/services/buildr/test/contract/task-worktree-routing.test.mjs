import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const triageSkill = read('package/targets/workspace/skills/buildr/task-triage/SKILL.md');
const worktreeSkill = read('package/targets/workspace/skills/buildr/task-worktree/SKILL.md');
const proposeUpstream = read('package/targets/workspace/skills/openspec/openspec-propose/SKILL.md');
const proposeSidebar = read('package/targets/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md');
const updateUpstream = read('package/targets/workspace/skills/openspec/openspec-update-change/SKILL.md');
const updateSidebar = read('package/targets/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md');
const openSpecComponent = YAML.parse(read('package/targets/workspace/components/buildr/openspec/component.yml'));
const packageManifest = YAML.parse(read('package/manifest.yml'));
const workspaceManifest = YAML.parse(read('package/targets/workspace/skills/manifest.yml'));

test('task triage 输出三轴决策、repository set 与条件化任务环境', () => {
  for (const required of [
    '## 2. 三轴决策',
    '### 语义治理',
    '### 执行形态',
    '### 任务跟踪',
    'Repository set',
    '`code-only + implementation`',
    '`change-flow + metadata-only`',
    '`buildr.task-worktree-lifecycle/v2`',
  ]) assert.ok(triageSkill.includes(required), `task-triage must include ${required}`);

  assert.match(triageSkill, /任何实现或 Change artifact 写入前创建或复用 canonical task environment/);
  assert.match(triageSkill, /本 Skill 只选择位置；创建、doctor、sync、保留和清理由 selected provider 负责/);
});

test('OpenSpec propose 直接入口在首次写入前执行 worktree 门禁', () => {
  assert.match(proposeSidebar, /执行 `openspec new change` 或写入任何 change artifacts 前/);
  assert.match(proposeSidebar, /代码修改、构建、测试或需要长期开发上下文/);
  assert.match(proposeSidebar, /先使用 `task-worktree` 声明完整 repository set/);
  assert.match(proposeSidebar, /无法判断是否会进入实现时，先澄清执行范围/);
  assert.match(proposeSidebar, /不修改外部 `openspec-propose` Skill 的上游正文/);

  assert.doesNotMatch(proposeUpstream, /canonical task worktree/);
  assert.doesNotMatch(proposeUpstream, /任务执行形态/);
});

test('OpenSpec update 只补实施转换的 worktree 门槛，不引入新的 capability contract', () => {
  assert.match(updateUpstream, /generatedBy: "1\.6\.0"/);
  assert.match(updateSidebar, /只修订既有 planning artifacts/);
  assert.match(updateSidebar, /不授予实现、同步或归档权限/);
  assert.match(updateSidebar, /重新执行 `task-worktree` 决策/);
  assert.ok(openSpecComponent.members.skills.includes('skills/openspec/openspec-update-change'));
  assert.ok(openSpecComponent.contributions.skillFragments.some((item) => item.startsWith('openspec-update-change@prepend=')));
  for (const sidebar of ['openspec-explore-sidebar.md', 'openspec-sync-sidebar.md', 'openspec-archive-sidebar.md']) {
    assert.ok(!openSpecComponent.members.skillContributions.some((item) => item.endsWith(sidebar)));
  }
  assert.ok(!packageManifest.capabilityContracts.some((item) => item.id.startsWith('buildr.openspec-')));
});

test('worktree provider 保持环境职责且 triage 只声明分支级 optional dependencies', () => {
  for (const required of [
    '## 1. 职责边界',
    '## 2. 决策',
    '## 3. 生命周期',
    '## 4. 协作交接',
    '## 5. 授权与停止条件',
    '| `create` |',
    '| `reuse` |',
    '| `none` |',
    '| `blocked` |',
    '只跳过 create-time doctor/sync',
    '仍执行 context 和本次动作需要的状态检查',
    '无法证明时停止删除或覆盖',
    '同一 environment 同时只有一个 owner Agent 写入',
    'selected `buildr.task-verification/v2` provider',
  ]) assert.ok(worktreeSkill.includes(required), `task-worktree must include ${required}`);
  assert.doesNotMatch(worktreeSkill, /## Guardrails/);
  assert.doesNotMatch(worktreeSkill, /复用既有 worktree且没有发生 tree 转换时不重复检查/);

  const packagedTriage = packageManifest.builtins.skills.find((item) => item.id === 'task-triage');
  const workspaceTriage = workspaceManifest.skills.find((item) => item.id === 'task-triage');
  assert.deepEqual(packagedTriage.provides || [], []);
  assert.deepEqual(workspaceTriage.provides || [], []);
  const expected = [
    { capability: 'buildr.current-knowledge-maintenance', version: 2, mode: 'optional' },
    { capability: 'buildr.task-worktree-lifecycle', version: 2, mode: 'optional' },
    { capability: 'buildr.task-board-maintenance', version: 1, mode: 'optional' },
  ];
  assert.deepEqual(packagedTriage.requires, expected);
  assert.deepEqual(workspaceTriage.requires, expected);
  assert.equal(packagedTriage.requires.some((item) => item.capability === 'buildr.task-verification'), false);

  const contract = packageManifest.capabilityContracts.find((item) => item.id === 'buildr.task-worktree-lifecycle');
  const binding = packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-worktree-lifecycle');
  const packagedWorktree = packageManifest.builtins.skills.find((item) => item.id === 'task-worktree');
  const workspaceWorktree = workspaceManifest.skills.find((item) => item.id === 'task-worktree');
  assert.equal(contract.version, 2);
  assert.equal(binding.provider, 'task-worktree');
  assert.equal(packagedWorktree.description, workspaceWorktree.description);
  assert.match(packagedWorktree.description, /不负责业务分流、Git 集成或验证。$/);
});
