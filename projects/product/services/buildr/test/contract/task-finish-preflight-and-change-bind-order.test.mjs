import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const finishSkill = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const developmentSkill = read('package/targets/workspace/skills/buildr/task-development/SKILL.md');
const proposeSidebar = read('package/targets/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md');

test('Task Finish Skill 在调用产品前轻量确认贡献已提交且主工作区已对齐', () => {
  assert.ok(finishSkill.length >= 1500 && finishSkill.length <= 6000);
  assert.ok(finishSkill.split('\n').length >= 30 && finishSkill.split('\n').length <= 90);
  for (const required of [
    '任务分支贡献已提交',
    '本机主工作区已对齐目标远端',
    '不得做成新的入口缺口码',
    '不要在调用产品前自行链式做 Environment → handoff → target/remote 的 fail-fast',
    '若返回 `task_finish.entry_gaps`',
    '`development` / `environment` / `delivery` 完整转述',
    '不得只报第一项',
    'Environment adapter',
  ]) assert.ok(finishSkill.includes(required), required);
  assert.match(finishSkill, /`--agent`省略或等于 Environment adapter/);
  assert.doesNotMatch(finishSkill, /--agent cursor|--agent codex/);
  const preflightIndex = finishSkill.indexOf('任务分支贡献已提交');
  const runIndex = finishSkill.indexOf('直接启动 canonical `buildr task finish run`');
  assert.ok(preflightIndex > 0 && runIndex > preflightIndex, 'alignment reminder must precede task finish run');
  assert.match(finishSkill, /不得做成新的入口缺口码[\s\S]*task_finish\.entry_gaps/s);
  assert.doesNotMatch(finishSkill, /task_finish\.entry_gaps.*脏工作区|新增.*entry_gaps/s);
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
    'task-planning-identity-driver.mjs inspect',
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
