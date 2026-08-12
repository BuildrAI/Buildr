import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/infrastructure/runtime/skills/manifests.mjs';
import { resolveSkillCapabilityGraph } from '../../src/infrastructure/runtime/skills/capabilities.mjs';

const target = path.resolve('package/targets/workspace');

test('task-manager contract/provider/binding 与 task-triage optional consumer 原子一致', () => {
  const manifest = YAML.parse(fs.readFileSync(path.join(target, 'skills', 'manifest.yml'), 'utf8'));
  const contract = manifest.contracts.find((item) => item.id === 'buildr.task-record' && item.version === 2);
  assert.ok(contract); assert.equal(parseCapabilityContract(path.join(target, 'skills', contract.path), contract).id, 'buildr.task-record');
  assert.deepEqual(manifest.bindings.find((item) => item.capability === 'buildr.task-record'), { capability: 'buildr.task-record', version: 2, provider: 'task-manager' });
  const manager = manifest.skills.find((item) => item.id === 'task-manager'); assert.equal(manager.enabled, true); assert.equal(manager.state, 'installed'); assert.equal(manager.required, false); assert.deepEqual(manager.provides, [{ capability: 'buildr.task-record', version: 2 }]);
  const triage = manifest.skills.find((item) => item.id === 'task-triage'); assert.ok(triage.requires.some((item) => item.capability === 'buildr.task-record' && item.version === 2 && item.mode === 'optional'));
  const graph = resolveSkillCapabilityGraph(target, null, { runtime: 'codex' });
  const dependency = graph.consumers.find((item) => item.consumer === 'task-triage').dependencies.find((item) => item.capability === 'buildr.task-record');
  assert.equal(dependency.selectedProvider.id, 'task-manager'); assert.equal(dependency.readiness, 'ready');
});

test('task-manager routing 正向命中正式记录，负向排除普通任务和专业阶段', () => {
  const manager = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-manager', 'SKILL.md'), 'utf8');
  const triage = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-triage', 'SKILL.md'), 'utf8');
  for (const positive of ['创建或查看待办/正式 Task Record', '按 Task ID 恢复', '首次持久交付写入前', 'create --status todo', 'task activate']) assert.ok(`${manager}\n${triage}`.includes(positive), positive);
  for (const negative of ['普通任务分流', '只读探索', 'Task Environment', 'Verification', 'Git', 'Finish']) assert.ok(manager.includes(negative), negative);
  assert.match(manager, /不要仅因用户说“任务”就触发/); assert.doesNotMatch(manager, /buildr worktree create|buildr verification run|buildr task finish run|git commit|git push/);
  assert.match(manager, /complete\|abandon.*任务复盘.*Token 数据仅在 Agent 可取得时记录.*用户明确同意后才路由 `task-retrospective`/s);
  assert.match(triage, /Local App 已创建时先 inspect/); assert.match(triage, /本次动作仅维护已有生命周期 metadata 时不递归创建新 Task/);
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
