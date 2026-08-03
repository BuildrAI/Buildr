import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';

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

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-verification-product-'));
  const root = path.join(base, 'workspace');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  run(['init', '--target', root, '--name', 'task-verification', '--description', 'Task Verification fixture', '--profile', 'team']);
  run(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Task Verification Project']);
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(declaration()));
  json(['task', 'create', 'verification-task', '--title', 'Verification Task', '--intent', '验证 current Result authority', '--project', 'demo', '--target', root]);
  return { base, root };
}

function recordArgs(root, target = 'delivery:v1') {
  return ['task', 'verification', 'record', 'verification-task', '--target-identity', target, '--target-summary', 'Demo delivery target', '--capability', 'demo/demo.unit::passed::Demo unit passed', '--outcome', 'passed', '--summary', 'Declared verification passed', '--declaration-root', root, '--target', root];
}

test('Task Verification CLI 维护单一 current Result 并派生 target/declaration applicability', (t) => {
  const { root } = fixture(t);
  let response = json(['task', 'verification', 'inspect', 'verification-task', '--target', root]);
  assert.equal(response.schemaVersion, 'buildr.task-verification-operation-result/v1');
  assert.equal(response.slot.present, false);

  response = json(recordArgs(root));
  assert.equal(response.status, 'recorded');
  assert.equal(response.slot.applicability.status, 'current');
  assert.match(response.slot.resultDigest, /^sha256-/);
  assert.deepEqual(response.effects, [{ type: 'created', path: '.buildr/tasks/verification-task/verification.yml' }]);

  response = json(['task', 'verification', 'inspect', 'verification-task', '--target-identity', 'delivery:v2', '--target', root]);
  assert.equal(response.slot.applicability.status, 'stale');
  assert.equal(response.slot.applicability.target.status, 'stale');
  response = json(['task', 'verification', 'inspect', 'verification-task', '--target', root]);
  assert.equal(response.slot.applicability.status, 'unknown');

  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(declaration('Changed policy fact')));
  response = json(['task', 'verification', 'inspect', 'verification-task', '--target-identity', 'delivery:v1', '--target', root]);
  assert.equal(response.slot.applicability.declarations.status, 'stale');
  assert.ok(response.slot.applicability.reasons.some((reason) => reason.code === 'declaration-identity-changed'));

  const yaml = fs.readFileSync(path.join(root, '.buildr', 'tasks', 'verification-task', 'verification.yml'), 'utf8');
  assert.doesNotMatch(yaml, /stdout|stderr|duration|applicability|resultDigest|revision|Environment Receipt/);
});

test('Local App 只读投影 current Result，并只生成 Task Verification Agent prompt', async (t) => {
  const { base, root } = fixture(t);
  json(recordArgs(root));
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
