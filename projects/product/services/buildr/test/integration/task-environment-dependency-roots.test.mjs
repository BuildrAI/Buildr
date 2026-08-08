import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import YAML from 'yaml';

import { registerTaskEnvironmentApplication } from '../../src/application/task-environment/task-environment-application.mjs';

const TASK_ID = 'dependency-roots';
const TIMESTAMP = '2026-08-08T00:00:00.000Z';

function writePackage(root, name) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name, version: '1.0.0' })}\n`);
  fs.writeFileSync(path.join(root, 'package-lock.json'), `${JSON.stringify({ name, version: '1.0.0', lockfileVersion: 3, packages: {} })}\n`);
}

function fixture(t, { services = ['buildr', 'buildr-web', 'unrelated'], scoped = ['buildr'] } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dependency-roots-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const controllerRoot = path.join(base, 'controller');
  const projectRoot = path.join(root, 'projects', 'product');
  fs.mkdirSync(projectRoot, { recursive: true });
  writePackage(controllerRoot, 'stable-controller');
  fs.mkdirSync(path.join(controllerRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(controllerRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(controllerRoot, 'package'), { recursive: true });
  fs.writeFileSync(path.join(controllerRoot, 'bin', 'buildr.mjs'), "if (process.argv[2] === 'version') process.stdout.write(JSON.stringify({version:'fixture'}) + '\\n'); else process.exitCode = 1;\n");
  for (const service of services) writePackage(path.join(projectRoot, 'services', service), service);
  fs.writeFileSync(path.join(projectRoot, 'task-environment.yml'), `schemaVersion: buildr.project-task-environment/v1
services:
  buildr:
    dependencyRoots:
      - { id: npm, manager: npm, root: ., manifest: package.json, lockfile: package-lock.json, required: true }
    requires:
      - { service: buildr-web, purpose: Local App source build }
  buildr-web:
    dependencyRoots:
      - { id: npm, manager: npm, root: ., manifest: package.json, lockfile: package-lock.json, required: true }
    requires: []
  unrelated:
    dependencyRoots:
      - { id: npm, manager: npm, root: ., manifest: package.json, lockfile: package-lock.json, required: true }
    requires: []
`);
  const installLog = path.join(base, 'installs.log');
  const npmExecutable = path.join(base, 'managed-npm');
  fs.writeFileSync(npmExecutable, `#!/bin/sh
