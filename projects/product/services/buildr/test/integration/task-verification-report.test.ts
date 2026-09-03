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
  const recorded = runtime.recordTaskVerification(root, 'demo-task', { expectedReportDigest: 'absent', contentIdentity: 'git:tree-one', contentSummary: 'Demo task content', checks: [{ id: 'demo-unit-full', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['complete unit suite'], source: 'command', outcome: 'passed', summary: 'All demo unit tests passed', durationMs: 1200 }], gaps: [], conclusion: { outcome: 'passed', summary: 'Task-related checks and low-cost regression passed' } });
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
  const base = { expectedReportDigest: 'absent', contentIdentity: 'one', contentSummary: 'One', gaps: [], conclusion: { outcome: 'passed', summary: 'Passed' } };
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { ...base, checks: [{ id: 'unit', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed', mapStatus: 'declared' }] }), { code: 'task_verification_field_forbidden' });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { ...base, checks: [{ id: 'unit', project: 'other', testing: 'unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed' }] }), { code: 'task_verification_check_scope_mismatch' });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { ...base, checks: [{ id: 'unit', project: 'demo', testing: 'missing', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed' }] }), { code: 'task_verification_testing_not_declared' });
});

test('invalid or absent Project testing maps become report gaps without discarding real checks', (t: any) => {
  const { root, runtime } = fixture(t); const mapFile = path.join(root, 'projects', 'demo', 'verification.yml');
  fs.writeFileSync(mapFile, 'schemaVersion: [broken\n');
  const invalid = runtime.recordTaskVerification(root, 'demo-task', { expectedReportDigest: 'absent', contentIdentity: 'invalid-map', contentSummary: 'Real content', checks: [{ id: 'manual-unit', project: 'demo', testing: 'manual-unit', selection: 'task-related', targets: ['manual unit command'], source: 'command', outcome: 'passed', summary: 'The command passed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Checks passed with a map gap' } });
  assert.equal(invalid.slot.report.declarations[0].status, 'invalid');
  assert.equal(invalid.slot.report.checks[0].mapStatus, 'map-unavailable');
  assert.equal(invalid.slot.report.gaps[0].testing, 'project-testing-map');
  fs.rmSync(mapFile);
  const absent = runtime.recordTaskVerification(root, 'demo-task', { expectedReportDigest: invalid.slot.reportDigest, contentIdentity: 'absent-map', contentSummary: 'Real content', checks: [{ id: 'manual-unit', project: 'demo', testing: 'manual-unit', selection: 'task-related', targets: ['manual unit command'], source: 'command', outcome: 'passed', summary: 'The command passed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Checks passed with a map gap' } });
  assert.equal(absent.slot.report.declarations[0].status, 'absent');
  assert.equal(absent.slot.report.checks[0].mapStatus, 'map-unavailable');
  assert.match(absent.slot.report.gaps[0].reason, /不存在/);
});

test('record uses the observed report digest and rejects a stale concurrent replacement', (t: any) => {
  const { root, runtime } = fixture(t);
  const input = { expectedReportDigest: 'absent', contentIdentity: 'git:first', contentSummary: 'First', checks: [{ id: 'unit', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Passed' } };
  const first = runtime.recordTaskVerification(root, 'demo-task', input);
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { ...input, contentIdentity: 'git:second' }), (error: any) => {
    assert.equal(error.code, 'task_verification_current_conflict');
    assert.equal(error.details.currentReportDigest, first.slot.reportDigest);
    return true;
  });
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.report.content.identity, 'git:first');
});

test('serialization failure keeps the current report unchanged', (t: any) => {
  const { root, runtime } = fixture(t);
  const input = { expectedReportDigest: 'absent', contentIdentity: 'git:first', contentSummary: 'First', checks: [{ id: 'unit', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Passed' } };
  const first = runtime.recordTaskVerification(root, 'demo-task', input);
  runtime.taskVerificationSerialize = () => { throw new Error('serialization fixture'); };
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', { ...input, expectedReportDigest: first.slot.reportDigest, contentIdentity: 'git:second' }), (error: any) => error.code === 'task_verification_write_failed' && error.details.stage === 'serialization');
  runtime.taskVerificationSerialize = undefined;
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.report.content.identity, 'git:first');
});

test('SQL mutation, post-read, and commit failures each roll back to the prior current report', (t: any) => {
  const { root, runtime } = fixture(t);
  const base = { expectedReportDigest: 'absent', contentIdentity: 'git:first', contentSummary: 'First', checks: [{ id: 'unit', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'passed', summary: 'Passed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Passed' } };
  const first = runtime.recordTaskVerification(root, 'demo-task', base);
  const replacement = { ...base, expectedReportDigest: first.slot.reportDigest, contentIdentity: 'git:replacement' };
  let database = runtime.openWorkspaceStructuredStore(root, { writable: true }).database;
  database.exec("CREATE TRIGGER reject_verification_update BEFORE UPDATE ON task_verification_current BEGIN SELECT RAISE(ABORT, 'injected mutation failure'); END;");
  database.close();
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', replacement), (error: any) => error.code === 'task_verification_write_failed' && error.details.stage === 'mutation');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.report.content.identity, 'git:first');

  database = runtime.openWorkspaceStructuredStore(root, { writable: true }).database;
  database.exec("DROP TRIGGER reject_verification_update; CREATE TRIGGER corrupt_verification_readback AFTER UPDATE ON task_verification_current BEGIN UPDATE task_verification_current SET target_identity = 'corrupt' WHERE task_id = NEW.task_id; END;");
  database.close();
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', replacement), (error: any) => error.code === 'task_verification_write_failed' && error.details.stage === 'post-read');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.report.content.identity, 'git:first');
  database = runtime.openWorkspaceStructuredStore(root, { writable: true }).database;
  database.exec('DROP TRIGGER corrupt_verification_readback;');
  database.close();

  const originalOpen = runtime.openWorkspaceStructuredStore.bind(runtime);
  runtime.openWorkspaceStructuredStore = (targetRoot: string, options: { writable: boolean }) => {
    const opened = originalOpen(targetRoot, options);
    if (!options.writable) return opened;
    const originalExec = opened.database.exec.bind(opened.database);
    opened.database.exec = (sql: string) => {
      if (sql === 'COMMIT') throw new Error('injected commit failure');
      return originalExec(sql);
    };
    return opened;
  };
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', replacement), (error: any) => error.code === 'task_verification_write_failed' && error.details.stage === 'commit');
  runtime.openWorkspaceStructuredStore = originalOpen;
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.report.content.identity, 'git:first');
});
