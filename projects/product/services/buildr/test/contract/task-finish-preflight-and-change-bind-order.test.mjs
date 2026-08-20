import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const finishSkill = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const developmentSkill = read('package/targets/workspace/skills/buildr/task-development/SKILL.md');
const proposeSidebar = read('package/targets/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md');

test('Task Finish Skill 在选择交付路径前轻量确认身份与安全边界', () => {
  assert.ok(finishSkill.length >= 1500 && finishSkill.length <= 6000);
  assert.ok(finishSkill.split('\n').length >= 30 && finishSkill.split('\n').length <= 110);
  for (const required of [
    'Task ID、canonical Workspace、current Development handoff',
    '实际 repository 集合',
    'remote identity',
    'Task Contribution',
    '需要 force push、覆盖他人提交、改写共享历史',
    '由 Agent 选择路径',
    'Buildr 自动 Finish',
    'Agent 直接交付',
  ]) assert.ok(finishSkill.includes(required), required);
  const preflightIndex = finishSkill.indexOf('## 交付前');
  const choiceIndex = finishSkill.indexOf('## 由 Agent 选择路径');
  assert.ok(preflightIndex > 0 && choiceIndex > preflightIndex, 'identity and safety checks must precede path selection');
  assert.doesNotMatch(finishSkill, /--agent cursor|--agent codex/);
});

test('OpenSpec 侧栏固定脚手架、绑定、begin、文档顺序并禁止空列表 begin 后再绑定', () => {
  for (const required of [
    'openspec new change',
    'task update --add-change',
    'buildr.task-development/v2',
    'begin',
    '不得在脚手架不存在时`add-change`',
    '也不得对空变更列表`begin`后再绑定即将写入的变更',
    '无变更的code-only任务仍可在首个实现前`begin`空列表',
    '必须重新`begin`或`planning`',
    '__internal task-planning-identity inspect',
  ]) assert.ok(proposeSidebar.includes(required), required);
  const scaffoldIndex = proposeSidebar.indexOf('openspec new change');
  const bindIndex = proposeSidebar.indexOf('task update --add-change');
  const beginIndex = proposeSidebar.indexOf('再调用selected`buildr.task-development/v2`provider的`begin`');
  const artifactsIndex = proposeSidebar.indexOf('最后才写入proposal/design/specs/tasks');
  assert.ok(scaffoldIndex > 0 && bindIndex > scaffoldIndex && beginIndex > bindIndex && artifactsIndex > beginIndex);
  assert.doesNotMatch(proposeSidebar, /写入首个Change artifact前/);
  assert.doesNotMatch(proposeSidebar, /写文档前先 begin/);
});

test('Task Development 有 OpenSpec 变更时先 add-change 再 begin', () => {
  assert.match(developmentSkill, /必须先有可解析脚手架并完成`add-change`再`begin`/);
  assert.match(developmentSkill, /不得先对空变更列表`begin`再绑定同一变更/);
  assert.match(developmentSkill, /无变更的任务仍在首个实现前`begin`空列表/);
});
