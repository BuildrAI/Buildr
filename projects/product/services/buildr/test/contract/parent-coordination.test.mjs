import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Parent Coordination只组合专业Applications且没有repository、filesystem scan或第二store', () => {
  const application = read('src/application/parent-coordination/parent-coordination-application.mjs');
  for (const required of ['inspectTaskRecord', 'inspectTaskDevelopment', 'inspectTaskReview', 'inspectTaskTerminalDelivery']) assert.ok(application.includes(required), required);
  for (const forbidden of ['node:fs', 'node:path', 'openWorkspaceStructuredStore', 'task_development_current', 'SELECT ', 'sqlite', 'readdir', 'glob']) assert.equal(application.includes(forbidden), false, forbidden);
  assert.equal(fs.existsSync(path.join(root, 'src/infrastructure/sqlite/parent-coordination-repository.mjs')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/infrastructure/filesystem/parent-coordination-repository.mjs')), false);
});

test('Parent Plan是closed计划值且Task Record不复制计划或Child状态', () => {
  const domain = read('src/domain/parent-coordination/parent-coordination.mjs');
  const taskRecord = read('src/domain/task-record/task-record.mjs');
  for (const required of ['outcome', 'architectureInvariants', 'contributions', 'dependencies', 'finalAcceptance']) assert.ok(domain.includes(required), required);
  for (const forbidden of ['completedChildCount', 'completed_child_count', 'childStatuses', 'lifecycleCache']) {
    assert.equal(domain.includes(forbidden), false, forbidden);
    assert.equal(taskRecord.includes(forbidden), false, forbidden);
  }
  for (const forbidden of ['parentPlan', 'plannedContributions', 'contributionHandoff', 'parentAcceptance']) assert.equal(taskRecord.includes(forbidden), false, forbidden);
});

test('CLI、Local App与Agent共用Parent Coordination Application和单一public JSON identity', () => {
  const registry = read('src/interfaces/cli/registry.mjs');
  const cli = read('src/interfaces/cli/parent-coordination.mjs');
  const server = read('src/interfaces/local-app/http/server.mjs');
  const worker = read('src/interfaces/local-app/http/read-worker.mjs');
  const json = read('src/application/json-contracts.mjs');
  const skill = read('package/targets/workspace/skills/buildr/task-development/SKILL.md');
  for (const command of ['task parent inspect', 'task parent record', 'task parent bind-child', 'task parent reconcile', 'task parent accept']) assert.ok(registry.includes(command), command);
  for (const method of ['inspectParentCoordination', 'recordParentPlan', 'reconcileParentPlan', 'bindChildContributions', 'acceptParentCoordination']) assert.ok(cli.includes(method) || server.includes(method), method);
  assert.match(worker, /coordination:\s*'inspectParentCoordination'/);
  assert.match(json, /buildr\.parent-coordination-result\/v1/);
  for (const phrase of ['Parent Plan', 'Contribution Handoff', 'task parent bind-child', '不自动完成Parent']) assert.ok(skill.includes(phrase), phrase);
});

test('模型不恢复lifecycle/progress/event/history authority且没有历史Task专用逻辑', () => {
  const sources = [
    read('src/domain/parent-coordination/parent-coordination.mjs'),
    read('src/application/parent-coordination/parent-coordination-application.mjs'),
    read('src/application/task-development/task-development-application.mjs'),
  ].join('\n');
  for (const forbidden of ['task_lifecycle_current', 'completed_child_count', 'parent_progress', 'coordination_events', 'coordination_history', 'delivery_registry', 'govern-task-intermediate-artifacts']) assert.equal(sources.includes(forbidden), false, forbidden);
  const migrations = fs.readdirSync(path.join(root, 'src/infrastructure/sqlite/migrations')).sort();
  assert.equal(migrations.at(-1), '0013_add_todo_task_retrospective_sources.sql');
  assert.equal(migrations.some((name) => name.includes('parent_coordination') || name.includes('parent_plan') || name.includes('progress')), false);
});

test('OpenSpec guard声明一个具体规范变化只有一个active Change owner', () => {
  const guard = read('package/targets/workspace/skills/buildr/openspec-contract-guard/SKILL.md');
  for (const phrase of ['同一个具体规范变化', '一个active Change', 'Parent Plan不是delta Change', '不能复制Child Change']) assert.ok(guard.includes(phrase), phrase);
});
