import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/infrastructure/runtime/skills/manifests.mjs';

const read = (relative) => fs.readFileSync(path.resolve(relative), 'utf8');

test('task-review contract/provider/binding 以一个能力支持两种参数化 Result', () => {
  const manifest = YAML.parse(read('resources/manifest.yml'));
  const contract = manifest.capabilityContracts.find((item) => item.id === 'buildr.task-review' && item.version === 1);
  assert.ok(contract);
  assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).id, 'buildr.task-review');
  assert.deepEqual(manifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-review'), { capability: 'buildr.task-review', version: 1, provider: 'task-review' });
  const provider = manifest.builtins.skills.find((item) => item.id === 'task-review');
  assert.equal(provider.required, false);
  assert.deepEqual(provider.provides, [{ capability: 'buildr.task-review', version: 1 }]);
  assert.equal(manifest.capabilityContracts.some((item) => /(?:planning|completion)[.-]review|task-review-(?:planning|completion)/i.test(item.id)), false);
});

test('task-review 动态审查范围、真实 method，并在中断时不写 Result', () => {
  const skill = read('resources/workspace/skills/buildr/task-review/SKILL.md');
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
  assert.match(skill, /current planning nodes包含OpenSpec Change `tasks\.md`/);
  assert.match(skill, /逐项语义判断checkbox能否在Change convergence\/archive前完成/);
  assert.match(skill, /把实际checklist写入`reviewed`.*无法审查时写入`uncovered`/);
  assert.match(skill, /必须形成精确finding并返回`changes-required`/);
  assert.match(skill, /不得用关键词匹配代替语义判断/);
  assert.match(skill, /同名产品能力.*Change-owned action仍可合法保留/);
  assert.doesNotMatch(skill, /buildr verification run|buildr task finish run|git commit|git push|revision:/);
});

test('Task Review 与 Task Retrospective authority 独立且都不成为 Finish 依赖', () => {
  const manifest = YAML.parse(read('resources/manifest.yml'));
  const review = manifest.builtins.skills.find((item) => item.id === 'task-review');
  const retrospective = manifest.builtins.skills.find((item) => item.id === 'task-retrospective');
  const development = manifest.builtins.skills.find((item) => item.id === 'task-development');
  const finish = manifest.builtins.skills.find((item) => item.id === 'task-finish');
  assert.deepEqual(review.provides, [{ capability: 'buildr.task-review', version: 1 }]);
  assert.deepEqual(retrospective.provides, [{ capability: 'buildr.task-retrospective', version: 2 }]);
  assert.equal(development.requires.some((item) => item.capability === 'buildr.task-review' && item.version === 1 && item.mode === 'required'), true);
  assert.equal(development.requires.some((item) => /retrospective|asset-review/.test(item.capability)), false);
  assert.equal(finish.requires.some((item) => item.capability === 'buildr.task-review'), false);
  assert.equal(finish.requires.some((item) => /retrospective|asset-review/.test(item.capability)), false);
  assert.match(read('resources/workspace/skills/buildr/task-review/SKILL.md'), /Task Retrospective/);
  assert.match(read('resources/workspace/skills/buildr/task-retrospective/SKILL.md'), /buildr\.task-retrospective\/v2/);
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
