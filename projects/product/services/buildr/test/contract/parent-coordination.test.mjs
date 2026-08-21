import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Parent Coordination使用固定查询的只读projection且没有filesystem scan或第二store', () => {
  const application = read('src/application/parent-coordination/parent-coordination-application.mjs');
  const repository = read('src/infrastructure/sqlite/parent-coordination-repository.mjs');
  for (const required of ['readParentCoordinationPersistence', 'projectParentCoordinationChild']) assert.ok(application.includes(required), required);
  for (const forbidden of ['inspectTaskRecord', 'inspectTaskReview', 'inspectTaskTerminalDelivery', 'resolveTaskEnvironmentExecution']) assert.equal(application.includes(forbidden), false, forbidden);
  for (const forbidden of ['node:fs', 'node:path', 'openWorkspaceStructuredStore', 'task_development_current', 'SELECT ', 'readdir', 'glob']) assert.equal(application.includes(forbidden), false, forbidden);
  for (const required of ['openWorkspaceStructuredStore', 'task_development_current', 'task_review_current', 'task_environment_current', 'task_finish_current', 'decodeTaskFinishCurrentRow', 'queryCount: 2']) assert.ok(repository.includes(required), required);
  for (const forbidden of ['INSERT ', 'UPDATE ', 'DELETE ', 'CREATE TABLE', 'CREATE VIEW']) assert.equal(repository.includes(forbidden), false, forbidden);
  assert.equal(fs.existsSync(path.join(root, 'src/infrastructure/sqlite/parent-coordination-repository.mjs')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/infrastructure/filesystem/parent-coordination-repository.mjs')), false);
});

test('Parent Plan是closed计划值且Task Record不复制计划或Child状态', () => {
  const domain = read('src/domain/parent-coordination/parent-coordination.mjs');
  const taskRecord = read('src/task/domain/record/task-record.mjs');
  for (const required of ['outcome', 'architectureDecisions', 'contributions', 'expectedChild', 'dependencies', 'finalAcceptance']) assert.ok(domain.includes(required), required);
  for (const forbidden of ['completedChildCount', 'completed_child_count', 'childStatuses', 'lifecycleCache']) {
    assert.equal(domain.includes(forbidden), false, forbidden);
    assert.equal(taskRecord.includes(forbidden), false, forbidden);
  }
  for (const forbidden of ['parentPlan', 'plannedContributions', 'contributionHandoff', 'parentAcceptance']) assert.equal(taskRecord.includes(forbidden), false, forbidden);
});

test('CLI、Buildr Web与Agent共用Parent Coordination Application和单一public JSON identity', () => {
  const registry = read('src/bootstrap/cli/registry.mjs');
  const cli = read('src/interfaces/cli/parent-coordination.mjs');
  const server = read('src/interfaces/local-app/http/server.mjs');
  const worker = read('src/interfaces/local-app/http/read-worker.mjs');
  const json = read('src/application/json-contracts.mjs');
  const skill = read('package/targets/workspace/skills/buildr/task-development/SKILL.md');
  for (const command of ['task parent inspect', 'task parent record', 'task parent refresh-planning', 'task parent bind-child', 'task parent reconcile', 'task parent accept']) assert.ok(registry.includes(command), command);
  for (const method of ['inspectParentCoordination', 'refreshParentPlanning', 'recordParentPlan', 'reconcileParentPlan', 'bindChildContributions', 'acceptParentCoordination']) assert.ok(cli.includes(method) || server.includes(method), method);
  for (const flag of ['--schema', '--example']) assert.ok(cli.includes(flag), flag);
  assert.match(worker, /coordination:\s*'inspectParentCoordination'/);
  assert.match(json, /buildr\.parent-coordination-result\/v3/);
  for (const phrase of ['Parent Plan', 'Contribution Handoff', 'task parent bind-child', '不自动完成Parent']) assert.ok(skill.includes(phrase), phrase);
  for (const phrase of [
    'Parent Plan JSON只是`task parent record|reconcile --input`的一次性CLI输入',
    '操作系统临时目录',
    '不得写入Workspace的`.buildr/local/`、`.buildr/tmp/`、`.buildr/transient/`',
    '`record`或`reconcile`成功后必须立即删除',
    'Application保存的current Parent Plan才是authority',
    '不扫描或删除调用方临时输入',
  ]) assert.ok(skill.includes(phrase), `task-development must govern temporary Parent Plan input lifecycle: ${phrase}`);
});

test('模型不恢复lifecycle/progress/event/history authority且没有历史Task专用逻辑', () => {
  const sources = [
    read('src/domain/parent-coordination/parent-coordination.mjs'),
    read('src/application/parent-coordination/parent-coordination-application.mjs'),
    read('src/application/task-development/task-development-application.mjs'),
  ].join('\n');
  for (const forbidden of ['task_lifecycle_current', 'completed_child_count', 'parent_progress', 'coordination_events', 'coordination_history', 'delivery_registry', 'govern-task-intermediate-artifacts']) assert.equal(sources.includes(forbidden), false, forbidden);
  const migrations = fs.readdirSync(path.join(root, 'src/infrastructure/sqlite/migrations')).sort();
  const migrationSources = migrations.map((name) => `${name}\n${read(`src/infrastructure/sqlite/migrations/${name}`)}`).join('\n');
  for (const forbidden of ['parent_coordination', 'parent_plan', 'parent_progress', 'coordination_events', 'coordination_history', 'delivery_registry']) {
    assert.equal(migrationSources.includes(forbidden), false, forbidden);
  }
});

test('OpenSpec guard声明一个具体规范变化只有一个active Change owner', () => {
  const guard = read('package/targets/workspace/skills/buildr/openspec-contract-guard/SKILL.md');
  for (const phrase of ['同一个具体规范变化', '一个active Change', 'Parent Plan不是delta Change', '不能复制Child Change']) assert.ok(guard.includes(phrase), phrase);
});
