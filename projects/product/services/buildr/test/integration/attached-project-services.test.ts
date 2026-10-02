import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { taskRecordFixture, runBuildr } from '../helpers/task-record-system-fixture.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());

async function fixture(t: any, name: string) {
  const { root, base } = taskRecordFixture(t, name);
  const source = path.join(base, 'attached-project');
  fs.mkdirSync(path.join(source, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(source, 'docs', 'brief.md'), '# 外部项目资料\n');
  for (const args of [['init', '-q', '--initial-branch=dev'], ['config', 'user.name', 'Test'], ['config', 'user.email', 'test@example.invalid'], ['remote', 'add', 'origin', 'https://example.invalid/attached.git'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const result = spawnSync('git', args, { cwd: source, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previous; });
  runBuildr(['project', 'create', 'attached', '--attach', source, '--name', '附接项目', '--target', root]);
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise<void>(resolve => instance.server.close(() => resolve())));
  const { url, initialWorkspaceId } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/projects`;
  const request = async (suffix: string) => {
    const response = await fetch(`${endpoint}/${suffix}`);
    return { status: response.status, body: await response.json() as any };
  };
  return { root, source, runtime, request };
}

test('公开附接项目的空服务列表在全局迁移前后可读且不补外部清单', async t => {
  const { root, source, runtime, request } = await fixture(t, 'attached-services-empty');
  const before = fs.readFileSync(path.join(root, 'projects', 'manifest.yml'));
  const originalFiles = fs.readdirSync(source, { recursive: true });
  assert.equal(fs.existsSync(path.join(root, 'services', 'manifest.yml')), false);
  const legacy = await request('attached/services');
  assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
  assert.deepEqual(legacy.body.services, []);
  assert.equal(legacy.body.migrationRequired, false);
  assert.equal(fs.existsSync(path.join(source, 'services')), false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'projects', 'manifest.yml')), before);
  assert.deepEqual(fs.readdirSync(source, { recursive: true }), originalFiles);
  assert.equal((await request('attached/services/missing')).status, 404);
  assert.equal((await request('missing/services')).status, 404);
  const catalog = runtime.assetCatalog(root);
  runtime.migrateAssetCatalog(root, { revision: catalog.revision });
  const globalBefore = fs.readFileSync(path.join(root, 'services', 'manifest.yml'));
  const global = await request('attached/services');
  assert.equal(global.status, 200, JSON.stringify(global.body));
  assert.equal(global.body.schemaVersion, 'buildr.services/v3');
  assert.deepEqual(global.body.services, []);
  assert.deepEqual(fs.readFileSync(path.join(root, 'services', 'manifest.yml')), globalBefore);
  assert.deepEqual(fs.readdirSync(source, { recursive: true }), originalFiles);
  assert.equal(fs.existsSync(path.join(source, 'services')), false);
});

test('服务读取保留坏附接清单、失效来源及受管项目缺失清单的诊断', async t => {
  const { root, source, request } = await fixture(t, 'attached-services-invalid');
  const manifest = path.join(source, 'services', 'manifest.yml');
  fs.mkdirSync(path.dirname(manifest));
  fs.writeFileSync(manifest, 'schemaVersion: invalid\nservices: []\n');
  const malformed = await request('attached/services');
  assert.equal(malformed.status, 409);
  assert.equal(malformed.body.error.code, 'service_registry_invalid');
  fs.unlinkSync(manifest);
  fs.renameSync(source, `${source}-unavailable`);
  const missingSource = await request('attached/services');
  assert.equal(missingSource.status, 500);
  assert.equal(missingSource.body.error.code, 'ENOENT');
  fs.unlinkSync(path.join(root, 'projects', 'demo', 'services', 'manifest.yml'));
  const ownedMissing = await request('demo/services');
  assert.equal(ownedMissing.status, 500);
  assert.equal(ownedMissing.body.error.code, 'ENOENT');
});
