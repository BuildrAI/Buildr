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
        executable: { kind: 'workspace-foundation', name: 'node' },
        args: ['prepare-fixture.mjs'],
        inputs: ['package.json', 'package-lock.json', 'prepare-fixture.mjs'],
        outputs: [{ path: 'node_modules', kind: 'directory' }],
        required: true,
        timeoutMs: 180_000,
      }],
    })),
  };
}

function declarationFor(services, timeoutMs = 180_000) {
  return {
    schemaVersion: 'buildr.project-environment-preparation/v1',
    recipes: services.map((service) => ({
      id: `${service}.npm-ci`, scope: { kind: 'service', service }, required: true,
      steps: [{
        id: 'npm-ci', cwd: '.', executable: { kind: 'workspace-foundation', name: 'node' }, args: ['prepare-fixture.mjs'],
        inputs: ['package.json', 'package-lock.json', 'prepare-fixture.mjs'], outputs: [{ path: 'node_modules', kind: 'directory' }], required: true, timeoutMs,
      }],
    })),
  };
}

function declarationRequest(services) {
  return {
    schemaVersion: 'buildr.task-environment-plan-request/v1',
    projects: [{
      project: 'product', source: { kind: 'project-declaration' },
      scopes: [
        { selector: 'project:product', disposition: 'not-applicable', reason: 'No Project-wide preparation.' },
        ...services.map((service) => ({ selector: `service:product/${service}`, disposition: 'required', reason: `${service} preparation is required.`, recipeIds: [`${service}.npm-ci`] })),
      ],
    }],
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
  const installLog = path.join(base, 'installs.log');
  const failMarker = path.join(base, 'fail-root');
  for (const service of services) {
    const serviceRoot = path.join(projectRoot, 'services', service);
    writePackage(serviceRoot, service);
    fs.writeFileSync(path.join(serviceRoot, 'prepare-fixture.mjs'), `import fs from 'node:fs';\nimport path from 'node:path';\nconst cwd = process.cwd();\nconst failMarker = ${JSON.stringify(failMarker)};\nif (fs.existsSync(failMarker) && fs.readFileSync(failMarker, 'utf8') === cwd) { console.error('declared install failure'); process.exit(17); }\nfs.rmSync(path.join(cwd, 'node_modules'), { recursive: true, force: true });\nfs.mkdirSync(path.join(cwd, 'node_modules'));\nfs.appendFileSync(${JSON.stringify(installLog)}, cwd + '\\n');\n`);
  }
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
    installRoots: () => fs.existsSync(installLog) ? fs.readFileSync(installLog, 'utf8').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) : [],
    serviceRoot: (service) => path.join(projectRoot, 'services', service),
    writeDeclaration(value = declarationFor(services)) { fs.writeFileSync(path.join(projectRoot, 'preparation.yml'), `${JSON.stringify(value, null, 2)}\n`); },
    fail(service = null) {
      failRoot = service ? path.join(projectRoot, 'services', service) : '';
      if (failRoot) fs.writeFileSync(failMarker, failRoot);
      else fs.rmSync(failMarker, { force: true });
    },
  };
}

test('prepare首次执行两个Service Step，幂等恢复不重复执行且不准备无关Service', (t) => {
  const current = fixture(t);
  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: current.plan });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.schemaVersion, 'buildr.task-environment-result/v4');
  assert.deepEqual(current.installRoots().sort(), [current.serviceRoot('buildr'), current.serviceRoot('buildr-web')].sort());
  assert.equal(fs.existsSync(path.join(current.serviceRoot('unrelated'), 'node_modules')), false);
  assert.deepEqual(prepared.environment.preparationSteps.map((step) => [step.scope, step.status]), [
    ['service:product/buildr', 'ready'],
    ['service:product/buildr-web', 'ready'],
  ]);
  assert.equal(prepared.effects.filter((effect) => effect.type === 'preparation-step-executed').length, 2);

  const restored = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false });
  assert.equal(restored.status, 'ready', JSON.stringify(restored, null, 2));
  assert.equal(restored.effects.some((effect) => effect.type === 'preparation-step-executed'), false);
  assert.equal(current.installRoots().length, 2);
  assert.equal(restored.environment.preparationPlan.identity, prepared.environment.preparationPlan.identity);
});

test('inspect对部分缺失和input漂移只读，prepare只恢复对应Service', (t) => {
  const current = fixture(t);
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: current.plan }).status, 'ready');
  const writesBeforeInspect = current.writes();
  fs.rmSync(path.join(current.serviceRoot('buildr-web'), 'node_modules'), { recursive: true });
  const missing = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.environment.preparationSteps.find((step) => step.scope.endsWith('/buildr-web')).status, 'missing');
  assert.equal(fs.existsSync(path.join(current.serviceRoot('buildr-web'), 'node_modules')), false);
  assert.equal(current.writes(), writesBeforeInspect);
  const recovered = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false });
  assert.deepEqual(recovered.effects.filter((effect) => effect.type === 'preparation-step-executed').map((effect) => effect.scope), ['service:product/buildr-web']);

  fs.appendFileSync(path.join(current.serviceRoot('buildr-web'), 'package-lock.json'), ' ');
  const drifted = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(drifted.status, 'blocked');
  assert.equal(drifted.environment.preparationSteps.find((step) => step.scope.endsWith('/buildr-web')).status, 'drifted');
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false }).status, 'ready');
});

