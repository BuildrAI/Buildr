import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

const test = createBuildrApplicationTest('integration-task-verification-report');

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-verification-report-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true }); fs.mkdirSync(path.join(root, 'projects', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'demo', 'services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\n`);
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), `schemaVersion: buildr.projects/v2\nprojects:\n  demo:\n    id: 22222222-2222-4222-8222-222222222222\n    workspaceId: 11111111-1111-4111-8111-111111111111\n    code: demo\n    name: Demo\n    description: Demo Project\n    source:\n      type: workspace\n      path: projects/demo\n`);
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'services', 'manifest.yml'), 'schemaVersion: buildr.services/v2\nprojectId: 22222222-2222-4222-8222-222222222222\nservices: {}\n');
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify({ schemaVersion: 'buildr.project-verification/v4', testing: [{ id: 'demo-unit', title: 'Demo unit', scope: { project: 'demo', services: [] }, purpose: 'Validate demo', sourcePaths: ['src/**'], testRoots: ['test/**'], full: { kind: 'command', argv: ['mvn', 'test'], cwd: '.' }, requirements: [] }] }));
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecordPersistence(root, { schemaVersion: 'buildr.task-record/v3', taskId: 'demo-task', title: 'Demo', intent: 'Verify report', scope: { projects: ['demo'], services: [] }, changes: [], parentTaskId: null, retrospective: null, status: 'active', result: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });
  return { root, runtime };
}

test('record stores one meaningful completion report and inspect derives content currentness', (t: any) => {
  const { root, runtime } = fixture(t);
  const recorded = runtime.recordTaskVerification(root, 'demo-task', { contentIdentity: 'git:tree-one', contentSummary: 'Demo task content', checks: [{ id: 'demo-unit-full', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['complete unit suite'], source: 'command', outcome: 'passed', summary: 'All demo unit tests passed', durationMs: 1200 }], gaps: [], conclusion: { outcome: 'passed', summary: 'Task-related checks and low-cost regression passed' } });
  assert.equal(recorded.slot.report.schemaVersion, 'buildr.task-verification-report/v1'); assert.equal(recorded.slot.applicability.status, 'current');
  assert.equal(recorded.slot.report.checks[0].mapStatus, 'declared');
  assert.equal(recorded.slot.report.declarations[0].status, 'ready');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.applicability.content.status, 'unknown');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { contentIdentity: 'git:tree-two' }).slot.applicability.status, 'stale');
});

test('report rejects empty evidence and contradictory passed conclusion', (t: any) => {
  const { root, runtime } = fixture(t);
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { contentIdentity: 'one', contentSummary: 'One', checks: [], gaps: [], conclusion: { outcome: 'incomplete', summary: 'Nothing checked' } }), { code: 'task_verification_report_empty' });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { contentIdentity: 'one', contentSummary: 'One', checks: [{ id: 'failed', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'failed', summary: 'Failed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Passed' } }), { code: 'task_verification_conclusion_inconsistent' });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { contentIdentity: 'one', contentSummary: 'One', checks: [], gaps: [{ testing: 'smoke', reason: 'No environment' }], conclusion: { outcome: 'passed', summary: 'Passed' } }), { code: 'task_verification_conclusion_inconsistent' });
});

test('record rejects caller-owned map status, out-of-scope checks, and unknown declared testing families', (t: any) => {
  const { root, runtime } = fixture(t);
  const base = { contentIdentity: 'one', contentSummary: 'One', gaps: [], conclusion: { outcome: 'passed', summary: 'Passed' } };
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { ...base, checks: [{ id: 'unit', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed', mapStatus: 'declared' }] }), { code: 'task_verification_field_forbidden' });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { ...base, checks: [{ id: 'unit', project: 'other', testing: 'unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed' }] }), { code: 'task_verification_check_scope_mismatch' });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { ...base, checks: [{ id: 'unit', project: 'demo', testing: 'missing', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed' }] }), { code: 'task_verification_testing_not_declared' });
});

test('invalid or absent Project testing maps become report gaps without discarding real checks', (t: any) => {
  const { root, runtime } = fixture(t); const mapFile = path.join(root, 'projects', 'demo', 'verification.yml');
  fs.writeFileSync(mapFile, 'schemaVersion: [broken\n');
  const invalid = runtime.recordTaskVerification(root, 'demo-task', { contentIdentity: 'invalid-map', contentSummary: 'Real content', checks: [{ id: 'manual-unit', project: 'demo', testing: 'manual-unit', selection: 'task-related', targets: ['manual unit command'], source: 'command', outcome: 'passed', summary: 'The command passed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Checks passed with a map gap' } });
  assert.equal(invalid.slot.report.declarations[0].status, 'invalid');
  assert.equal(invalid.slot.report.checks[0].mapStatus, 'map-unavailable');
  assert.equal(invalid.slot.report.gaps[0].testing, 'project-testing-map');
  fs.rmSync(mapFile);
  const absent = runtime.recordTaskVerification(root, 'demo-task', { contentIdentity: 'absent-map', contentSummary: 'Real content', checks: [{ id: 'manual-unit', project: 'demo', testing: 'manual-unit', selection: 'task-related', targets: ['manual unit command'], source: 'command', outcome: 'passed', summary: 'The command passed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Checks passed with a map gap' } });
  assert.equal(absent.slot.report.declarations[0].status, 'absent');
  assert.equal(absent.slot.report.checks[0].mapStatus, 'map-unavailable');
  assert.match(absent.slot.report.gaps[0].reason, /不存在/);
});
