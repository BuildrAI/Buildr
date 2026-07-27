import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const core = fs.readFileSync('package/targets/workspace/rules/buildr/core.md', 'utf8');

test('Core 统一约束面向用户的中英文术语表达', () => {
  assert.match(core, /面向用户说明产品设计、实现、问题、方案、进度或结果时，应使用直接、简练的中文/);
  assert.match(core, /已有正式或稳定中文名称的采用“中文（English Term）”，后续优先使用中文/);
  assert.match(core, /没有稳定中文译名的可保留英文，但首次出现时须说明含义/);
  assert.match(core, /同一描述范围内的术语译法必须保持一致/);
  assert.match(core, /命令、代码标识、字段名、接口名、文件路径、错误原文及其他必须与实现精确对应的内容保留英文/);
});

test('Core 不再保留被统一规则替代的旧表达', () => {
  assert.doesNotMatch(core, /术语使用必须一致：同一个描述块内/);
  assert.doesNotMatch(core, /面向用户说明问题、方案、进度或结果时，优先使用常用、直接和简练的语言/);
});
