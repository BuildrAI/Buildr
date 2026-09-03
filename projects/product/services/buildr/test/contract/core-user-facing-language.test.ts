import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const core: any = fs.readFileSync('resources/workspace/AGENTS.md', 'utf8');

test('Core 保留人和智能体的基本术语对齐规则并自洽使用', () => {
  assert.match(core, /人和智能体使用一致术语/);
  assert.match(core, /专业术语每次出现都必须使用“中文（English Term）”/);
  assert.match(core, /无稳定中文译名时使用“中文释义（English Term）”/);
  assert.match(core, /不得单独使用中文或英文专业术语/);
  for (const aligned of ['工作空间（Workspace）', '智能体（Agent）', '规则（Rule）', '技能正文（Skill body）', '工作流（Workflow）', '智能体运行时（Agent runtime）']) assert.ok(core.includes(aligned), aligned);
  assert.doesNotMatch(core, /Buildr 不保存 context window|## Rule 边界|## Workspace 模型|## Workspace 硬边界/);
});