test('单个Service Step失败时Environment整体blocked并保留具体诊断', (t) => {
  const current = fixture(t);
  current.fail('buildr-web');
  const failed = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: current.plan });
  assert.equal(failed.status, 'blocked');
  const web = failed.environment.preparationSteps.find((step) => step.scope.endsWith('/buildr-web'));
  assert.equal(web.status, 'failed');
  assert.match(web.diagnostic, /service:product\/buildr-web.*exit 17/);
  assert.match(failed.diagnostic.message, /service:product\/buildr-web/);
  assert.equal(failed.environment.preparationSteps.find((step) => step.scope.endsWith('/buildr')).status, 'ready');
  current.fail();
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false }).status, 'ready');
});

test('没有Plan时prepare形成受控执行根但明确blocked，plan record不执行Step', (t) => {
  const current = fixture(t);
  const missing = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.diagnostic.code, 'task_environment_plan_missing');
  assert.equal(current.installRoots().length, 0);
  const recorded = current.runtime.recordTaskEnvironmentPlan(current.root, TASK_ID, current.plan);
  assert.equal(recorded.status, 'ready');
  assert.equal(current.installRoots().length, 0);
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false }).status, 'ready');
});

test('非npm Service executable同样按input/executable/output identity准备和恢复', (t) => {
  const current = fixture(t, { services: ['buildr'], scoped: ['buildr'] });
  const root = current.serviceRoot('buildr');
  const executableName = process.platform === 'win32' ? 'prepare.cmd' : 'prepare.sh';
  const executable = path.join(root, executableName);
  fs.writeFileSync(path.join(root, 'input.txt'), 'v1\n');
  fs.writeFileSync(executable, process.platform === 'win32' ? '@echo off\r\n>prepared.txt <nul set /p "=prepared"\r\nexit /b 0\r\n' : '#!/bin/sh\nset -eu\nprintf prepared > prepared.txt\n');
  fs.chmodSync(executable, 0o755);
  const plan = {
    schemaVersion: 'buildr.task-environment-plan/v1',
    services: [{
      selector: 'service:product/buildr', disposition: 'required',
      steps: [{ id: 'custom', cwd: '.', executable: { kind: 'service', path: executableName }, args: [], inputs: ['input.txt'], outputs: [{ path: 'prepared.txt', kind: 'file' }], required: true, timeoutMs: 10_000 }],
    }],
  };
  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(current.installRoots().length, 0);
  assert.equal(fs.readFileSync(path.join(root, 'prepared.txt'), 'utf8'), 'prepared');
  fs.appendFileSync(executable, '# executable identity drift\n');
  assert.equal(current.runtime.inspectTaskEnvironment(current.root, TASK_ID).environment.preparationSteps[0].status, 'drifted');
  const recovered = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false });
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.effects.filter((effect) => effect.type === 'preparation-step-executed').length, 1);
});

test('Plan替换原子使旧准备事实blocked且record本身不执行Step', (t) => {
  const current = fixture(t);
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: current.plan }).status, 'ready');
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
  assert.equal(current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false }).status, 'ready');
});

test('Project Declaration按Task多Service scope选择Recipe，漂移只读blocked并由显式Plan Request恢复', (t) => {
  const current = fixture(t);
  current.writeDeclaration();
  const request = declarationRequest(['buildr', 'buildr-web']);
  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: request });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.environment.preparationDeclarations[0].status, 'ready');
  assert.deepEqual(prepared.environment.preparationRecipes.map((recipe) => recipe.recipe), ['buildr.npm-ci', 'buildr-web.npm-ci']);
  assert.equal(prepared.environment.preparationRecipes.some((recipe) => recipe.recipe === 'unrelated.npm-ci'), false);

  const writesBeforeInspect = current.writes();
  current.writeDeclaration(declarationFor(['buildr', 'buildr-web', 'unrelated'], 179_000));
  const stale = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(stale.status, 'blocked');
  assert.equal(stale.environment.preparationDeclarations[0].status, 'drifted');
  assert.match(stale.nextActions[0], /trigger: environment-gap/);
  assert.match(stale.nextActions[0], /declaration-intake Skill/);
  assert.equal(current.writes(), writesBeforeInspect);

  const recovered = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: request });
  assert.equal(recovered.status, 'ready', JSON.stringify(recovered, null, 2));
  assert.notEqual(recovered.environment.preparationPlan.identity, prepared.environment.preparationPlan.identity);
  assert.equal(recovered.environment.preparationSteps.every((step) => step.executed), true);
  assert.equal(current.installRoots().length, 4);
});

test('Preparation Declaration缺失时Environment blocked并只返回Intake恢复入口', (t) => {
  const current = fixture(t);
  const declarationPath = path.join(current.root, 'projects', 'product', 'preparation.yml');
  assert.equal(fs.existsSync(declarationPath), false);
  const result = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: declarationRequest(['buildr', 'buildr-web']) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'project_environment_preparation_missing');
  assert.match(result.nextActions[0], /declaration-intake Skill/);
  assert.match(result.nextActions[0], /service:product\/buildr-web/);
  assert.equal(fs.existsSync(declarationPath), false);
  assert.equal(current.installRoots().length, 0);
});
