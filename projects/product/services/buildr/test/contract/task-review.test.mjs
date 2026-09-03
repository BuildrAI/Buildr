import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/agent-assets/infrastructure/runtime/skills/manifests.ts';

const read = (relative) => fs.readFileSync(path.resolve(relative), 'utf8');

test('task-review contract/provider/binding 以一个能力支持两种参数化 Result', () => {
  const manifest = YAML.parse(read('resources/manifest.yml'));
  const contract = manifest.capabilityContracts.find((item) => item.id === 'buildr.task-review' && item.version === 2);
  assert.ok(contract);
  assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).id, 'buildr.task-review');
  assert.deepEqual(manifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-review'), { capability: 'buildr.task-review', version: 2, provider: 'task-review' });
  const provider = manifest.builtins.skills.find((item) => item.id === 'task-review');
  assert.equal(provider.required, false);
  assert.deepEqual(provider.provides, [{ capability: 'buildr.task-review', version: 2 }]);
  assert.equal(manifest.capabilityContracts.some((item) => /(?:planning|completion)[.-]review|task-review-(?:planning|completion)/i.test(item.id)), false);
});

test('task-review 从真实对象动态审查、真实记录method并用CAS防覆盖', () => {
  const skill = read('resources/workspace/skills/buildr/task-review/SKILL.md');
  for (const required of [
    '从真实工作现场取得本次对象',
    '动态审查',
    '同一 Agent 自审使用 `self`',
    '只有另一 Agent 完整执行才使用 `independent-agent`',
    '中断时不要调用 record',
    '--expected-current',
  ]) assert.ok(skill.includes(required), required);
  assert.match(skill, /完成结果可以是当前代码内容、Git commit\/tree、文件产物、部署结果或外部系统结果/);
  assert.match(skill, /直接使用当前对象或专业接口已返回的稳定身份/);
  assert.match(skill, /Application 不判断适用性/);
  assert.match(skill, /并发冲突时重新 inspect/);
  assert.doesNotMatch(skill, /buildr verification run|buildr task finish run|git commit|git push|revision:/);
});

test('Task Review 与纯复盘 Skill 职责独立且都不成为 Finish 依赖', () => {
  const manifest = YAML.parse(read('resources/manifest.yml'));
  const review = manifest.builtins.skills.find((item) => item.id === 'task-review');
  const retrospective = manifest.builtins.skills.find((item) => item.id === 'task-retrospective');
  const finish = manifest.builtins.skills.find((item) => item.id === 'task-finish');
  assert.deepEqual(review.provides, [{ capability: 'buildr.task-review', version: 2 }]);
  assert.deepEqual(retrospective.provides || [], []);
  assert.ok(retrospective.requires.some((item) => item.capability === 'buildr.task-record' && item.version === 3));
  assert.equal(manifest.builtins.skills.some((item) => item.id === 'task-development'), false);
  assert.equal(finish.requires.some((item) => item.capability === 'buildr.task-review'), false);
  assert.equal(finish.requires.some((item) => /retrospective|asset-review/.test(item.capability)), false);
  assert.match(read('resources/workspace/skills/buildr/task-review/SKILL.md'), /Task Retrospective/);
  assert.match(read('resources/workspace/skills/buildr/task-retrospective/SKILL.md'), /\.buildr\/local\/task-retrospectives/);
});

test('Task Review Application 是唯一 repository writer caller', () => {
  const sourceRoot = path.resolve('src');
  const callers = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/static-validation\.(?:mjs|ts)$/.test(file)) continue;
      else if (/\.(?:mjs|js|ts)$/.test(entry.name) && fs.readFileSync(file, 'utf8').includes('.writeTaskReviewResultPersistence(')) callers.push(path.relative(sourceRoot, file).split(path.sep).join('/'));
    }
  };
  visit(sourceRoot);
  assert.deepEqual(callers, ['task/application/task-review-application.ts']);
});
