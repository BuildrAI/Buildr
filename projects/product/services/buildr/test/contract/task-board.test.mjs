import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');
const boardSkill = read('package/targets/workspace/skills/buildr/task-board/SKILL.md');
const triageSkill = read('package/targets/workspace/skills/buildr/task-triage/SKILL.md');
const template = read('package/targets/workspace/skills/buildr/task-board/assets/task-board-template.html');
const openaiMetadata = read('package/targets/workspace/skills/buildr/task-board/agents/openai.yaml');
const packageManifest = read('package/manifest.yml');
const workspaceManifest = read('package/targets/workspace/skills/manifest.yml');
const bootstrapContract = read('package/bootstrap/contract.yml');
const productSkill = read('package/targets/runtime/skills/buildr/SKILL.md');

function parseBoardData(html) {
  const match = html.match(/<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'template must contain board-data JSON');
  return JSON.parse(match[1]);
}

test('任务看板是当前 artifact，旧称只保留用户意图路由', () => {
  assert.match(boardSkill, /旧称“任务驾驶舱”只用于路由/);
  assert.doesNotMatch(boardSkill, /驾驶舱首次创建/);
  assert.match(boardSkill, /`0\.\.N` 个真实 OpenSpec change ids/);
  assert.match(boardSkill, /`changes` 可以为空/);
  assert.match(triageSkill, /复杂 `code-only` 任务可以在没有 Change 时创建看板/);
  assert.match(triageSkill, /不得为了看板格式创建虚假 Change/);
  assert.match(openaiMetadata, /display_name: "任务看板"/);
  assert.match(openaiMetadata, /Use \$task-board/);
});

test('任务看板模板提供 changes batches dependencyPool 和方案分层', () => {
  const data = parseBoardData(template);
  assert.deepEqual(data.changes, []);
  assert.ok(Array.isArray(data.progress.batches));
  assert.ok(Array.isArray(data.progress.dependencyPool));
  assert.ok(Array.isArray(data.solution.businessPlan));
  assert.ok(Array.isArray(data.solution.technicalPlan));
  assert.ok(Array.isArray(data.technical.details));
  assert.ok(data.progress.batches.every((batch) => batch.id && Array.isArray(batch.changeIds)));
  assert.ok(data.progress.batches.some((batch) => batch.changeIds.length === 0));
  assert.ok(data.changes.every((change) => change.id && change.path && Array.isArray(change.batchIds)));
  assert.doesNotMatch(template, /https?:\/\//);
  assert.doesNotMatch(template, /\b(?:fetch|XMLHttpRequest|localStorage)\b/);
  assert.doesNotMatch(template, /data\.progress\.stages/);
  assert.match(template, /@media \(max-width: 820px\)/);
});

test('任务看板 provider 与 capability contract 返回稳定结果证据', () => {
  const contract = read('package/targets/workspace/skills/contracts/buildr/task-board-maintenance/v1.md');
  assert.match(boardSkill, /`buildr\.task-board-maintenance\/v1` 的默认 provider/);
  for (const status of ['`created`', '`updated`', '`aligned`', '`blocked`']) {
    assert.ok(boardSkill.includes(status), `task-board must define ${status}`);
  }
  assert.match(contract, /id: buildr\.task-board-maintenance/);
  assert.match(contract, /允许 `changes` 与 batch `changeIds` 为空/);
  assert.match(packageManifest, /capability: buildr\.task-board-maintenance[\s\S]*?provider: task-board/);
});

test('任务看板从 runtime Skill 自身复制完整目录中的模板', () => {
  assert.match(boardSkill, /从当前 runtime Skill 目录复制 `assets\/task-board-template\.html`/);
  assert.match(boardSkill, /不重新手写模板/);
  assert.match(boardSkill, /不依赖 workspace 源目录/);
});

test('历史 task-cockpits 页面明确保持原路径和原内容', () => {
  assert.match(boardSkill, /既有 `task-cockpits\/` 页面保持原路径和原内容/);
  assert.match(boardSkill, /不移动、转换、覆盖或重写/);
  assert.match(boardSkill, /新任务只写入 `task-boards\/`/);
});

test('任务看板 guidance 简洁、按执行顺序组织且不重复契约章节', () => {
  for (const heading of [
    '## 1. 适用范围',
    '## 2. 输入与事实',
    '## 3. 定位与操作',
    '## 4. 内容模型',
    '## 5. 更新与验证',
    '## 6. 结果',
  ]) assert.ok(boardSkill.includes(heading), `task-board must include ${heading}`);
  assert.ok(boardSkill.split('\n').length <= 90, 'task-board guidance should stay compact');
  assert.doesNotMatch(boardSkill, /^## (?:检查|页面维护约束|面向用户的回复|Result Evidence)$/m);
});

test('任务看板 routing descriptions 一致且 identity/update 失败语义确定', () => {
  const packaged = YAML.parse(packageManifest).builtins.skills.find((item) => item.id === 'task-board');
  const workspace = YAML.parse(workspaceManifest).skills.find((item) => item.id === 'task-board');
  const frontmatterDescription = boardSkill.match(/^description: (.+)$/m)?.[1];
  assert.equal(packaged.description, workspace.description);
  assert.equal(workspace.description, frontmatterDescription);
  assert.match(frontmatterDescription, /简单任务不使用。$/);
  for (const required of [
    '完整文件名 `yyyy-MM-dd-<task-id>.html`',
    '内嵌 `meta.taskId`',
    '多个候选、identity 不一致或目标冲突均返回 `blocked`',
    '检查或写入失败时保留既有文件并返回 `blocked`',
    '候选与现有内容一致时返回 `aligned`',
  ]) assert.ok(boardSkill.includes(required), `task-board must include ${required}`);
});

test('package 只发布 task-board 并声明单一 task-cockpit predecessor', () => {
  assert.match(packageManifest, /- id: task-board[\s\S]*?replaces:\n\s+id: task-cockpit[\s\S]*?runtimePath: task-cockpit/);
  assert.doesNotMatch(packageManifest, /- id: task-cockpit\n\s+path: package\/targets/);
  assert.match(bootstrapContract, /  - task-board/);
  assert.doesNotMatch(bootstrapContract, /  - task-cockpit/);
  assert.match(productSkill, /任务看板.*`task-board` Skill/);
  assert.doesNotMatch(productSkill, /`task-cockpit` Skill/);
});
