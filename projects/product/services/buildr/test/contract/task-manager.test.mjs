import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/agent-assets/infrastructure/runtime/skills/manifests.mjs';

const target = path.resolve('resources/workspace');

test('task-manager contract/provider/binding 与 task-triage optional consumer 原子一致', () => {
  const manifest = YAML.parse(fs.readFileSync('resources/manifest.yml', 'utf8'));
  const contract = manifest.capabilityContracts.find((item) => item.id === 'buildr.task-record' && item.version === 2);
  assert.ok(contract); assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).id, 'buildr.task-record');
  assert.deepEqual(manifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-record'), { capability: 'buildr.task-record', version: 2, provider: 'task-manager' });
  const manager = manifest.builtins.skills.find((item) => item.id === 'task-manager'); assert.equal(manager.required, false); assert.deepEqual(manager.provides, [{ capability: 'buildr.task-record', version: 2 }]);
  const triage = manifest.builtins.skills.find((item) => item.id === 'task-triage'); assert.ok(triage.requires.some((item) => item.capability === 'buildr.task-record' && item.version === 2 && item.mode === 'optional'));
});

test('task-manager routing 正向命中正式记录，负向排除普通任务和专业阶段', () => {
  const manager = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-manager', 'SKILL.md'), 'utf8');
  const triage = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-triage', 'SKILL.md'), 'utf8');
  for (const positive of ['创建或查看待办/正式 Task Record', '按 Task ID 恢复', '首次持久交付写入前', 'create --status todo', 'task activate']) assert.ok(`${manager}\n${triage}`.includes(positive), positive);
  for (const negative of ['普通任务分流', '只读探索', 'Task Environment', 'Verification', 'Git', 'Finish']) assert.ok(manager.includes(negative), negative);
  assert.match(manager, /不要仅因用户说“任务”就触发/); assert.doesNotMatch(manager, /buildr worktree create|buildr verification run|buildr task finish run|git commit|git push/);
  assert.match(manager, /complete\|abandon.*任务复盘.*Token 数据仅在 Agent 可取得时记录.*用户明确同意后才路由 `task-retrospective`/s);
  assert.match(manager, /Task intent.*具名的 Workspace 相对 Markdown 链接.*不要只写裸路径.*链接可解析.*正文当前可读取/s);
  assert.match(triage, /Buildr Web 已创建时先 inspect/); assert.match(triage, /本次动作仅维护已有生命周期 metadata 时不递归创建新 Task/);
});

test('task-triage 从 Parent 规划项启动独立 Child 时不共享 Change 或 worktree', () => {
  const triage = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-triage', 'SKILL.md'), 'utf8');
  for (const required of [
    '从 Parent 规划项启动独立 Child Task',
    '初始不引用Parent Change',
    '`0..N` Change允许此时保持空列表',
    'Child execution root中创建该独立目标自己的窄Change',
    '刷新Development planning snapshot与适用Planning Review',
    '不得把Parent Change、Parent worktree、branch、Environment Receipt或Development事实复制或继承为Child authority',
    '延后Child Environment prepare',
    '最新`dev`',
  ]) assert.ok(triage.includes(required), required);
});

test('active Parent创建后默认交接并完整准备到Child前停止点', () => {
  const manager = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-manager', 'SKILL.md'), 'utf8');
  const development = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-development', 'SKILL.md'), 'utf8');
  const triage = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-triage', 'SKILL.md'), 'utf8');

  for (const required of [
    '创建 Parent Task',
    'active Task Record create或todo activate成功后',
    '不得把Task Record成功当作目标完成',
    '交接给`task-development`',
    '交接不进入Task Record Result',
    '不让本Skill调用Environment、Development或Review writer',
    '只创建todo、只写Task Record',
  ]) assert.ok(manager.includes(required), `task-manager must include ${required}`);

  for (const required of [
    '持续准备到可选择首个Child',
    '`buildr task next <parent-task-id>',
    'next为`prepare`时交给`task-environment`',
    'next为`begin`时使用返回的matching retained controller',
    '每次成功后立即重读`task next`',
    '直接按v2 schema执行`task parent record`',
    '`planning-review`交给`task-review`',
    '`refresh-parent-planning`调用公开`task parent refresh-planning`',
    '只有current next为`start-child-contribution`',
    'Parent已准备好，可以选择第一个Child',
    '不得自动选择或创建Child',
    '默认准备只在真实blocker处中断',
  ]) assert.ok(development.includes(required), `task-development must include ${required}`);

  for (const required of [
    '## 创建并默认准备 Parent Task',
    'todo或用户明确“只创建记录”仍只写Task Record',
    'active Parent Task Record创建成功不是Parent准备完成',
    '不得要求用户再次说“继续准备”',
    '不新增跨authority的`parent start`命令',
  ]) assert.ok(triage.includes(required), `task-triage must include ${required}`);

  assert.doesNotMatch(manager, /task environment prepare|__internal task-development|task review record|task parent record/);
});
