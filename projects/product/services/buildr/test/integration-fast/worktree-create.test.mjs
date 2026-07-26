import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(productRoot, 'bin', 'buildr.mjs');
let workspace;

function runBuildr(args, expectedStatus = 0, env = process.env) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: productRoot, encoding: 'utf8', env });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function git(args) {
  const result = spawnSync('git', ['-C', workspace, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function gitAt(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

describe('worktree create CLI', { concurrency: 1 }, () => {
  before(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-worktree-integration-'));
    const initialized = spawnSync(process.execPath, [cli, 'init', '--agent', 'codex', '--target', workspace, '--name', 'worktree-fixture', '--description', 'worktree fixture', '--profile', 'team'], { cwd: productRoot, encoding: 'utf8' });
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
    git(['init', '-b', 'main']);
    git(['config', 'user.name', 'Buildr Test']);
    git(['config', 'user.email', 'buildr-test@example.com']);
    git(['add', '.']);
    git(['commit', '-m', 'baseline']);
  });

  after(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('creates, diagnoses, auto-syncs runtime stale, then reuses without another bootstrap', () => {
    const created = runBuildr(['worktree', 'create', 'demo', '--agent', 'codex', '--branch', 'codex/demo', '--start-point', 'main', '--target', workspace, '--json']);
    assert.equal(created.schemaVersion, 'buildr.worktree-create/v2');
    assert.equal(created.state, 'created');
    assert.equal(created.treeChanged, true);
    assert.equal(created.bootstrap.doctorBefore.health.ready, false);
    assert.deepEqual(created.bootstrap.doctorBefore.findings.map((finding) => finding.code), ['runtime.codex_stale']);
    assert.deepEqual(created.bootstrap.sync, { status: 'applied', reason: 'runtime-stale-only' });
    assert.equal(created.bootstrap.doctorAfter.health.ready, true);
    assert.equal(created.ready, true);
    assert.equal(created.runtimeExpectation.activation.rules, 'path-read');
    assert.equal(created.runtimeExpectation.activation.skills, 'session-start');
    assert.equal(created.runtimeExpectation.sessionConsumption, 'unknown');
    assert.equal(created.adoption.status, 'not-required');
    assert.equal(git(['-C', created.worktree.path, 'status', '--porcelain']), '');

    const cwdOnly = runBuildr(['worktree', 'context', '--target', created.worktree.path, '--json']);
    assert.equal(cwdOnly.ready, true);
    assert.equal(cwdOnly.executionReady, true);
    assert.equal(cwdOnly.adoption.status, 'not-verified');
    assert.equal(cwdOnly.executionBinding.workdir, created.worktree.path);
    const adopted = runBuildr(['worktree', 'adopt', '--agent', 'codex', '--target', created.worktree.path, '--session-root', workspace, '--session-handle', 'codex-demo-session', '--root-evidence-source', 'host-context', '--mode', 'new-session', '--started-at', new Date().toISOString(), '--json']);
    assert.equal(adopted.schemaVersion, 'buildr.task-environment-adoption/v1');
    assert.equal(adopted.environmentEvidence.assurance, 'buildr-verified');
    assert.equal(adopted.sessionEvidence.assurance, 'agent-attested');
    const adoptedContext = runBuildr(['worktree', 'context', '--target', created.worktree.path, '--session-root', created.worktree.path, '--session-handle', 'codex-demo-session', '--json']);
    assert.equal(adoptedContext.executionReady, true);
    assert.equal(adoptedContext.adoption.status, 'activation-verified');
    const wrongSession = runBuildr(['worktree', 'context', '--target', created.worktree.path, '--session-root', workspace, '--session-handle', 'other-session', '--json']);
    assert.equal(wrongSession.executionReady, true);
    assert.equal(wrongSession.adoption.blocked.code, 'worktree.activation_session_mismatch');
    const agentsFile = path.join(created.worktree.path, 'AGENTS.md');
    const agentsBefore = fs.readFileSync(agentsFile, 'utf8');
    fs.writeFileSync(agentsFile, `${agentsBefore.trimEnd()}\n\n<!-- adoption drift fixture -->\n`);
    const staleRuntime = runBuildr(['worktree', 'context', '--target', created.worktree.path, '--session-root', created.worktree.path, '--session-handle', 'codex-demo-session', '--json'], 1);
    assert.equal(staleRuntime.adoption.status, 'stale');
    assert.equal(staleRuntime.adoption.blocked.code, 'worktree.adoption_runtime_stale');
    fs.writeFileSync(agentsFile, agentsBefore);

    const reused = runBuildr(['worktree', 'create', 'demo', '--agent', 'codex', '--branch', 'codex/demo', '--start-point', 'main', '--target', workspace, '--json']);
    assert.equal(reused.state, 'reused');
    assert.equal(reused.treeChanged, false);
    assert.equal(reused.bootstrap.doctorBefore, null);
    assert.deepEqual(reused.bootstrap.sync, { status: 'skipped', reason: 'reused-without-tree-transition' });
  });

  test('skips sync when tracked runtime is already healthy', () => {
    git(['add', '-f', '.agents']);
    git(['commit', '-m', 'track runtime fixture']);
    const healthy = runBuildr(['worktree', 'create', 'healthy', '--agent', 'codex', '--branch', 'codex/healthy', '--start-point', 'main', '--target', workspace, '--json']);
    assert.equal(healthy.state, 'created');
    assert.equal(healthy.bootstrap.doctorBefore.health.ready, true);
    assert.deepEqual(healthy.bootstrap.sync, { status: 'skipped', reason: 'doctor-ready' });
    assert.equal(healthy.bootstrap.doctorAfter.health.ready, true);
    const common = git(['rev-parse', '--git-common-dir']);
    const receiptFile = path.join(path.resolve(workspace, common), 'buildr', 'task-environments', 'healthy.json');
    const legacyReceipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    delete legacyReceipt.runtimeExpectation;
    fs.writeFileSync(receiptFile, `${JSON.stringify(legacyReceipt, null, 2)}\n`);
    const legacyContext = runBuildr(['worktree', 'context', '--target', healthy.environment.root, '--json']);
    assert.equal(legacyContext.ready, true);
    assert.equal(legacyContext.adoption.status, 'legacy-activation-unverified');
    assert.equal(legacyContext.executionReady, true);
  });

  test('creates one environment with nested Project and Service repositories and resolves context', (t) => {
    const sourceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-worktree-multi-source-'));
    t.after(() => fs.rmSync(sourceBase, { recursive: true, force: true }));
    const seed = path.join(sourceBase, 'seed');
    fs.mkdirSync(seed);
    gitAt(seed, ['init', '-b', 'dev']);
    gitAt(seed, ['config', 'user.name', 'Buildr Test']);
    gitAt(seed, ['config', 'user.email', 'buildr-test@example.com']);
    fs.writeFileSync(path.join(seed, 'README.md'), '# shared source\n');
    gitAt(seed, ['add', 'README.md']);
    gitAt(seed, ['commit', '-m', 'seed']);
    const remote = path.join(sourceBase, 'shared.git');
    const bare = spawnSync('git', ['clone', '--bare', seed, remote], { encoding: 'utf8' });
    assert.equal(bare.status, 0, bare.stderr);

    const remoteUrl = `file://${remote}`;
    const projectCreated = spawnSync(process.execPath, [cli, 'project', 'create', 'nested', '--target', workspace, '--repo', remoteUrl, '--integration-branch', 'dev', '--name', 'Nested', '--description', 'Nested repository'], { cwd: productRoot, encoding: 'utf8' });
    assert.equal(projectCreated.status, 0, projectCreated.stderr);
    const projectRoot = path.join(workspace, 'projects', 'nested');
    gitAt(projectRoot, ['config', 'user.name', 'Buildr Test']);
    gitAt(projectRoot, ['config', 'user.email', 'buildr-test@example.com']);

    const serviceCreated = spawnSync(process.execPath, [cli, 'service', 'create', 'nested/api', remoteUrl, '--target', workspace, '--integration-branch', 'dev', '--name', 'API', '--description', 'Nested service', '--type', 'backend'], { cwd: productRoot, encoding: 'utf8' });
    assert.equal(serviceCreated.status, 0, serviceCreated.stderr);
    const serviceRoot = path.join(projectRoot, 'services', 'api');
    gitAt(serviceRoot, ['config', 'user.name', 'Buildr Test']);
    gitAt(serviceRoot, ['config', 'user.email', 'buildr-test@example.com']);
    gitAt(projectRoot, ['add', '-A']);
    gitAt(projectRoot, ['commit', '-m', 'project baseline']);
    const synced = spawnSync(process.execPath, [cli, 'sync', 'codex', '--target', workspace], { cwd: productRoot, encoding: 'utf8' });
    assert.equal(synced.status, 0, synced.stderr || synced.stdout);
    if (gitAt(serviceRoot, ['status', '--porcelain'])) {
      gitAt(serviceRoot, ['add', '-A']);
      gitAt(serviceRoot, ['commit', '-m', 'service runtime baseline']);
    }
    if (gitAt(projectRoot, ['status', '--porcelain'])) {
      gitAt(projectRoot, ['add', '-A']);
      gitAt(projectRoot, ['commit', '-m', 'project runtime baseline']);
    }
    git(['add', '-A']);
    git(['add', '-f', '.agents']);
    git(['commit', '-m', 'register nested repositories']);

    const created = runBuildr(['worktree', 'create', 'multi', '--agent', 'codex', '--branch', 'codex/multi', '--start-point', 'main', '--include', 'project:nested', '--include', 'service:nested/api', '--target', workspace, '--json']);
    assert.equal(created.ready, true);
    assert.deepEqual(created.repositories.map((item) => item.selector), ['workspace', 'project:nested', 'service:nested/api']);
    assert.equal(created.repositories.every((item) => item.state === 'created'), true);
    assert.equal(created.repositories[1].checkoutPath, path.join(created.environment.root, 'projects', 'nested'));
    assert.equal(created.repositories[2].checkoutPath, path.join(created.environment.root, 'projects', 'nested', 'services', 'api'));

    const preAdoptionContext = runBuildr(['worktree', 'context', '--target', created.repositories[2].checkoutPath, '--json']);
    assert.equal(preAdoptionContext.executionReady, true);
    const context = runBuildr(['worktree', 'context', '--target', created.repositories[2].checkoutPath, '--json']);
    assert.equal(context.schemaVersion, 'buildr.task-environment-context/v1');
    assert.equal(context.ready, true);
    assert.equal(context.taskId, 'multi');
    assert.equal(context.executionReady, true);
    assert.equal(context.membership.selector, 'service:nested/api');
    assert.deepEqual(context.allowedExecutionRoots, created.repositories.map((item) => item.checkoutPath));

    const inspected = runBuildr(['worktree', 'inspect', 'multi', '--target', workspace, '--json']);
    assert.equal(inspected.ready, true);
    assert.equal(inspected.repositories.length, 3);

    const mainContext = runBuildr(['worktree', 'context', '--target', workspace, '--json'], 1);
    assert.equal(mainContext.ready, false);
    assert.equal(mainContext.blocked.code, 'worktree.not_task_environment');

    const changedPlan = runBuildr(['worktree', 'create', 'multi', '--agent', 'codex', '--branch', 'codex/multi', '--start-point', 'main', '--include', 'project:nested', '--target', workspace, '--json'], 1);
    assert.equal(changedPlan.treeChanged, false);
    assert.match(changedPlan.blocked.message, /different repository plan/);
    assert.equal(runBuildr(['worktree', 'inspect', 'multi', '--target', workspace, '--json']).ready, true);

    const missingParent = runBuildr(['worktree', 'create', 'missing-parent', '--agent', 'codex', '--branch', 'codex/missing-parent', '--start-point', 'main', '--include', 'service:nested/api', '--target', workspace, '--json'], 1);
    assert.equal(missingParent.treeChanged, false);
    assert.match(missingParent.blocked.message, /requires explicit selector project:nested/);
    assert.equal(fs.existsSync(path.join(workspace, '.worktrees', 'missing-parent')), false);

    const parallel = runBuildr(['worktree', 'create', 'parallel', '--agent', 'codex', '--branch', 'codex/parallel', '--start-point', 'main', '--include', 'project:nested', '--include', 'service:nested/api', '--target', workspace, '--json']);
    assert.equal(parallel.ready, true);
    const parallelContext = runBuildr(['worktree', 'context', '--target', parallel.environment.root, '--json']);
    assert.equal(parallelContext.taskId, 'parallel');
    assert.equal(parallelContext.executionReady, true);
    assert.equal(runBuildr(['worktree', 'inspect', 'multi', '--target', workspace, '--json']).ready, true);

    const partialArgs = ['worktree', 'create', 'partial', '--agent', 'codex', '--branch', 'codex/partial', '--start-point', 'main', '--include', 'project:nested', '--include', 'service:nested/api', '--target', workspace, '--json'];
    const partial = runBuildr(partialArgs, 1, { ...process.env, BUILDR_FAULT_WORKTREE_ADD_SELECTOR: 'project:nested' });
    assert.equal(partial.blocked.code, 'worktree.partial_create_failed');
    assert.equal(partial.repositories[0].state, 'created');
    assert.equal(fs.existsSync(path.join(workspace, '.worktrees', 'partial')), true);
    const recovered = runBuildr(partialArgs);
    assert.equal(recovered.ready, true);
    assert.equal(recovered.repositories[0].state, 'reused');
    assert.equal(recovered.repositories.slice(1).every((item) => item.state === 'created'), true);

    const projectManifest = path.join(workspace, 'projects', 'manifest.yml');
    const manifestBefore = fs.readFileSync(projectManifest, 'utf8');
    fs.writeFileSync(projectManifest, manifestBefore.replace(remoteUrl, 'file:///invalid/other.git'));
    try {
      const remoteMismatch = runBuildr(['worktree', 'create', 'remote-mismatch', '--agent', 'codex', '--branch', 'codex/remote-mismatch', '--start-point', 'main', '--include', 'project:nested', '--target', workspace, '--json'], 1);
      assert.equal(remoteMismatch.treeChanged, false);
      assert.match(remoteMismatch.blocked.message, /remote identity conflicts/);
      assert.equal(fs.existsSync(path.join(workspace, '.worktrees', 'remote-mismatch')), false);
    } finally {
      fs.writeFileSync(projectManifest, manifestBefore);
    }

    gitAt(serviceRoot, ['worktree', 'remove', '--force', recovered.repositories[2].checkoutPath]);
    const missingRepository = runBuildr(['worktree', 'context', '--target', recovered.environment.root, '--json'], 1);
    assert.equal(missingRepository.ready, false);
    assert.equal(missingRepository.blocked.code, 'worktree.context_identity_mismatch');
    assert.equal(runBuildr(['worktree', 'inspect', 'parallel', '--target', workspace, '--json']).ready, true);
  });

  test('retains a created checkout and blocks sync for non-runtime doctor findings', () => {
    fs.rmSync(path.join(workspace, 'rules', 'buildr', 'core.md'));
    git(['add', '-A']);
    git(['commit', '-m', 'break workspace fixture']);
    const unsafe = runBuildr(['worktree', 'create', 'unsafe', '--agent', 'codex', '--branch', 'codex/unsafe', '--start-point', 'main', '--target', workspace, '--json'], 1);
    assert.equal(unsafe.state, 'blocked');
    assert.equal(unsafe.treeChanged, true);
    assert.equal(unsafe.bootstrap.sync.status, 'blocked');
    assert.equal(unsafe.blocked.code, 'worktree.auto_sync_unsafe');
    assert.equal(fs.existsSync(unsafe.worktree.path), true);
    assert.ok(unsafe.bootstrap.doctorBefore.findings.some((finding) => finding.code !== 'runtime.codex_stale'));
  });

  test('fails closed before writes for occupied path and branch identity conflict', () => {
    const occupied = path.join(workspace, '.worktrees', 'occupied');
    fs.mkdirSync(occupied, { recursive: true });
    const occupiedResult = runBuildr(['worktree', 'create', 'occupied', '--agent', 'codex', '--branch', 'codex/occupied', '--start-point', 'main', '--target', workspace, '--json'], 1);
    assert.equal(occupiedResult.state, 'blocked');
    assert.equal(occupiedResult.treeChanged, false);
    assert.match(occupiedResult.blocked.message, /occupied but not registered/);
    assert.equal(git(['branch', '--list', 'codex/occupied']), '');

    const conflict = runBuildr(['worktree', 'create', 'other', '--agent', 'codex', '--branch', 'codex/demo', '--start-point', 'main', '--target', workspace, '--json'], 1);
    assert.equal(conflict.state, 'blocked');
    assert.equal(conflict.treeChanged, false);
    assert.match(conflict.blocked.message, /already checked out/);
    assert.equal(fs.existsSync(path.join(workspace, '.worktrees', 'other')), false);
  });
});
