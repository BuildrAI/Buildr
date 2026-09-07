import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative: string): string => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const triageSkill = read('resources/workspace/skills/buildr/task-triage/SKILL.md');
const worktreeSkill = read('resources/workspace/skills/buildr/task-worktree/SKILL.md');
const proposeSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md');
const applySidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md');
const updateSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md');
const packageManifest = YAML.parse(read('resources/manifest.yml'));

test('task triage把普通工作、独立Worktree与专业能力按需组合', () => {
  for (const required of [
    '## 2. 两轴决策',
    'Repository set',
    'Formal Task Record本身不是编辑、构建或有界测试的通用工作许可',
    '需要隔离Git位置时显式使用Worktree',
    '不需要Worktree的直接工作不补造位置、Plan或Receipt',
    'Task Worktree：create / inspect / none / blocked',
  ]) assert.ok(triageSkill.includes(required), `task-triage must include ${required}`);
  assert.doesNotMatch(triageSkill, /buildr\.task-environment|Task Environment：prepare/);
});

test('OpenSpec入口直接使用当前Workspace或matching Worktree', () => {
  assert.match(proposeSidebar, /当前Workspace直接工作/);
  assert.match(proposeSidebar, /需要隔离时显式创建并检查matching Worktree/);
  assert.match(proposeSidebar, /`openspec new change`、`task update --add-change`/);
  assert.match(applySidebar, /当前Workspace或matching Worktree根/);
  assert.match(applySidebar, /不得从cwd、branch、路径相似、旧Receipt或同一HEAD猜ownership/);
  assert.match(updateSidebar, /只修订既有planning artifacts/);
  assert.match(updateSidebar, /纯规划修订直接使用当前Change现场/);
  assert.doesNotMatch(`${proposeSidebar}\n${applySidebar}\n${updateSidebar}`, /Task Environment|Environment Receipt/);
});

test('Worktree只维护Git位置和精确删除安全', () => {
  for (const required of [
    'buildr.git-worktree-provider/v1',
    '只管理Git checkout、本地任务分支、窄Git evidence和具体删除安全',
    '普通任务可以直接在已确认的当前checkout工作',
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
