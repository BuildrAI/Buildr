import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { resolveSkillCapabilityGraph } from '../../src/infrastructure/runtime/skills/capabilities.mjs';
import { parseCapabilityContract } from '../../src/infrastructure/runtime/skills/manifests.mjs';

const target = path.resolve('package/targets/workspace');
const read = (relative) => fs.readFileSync(path.resolve(relative), 'utf8');

test('task-review contract/provider/binding 以一个能力支持两种参数化 Result', () => {
  const manifest = YAML.parse(read('package/targets/workspace/skills/manifest.yml'));
  const contract = manifest.contracts.find((item) => item.id === 'buildr.task-review' && item.version === 1);
  assert.ok(contract);
  assert.equal(parseCapabilityContract(path.join(target, 'skills', contract.path), contract).id, 'buildr.task-review');
  assert.deepEqual(manifest.bindings.find((item) => item.capability === 'buildr.task-review'), { capability: 'buildr.task-review', version: 1, provider: 'task-review' });
  const provider = manifest.skills.find((item) => item.id === 'task-review');
  assert.equal(provider.enabled, true);
  assert.equal(provider.required, false);
  assert.equal(provider.state, 'installed');
  assert.deepEqual(provider.provides, [{ capability: 'buildr.task-review', version: 1 }]);
  assert.equal(manifest.contracts.some((item) => /(?:planning|completion)[.-]review|task-review-(?:planning|completion)/i.test(item.id)), false);
  const graph = resolveSkillCapabilityGraph(target, null, { runtime: 'codex' });
  assert.deepEqual(graph.bindings.find((item) => item.capability === 'buildr.task-review'), {
    capability: 'buildr.task-review', version: 1, provider: 'task-review', scope: '.', manifestPath: 'skills/manifest.yml', context: 'workspace-default',
  });
  assert.deepEqual(graph.skills.find((item) => item.id === 'task-review').provides, [{ capability: 'buildr.task-review', version: 1 }]);
});

test('task-review 动态审查范围、真实 method，并在中断时不写 Result', () => {
  const skill = read('package/targets/workspace/skills/buildr/task-review/SKILL.md');
  for (const required of [
    'Planning Review 或 Completion Review',
    '动态执行语义审查',
    '同一 Agent 自审使用 `self`',
    '实际独立 Agent 完整执行',
    '没有明确 Candidate identity 就停止',
    '中断时不要调用 record',
    '不生成总 receipt',
  ]) assert.ok(skill.includes(required), required);
  assert.match(skill, /不要把 OpenSpec artifacts、代码目录、测试命令或 checklist 固定为每个 Task 的必选范围/);
  assert.doesNotMatch(skill, /buildr verification run|buildr task finish run|git commit|git push|revision:/);
});

test('Task Review 与资产审查 authority 独立，Task Finish 依赖保持不变', () => {
  const manifest = YAML.parse(read('package/manifest.yml'));
  const review = manifest.builtins.skills.find((item) => item.id === 'task-review');
  const assetReview = manifest.builtins.skills.find((item) => item.id === 'task-asset-review');
  const finish = manifest.builtins.skills.find((item) => item.id === 'task-finish');
  assert.deepEqual(review.provides, [{ capability: 'buildr.task-review', version: 1 }]);
  assert.deepEqual(assetReview.provides, [{ capability: 'buildr.task-asset-review', version: 3 }]);
  assert.equal(finish.requires.some((item) => item.capability === 'buildr.task-review'), false);
  assert.equal(finish.requires.some((item) => item.capability === 'buildr.task-asset-review' && item.version === 3 && item.mode === 'optional'), true);
  assert.match(read('package/targets/workspace/skills/buildr/task-review/SKILL.md'), /不取代 `task-asset-review`/);
  assert.match(read('package/targets/workspace/skills/buildr/task-asset-review/SKILL.md'), /buildr\.task-asset-review\/v3/);
});

test('Task Review Application 是唯一 repository writer caller', () => {
  const sourceRoot = path.resolve('src');
  const callers = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('static-validation.mjs')) continue;
      else if (/\.(?:mjs|js)$/.test(entry.name) && fs.readFileSync(file, 'utf8').includes('.writeTaskReviewResultPersistence(')) callers.push(path.relative(sourceRoot, file).split(path.sep).join('/'));
    }
  };
  visit(sourceRoot);
  assert.deepEqual(callers, ['application/task-review/task-review-application.mjs']);
});
