import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');
const reviewSkill = read('package/targets/workspace/skills/buildr/task-asset-review/SKILL.md');
const finishSkill = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const buildrSkill = read('package/targets/runtime/skills/buildr/SKILL.md');
const packageManifest = read('package/manifest.yml');
const workspaceSkills = read('package/targets/workspace/skills/manifest.yml');
const packageMaintenance = read('src/application/package-maintenance.mjs');
const workspaceOperations = read('src/application/workspace-operations.mjs');
const contract = read('package/targets/workspace/skills/contracts/buildr/task-asset-review/v3.md');
const gitignore = read('package/targets/workspace/gitignore');
const fixtures = JSON.parse(read('test/fixtures/task-asset-review.json'));

test('任务资产审查以 v3 capability 原子发布', () => {
  assert.match(contract, /id: buildr\.task-asset-review[\s\S]*version: 3/);
  assert.match(reviewSkill, /本 Skill 是 `buildr\.task-asset-review\/v3` 的默认 provider/);
  assert.match(buildrSkill, /`buildr\.task-asset-review\/v3` selected provider/);
  for (const manifest of [packageManifest, workspaceSkills]) {
    assert.match(manifest, /buildr\.task-asset-review[\s\S]*version: 3/);
    assert.match(manifest, /task-asset-review[\s\S]*provides:[\s\S]*buildr\.task-asset-review[\s\S]*version: 3/);
  }
  assert.ok(gitignore.split(/\r?\n/).includes('/.buildr/asset-review/'));
  assert.match(packageMaintenance, /appendGitignoreEntries[\s\S]*'\/\.buildr\/asset-review\/'/);
  assert.match(workspaceOperations, /appendGitignoreEntries[\s\S]*'\/\.buildr\/asset-review\/'/);
  assert.match(packageManifest, /task-asset-review\/scripts\/observation\.mjs/);
  assert.match(packageManifest, /task-asset-review\/templates\/observation\.md/);
  assert.match(packageManifest, /task-asset-review\/templates\/asset-maintenance-record\.md/);
});

test('provider 从非简单任务开始观察并保持证据边界', () => {
  for (const required of [
    '探索、设计、诊断、实现或验证',
    'Workspace-local untracked inbox',
    '/.buildr/asset-review/',
    'legacy inbox',
    'root Agent 是单一写者',
    'owner mismatch',
    '完整原始对话',
    '完整工具日志',
    '模型隐藏推理',
    '原子替换',
  ]) assert.ok(reviewSkill.includes(required), `review Skill must include ${required}`);
  assert.match(reviewSkill, /不要把特定 CLI、Launcher、daemon、端口或 registry 当成固定检查清单/);
});

test('provider 独占资格审查、分类和人工交接政策', () => {
  assert.deepEqual(fixtures.candidateTypes, ['rule', 'skill', 'capability-contract', 'product-followup']);
  assert.deepEqual(fixtures.finishResults, ['no-observation', 'discarded', 'awaiting-human', 'degraded']);
  assert.ok(fixtures.lifecycleCases.includes('owner-mismatch'));
  assert.ok(fixtures.lifecycleCases.includes('linked-worktree-shared-inbox'));
  assert.ok(fixtures.lifecycleCases.includes('legacy-migration'));
  assert.ok(fixtures.lifecycleCases.includes('discard-no-candidate'));
  assert.ok(fixtures.lifecycleCases.includes('product-absorbed'));
  for (const required of [
    '`rule`',
    '`skill`',
    '`capability-contract`',
    '`product-followup`',
    'Command、Component 和普通 docs 不作为直接候选',
    '重新进入 `task-triage`',
    'asset-maintenance/',
    '不要创建 `asset.yml`',
    '--outcome product-absorbed',
    '--outcome no-change',
    '--completion',
    'source.task',
    'identity 不同',
  ]) assert.ok(reviewSkill.includes(required), `review Skill must include ${required}`);
});

test('Task Finish 只触发 finalize 并等待 provider 结果', () => {
  const section = finishSkill.slice(finishSkill.indexOf('## 2. 任务资产审查 finalize'), finishSkill.indexOf('## 3. OpenSpec 归档'));
  assert.match(section, /调用 `buildr\.task-asset-review\/v3` selected provider 的 finalize/);
  assert.match(section, /不汇总 observation 信号、不执行资格门禁、不判断最终应沉淀什么/);
  assert.match(section, /`no-observation` 或 `discarded`/);
  assert.match(section, /`awaiting-human`/);
  assert.match(section, /worktree cleanup 前等待用户明确 accept 或 reject/);
  assert.match(section, /不自行实现备用审查/);
  assert.doesNotMatch(section, /强信号|Rule\/Skill 候选|轻量资格判断/);
  assert.match(workspaceSkills, /task-finish[\s\S]*requires:[\s\S]*buildr\.task-asset-review[\s\S]*version: 3[\s\S]*mode: optional/);
});
