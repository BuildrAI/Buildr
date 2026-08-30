import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { planRetainedTaskFinishActivation } from '../../src/task/application/finish/task-finish-activation.mjs';
import { createTaskFinishProductHandlers } from '../../src/task/application/finish/task-finish-product-executor.mjs';
import { createIsolatedGitCarrier, observeGitTaskContribution } from '../../src/task/application/finish/git-task-contribution.mjs';
import { createTaskFinishSqliteRuntime, persistTaskFinishRun } from '../helpers/task-finish-sqlite-fixture.mjs';

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function writeExecutable(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
}

const fakeBuildr = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const target = args[args.indexOf('--target') + 1];
if (args[0] === 'doctor') {
  const skill = fs.readFileSync(path.join(target, 'skills', 'example', 'SKILL.md'), 'utf8');
  if (skill.includes('doctor-overflow')) process.stdout.write('x'.repeat(5 * 1024 * 1024));
  const ready = !skill.includes('doctor-failure') && args[args.indexOf('--agent') + 1] === 'codex';
  process.stdout.write(JSON.stringify({ health: { ready }, findings: ready ? [] : [{ code: 'fixture.not-ready' }] }) + '\\n');
  if (!ready) process.exitCode = 1;
}
else if (args[0] === 'web' && args[1] === 'launcher') process.stdout.write(JSON.stringify({ installed: true }) + '\\n');
else if (args[0] === 'render') {
  const skill = fs.readFileSync(path.join(target, 'skills', 'example', 'SKILL.md'), 'utf8');
  if (skill.includes('tracked-delta')) fs.writeFileSync(path.join(target, 'README.md'), 'render changed tracked source\\n');
} else process.exit(2);
`;

function fixture(t, { contributionPath, contributionContent }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-activation-delivery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const seed = path.join(root, 'seed');
  const remote = path.join(root, 'remote.git');
  const retained = path.join(root, 'workspace');
  fs.mkdirSync(seed);
  fs.writeFileSync(path.join(seed, 'AGENTS.md'), '# Finish activation test fixture\n');
  fs.mkdirSync(path.join(seed, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  command(seed, 'git', ['init', '-b', 'dev']);
  command(seed, 'git', ['config', 'user.name', 'Buildr Activation']);
  command(seed, 'git', ['config', 'user.email', 'activation@example.com']);
  fs.writeFileSync(path.join(seed, '.gitignore'), '/.buildr/\n/.worktrees/\n/.agents/\n');
  fs.writeFileSync(path.join(seed, 'README.md'), '# activation\n');
  writeExecutable(path.join(seed, 'projects', 'product', 'buildr'), fakeBuildr);
  fs.mkdirSync(path.join(seed, 'rules', 'buildr'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'rules', 'buildr', 'core.md'), 'old managed rule\n');
  fs.mkdirSync(path.join(seed, 'skills', 'example'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'skills', 'example', 'SKILL.md'), 'old skill\n');
  const packageRule = path.join(seed, 'projects', 'product', 'services', 'buildr', 'resources', 'workspace', 'AGENTS.md');
  fs.mkdirSync(path.dirname(packageRule), { recursive: true });
  fs.writeFileSync(packageRule, 'old managed rule\n');
  command(seed, 'git', ['add', '-A']);
  command(seed, 'git', ['commit', '-m', 'baseline']);
  command(root, 'git', ['init', '--bare', remote]);
  command(seed, 'git', ['remote', 'add', 'origin', remote]);
  command(seed, 'git', ['push', '-u', 'origin', 'dev']);
  command(root, 'git', ['clone', '--branch', 'dev', remote, retained]);
  command(retained, 'git', ['config', 'user.name', 'Buildr Activation']);
  command(retained, 'git', ['config', 'user.email', 'activation@example.com']);
  const environmentRoot = path.join(retained, '.worktrees', 'activation');
  command(retained, 'git', ['worktree', 'add', '-b', 'codex/activation', environmentRoot, 'dev']);
  const changed = path.join(environmentRoot, contributionPath);
  fs.mkdirSync(path.dirname(changed), { recursive: true });
  fs.writeFileSync(changed, contributionContent);
  command(environmentRoot, 'git', ['add', contributionPath]);
  command(environmentRoot, 'git', ['commit', '-m', 'candidate']);
  const expectedTargetRef = command(retained, 'git', ['rev-parse', 'HEAD']);
  const taskContribution = observeGitTaskContribution({ root: environmentRoot, deliveryBaselineHead: expectedTargetRef });
  const isolated = createIsolatedGitCarrier({ repositoryRoot: environmentRoot, workspaceRoot: retained, runId: 'activation-delivery', deliveryBaselineHead: expectedTargetRef, taskContribution, message: 'carrier' });
  const activationPlan = planRetainedTaskFinishActivation({ agent: 'codex', changedPaths: isolated.changedPaths });
  const carrier = { identity: 'sha256-carrier', ...isolated, kind: 'git-isolated-commit', branch: null, expectedTargetRef, targetRef: 'origin/dev', activationPlan };
  const run = { runId: 'activation-delivery', identity: { task: 'activation', handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1, contentTargetIdentity: 'sha256-target', agent: 'codex', targetBranch: 'dev', remote: 'origin', environmentRoot, workspaceRoot: retained }, deliveryCarrier: carrier, delivery: null };
  const sqliteRuntime = createTaskFinishSqliteRuntime(retained, run.identity.task);
  const persistedRun = persistTaskFinishRun(sqliteRuntime, retained, run.identity, run.runId);
  persistedRun.deliveryCarrier = run.deliveryCarrier;
  sqliteRuntime.writeTaskFinishRunPersistence(retained, persistedRun);
  const runtime = {
    ...sqliteRuntime,
    assertTaskDevelopmentCarrier: () => ({ status: 'equivalent' }),
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      controllerInvocation: { command: path.join(retained, 'projects', 'product', 'buildr'), argsPrefix: [], sourceRoot: path.join(retained, 'projects', 'product', 'services', 'buildr') },
    }),
  };
  return { retained, remote, run: persistedRun, runtime, handlers: createTaskFinishProductHandlers({ runtime, root: environmentRoot }) };
}

test('Workspace Skill contribution renders and never syncs', async (t) => {
  const data = fixture(t, { contributionPath: 'skills/example/SKILL.md', contributionContent: 'updated skill\n' });
  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
  assert.equal(result.output.delivery.activation.plan.mode, 'render-runtime');
  assert.equal(result.operations.some((item) => item.id === 'deliver-retained-render'), true);
  assert.equal(result.operations.some((item) => item.id === 'deliver-retained-sync'), false);
  const doctor = result.operations.find((item) => item.id === 'deliver-retained-doctor');
  const activationIndex = result.operations.findIndex((item) => item.id === 'activate-workspace-structured-store');
  const doctorIndex = result.operations.findIndex((item) => item.id === 'deliver-retained-doctor');
  assert.equal(activationIndex >= 0 && activationIndex < doctorIndex, true);
  assert.deepEqual(doctor.args.slice(0, 3), ['doctor', '--agent', 'codex']);
  assert.equal(result.output.delivery.finalRemoteRef, data.run.deliveryCarrier.head);
});

test('render tracked delta becomes activation attention without negating delivery', async (t) => {
  const data = fixture(t, { contributionPath: 'skills/example/SKILL.md', contributionContent: 'tracked-delta\n' });
  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'passed');
  assert.equal(result.output.delivery.status, 'delivered');
  assert.equal(result.output.delivery.activation.status, 'attention');
  assert.equal(result.output.delivery.activation.code, 'task-finish.render-produced-tracked-delta');
  assert.deepEqual(result.output.delivery.activation.diagnostic.map((item) => item.path), ['README.md']);
  assert.equal(command(data.retained, 'git', ['diff', '--cached', '--name-only']), '');
});

test('Doctor failure becomes activation attention without negating delivery', async (t) => {
  const data = fixture(t, { contributionPath: 'skills/example/SKILL.md', contributionContent: 'doctor-failure\n' });
  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'passed');
  assert.equal(result.operations.some((item) => item.id === 'deliver-retained-sync'), false);
  assert.equal(result.output.delivery.status, 'delivered');
  assert.equal(result.output.delivery.remoteAfterRef, data.run.deliveryCarrier.head);
  assert.equal(result.output.delivery.activation.code, 'task-finish.retained-doctor-failed');
  assert.equal(result.output.delivery.retainedDoctor, 'attention');
});

test('Structured Store activation失败时不运行最终Doctor且Delivery保持成立', async (t) => {
  const data = fixture(t, { contributionPath: 'skills/example/SKILL.md', contributionContent: 'updated skill\n' });
  let pendingActivation = false;
  data.runtime.openWorkspaceStructuredStore = (root, options = {}) => {
    if (options.allowPendingRead === true && options.writable === false) {
      pendingActivation = true;
      return {
        present: true,
        version: 18,
        migrationRequired: true,
        scripts: Array.from({ length: 20 }, (_, version) => ({ version })),
        database: { close() {} },
      };
    }
    if (pendingActivation && options.writable === true) {
      pendingActivation = false;
      throw Object.assign(new Error('migration writer failed'), { code: 'workspace_store_database_failed' });
    }
    throw new Error(`unexpected structured-store activation call: ${root} ${JSON.stringify(options)}`);
  };

  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'passed');
  assert.equal(result.output.delivery.status, 'delivered');
  assert.equal(result.output.delivery.activation.status, 'attention');
  assert.equal(result.output.delivery.activation.code, 'workspace_store_database_failed');
  assert.equal(result.operations.some((item) => item.id === 'deliver-retained-doctor'), false);
});

test('Doctor compact输出超限保留独立失败分类', async (t) => {
  const data = fixture(t, { contributionPath: 'skills/example/SKILL.md', contributionContent: 'doctor-overflow\n' });
  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'passed');
  assert.equal(result.output.delivery.activation.status, 'attention');
  assert.equal(result.output.delivery.activation.code, 'doctor.output_limit_exceeded');
  assert.match(result.output.delivery.activation.message, /4194304 bytes/);
});

test('Buildr package contribution is delivered without generic sync', async (t) => {
  const contributionPath = 'projects/product/services/buildr/resources/workspace/AGENTS.md';
  const data = fixture(t, { contributionPath, contributionContent: 'new managed rule\n' });
  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
  const delivery = result.output.delivery;
  assert.equal(delivery.activation.plan.mode, 'none');
  assert.equal(result.operations.some((item) => item.id === 'deliver-retained-sync'), false);
  assert.equal(result.operations.some((item) => item.id === 'deliver-cli-install'), false);
  assert.equal(result.operations.some((item) => item.id === 'deliver-local-app-install'), false);
  assert.equal(delivery.runtimeInstall, 'not-applicable');
  assert.equal(delivery.localAppDelivery, 'not-applicable');
  assert.equal(delivery.finalRemoteRef, delivery.carrierRef);
  assert.equal(command(data.retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], delivery.finalRemoteRef);
});

test('Environment cleanup attention不跳过Finish-owned carrier removal', async (t) => {
  const data = fixture(t, { contributionPath: 'skills/example/SKILL.md', contributionContent: 'updated skill\n' });
  const delivered = await data.handlers.deliver({ run: data.run });
  assert.equal(delivered.status, 'passed', JSON.stringify(delivered, null, 2));
  data.run.delivery = delivered.output.delivery;
  data.run.developmentHandoff = {
    identity: data.run.identity.handoffIdentity,
    candidate: { identity: data.run.identity.candidateIdentity, generation: data.run.identity.candidateGeneration },
    gates: {},
  };
  const carrierRoot = data.run.deliveryCarrier.root;
  assert.equal(fs.existsSync(carrierRoot), true);

  const cleaned = await data.handlers.cleanup({ run: data.run });
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned, null, 2));
  assert.equal(cleaned.output.completion.cleanup.status, 'attention');
  assert.equal(cleaned.output.completion.cleanup.carriers.status, 'cleaned');
  assert.deepEqual(cleaned.output.completion.cleanup.carriers.repositories, [{ selector: 'workspace', status: 'removed', code: null }]);
  assert.equal(fs.existsSync(carrierRoot), false);
  assert.equal(command(data.retained, 'git', ['worktree', 'list', '--porcelain']).includes(carrierRoot), false);
});