if [ -n "$FAIL_ROOT" ] && [ "$FAIL_ROOT" = "$PWD" ]; then echo "declared install failure" >&2; exit 17; fi
rm -rf node_modules
mkdir -p node_modules
printf '%s\\n' "$PWD" >> "$INSTALL_LOG"
`);
  fs.chmodSync(npmExecutable, 0o755);
  let persistence = null;
  let failRoot = '';
  let writes = 0;
  const serviceEntities = Object.fromEntries(services.map((service) => [service, {
    code: service,
    source: { type: 'workspace', path: `projects/product/services/${service}` },
  }]));
  const runtime = {
    productRoot: () => controllerRoot,
    assertCanonicalTaskWorkspace: () => root,
    taskEnvironmentPath: (_target, taskId) => `workspace-sqlite:task-environment/${taskId}`,
    readTaskRecordPersistence: () => ({ root, record: { taskId: TASK_ID, status: 'active', scope: { projects: ['product'], services: scoped.map((service) => ({ project: 'product', service })) }, changes: [] } }),
    readTaskEnvironmentPersistence: (_target, _taskId, options = {}) => {
      if (!persistence && !options.optional) throw new Error('missing current');
      return persistence;
    },
    writeTaskEnvironmentPersistence: (_target, receipt) => {
      writes += 1;
      persistence = { root, file: `workspace-sqlite:task-environment/${TASK_ID}`, receipt: structuredClone(receipt) };
      return persistence;
    },
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, projects: { product: { code: 'product', source: { type: 'workspace', path: 'projects/product' } } } }),
    readServiceRegistryRecord: () => ({ services: serviceEntities }),
    readWorkspaceRecord: () => ({ workspace: { id: 'workspace-fixture' } }),
    parseYamlDocument: (content) => YAML.parseDocument(content, { uniqueKeys: true }).toJS(),
    isSupportedAgent: (adapter) => adapter === 'codex',
    workspaceNodeExecution: () => ({ ready: true, identity: { digest: 'managed-node' }, npmExecutable, environment: { ...process.env, INSTALL_LOG: installLog, FAIL_ROOT: failRoot } }),
    checkRuntimeAdapter: () => ({ runtimeSourceEvidence: { projectionReady: true, projectionIdentity: 'projection-fixture' } }),
    renderRuntime: () => { throw new Error('projection should remain ready'); },
    probeTaskEnvironmentResource: () => { throw new Error('no resources'); },
  };
  registerTaskEnvironmentApplication(runtime);
  return {
    root,
    runtime,
    writes: () => writes,
    receipt: () => persistence?.receipt,
    installRoots: () => fs.existsSync(installLog) ? fs.readFileSync(installLog, 'utf8').trim().split('\n').filter(Boolean) : [],
    serviceRoot: (service) => path.join(projectRoot, 'services', service),
    fail(service = null) { failRoot = service ? path.join(projectRoot, 'services', service) : ''; },
  };
}

test('prepare 首次准备声明闭包的两个 npm roots，幂等恢复不重复安装且不安装无关 Service', (t) => {
  const current = fixture(t);
  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.schemaVersion, 'buildr.task-environment-result/v2');
  assert.deepEqual(current.installRoots().sort(), [current.serviceRoot('buildr'), current.serviceRoot('buildr-web')].sort());
  assert.equal(fs.existsSync(path.join(current.serviceRoot('unrelated'), 'node_modules')), false);
  assert.deepEqual(prepared.environment.dependencyRoots.map((root) => [root.scope, root.status]), [
    ['service:product/buildr-web', 'ready'],
    ['service:product/buildr', 'ready'],
  ]);
  assert.equal(prepared.effects.filter((effect) => effect.type === 'dependency-root-prepared').length, 2);

  const restored = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.equal(restored.status, 'ready');
  assert.equal(restored.effects.some((effect) => effect.type === 'dependency-root-prepared'), false);
  assert.equal(current.installRoots().length, 2);
  assert.deepEqual(restored.environment.dependencyRoots.map((root) => [root.id, root.preparedLockfileIdentity]), prepared.environment.dependencyRoots.map((root) => [root.id, root.preparedLockfileIdentity]));
});

test('inspect 对部分缺失和 lockfile 漂移只读，prepare 只恢复 buildr-web', (t) => {
  const current = fixture(t);
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false }).status, 'ready');
  const writesBeforeInspect = current.writes();
  fs.rmSync(path.join(current.serviceRoot('buildr-web'), 'node_modules'), { recursive: true });
  const missing = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.environment.dependencyRoots.find((root) => root.service === 'buildr-web').status, 'missing');
  assert.equal(fs.existsSync(path.join(current.serviceRoot('buildr-web'), 'node_modules')), false);
  assert.equal(current.writes(), writesBeforeInspect);
  const recovered = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.deepEqual(recovered.effects.filter((effect) => effect.type === 'dependency-root-prepared').map((effect) => effect.scope), ['service:product/buildr-web']);

  const sharedNodeModules = path.join(current.serviceRoot('unrelated'), 'node_modules');
  fs.mkdirSync(sharedNodeModules, { recursive: true });
  fs.rmSync(path.join(current.serviceRoot('buildr-web'), 'node_modules'), { recursive: true });
  fs.symlinkSync(sharedNodeModules, path.join(current.serviceRoot('buildr-web'), 'node_modules'), 'dir');
  const linked = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(linked.status, 'blocked');
  assert.match(linked.environment.dependencyRoots.find((root) => root.service === 'buildr-web').diagnostic, /不得软链接或共享/);
  const relocalized = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.equal(relocalized.status, 'ready');
  assert.equal(fs.lstatSync(path.join(current.serviceRoot('buildr-web'), 'node_modules')).isSymbolicLink(), false);

  fs.appendFileSync(path.join(current.serviceRoot('buildr-web'), 'package-lock.json'), ' ');
  const drifted = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(drifted.status, 'blocked');
  assert.equal(drifted.environment.dependencyRoots.find((root) => root.service === 'buildr-web').status, 'drifted');
  const repaired = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.equal(repaired.status, 'ready');
  assert.deepEqual(repaired.effects.filter((effect) => effect.type === 'dependency-root-prepared').map((effect) => effect.scope), ['service:product/buildr-web']);
  const web = repaired.environment.dependencyRoots.find((root) => root.service === 'buildr-web');
  assert.equal(web.lockfileIdentity, web.preparedLockfileIdentity);
});

test('buildr-web npm ci 失败时 Environment 整体 blocked 并保留逐根诊断', (t) => {
  const current = fixture(t);
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false }).status, 'ready');
  fs.rmSync(path.join(current.serviceRoot('buildr-web'), 'node_modules'), { recursive: true });
  current.fail('buildr-web');
  const failed = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.equal(failed.status, 'blocked');
  const web = failed.environment.dependencyRoots.find((root) => root.service === 'buildr-web');
  assert.equal(web.status, 'failed');
  assert.match(web.diagnostic, /service:product\/buildr-web npm ci 失败（exit 17）/);
  assert.match(failed.diagnostic.message, /service:product\/buildr-web/);
  assert.equal(failed.environment.dependencyRoots.find((root) => root.service === 'buildr').status, 'ready');
  current.fail();
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false }).status, 'ready');
});
