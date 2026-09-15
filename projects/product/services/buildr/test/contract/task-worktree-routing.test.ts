import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative: string): string => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const triageSkill = read('resources/workspace/skills/buildr/task-triage/SKILL.md')
  + read('resources/workspace/skills/buildr/task-triage/references/structured-handoff.md');
const worktreeSkill = read('resources/workspace/skills/buildr/task-worktree/SKILL.md');
const proposeSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md');
const applySidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md');
const updateSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md');
const syncSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-sync-converge.md');
const archiveSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-archive-converge.md');
const packageManifest = YAML.parse(read('resources/manifest.yml'));

test('task triage在持久文件写入前默认隔离并保留局部失败边界', () => {
  for (const required of [
    '## 2. 两轴决策',
    'Repository set',
    'Formal Task Record本身不是编辑、构建或有界测试的通用工作许可',
    '除非用户明确要求在主开发分支修改，否则一律创建或复用当前任务的独立工作树（Worktree）',
    '只读检查、合法任务记录和临时输出无需为此创建工作树（Worktree）',
    'Task Worktree：create / inspect / none / blocked',
  ]) assert.ok(triageSkill.includes(required), `task-triage must include ${required}`);
  assert.doesNotMatch(triageSkill, /buildr\.task-environment|Task Environment：prepare/);
});

test('OpenSpec规划和实施入口执行同一默认隔离策略', () => {
  for (const sidebar of [proposeSidebar, applySidebar, updateSidebar, syncSidebar, archiveSidebar]) {
    assert.match(sidebar, /`task-triage` 的默认隔离策略/);
    assert.match(sidebar, /只有用户明确要求在主开发分支修改时使用该位置/);
  }
  assert.match(proposeSidebar, /`openspec new change`、`task update --add-change`/);
  assert.match(applySidebar, /按默认隔离策略确认的实际工作根/);
  assert.match(applySidebar, /不得从cwd、branch、路径相似、旧Receipt或同一HEAD猜ownership/);
  assert.match(updateSidebar, /只修订既有planning artifacts/);
  assert.match(updateSidebar, /纯规划修订也在写入前执行/);
  assert.doesNotMatch(`${proposeSidebar}\n${applySidebar}\n${updateSidebar}`, /Task Environment|Environment Receipt/);
});

test('Worktree只维护Git位置和精确删除安全', () => {
  for (const required of [
    'buildr.git-worktree-provider/v1',
    '只管理Git checkout、本地任务分支、窄Git evidence和具体删除安全',
    '../task-triage/SKILL.md#默认隔离',
    'buildr worktree create <task-id>',
    'buildr worktree inspect <task-id>',
    'buildr worktree cleanup <task-id>',
    '--expected-source <selector>=<full-commit>',
    '--delivered-ref <selector>=<full-commit>',
    '不判断 Task 是否 ready、完成或业务成果是否等价',
    '不管理Preview、容器或其他资源',
  ]) assert.ok(worktreeSkill.includes(required), `task-worktree must include ${required}`);
  assert.doesNotMatch(worktreeSkill, /--integrated-ref|Environment Receipt|环境 ready|总 cleanup/);
});

test('能力绑定不再要求Task Environment', () => {
  const triage = packageManifest.builtins.skills.find((item: { id: string }) => item.id === 'task-triage');
  const finish = packageManifest.builtins.skills.find((item: { id: string }) => item.id === 'task-finish');
  assert.ok(triage.requires.some((item: { capability: string }) => item.capability === 'buildr.git-worktree-provider'));
  assert.ok(finish.requires.some((item: { capability: string }) => item.capability === 'buildr.git-worktree-provider'));
  assert.equal(triage.requires.some((item: { capability: string }) => item.capability === 'buildr.task-environment'), false);
  assert.equal(finish.requires.some((item: { capability: string }) => item.capability === 'buildr.task-environment'), false);
  const worktreeBinding = packageManifest.initialSkillBindings.find((item: { capability: string }) => item.capability === 'buildr.git-worktree-provider');
  assert.equal(worktreeBinding.provider, 'task-worktree');
});
