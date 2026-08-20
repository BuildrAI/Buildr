import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const core = fs.readFileSync('package/targets/workspace/rules/buildr/core.md', 'utf8');
const staticValidation = fs.readFileSync('src/application/package-maintenance/static-validation.mjs', 'utf8');

test('Core 让 Rule 只声明 scope 边界和专业 owner', () => {
  assert.match(core, /`AGENTS\.md` 只能增加当前作用域的这些内容/);
  assert.match(core, /规则不承担技能路由、命令序列、生命周期、恢复或专业状态/);
  assert.match(core, /技能说明（Skill description）发现用户意图/);
  assert.match(core, /能力绑定（capability binding）选择提供者（provider）/);
  assert.match(core, /项目声明（Project declaration）说明适用性与证明范围/);
  assert.match(core, /规则可以命名唯一责任主体（owner）和禁止绕过的不变量/);
  assert.match(core, /不得复制流程或当前状态/);
  assert.match(core, /任务流程由技能承载/);
  assert.doesNotMatch(core, /具体任务流程由对应 Skill、项目规则或服务规则承载/);
});

test('Core 不再把 Project 描述为 Skill source', () => {
  assert.match(core, /项目表示业务、产品线、系统或长期工作单元/);
  assert.doesNotMatch(core, /Project[^\n]*Skill source/);
});

test('Core 只保留 Buildr 产品与 workspace 边界', () => {
  assert.match(core, /Buildr 应该约束智能体（Agent）不要做错事，而不是要求智能体必须通过 Buildr 才能做事/);
  assert.match(core, /内部登记、派生证据或自动化信心不足，不得否定可从权威来源验证的事实/);
  assert.doesNotMatch(core, /面向用户使用直接、简练的中文/);
  assert.doesNotMatch(core, /Git 提交信息的主题和正文/);
  assert.doesNotMatch(core, /最后一个非空字符后必须且只能保留一个换行符/);
  assert.doesNotMatch(core, /已有 `practices\/`/);
  assert.doesNotMatch(core, /workspace transition check/);
  assert.doesNotMatch(core, /## 源资产位置/);
  assert.doesNotMatch(core, /components\/manifest\.yml|commands\/manifest\.yml/);
  assert.doesNotMatch(core, /Buildr 不保存 context window/);
});

test('package static 不把 Product Rule 文案当作专业流程契约', () => {
  assert.doesNotMatch(staticValidation, /Product AGENTS\.md must include/);
  assert.doesNotMatch(staticValidation, /Buildr Core must include/);
  assert.doesNotMatch(staticValidation, /合并前候选验证使用临时 workspace/);
  assert.doesNotMatch(staticValidation, /继续等待同一进程，不重复启动相同命令/);
});
