import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');
const readService = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');

const buildr = readService('package/targets/runtime/skills/buildr/SKILL.md');
const triage = readService('resources/workspace/skills/buildr/task-triage/SKILL.md');
const selfBootstrap = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr-self-bootstrap-sync/SKILL.md'), 'utf8');

test('协作者 tree transition 无 matching Finish 时排他路由普通 Workspace update', () => {
  for (const required of [
    '协作者提交使canonical checkout前进',
    '固定归类为普通Workspace update',
    '本地没有协作者Task是正常事实',
    '不得从commit author、Task缺失、HEAD、dirty tree或Doctor runtime drift反推本地Finish',
    '`buildr sync <agent> --target <workspace-root>`',
    '最终Doctor',
  ]) assert.ok(buildr.includes(required), `Buildr Skill must include: ${required}`);

  for (const required of [
    '只能把它归类为普通Workspace update',
    '本地没有协作者Task是正常事实',
    '不得因此查找、恢复或启动`buildr-self-bootstrap-sync`',
    '只有真实matching Finish Result才能把同一run交给self-bootstrap',
  ]) assert.ok(triage.includes(required), `task-triage must include: ${required}`);
});

test('self-bootstrap 只接受 matching Delivery Result 并在普通 Workspace update 前保持零副作用', () => {
  assert.match(selfBootstrap, /description: Buildr自举Workspace取得matching Task delivery result/);
  for (const required of [
    '返回`not-applicable`',
    '不反推Task或Activation',
    '按普通Workspace update处理',
    'matching `buildr.task-finish-self-bootstrap-input/v1`稳定投影',
    'reconciliation形成的Delivery可以没有Delivery Carrier',
    '历史遗留的`doctor-blocked` current run仍可兼容恢复',
  ]) assert.ok(selfBootstrap.includes(required), `self-bootstrap Skill must include: ${required}`);
});

test('workspace sync 不掩盖非 sync blocker，也不生成 Task 或 Finish authority', () => {
  assert.match(buildr, /Doctor包含CLI、Component、Command、Git或其他非sync blocker时，不能把一次sync宣称为完整修复/);
  assert.match(triage, /存在非sync blocker时按对应authority停止或处理，不用一次sync掩盖/);
  for (const authority of ['Task', 'Environment', 'Verification', 'Candidate', 'Finish Result', 'self-bootstrap evidence']) {
    assert.ok(buildr.includes(authority), `Buildr Skill must exclude ${authority}`);
  }
});
