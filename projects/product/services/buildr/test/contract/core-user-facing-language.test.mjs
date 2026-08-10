import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const core = fs.readFileSync('package/targets/workspace/rules/buildr/core.md', 'utf8');

test('Core 统一约束面向用户的中英文术语表达', () => {
  assert.match(core, /面向用户说明或回复时，应使用直接、简练、易于理解的表达/);
  assert.match(core, /专业术语可以使用中文，也可以使用中英文并列/);
  assert.match(core, /凡使用英文专业术语，必须同时提供对应的中文名称或中文含义/);
  assert.match(core, /采用“中文（English Term）”形式，不得单独使用英文专业术语/);
  assert.match(core, /没有稳定中文译名时，应提供准确的中文释义，并在括号内保留英文原词/);
  assert.match(core, /同一描述范围内的中文名称或中文释义必须保持一致/);
  assert.match(core, /命令、代码标识、字段名、接口名、文件路径、错误原文和产品专名等必须精确对应原文的内容可以保留英文/);
  assert.match(core, /将其作为专业概念向用户说明时，仍须补充中文说明/);
});

test('Core 不再保留被统一规则替代的旧表达', () => {
  assert.doesNotMatch(core, /术语使用必须一致：同一个描述块内/);
  assert.doesNotMatch(core, /面向用户说明问题、方案、进度或结果时，优先使用常用、直接和简练的语言/);
  assert.doesNotMatch(core, /必要的专业术语首次出现时/);
  assert.doesNotMatch(core, /没有稳定中文译名的可保留英文/);
});
