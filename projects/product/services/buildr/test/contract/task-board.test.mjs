import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');
const boardSkill = read('package/targets/workspace/skills/buildr/task-board/SKILL.md');
const triageSkill = read('package/targets/workspace/skills/buildr/task-triage/SKILL.md');
const template = read('package/targets/workspace/skills/buildr/task-board/assets/task-board-template.html');
const openaiMetadata = read('package/targets/workspace/skills/buildr/task-board/agents/openai.yaml');
const packageManifest = read('package/manifest.yml');
const bootstrapContract = read('package/bootstrap/contract.yml');
const productSkill = read('package/targets/runtime/skills/buildr/SKILL.md');

function parseBoardData(html) {
  const match = html.match(/<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'template must contain board-data JSON');
  return JSON.parse(match[1]);
}

test('任务看板是当前 artifact，旧称只保留用户意图路由', () => {
  assert.match(boardSkill, /“任务驾驶舱”只作为旧用户意图继续路由/);
  assert.match(boardSkill, /OpenSpec changes 是 `0\.\.N` 个可选真实关联/);
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
  assert.match(boardSkill, /status: created \| updated \| aligned \| blocked/);
  assert.match(contract, /id: buildr\.task-board-maintenance/);
  assert.match(contract, /允许 `changes` 与 batch `changeIds` 为空/);
  assert.match(packageManifest, /capability: buildr\.task-board-maintenance[\s\S]*?provider: task-board/);
});

test('任务看板从 runtime Skill 自身复制完整目录中的模板', () => {
  assert.match(boardSkill, /当前 runtime `SKILL\.md` 所在目录为基准/);
  assert.match(boardSkill, /相对路径 `assets\/task-board-template\.html`/);
  assert.match(boardSkill, /完整目录投射是 Buildr runtime contract/);
  assert.match(boardSkill, /不要.*依赖 `agents\/openai\.yaml` 定位资源/);
  assert.doesNotMatch(boardSkill, /不要依赖 runtime 投射目录一定包含随附模板/);
});

test('历史 task-cockpits 页面明确保持原路径和原内容', () => {
  assert.match(boardSkill, /既有 `task-cockpits\/` 页面保持原路径和原内容/);
  assert.match(boardSkill, /不得移动、转换、覆盖或重写这些历史 HTML/);
  assert.match(boardSkill, /新任务只在 `task-boards\/` 下创建页面/);
});

test('package 只发布 task-board 并声明单一 task-cockpit predecessor', () => {
  assert.match(packageManifest, /- id: task-board[\s\S]*?replaces:\n\s+id: task-cockpit[\s\S]*?runtimePath: task-cockpit/);
  assert.doesNotMatch(packageManifest, /- id: task-cockpit\n\s+path: package\/targets/);
  assert.match(bootstrapContract, /  - task-board/);
  assert.doesNotMatch(bootstrapContract, /  - task-cockpit/);
  assert.match(productSkill, /任务看板.*`task-board` Skill/);
  assert.doesNotMatch(productSkill, /`task-cockpit` Skill/);
});
