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
const environmentSkill = read('package/targets/workspace/skills/buildr/task-environment/SKILL.md');
const proposeUpstream = read('package/targets/workspace/skills/openspec/openspec-propose/SKILL.md');
const proposeSidebar = read('package/targets/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md');
const updateUpstream = read('package/targets/workspace/skills/openspec/openspec-update-change/SKILL.md');
const updateSidebar = read('package/targets/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md');
const openSpecComponent = YAML.parse(read('package/targets/workspace/components/buildr/openspec/component.yml'));
const packageManifest = YAML.parse(read('package/manifest.yml'));
const workspaceManifest = YAML.parse(read('package/targets/workspace/skills/manifest.yml'));

test('task triage 输出两轴决策、repository set 与 Task Environment 动作', () => {
  for (const required of [
    '## 2. 两轴决策',
    '### 语义治理',
    '### 执行形态',
    'Repository set',
    '`implementation`',
    '`metadata-only`',
    '`buildr.task-environment/v1`',
  ]) assert.ok(triageSkill.includes(required), `task-triage must include ${required}`);

  assert.doesNotMatch(triageSkill, /create-board|continue-board|buildr\.task-board-maintenance/);

  assert.match(triageSkill, /首次持久交付写入前取得 `ready`、实际 execution roots、validation root 和执行 CLI/);
  assert.match(triageSkill, /`metadata-only` 可以使用共享执行根，不必创建 Git worktree/);
  assert.match(triageSkill, /Task Environment：prepare \/ inspect \/ none \/ blocked/);
});

test('OpenSpec propose 直接入口在首次写入前执行 Task Environment 门禁', () => {
  assert.match(proposeSidebar, /执行 `openspec new change` 或写入任何 change artifacts 前/);
  assert.match(proposeSidebar, /代码修改、构建、测试或需要长期开发上下文/);
  assert.match(proposeSidebar, /使用 `task-environment` 按 Task ID 准备完整 repository set/);
  assert.match(proposeSidebar, /共享执行根，不必创建 Git worktree/);
  assert.match(proposeSidebar, /无法判断是否会进入实现时，先澄清执行范围/);
  assert.match(proposeSidebar, /不修改外部 `openspec-propose` Skill 的上游正文/);

  assert.doesNotMatch(proposeUpstream, /canonical task worktree/);
  assert.doesNotMatch(proposeUpstream, /任务执行形态/);
});

test('OpenSpec update 只补新的执行效果门槛，不引入新的 capability contract', () => {
  assert.match(updateUpstream, /generatedBy: "1\.6\.0"/);
  assert.match(updateSidebar, /只修订既有 planning artifacts/);
  assert.match(updateSidebar, /不授予实现、同步或归档权限/);
  assert.match(updateSidebar, /重新运行 Task Environment `prepare`/);
  assert.match(updateSidebar, /matching `ready`、明确 execution roots 与执行 CLI/);
  assert.ok(openSpecComponent.members.skills.includes('skills/openspec/openspec-update-change'));
  assert.ok(openSpecComponent.contributions.skillFragments.some((item) => item.startsWith('openspec-update-change@prepend=')));
  for (const sidebar of ['openspec-explore-sidebar.md', 'openspec-sync-sidebar.md', 'openspec-archive-sidebar.md']) {
    assert.ok(!openSpecComponent.members.skillContributions.some((item) => item.endsWith(sidebar)));
  }
  assert.ok(!packageManifest.capabilityContracts.some((item) => item.id.startsWith('buildr.openspec-')));
});

test('Task Environment 独占环境职责，worktree 只保留窄 Git provider 能力', () => {
  for (const required of [
    '`buildr.git-worktree-provider/v1` 的默认 provider',
    '只管理 Git checkout 和窄 Git evidence',
    'buildr worktree create <task-id>',
    'buildr worktree inspect <task-id>',
    'buildr worktree cleanup <task-id>',
    '不判断 Task 是否 ready',
    '不登记动态资源',
  ]) assert.ok(worktreeSkill.includes(required), `task-worktree must include ${required}`);
  assert.match(environmentSkill, /`buildr.task-environment\/v1` 的默认 provider/);
  assert.match(environmentSkill, /Environment Receipt 独占 Runtime、CLI、依赖、projection、动态资源、ready、恢复和总 cleanup/);
  assert.doesNotMatch(worktreeSkill, /executionReady|worktree context|worktree adopt/);

  const packagedTriage = packageManifest.builtins.skills.find((item) => item.id === 'task-triage');
  const workspaceTriage = workspaceManifest.skills.find((item) => item.id === 'task-triage');
  assert.deepEqual(packagedTriage.provides || [], []);
  assert.deepEqual(workspaceTriage.provides || [], []);
  const expected = [
    { capability: 'buildr.task-record', version: 1, mode: 'optional' },
    { capability: 'buildr.current-knowledge-maintenance', version: 2, mode: 'optional' },
    { capability: 'buildr.task-environment', version: 1, mode: 'optional' },
    { capability: 'buildr.task-development', version: 2, mode: 'optional' },
  ];
  assert.deepEqual(packagedTriage.requires, expected);
  assert.deepEqual(workspaceTriage.requires, expected);
  assert.equal(packagedTriage.requires.some((item) => item.capability === 'buildr.task-verification'), false);

  const environmentContract = packageManifest.capabilityContracts.find((item) => item.id === 'buildr.task-environment');
  const worktreeContract = packageManifest.capabilityContracts.find((item) => item.id === 'buildr.git-worktree-provider');
  const environmentBinding = packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-environment');
  const worktreeBinding = packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.git-worktree-provider');
  const packagedWorktree = packageManifest.builtins.skills.find((item) => item.id === 'task-worktree');
  const workspaceWorktree = workspaceManifest.skills.find((item) => item.id === 'task-worktree');
  assert.equal(environmentContract.version, 1);
  assert.deepEqual(environmentContract.replaces.map((item) => `${item.id}@${item.version}`), ['buildr.task-worktree-lifecycle@1', 'buildr.task-worktree-lifecycle@2']);
  assert.equal(worktreeContract.version, 1);
  assert.equal(environmentBinding.provider, 'task-environment');
  assert.equal(worktreeBinding.provider, 'task-worktree');
  assert.equal(packagedWorktree.description, workspaceWorktree.description);
  assert.match(packagedWorktree.description, /不负责环境 ready、恢复、Runtime、资源或总 cleanup。$/);
  assert.equal(packageManifest.capabilityContracts.some((item) => item.id === 'buildr.task-worktree-lifecycle'), false);
  assert.equal(packageManifest.initialSkillBindings.some((item) => item.capability === 'buildr.task-worktree-lifecycle'), false);

  for (const id of ['task-triage', 'task-environment', 'task-worktree', 'task-finish']) {
    const packaged = packageManifest.builtins.skills.find((item) => item.id === id);
    const workspace = workspaceManifest.skills.find((item) => item.id === id);
    const source = read(packaged.path.replace(/^package\//, 'package/') + '/SKILL.md');
    const frontmatter = source.match(/^description: (.+)$/m)?.[1];
    assert.equal(packaged.description, workspace.description);
    assert.equal(packaged.description, frontmatter);
  }
});
