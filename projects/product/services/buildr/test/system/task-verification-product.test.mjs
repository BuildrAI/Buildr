import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';
import { cleanupLocalTaskLifecycleSystemContext, copyTaskLifecycleWorkspace } from '../helpers/task-lifecycle-system-context.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, expected, `buildr ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function json(args, expected = 0) {
  const result = run([...args, '--json'], expected);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function declaration(proves = 'Demo behavior') {
  return {
    schemaVersion: 'buildr.project-verification/v2',
    resources: [],
    capabilities: [{
      id: 'demo.unit',
      title: 'Demo unit',
      scope: { project: 'demo', services: [] },
      invocation: { kind: 'command', argv: ['node', '-e', 'void 0'], cwd: '.' },
      applicability: { paths: ['**'], conditions: [] },
      proves: [proves],
      requiredForDelivery: true,
      environment: { requires: ['node'] },
      effects: { writes: [], externalSystems: [], authorization: 'implicit' },
      resourceClaims: [],
    }],
  };
}

after(() => cleanupLocalTaskLifecycleSystemContext());

function fixture(t) {
  const { base, root } = copyTaskLifecycleWorkspace(t, 'task-verification-product');
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(declaration()));
  createRuntime().createTaskRecord(root, { taskId: 'verification-task', title: 'Verification Task', intent: '验证 current Result authority', projects: ['demo'], services: [], changes: [] });
  return { base, root };
}

function recordArgs(root, target = 'delivery:v1') {
  return ['task', 'verification', 'record', 'verification-task', '--target-identity', target, '--target-summary', 'Demo delivery target', '--capability', 'demo/demo.unit::passed::Demo unit passed', '--outcome', 'passed', '--summary', 'Declared verification passed', '--declaration-root', root, '--target', root];
}

function recordInput(root, target = 'delivery:v1') {
  return {
    targetIdentity: target,
    targetSummary: 'Demo delivery target',
    capabilities: [{ project: 'demo', capability: 'demo.unit', outcome: 'passed', facts: ['Demo unit passed'] }],
    coverageGaps: [],
    conclusion: { outcome: 'passed', summary: 'Declared verification passed' },
    declarationRoot: root,
  };
}

test('Task Verification CLI 维护单一 current Result 并派生 target/declaration applicability', (t) => {
  const { root } = fixture(t);
  const runtime = createRuntime();
  let response = json(['task', 'verification', 'inspect', 'verification-task', '--target', root]);
  assert.equal(response.schemaVersion, 'buildr.task-verification-operation-result/v1');
  assert.equal(response.slot.present, false);
  const rejectedInspectPath = json(['task', 'verification', 'inspect', 'verification-task', '--declaration-root', root, '--target', root], 2);
  assert.equal(rejectedInspectPath.error.code, 'task_verification_cli.syntax');
  assert.match(rejectedInspectPath.error.message, /Unknown argument: --declaration-root/);

  response = json(recordArgs(root));
  assert.equal(response.status, 'recorded');
  assert.equal(response.slot.applicability.status, 'current');
  assert.match(response.slot.resultDigest, /^sha256-/);
  assert.deepEqual(response.effects, [{ type: 'created', path: 'workspace-sqlite:task-verification/verification-task' }]);

  response = json(['task', 'verification', 'inspect', 'verification-task', '--target-identity', 'delivery:v2', '--target', root]);
  assert.equal(response.slot.applicability.status, 'stale');
  assert.equal(response.slot.applicability.target.status, 'stale');
  response = runtime.inspectTaskVerification(root, 'verification-task');
  assert.equal(response.slot.applicability.status, 'unknown');

  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(declaration('Changed policy fact')));
  response = runtime.inspectTaskVerification(root, 'verification-task', { targetIdentity: 'delivery:v1' });
  assert.equal(response.slot.applicability.target.status, 'current');
  assert.equal(response.slot.applicability.declarations.status, 'unknown');
  assert.equal(response.slot.applicability.status, 'unknown');

  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  const payload = opened.database.prepare("SELECT result_json FROM task_verification_current WHERE task_id = 'verification-task'").get().result_json;
  opened.database.close();
  assert.doesNotMatch(payload, /stdout|stderr|duration|applicability|resultDigest|revision|Environment Receipt/);
});

