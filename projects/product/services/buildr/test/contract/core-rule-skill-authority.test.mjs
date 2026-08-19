import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const core = fs.readFileSync('package/targets/workspace/rules/buildr/core.md', 'utf8');
const staticValidation = fs.readFileSync('src/application/package-maintenance/static-validation.mjs', 'utf8');

test('Core 让 Rule 只声明 scope 边界和专业 owner', () => {
  assert.match(core, /`AGENTS\.md` 只能增加当前 scope 的这些内容/);
  assert.match(core, /Rule 不承担 Skill 路由、命令序列、生命周期、重跑\/恢复、报告模板或专业状态\/Result/);
  assert.match(core, /Skill description 发现用户意图/);
  assert.match(core, /capability binding 选择 provider/);
  assert.match(core, /Project declaration 声明能力、适用性和证明范围/);
  assert.match(core, /Rule 可以命名唯一 owner 和禁止绕过的不变量/);
  assert.match(core, /不得复制其流程或当前状态/);
  assert.match(core, /任务流程由 Skill 承载/);
  assert.doesNotMatch(core, /具体任务流程由对应 Skill、项目规则或服务规则承载/);
});

test('Core 不再把 Project 描述为 Skill source', () => {
  assert.match(core, /项目（Project） \| 业务、产品线、系统或长期工作单元；拥有 Project Rules、OpenSpec、capability\/applicability context 和 Service registry/);
  assert.doesNotMatch(core, /项目（Project） \|[^\n]*技能（Skills）/);
});

test('Core 精确区分结尾换行符、末尾空白行与正文空行', () => {
  assert.match(core, /最后一个非空字符后必须且只能保留一个换行符/);
  assert.ok(core.includes('正确：`...\\n`；错误：`...\\n\\n`'));
  assert.match(core, /该限制只针对文件末尾，不限制正文内部的合理空行/);
  assert.doesNotMatch(core, /文档默认不要写两个空白行/);
});

test('package static 不把 Product Rule 文案当作专业流程契约', () => {
  assert.doesNotMatch(staticValidation, /Product AGENTS\.md must include/);
  assert.doesNotMatch(staticValidation, /Buildr Core must include/);
  assert.doesNotMatch(staticValidation, /合并前候选验证使用临时 workspace/);
  assert.doesNotMatch(staticValidation, /继续等待同一进程，不重复启动相同命令/);
});
