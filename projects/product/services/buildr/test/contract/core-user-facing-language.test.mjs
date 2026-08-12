import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const core = fs.readFileSync('package/targets/workspace/rules/buildr/core.md', 'utf8');

test('Core 统一约束面向用户的中英文术语表达', () => {
  assert.match(core, /面向用户使用直接、简练的中文/);
  assert.match(core, /专业术语使用中文或“中文（English Term）”/);
  assert.match(core, /无稳定译名时使用“中文释义（English Term）”/);
  assert.match(core, /命令、标识、路径、错误原文和产品名可保留英文/);
});

test('Core 不再保留被统一规则替代的旧表达', () => {
  assert.doesNotMatch(core, /术语使用必须一致：同一个描述块内/);
  assert.doesNotMatch(core, /面向用户说明问题、方案、进度或结果时，优先使用常用、直接和简练的语言/);
  assert.doesNotMatch(core, /必要的专业术语首次出现时/);
  assert.doesNotMatch(core, /没有稳定中文译名的可保留英文/);
});