test('Verification coverage gap保留current事实并返回只读Intake next action', (t) => {
  const { root } = fixture(t);
  const declarationPath = path.join(root, 'projects', 'demo', 'verification.yml');
  fs.rmSync(declarationPath);
  const response = json([
    'task', 'verification', 'record', 'verification-task',
    '--target-identity', 'delivery:gap', '--target-summary', 'Gap target',
    '--coverage-gap', 'project:demo::No declared verification capability',
    '--outcome', 'not-passed', '--summary', 'Coverage gap remains',
    '--declaration-root', root, '--target', root,
  ]);
  assert.equal(response.slot.result.coverageGaps[0].scope, 'project:demo');
  assert.equal(response.slot.result.conclusion.outcome, 'not-passed');
  assert.match(response.nextActions[0], /trigger: verification-gap/);
  assert.match(response.nextActions[0], /gap: project:demo/);
  assert.equal(fs.existsSync(declarationPath), false);

  const inspected = json(['task', 'verification', 'inspect', 'verification-task', '--target', root]);
  assert.deepEqual(inspected.nextActions, response.nextActions);
  assert.equal(fs.existsSync(declarationPath), false);
});

test('Task Verification CLI记录workspace-only负向Result且不伪造passed', (t) => {
  const { root } = fixture(t);
  createRuntime().createTaskRecord(root, { taskId: 'workspace-verification', title: 'Workspace Verification', intent: 'Record a workspace coverage gap.', projects: [], services: [], changes: [] });
  const response = json([
    'task', 'verification', 'record', 'workspace-verification',
    '--target-identity', 'workspace:delivery-v1', '--target-summary', 'Workspace delivery target',
    '--coverage-gap', 'workspace::No workspace verification capability',
    '--outcome', 'not-passed', '--summary', 'Workspace coverage gap remains',
    '--declaration-root', root, '--target', root,
  ]);
  assert.deepEqual(response.slot.result.declarations, []);
  assert.deepEqual(response.slot.result.capabilities, []);
  assert.deepEqual(response.slot.result.coverageGaps, [{ scope: 'workspace', summary: 'No workspace verification capability' }]);
  assert.equal(response.slot.result.conclusion.outcome, 'not-passed');
  assert.equal(response.slot.applicability.status, 'current');
  assert.deepEqual(response.nextActions, []);
});

test('Local App 只读投影 current Result，并只生成 Task Verification Agent prompt', async (t) => {
  const { base, root } = fixture(t);
  createRuntime().recordTaskVerification(root, 'verification-task', recordInput(root));
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
  });
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const writeHeaders = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource, options = {}) => {
    const response = await fetch(resource, options);
    return { status: response.status, headers: response.headers, body: await response.json() };
  };

  let response = await request(`${endpoint}/tasks/verification-task/verification`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.body.slot.present, true);
  assert.equal(response.body.slot.applicability.status, 'unknown');
  response = await request(`${endpoint}/tasks/verification-task/verification?target=delivery:v1`);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'target_forbidden');
  response = await request(`${endpoint}/tasks/verification-task/verification`, { method: 'POST', headers: writeHeaders, body: '{}' });
  assert.equal(response.status, 404, 'Local App must not expose direct Verification Result writer');

  response = await request(`${endpoint}/prompts/task-verification`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'verification-task', targetIdentity: 'delivery:v1' }) });
  assert.equal(response.status, 200);
  assert.match(response.body.prompt, /task-verification Skill/);
  assert.match(response.body.prompt, /coverage gap/);
  assert.match(response.body.prompt, /不得覆盖 current/);
  response = await request(`${endpoint}/prompts/task-verification`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'verification-task', path: root }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'target_forbidden');
});
