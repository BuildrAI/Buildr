import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerTaskEnvironmentApplication } from '../../src/application/task-environment/task-environment-application.mjs';

const TASK_ID = 'preparation-plan';

function writePackage(root, name) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name, version: '1.0.0' })}\n`);
  fs.writeFileSync(path.join(root, 'package-lock.json'), `${JSON.stringify({ name, version: '1.0.0', lockfileVersion: 3, packages: {} })}\n`);
}

function planFor(services) {
  return {
    schemaVersion: 'buildr.task-environment-plan/v1',
    services: services.map((service) => ({
      selector: `service:product/${service}`,
      disposition: 'required',
      steps: [{
        id: 'npm-ci',
        cwd: '.',
        executable: { kind: 'workspace-foundation', name: 'npm' },
        args: ['ci'],
        inputs: ['package.json', 'package-lock.json'],
        outputs: [{ path: 'node_modules', kind: 'directory' }],
        required: true,
        timeoutMs: 180_000,
      }],
    })),
  };
}

function fixture(t, { services = ['buildr', 'buildr-web', 'unrelated'], scoped = ['buildr', 'buildr-web'] } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preparation-plan-')));
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
    isSupportedAgent: (adapter) => adapter === 'codex',
    workspaceNodeExecution: () => ({ ready: true, identity: { digest: 'managed-node' }, executable: process.execPath, npmExecutable, paths: { npx: npmExecutable }, environment: { ...process.env, INSTALL_LOG: installLog, FAIL_ROOT: failRoot } }),
    checkRuntimeAdapter: () => ({ runtimeSourceEvidence: { projectionReady: true, projectionIdentity: 'projection-fixture' } }),
    renderRuntime: () => { throw new Error('projection should remain ready'); },
    probeTaskEnvironmentResource: () => { throw new Error('no resources'); },
  };
  registerTaskEnvironmentApplication(runtime);
  return {
    root,
    runtime,
    plan: planFor(scoped),
    writes: () => writes,
    installRoots: () => fs.existsSync(installLog) ? fs.readFileSync(installLog, 'utf8').trim().split('\n').filter(Boolean) : [],
    serviceRoot: (service) => path.join(projectRoot, 'services', service),
    fail(service = null) { failRoot = service ? path.join(projectRoot, 'services', service) : ''; },
  };
}

test('prepare首次执行两个Service Step，幂等恢复不重复执行且不准备无关Service', (t) => {
  const current = fixture(t);
  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false, plan: current.plan });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.schemaVersion, 'buildr.task-environment-result/v3');
  assert.deepEqual(current.installRoots().sort(), [current.serviceRoot('buildr'), current.serviceRoot('buildr-web')].sort());
  assert.equal(fs.existsSync(path.join(current.serviceRoot('unrelated'), 'node_modules')), false);
  assert.deepEqual(prepared.environment.preparationSteps.map((step) => [step.scope, step.status]), [
    ['service:product/buildr', 'ready'],
    ['service:product/buildr-web', 'ready'],
  ]);
  assert.equal(prepared.effects.filter((effect) => effect.type === 'preparation-step-executed').length, 2);

  const restored = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.equal(restored.status, 'ready', JSON.stringify(restored, null, 2));
  assert.equal(restored.effects.some((effect) => effect.type === 'preparation-step-executed'), false);
  assert.equal(current.installRoots().length, 2);
  assert.equal(restored.environment.preparationPlan.identity, prepared.environment.preparationPlan.identity);
});

test('inspect对部分缺失和input漂移只读，prepare只恢复对应Service', (t) => {
  const current = fixture(t);
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false, plan: current.plan }).status, 'ready');
  const writesBeforeInspect = current.writes();
  fs.rmSync(path.join(current.serviceRoot('buildr-web'), 'node_modules'), { recursive: true });
  const missing = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.environment.preparationSteps.find((step) => step.scope.endsWith('/buildr-web')).status, 'missing');
  assert.equal(fs.existsSync(path.join(current.serviceRoot('buildr-web'), 'node_modules')), false);
  assert.equal(current.writes(), writesBeforeInspect);
  const recovered = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.deepEqual(recovered.effects.filter((effect) => effect.type === 'preparation-step-executed').map((effect) => effect.scope), ['service:product/buildr-web']);

  fs.appendFileSync(path.join(current.serviceRoot('buildr-web'), 'package-lock.json'), ' ');
  const drifted = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(drifted.status, 'blocked');
  assert.equal(drifted.environment.preparationSteps.find((step) => step.scope.endsWith('/buildr-web')).status, 'drifted');
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false }).status, 'ready');
});

test('单个Service Step失败时Environment整体blocked并保留具体诊断', (t) => {
  const current = fixture(t);
  current.fail('buildr-web');
  const failed = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false, plan: current.plan });
  assert.equal(failed.status, 'blocked');
  const web = failed.environment.preparationSteps.find((step) => step.scope.endsWith('/buildr-web'));
  assert.equal(web.status, 'failed');
  assert.match(web.diagnostic, /service:product\/buildr-web.*exit 17/);
  assert.match(failed.diagnostic.message, /service:product\/buildr-web/);
  assert.equal(failed.environment.preparationSteps.find((step) => step.scope.endsWith('/buildr')).status, 'ready');
  current.fail();
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false }).status, 'ready');
});

test('没有Plan时prepare形成受控执行根但明确blocked，plan record不执行Step', (t) => {
  const current = fixture(t);
  const missing = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.diagnostic.code, 'task_environment_plan_missing');
  assert.equal(current.installRoots().length, 0);
  const recorded = current.runtime.recordTaskEnvironmentPlan(current.root, TASK_ID, current.plan);
  assert.equal(recorded.status, 'ready');
  assert.equal(current.installRoots().length, 0);
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false }).status, 'ready');
});

test('非npm Service executable同样按input/executable/output identity准备和恢复', (t) => {
  const current = fixture(t, { services: ['buildr'], scoped: ['buildr'] });
  const root = current.serviceRoot('buildr');
  const executable = path.join(root, 'prepare.sh');
  fs.writeFileSync(path.join(root, 'input.txt'), 'v1\n');
  fs.writeFileSync(executable, '#!/bin/sh\nset -eu\nprintf prepared > prepared.txt\n');
  fs.chmodSync(executable, 0o755);
  const plan = {
    schemaVersion: 'buildr.task-environment-plan/v1',
    services: [{
      selector: 'service:product/buildr', disposition: 'required',
      steps: [{ id: 'custom', cwd: '.', executable: { kind: 'service', path: 'prepare.sh' }, args: [], inputs: ['input.txt'], outputs: [{ path: 'prepared.txt', kind: 'file' }], required: true, timeoutMs: 10_000 }],
    }],
  };
  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false, plan });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(current.installRoots().length, 0);
  assert.equal(fs.readFileSync(path.join(root, 'prepared.txt'), 'utf8'), 'prepared');
  fs.appendFileSync(executable, '# executable identity drift\n');
  assert.equal(current.runtime.inspectTaskEnvironment(current.root, TASK_ID).environment.preparationSteps[0].status, 'drifted');
  const recovered = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false });
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.effects.filter((effect) => effect.type === 'preparation-step-executed').length, 1);
});

test('Plan替换原子使旧准备事实blocked且record本身不执行Step', (t) => {
  const current = fixture(t);
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false, plan: current.plan }).status, 'ready');
  const installs = current.installRoots().length;
  const replacement = structuredClone(current.plan);
  replacement.services[0].steps[0].timeoutMs = 179_000;
  const recorded = current.runtime.recordTaskEnvironmentPlan(current.root, TASK_ID, replacement);
  assert.equal(recorded.status, 'ready');
  assert.equal(current.installRoots().length, installs);
  const saved = current.runtime.inspectTaskEnvironmentPlan(current.root, TASK_ID);
  assert.equal(saved.status, 'ready');
  assert.equal(saved.plan.identity, recorded.plan.identity);
  assert.equal(current.runtime.readTaskEnvironmentCurrent(current.root, TASK_ID).status, 'blocked');
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false }).status, 'ready');
});
