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
  const contract = manifest.contracts.find((item) => item.id === 'buildr.task-record' && item.version === 1);
  assert.ok(contract); assert.equal(parseCapabilityContract(path.join(target, 'skills', contract.path), contract).id, 'buildr.task-record');
  assert.deepEqual(manifest.bindings.find((item) => item.capability === 'buildr.task-record'), { capability: 'buildr.task-record', version: 1, provider: 'task-manager' });
  const manager = manifest.skills.find((item) => item.id === 'task-manager'); assert.equal(manager.enabled, true); assert.equal(manager.state, 'installed'); assert.equal(manager.required, false); assert.deepEqual(manager.provides, [{ capability: 'buildr.task-record', version: 1 }]);
  const triage = manifest.skills.find((item) => item.id === 'task-triage'); assert.ok(triage.requires.some((item) => item.capability === 'buildr.task-record' && item.version === 1 && item.mode === 'optional'));
  const graph = resolveSkillCapabilityGraph(target, null, { runtime: 'codex' });
  const dependency = graph.consumers.find((item) => item.consumer === 'task-triage').dependencies.find((item) => item.capability === 'buildr.task-record');
  assert.equal(dependency.selectedProvider.id, 'task-manager'); assert.equal(dependency.readiness, 'ready');
});

test('task-manager routing 正向命中正式记录，负向排除普通任务和专业阶段', () => {
  const manager = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-manager', 'SKILL.md'), 'utf8');
  const triage = fs.readFileSync(path.join(target, 'skills', 'buildr', 'task-triage', 'SKILL.md'), 'utf8');
  for (const positive of ['创建、查看、更新、设置 Parent、完成或放弃正式 Task Record', '按 Task ID 恢复', '首次持久交付写入前']) assert.ok(`${manager}\n${triage}`.includes(positive), positive);
  for (const negative of ['普通任务分流', '只读探索', 'Task Environment', 'Verification', 'Git', 'Finish']) assert.ok(manager.includes(negative), negative);
  assert.match(manager, /不要仅因用户说“任务”就触发/); assert.doesNotMatch(manager, /buildr worktree create|buildr verification run|buildr task finish run|git commit|git push/);
  assert.match(manager, /complete\|abandon.*任务复盘.*Token 数据仅在 Agent 可取得时记录.*用户明确同意后才路由 `task-retrospective`/s);
  assert.match(triage, /Local App 已创建时先 inspect/); assert.match(triage, /本次动作仅维护已有生命周期 metadata 时不递归创建新 Task/);
});
