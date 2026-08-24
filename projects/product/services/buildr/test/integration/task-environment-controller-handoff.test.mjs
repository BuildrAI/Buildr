import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { registerTaskEnvironmentApplication } from '../../src/task/application/task-environment-application.mjs';
import { normalizeTaskEnvironmentPlan } from '../../src/task/domain/task-environment-plan.mjs';

const TASK_ID = 'controller-binding';
const GIT_PROVIDER = 'buildr.git-worktree-provider/v1';
const PLAN_INPUT = {
  schemaVersion: 'buildr.task-environment-plan/v1',
  services: [{ selector: 'service:product/buildr', disposition: 'not-applicable', reason: 'Controller fixture has no technical preparation Step.', steps: [] }],
};

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function writeController(controllerRoot, marker = 'm1') {
  fs.mkdirSync(path.join(controllerRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(controllerRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(controllerRoot, 'package'), { recursive: true });
  fs.writeFileSync(path.join(controllerRoot, 'src', 'controller.mjs'), `export const controller = '${marker}';\n`);
  fs.writeFileSync(path.join(controllerRoot, 'bin', 'buildr.mjs'), `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'version') process.stdout.write(JSON.stringify({ version: 'fixture' }) + '\\n');
else if (args[0] === 'sync') { fs.writeFileSync('candidate-sync-pollution.txt', 'polluted\\n'); process.stdout.write('synced\\n'); }
else if (args[0] === 'render' && args.includes('--product-skill')) process.stdout.write('rendered product Skill\\n');
else if (args[0] === 'runtime' && args[1] === 'check') process.stdout.write('Projection identity: candidate-projection\\n');
else process.exitCode = 1;
`);
  fs.writeFileSync(path.join(controllerRoot, 'package', 'marker.txt'), `${marker}\n`);
  fs.writeFileSync(path.join(controllerRoot, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
  fs.writeFileSync(path.join(controllerRoot, 'package-lock.json'), '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}\n');
}

function receipt({ root, controllerRoot, executionRoot, isolated, timestamp }) {
  const planPayload = {
    schemaVersion: 'buildr.task-environment-plan/v3',
    projects: [{
      project: 'product', source: { kind: 'task-inline', path: null, identity: null },
      scopes: [
        { selector: 'project:product', disposition: 'not-applicable', reason: 'Controller fixture has no Project preparation Step.', recipes: [] },
        { selector: 'service:product/buildr', disposition: 'not-applicable', reason: 'Controller fixture has no technical preparation Step.', recipes: [] },
      ],
    }],
    capabilityPreparation: [],
  };
  const plan = normalizeTaskEnvironmentPlan(planPayload, { scopeSelectors: ['project:product', 'service:product/buildr'] });
  const probes = {
    runtime: { status: 'ready', identity: 'runtime-m1', observedAt: timestamp, diagnostic: null },
    cli: { status: 'ready', identity: 'cli-m1', observedAt: timestamp, diagnostic: null },
    preparation: { status: 'ready', identity: plan.identity, observedAt: timestamp, diagnostic: null },
    projection: { status: 'ready', identity: 'projection-m1', observedAt: timestamp, diagnostic: null },
  };
  return {
    schemaVersion: 'buildr.task-environment-receipt/v6',
    taskId: TASK_ID,
    workspace: { id: 'workspace-fixture', root },
    controller: { sourceRoot: controllerRoot, cliSource: path.join(controllerRoot, 'bin', 'buildr.mjs'), identity: 'sha256-created-at-m1', adapter: 'codex' },
    runtimeInvocation: { kind: 'node', executable: process.execPath, version: process.version, identity: 'sha256-runtime', searchPrefix: path.dirname(process.execPath), source: 'stable-controller' },
    status: 'ready',
    scopes: [{
      selector: 'workspace', kind: 'workspace', project: null, service: null, sourcePath: '.', executionRoot, validationRoot: executionRoot, shared: !isolated,
      provider: isolated ? { capability: GIT_PROVIDER, selector: 'workspace', evidence: path.join(root, '.git', 'buildr', 'task-worktrees', `${TASK_ID}.json`) } : null,
      ...probes,
    }, {
      selector: 'project:product', kind: 'project', project: 'product', service: null, sourcePath: 'projects/product', executionRoot: path.join(executionRoot, 'projects', 'product'), validationRoot: executionRoot, shared: !isolated, provider: null, ...probes,
    }, {
      selector: 'service:product/buildr', kind: 'service', project: 'product', service: 'buildr', sourcePath: 'projects/product/services/buildr', executionRoot: path.join(executionRoot, 'projects', 'product', 'services', 'buildr'), validationRoot: executionRoot, shared: !isolated, provider: null, ...probes,
    }],
    preparationPlan: plan,
    preparationDeclarations: [{ project: 'product', source: 'task-inline', path: null, identity: null, preparedIdentity: null, status: 'ready', observedAt: timestamp, diagnostic: null }],
    preparationScopes: [
      { selector: 'project:product', disposition: 'not-applicable', status: 'not-applicable', recipeIds: [], observedAt: timestamp, diagnostic: 'Controller fixture has no Project preparation Step.' },
      { selector: 'service:product/buildr', disposition: 'not-applicable', status: 'not-applicable', recipeIds: [], observedAt: timestamp, diagnostic: 'Controller fixture has no technical preparation Step.' },
    ],
    preparationRecipes: [],
    preparationSteps: [],
    resources: [],
    latest: { ready: { status: 'ready', observedAt: timestamp, diagnostic: null }, cleanup: null },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function fixture(t, { withReceipt = true, isolated = withReceipt } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-controller-binding-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const controllerRoot = path.join(root, 'projects', 'product', 'services', 'buildr');
  const alternateControllerRoot = path.join(root, 'fixtures', 'alternate-controller');
  const productCli = path.join(root, 'projects', 'product', 'buildr');
  writeController(controllerRoot);
  writeController(alternateControllerRoot, 'alternate');
  fs.mkdirSync(path.dirname(productCli), { recursive: true });
  fs.writeFileSync(productCli, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'version') process.stdout.write(JSON.stringify({ version: 'fixture' }) + '\\n');
else if (args[0] === 'sync') { fs.writeFileSync('candidate-sync-pollution.txt', 'polluted\\n'); process.stdout.write('synced\\n'); }
else if (args[0] === 'render' && args.includes('--product-skill')) process.stdout.write('rendered product Skill\\n');
else if (args[0] === 'runtime' && args[1] === 'check') process.stdout.write('Projection identity: candidate-projection\\n');
else process.exitCode = 1;
`);
  fs.chmodSync(productCli, 0o755);
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['config', 'user.email', 'buildr-test@example.com']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'baseline M1']);
  const m1 = git(root, ['rev-parse', 'HEAD']);
  const taskRoot = path.join(root, '.worktrees', TASK_ID);
  if (isolated) {
    fs.mkdirSync(path.dirname(taskRoot), { recursive: true });
    git(root, ['worktree', 'add', '-b', `tasks/${TASK_ID}`, taskRoot, m1]);
    fs.mkdirSync(path.join(taskRoot, 'projects', 'product', 'services', 'buildr', 'node_modules'), { recursive: true });
  }
  fs.mkdirSync(path.join(controllerRoot, 'node_modules'), { recursive: true });

  const timestamp = new Date().toISOString();
  let productRoot = controllerRoot;
  let managerCliSource = path.join(controllerRoot, 'bin', 'buildr.mjs');
  let persistence = withReceipt ? {
    root,
    directory: path.join(root, '.buildr', 'tasks', TASK_ID),
    file: `workspace-sqlite:task-environment/${TASK_ID}`,
    receipt: receipt({ root, controllerRoot, executionRoot: isolated ? taskRoot : root, isolated, timestamp }),
  } : null;
  const calls = { writes: 0, providerPlans: 0, providerMutations: 0, providerCleanups: 0, providerCleanupInput: null, projectionChecks: 0, resourceProbes: 0, resourceCleanups: 0 };
  let retainedProjectionReady = true;
  const providerEvidence = {
    branch: `tasks/${TASK_ID}`,
    repositories: [{ selector: 'workspace', startPoint: m1, checkoutPath: taskRoot }],
  };
  const runtime = {
    productRoot: () => productRoot,
    currentProductInvocation: (options = {}) => ({
      command: process.execPath,
      argsPrefix: [options.cliPath || managerCliSource],
      kind: options.kind || 'host-node',
    }),
    assertCanonicalTaskWorkspace: () => root,
    taskEnvironmentPath: (_target, taskId) => `workspace-sqlite:task-environment/${taskId}`,
    readTaskRecordPersistence: () => ({ record: { taskId: TASK_ID, status: 'active', scope: { projects: ['product'], services: [{ project: 'product', service: 'buildr' }] }, changes: [] } }),
    readTaskEnvironmentPersistence: (_target, _taskId, options = {}) => {
      if (!persistence && !options.optional) throw new Error('Environment Receipt missing');
      return persistence;
    },
    writeTaskEnvironmentPersistence: (_target, value) => {
      calls.writes += 1;
      persistence = {
        root,
        directory: path.join(root, '.buildr', 'tasks', TASK_ID),
        file: `workspace-sqlite:task-environment/${TASK_ID}`,
        receipt: structuredClone(value),
      };
      return persistence;
    },
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, projects: { product: { code: 'product', source: { type: 'workspace', path: 'projects/product' } } } }),
    readServiceRegistryRecord: () => ({ services: { buildr: { code: 'buildr', source: { type: 'workspace', path: 'projects/product/services/buildr' } } } }),
    readWorkspaceRecord: () => ({ workspace: { id: 'workspace-fixture' } }),
    isSupportedAgent: (adapter) => ['codex', 'claude-code'].includes(adapter),
    checkRuntimeAdapter: () => {
      calls.projectionChecks += 1;
      return { runtimeSourceEvidence: { projectionReady: retainedProjectionReady, projectionIdentity: 'retained-projection' } };
    },
    renderRuntime: () => { throw new Error('projection should already be ready'); },
    readGitWorktreeEvidence: () => isolated ? { evidence: providerEvidence } : null,
    gitWorktreeEvidencePath: () => path.join(root, '.git', 'buildr', 'task-worktrees', `${TASK_ID}.json`),
    planGitWorktrees: () => {
      calls.providerPlans += 1;
      return { repositories: providerEvidence.repositories };
    },
    prepareGitWorktrees: () => {
      calls.providerMutations += 1;
      return { status: 'ready', repositories: providerEvidence.repositories, evidencePath: path.join(root, '.git', 'buildr', 'task-worktrees', `${TASK_ID}.json`), effects: [] };
    },
    inspectGitWorktrees: () => ({ status: 'ready', repositories: providerEvidence.repositories, diagnostic: null }),
    cleanupGitWorktrees: (input) => {
      calls.providerCleanups += 1;
      calls.providerCleanupInput = input;
      return { status: 'cleaned', effects: [] };
    },
    probeTaskEnvironmentResource: (resource) => {
      calls.resourceProbes += 1;
      return { status: 'ready', identity: resource.identity.providerIdentity, observedAt: new Date().toISOString(), diagnostic: null };
    },
    cleanupTaskEnvironmentResource: async (resource) => {
      calls.resourceCleanups += 1;
      return { probe: { status: 'blocked', identity: resource.identity.providerIdentity, observedAt: new Date().toISOString(), diagnostic: 'released' } };
    },
  };
  registerTaskEnvironmentApplication(runtime);
  return {
    root,
    controllerRoot,
    alternateControllerRoot,
    taskRoot,
    m1,
    plan: PLAN_INPUT,
    runtime,
    calls,
    receipt: () => persistence?.receipt || null,
    setProductRoot: (value) => { productRoot = value; },
    setManagerCliSource: (value) => { managerCliSource = value; },
    setRetainedProjectionReady: (value) => { retainedProjectionReady = value; },
    advanceManager() {
      fs.appendFileSync(path.join(controllerRoot, 'src', 'controller.mjs'), "export const manager = 'm2';\n");
      git(root, ['add', 'projects/product/services/buildr/src/controller.mjs']);
      git(root, ['commit', '-m', 'advance retained manager to M2']);
      return git(root, ['rev-parse', 'HEAD']);
    },
  };
}

test('npm manager uses the installed CLI entry outside the product payload root', (t) => {
  const current = fixture(t, { withReceipt: false, isolated: false });
  const envelopeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-installed-manager-')));
  t.after(() => fs.rmSync(envelopeRoot, { recursive: true, force: true }));
  const productRoot = path.join(envelopeRoot, 'payload', 'product');
  const cliSource = path.join(envelopeRoot, 'bin', 'buildr.mjs');
  fs.mkdirSync(path.join(productRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(productRoot, 'package'), { recursive: true });
  fs.mkdirSync(path.join(productRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.dirname(cliSource), { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'src', 'manager.mjs'), 'export const manager = true;\n');
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
  fs.writeFileSync(path.join(productRoot, 'bin', 'buildr.mjs'), 'throw new Error("payload fallback must not run");\n');
  fs.writeFileSync(cliSource, `#!/usr/bin/env node
if (process.argv[2] === 'version') process.stdout.write(JSON.stringify({ version: 'fixture' }) + '\\n');
else process.exitCode = 1;
`);
  current.setProductRoot(productRoot);
  current.setManagerCliSource(cliSource);

  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: current.plan });

  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.environment.controller.sourceRoot, productRoot);
  assert.equal(current.receipt().controller.cliSource, cliSource);
  assert.equal(fs.existsSync(path.join(productRoot, 'bin', 'buildr.mjs')), true);
});

test('retained controller uses candidate CLI to render and verify a candidate-owned runtime projection without source sync', (t) => {
  const current = fixture(t);
  current.setRetainedProjectionReady(false);

  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex' });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.environment.scopes[0].projection.identity, 'candidate-projection');
  assert.equal(prepared.environment.controller.identity, 'sha256-created-at-m1');
  assert.equal(fs.existsSync(path.join(current.taskRoot, 'candidate-sync-pollution.txt')), false);
  assert.equal(git(current.taskRoot, ['status', '--short']), '');

  const inspected = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(inspected.status, 'ready', JSON.stringify(inspected, null, 2));
  assert.equal(inspected.environment.scopes[0].projection.identity, 'candidate-projection');
});

test('dirty Git-backed manager blocks first prepare before any persistent effect', async (t) => {
  const cases = {
    staged(current) {
      fs.appendFileSync(path.join(current.controllerRoot, 'src', 'controller.mjs'), 'export const staged = true;\n');
      git(current.root, ['add', 'projects/product/services/buildr/src/controller.mjs']);
    },
    unstaged(current) {
      fs.appendFileSync(path.join(current.controllerRoot, 'package.json'), ' ');
    },
    untracked(current) {
      fs.writeFileSync(path.join(current.controllerRoot, 'bin', 'untracked.mjs'), 'export {};\n');
    },
  };
  for (const [name, dirty] of Object.entries(cases)) {
    await t.test(name, () => {
      const current = fixture(t, { withReceipt: false, isolated: false });
      dirty(current);
      const result = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false });
      assert.equal(result.status, 'blocked');
      assert.equal(result.diagnostic.code, 'task_environment_manager_dirty');
      assert.deepEqual(result.effects, []);
      assert.equal(current.receipt(), null);
      assert.equal(current.calls.writes, 0);
      assert.equal(current.calls.providerPlans, 0);
      assert.equal(current.calls.providerMutations, 0);
      assert.equal(current.calls.projectionChecks, 0);
    });
  }
});

test('.buildr lifecycle changes do not affect manager clean or Receipt creation fingerprint', (t) => {
  const current = fixture(t, { withReceipt: false, isolated: false });
  const metadata = path.join(current.root, '.buildr', 'tasks', 'other-task');
  fs.mkdirSync(metadata, { recursive: true });
  fs.writeFileSync(path.join(metadata, 'task.yml'), 'taskId: other-task\n');
  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false, plan: current.plan });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  const createdIdentity = current.receipt().controller.identity;
  fs.appendFileSync(path.join(metadata, 'task.yml'), 'status: active\n');
  const restored = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false });
  assert.equal(restored.status, 'ready', JSON.stringify(restored, null, 2));
  assert.equal(current.receipt().controller.identity, createdIdentity);
  assert.equal(restored.effects.some((effect) => effect.type === 'controller-handoff'), false);
});

test('existing Task Environment placement cannot switch between Git and shared roots', async (t) => {
  await t.test('Git to shared', (subtest) => {
    const current = fixture(subtest);
    const result = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: false });
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostic.code, 'task_environment_plan_mismatch');
    assert.deepEqual(result.effects, []);
    assert.equal(current.calls.writes, 0);
    assert.equal(current.calls.providerPlans, 0);
    assert.equal(current.calls.providerMutations, 0);
  });

  await t.test('shared to Git', (subtest) => {
    const current = fixture(subtest, { isolated: false });
    const result = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex', useGit: true });
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostic.code, 'task_environment_plan_mismatch');
    assert.deepEqual(result.effects, []);
    assert.equal(current.calls.writes, 0);
    assert.equal(current.calls.providerPlans, 0);
    assert.equal(current.calls.providerMutations, 0);
  });
});

test('clean retained M2 keeps probing the M1 task checkout without handoff or source update', (t) => {
  const current = fixture(t);
  const m2 = current.advanceManager();
  assert.notEqual(m2, current.m1);
  assert.equal(git(current.taskRoot, ['rev-parse', 'HEAD']), current.m1);

  const inspected = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
  assert.equal(inspected.status, 'ready', JSON.stringify(inspected, null, 2));
  assert.equal(inspected.environment.controller.identity, 'sha256-created-at-m1');
  assert.equal(git(current.taskRoot, ['rev-parse', 'HEAD']), current.m1);

  const checksBefore = current.calls.projectionChecks;
  const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex' });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.ok(current.calls.projectionChecks > checksBefore);
  assert.equal(current.receipt().controller.identity, 'sha256-created-at-m1');
  assert.equal(prepared.effects.some((effect) => effect.type === 'controller-handoff'), false);
  assert.equal(prepared.environment.scopes[0].executionRoot, current.taskRoot);
  assert.equal(git(current.taskRoot, ['rev-parse', 'HEAD']), current.m1);
});

test('clean retained manager upgrade can register/release resources and complete authorized cleanup without handoff', async (t) => {
  const current = fixture(t);
  current.advanceManager();
  const timestamp = new Date().toISOString();
  const input = {
    id: 'preview:demo', kind: 'preview', scope: 'workspace', provider: 'local-app-preview',
    identity: { productCheckout: current.taskRoot, url: 'http://127.0.0.1:4321', port: 4321, pid: 1234, providerIdentity: `demo:1234:${current.m1}` },
    handle: { instance: 'demo' },
    probe: { status: 'ready', identity: `demo:1234:${current.m1}`, observedAt: timestamp, diagnostic: null },
  };
  const registered = current.runtime.registerTaskEnvironmentResource(current.root, TASK_ID, input);
  assert.equal(registered.resource.id, input.id);
  const released = current.runtime.releaseTaskEnvironmentResource(current.root, TASK_ID, { id: input.id, provider: input.provider, probe: { ...input.probe, status: 'blocked', diagnostic: 'stopped' } });
  assert.equal(released.resource.status, 'released');
  assert.equal(current.receipt().controller.identity, 'sha256-created-at-m1');

  const result = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID, {
    type: 'finish', deliveries: { workspace: 'dev' }, candidateRef: current.m1,
  });
  assert.equal(result.status, 'cleaned', JSON.stringify(result, null, 2));
  assert.equal(current.receipt().controller.identity, 'sha256-created-at-m1');
  assert.equal(result.effects.some((effect) => effect.type === 'controller-handoff'), false);
  assert.equal(current.calls.providerCleanups, 1);
});

test('dirty, candidate, sourceRoot and adapter mismatches remain blocked without rewriting the Receipt', async (t) => {
  await t.test('dirty retained manager', async (subtest) => {
    const current = fixture(subtest);
    fs.appendFileSync(path.join(current.controllerRoot, 'src', 'controller.mjs'), 'export const dirty = true;\n');
    const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex' });
    assert.equal(prepared.status, 'blocked');
    assert.equal(prepared.diagnostic.code, 'task_environment_manager_dirty');
    assert.equal(current.calls.writes, 0);
    const cleaned = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID, { type: 'finish', deliveries: { workspace: 'dev' } });
    assert.equal(cleaned.status, 'blocked');
    assert.equal(cleaned.diagnostic.code, 'task_environment_manager_dirty');
    assert.equal(current.calls.writes, 0);
    assert.equal(current.receipt().controller.identity, 'sha256-created-at-m1');
  });

  await t.test('candidate can inspect but cannot mutate', async (subtest) => {
    const current = fixture(subtest);
    current.setProductRoot(path.join(current.taskRoot, 'projects', 'product', 'services', 'buildr'));
    const inspected = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
    assert.equal(inspected.status, 'ready', JSON.stringify(inspected, null, 2));
    const prepared = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex' });
    assert.equal(prepared.status, 'blocked');
    assert.equal(prepared.diagnostic.code, 'task_environment_candidate_controller_forbidden');
    assert.throws(() => current.runtime.registerTaskEnvironmentResource(current.root, TASK_ID, {}), (error) => error.code === 'task_environment_candidate_controller_forbidden');
    const cleaned = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID, { type: 'finish', deliveries: { workspace: 'dev' } });
    assert.equal(cleaned.status, 'blocked');
    assert.equal(cleaned.diagnostic.code, 'task_environment_candidate_controller_forbidden');
    assert.equal(current.calls.writes, 0);
  });

  await t.test('sourceRoot mismatch', (subtest) => {
    const current = fixture(subtest);
    current.setProductRoot(current.alternateControllerRoot);
    const inspected = current.runtime.inspectTaskEnvironment(current.root, TASK_ID);
    assert.equal(inspected.status, 'ready', JSON.stringify(inspected, null, 2));
    const result = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'codex' });
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostic.code, 'task_environment_manager_mismatch');
    assert.throws(() => current.runtime.registerTaskEnvironmentResource(current.root, TASK_ID, {}), (error) => error.code === 'task_environment_manager_mismatch');
    assert.throws(() => current.runtime.releaseTaskEnvironmentResource(current.root, TASK_ID, {}), (error) => error.code === 'task_environment_manager_mismatch');
    assert.equal(current.calls.writes, 0);
  });

  await t.test('adapter mismatch', (subtest) => {
    const current = fixture(subtest);
    const result = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { adapter: 'claude-code' });
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostic.code, 'task_environment_manager_mismatch');
    assert.equal(current.calls.writes, 0);
  });
});

test('首次 prepare 缺少 adapter 必须 fail closed 且零写入', (t) => {
  const current = fixture(t, { withReceipt: false, isolated: false });
  const result = current.runtime.prepareTaskEnvironment(current.root, TASK_ID, { useGit: false, plan: current.plan });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'task_environment_adapter_required');
  assert.equal(current.calls.writes, 0);
  assert.equal(current.receipt(), null);
});

test('cleanup keeps the existing unauthorized diagnostic persistence behavior', async (t) => {
  const current = fixture(t);
  const result = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'task_environment_cleanup_unauthorized');
  assert.equal(current.calls.writes, 1);
  assert.equal(current.receipt().latest.cleanup.status, 'blocked');
});

test('active到completed no-change的golden lifecycle可受控清理Environment', async (t) => {
  const current = fixture(t);

  const active = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID);
  assert.equal(active.status, 'blocked');
  assert.equal(active.diagnostic.code, 'task_environment_cleanup_unauthorized');

  current.runtime.readTaskRecordPersistence = () => ({ record: {
    taskId: TASK_ID,
    status: 'completed',
    result: { summary: '协调任务确认无代码变更。', noChange: true },
  } });
  const completed = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID);

  assert.equal(completed.status, 'cleaned', JSON.stringify(completed, null, 2));
  assert.equal(current.calls.providerCleanupInput.allowNoChange, true);
  assert.deepEqual(current.calls.providerCleanupInput.integratedRefs, {});
  assert.match(current.receipt().latest.cleanup.summary, /无代码变更/);
});

test('普通completed Task缺少Delivery evidence时仍拒绝cleanup', async (t) => {
  const current = fixture(t);
  current.runtime.readTaskRecordPersistence = () => ({ record: {
    taskId: TASK_ID,
    status: 'completed',
    result: { summary: '声称已有代码交付。', noChange: false },
  } });

  const result = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID);

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'task_environment_cleanup_unauthorized');
  assert.equal(current.calls.providerCleanups, 0);
});

test('completed Task可由持久化交付证据独立授权Environment cleanup', async (t) => {
  const current = fixture(t);
  const containment = {
    schemaVersion: 'buildr.task-delivery-containment-proof/v1',
    identity: `sha256-${'3'.repeat(64)}`,
    taskContributionIdentity: `sha256-${'4'.repeat(64)}`,
    targetRef: current.m1,
    changedPaths: ['feature.txt'],
    checkedPaths: [],
  };
  const taskContribution = {
    schemaVersion: 'buildr.git-task-contribution/v1',
    identity: containment.taskContributionIdentity,
    originalBaseline: { head: current.m1, tree: `sha256-${'5'.repeat(64)}` },
    source: { head: current.m1, tree: `sha256-${'6'.repeat(64)}` },
  };
  current.runtime.readTaskRecordPersistence = () => ({ record: {
    taskId: TASK_ID,
    status: 'completed',
    result: { summary: '任务贡献已验证交付。', noChange: false },
  } });
  current.runtime.readTaskFinishCompletionPersistence = () => ({
    status: 'complete',
    completion: {
      result: {
        identity: { task: TASK_ID, repositories: [{ selector: 'workspace', disposition: 'applicable' }] },
        repositories: [{
          selector: 'workspace',
          taskContribution,
          delivery: { status: 'delivered', finalRemoteRef: current.m1, containment },
        }],
      },
    },
  });

  const result = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID);

  assert.equal(result.status, 'cleaned', JSON.stringify(result, null, 2));
  assert.equal(current.calls.providerCleanupInput.integratedRefs.workspace, current.m1);
  assert.deepEqual(current.calls.providerCleanupInput.integratedContributions.workspace, { ...containment, taskContribution });
});

test('completed reconciliation以持久化agent-reviewed equivalence授权Environment cleanup', async (t) => {
  const current = fixture(t);
  const taskContribution = {
    schemaVersion: 'buildr.git-task-contribution/v1',
    identity: `sha256-${'4'.repeat(64)}`,
    originalBaseline: { head: current.m1, tree: `sha256-${'5'.repeat(64)}` },
    source: { head: current.m1, tree: `sha256-${'6'.repeat(64)}` },
  };
  const carrier = {
    identity: `sha256-${'7'.repeat(64)}`,
    kind: 'git-isolated-commit',
    head: current.m1,
    tree: git(current.root, ['rev-parse', `${current.m1}^{tree}`]),
    changedPaths: ['feature.txt'],
  };
  const equivalence = {
    status: 'equivalent',
    reuseMode: 'agent-reviewed-delivery-adaptation',
    semanticEquivalence: 'agent-reviewed-not-proven-by-buildr',
    carrierIdentity: carrier.identity,
    taskContributionIdentity: taskContribution.identity,
  };
  current.runtime.readTaskRecordPersistence = () => ({ record: {
    taskId: TASK_ID,
    status: 'completed',
    result: { summary: '适配后的任务贡献已验证交付。', noChange: false },
  } });
  current.runtime.readTaskFinishCompletionPersistence = () => ({
    status: 'complete',
    completion: {
      result: {
        identity: { task: TASK_ID, repositories: [{ selector: 'workspace', disposition: 'applicable' }] },
        repositories: [{
          selector: 'workspace', taskContribution, deliveryCarrier: carrier, equivalence,
          delivery: { status: 'delivered', finalRemoteRef: current.m1, containment: null },
        }],
      },
    },
  });

  const result = await current.runtime.cleanupTaskEnvironment(current.root, TASK_ID);

  assert.equal(result.status, 'cleaned', JSON.stringify(result, null, 2));
  assert.deepEqual(current.calls.providerCleanupInput.integratedContributions.workspace, {
    ...carrier,
    reuseMode: 'agent-reviewed-delivery-adaptation',
    taskContribution,
    deliveryEquivalence: equivalence,
  });
});
