import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Candidate-only owner: release history bridge idempotency and remote races.

import { bridgeMainToDev } from '../../tools/release/bridge-main-to-dev.mjs';

function differentTree(tree) {
  return `${tree.slice(0, -1)}${tree.endsWith('0') ? '1' : '0'}`;
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

function commit(cwd, message, content) {
  fs.writeFileSync(path.join(cwd, 'candidate.txt'), `${content}\n`);
  fs.mkdirSync(path.join(cwd, 'projects', 'product', 'services', 'buildr'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'projects', 'product', 'services', 'buildr', 'package.json'), '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.5"}\n');
  git(cwd, 'add', 'candidate.txt', 'projects/product/services/buildr/package.json');
  git(cwd, 'commit', '-m', message);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-bridge-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const work = path.join(root, 'work');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'dev');
  git(seed, 'config', 'user.name', 'Buildr Test');
  git(seed, 'config', 'user.email', 'buildr@example.com');
  commit(seed, 'base', 'base');
  git(seed, 'branch', 'main');
  commit(seed, 'candidate', 'candidate');
  const candidateTree = git(seed, 'rev-parse', 'HEAD^{tree}');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev');
  git(seed, 'checkout', 'main');
  commit(seed, 'squash candidate', 'candidate');
  git(seed, 'push', 'origin', 'main');
  git(root, 'clone', '--branch', 'dev', remote, work);
  git(work, 'config', 'user.name', 'Buildr Test');
  git(work, 'config', 'user.email', 'buildr@example.com');
  return { root, remote, seed, work, candidateTree };
}

function closeoutEvidence(data, {
  status = 'passed', runId = 'finish-run-1', taskId = 'release-0.1.0-rc.5',
  devRef = git(data.work, 'rev-parse', 'origin/dev'), filename = 'self-bootstrap-closeout.json', mutate = null,
} = {}) {
  const evidencePath = path.join(data.root, filename);
  const plan = {
    runId,
    taskId,
    remote: 'origin',
    targetBranch: 'dev',
    baseRef: devRef,
  };
  const phase = (id, phaseStatus, outputIdentity = null) => ({
    id, status: phaseStatus, inputIdentity: null, outputIdentity, effects: [], diagnostic: null,
  });
  const evidence = {
    schemaVersion: 'buildr.self-bootstrap-closeout-result/v1',
    status,
    runId,
    taskId,
    mode: 'complete',
    plan,
    recoveryPlan: null,
    developmentEntryIdentity: null,
    phases: [
      phase('preflight', status === 'passed' ? 'passed' : 'not-applicable', devRef),
      phase('plan', 'passed', 'sha256-plan'),
      phase('sync', 'not-applicable'),
      phase('commit', 'not-applicable'),
      phase('push', 'not-applicable'),
      phase('install-local-app', 'not-applicable'),
      phase('verify-development-entry', 'not-applicable'),
      phase('finalize', status === 'passed' ? 'passed' : 'not-applicable'),
    ],
    effects: [],
    diagnostic: status === 'passed' ? null : null,
  };
  if (mutate) mutate(evidence);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`);
  return { selfBootstrapRun: runId, selfBootstrapEvidence: evidencePath };
}

function bridgeOptions(data, overrides = {}) {
  return {
    repo: data.work,
    candidateTree: data.candidateTree,
    version: '0.1.0-rc.5',
    ...closeoutEvidence(data),
    ...overrides,
  };
}

test('tree-identical squash main is bridged to dev without changing the candidate tree', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const result = bridgeMainToDev(bridgeOptions(data));
  assert.equal(result.action, 'bridged');
  assert.equal(git(data.work, 'rev-parse', 'HEAD^{tree}'), data.candidateTree);
  assert.equal(git(data.work, 'merge-base', '--is-ancestor', 'origin/main', 'origin/dev'), '');
});

test('already-bridged main/dev history is an idempotent no-op', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  bridgeMainToDev(bridgeOptions(data));
  const head = git(data.work, 'rev-parse', 'HEAD');
  const result = bridgeMainToDev(bridgeOptions(data));
  assert.equal(result.action, 'already-bridged');
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('explicit recovery Task provenance permits the same tree-gated history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, {
    taskId: 'show-buildr-web-development-badge',
    filename: 'recovery-self-bootstrap.json',
  });
  const result = bridgeMainToDev(bridgeOptions(data, {
    ...evidence,
    selfBootstrapTask: 'show-buildr-web-development-badge',
  }));
  assert.equal(result.action, 'bridged');
  assert.equal(result.selfBootstrap.taskId, 'show-buildr-web-development-badge');
  assert.equal(result.releaseTaskId, 'release-0.1.0-rc.5');
  assert.equal(result.selfBootstrapProvenance, 'explicit-recovery-task');
  assert.equal(git(data.work, 'rev-parse', 'HEAD^{tree}'), data.candidateTree);
});

test('foreign recovery evidence is rejected unless its Task is explicitly bound', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, {
    taskId: 'show-buildr-web-development-badge',
    filename: 'unbound-recovery-self-bootstrap.json',
  });
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(
    () => bridgeMainToDev(bridgeOptions(data, evidence)),
    /identity does not match/,
  );
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('tree mismatch fails closed before creating a history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(
    () => bridgeMainToDev(bridgeOptions(data, { candidateTree: differentTree(data.candidateTree) })),
    /does not match the verified candidate tree/,
  );
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('remote ref race fails closed and preserves the local candidate', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(() => bridgeMainToDev(bridgeOptions(data, {
    beforeRemoteRecheck: () => {
      git(data.seed, 'checkout', 'dev');
      commit(data.seed, 'concurrent update', 'concurrent');
      git(data.seed, 'push', 'origin', 'dev');
    },
  })), /Remote refs changed/);
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('package version mismatch fails closed before creating a history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const head = git(data.work, 'rev-parse', 'HEAD');
  const evidence = closeoutEvidence(data, {
    taskId: 'release-0.1.0-rc.6',
    filename: 'version-mismatch.json',
  });
  assert.throws(
    () => bridgeMainToDev(bridgeOptions(data, { ...evidence, version: '0.1.0-rc.6' })),
    /package version does not match/,
  );
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('not-applicable self-bootstrap evidence permits a tree-identical history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, { status: 'not-applicable', filename: 'not-applicable.json' });
  const result = bridgeMainToDev(bridgeOptions(data, evidence));
  assert.equal(result.action, 'bridged');
  assert.equal(result.selfBootstrap.status, 'not-applicable');
});

test('incomplete not-applicable self-bootstrap evidence fails before creating a history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, {
    status: 'not-applicable',
    filename: 'incomplete-not-applicable.json',
    mutate: (value) => { value.phases = value.phases.filter((phase) => phase.id !== 'finalize'); },
  });
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(() => bridgeMainToDev(bridgeOptions(data, evidence)), /phase set is incomplete/);
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('not-applicable evidence with a non-applicable finalize phase fails closed', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, {
    status: 'not-applicable',
    filename: 'invalid-finalize.json',
    mutate: (value) => { value.phases.find((phase) => phase.id === 'finalize').status = 'passed'; },
  });
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(() => bridgeMainToDev(bridgeOptions(data, evidence)), /phase set is invalid/);
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('missing self-bootstrap evidence fails before creating a history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(() => bridgeMainToDev({
    repo: data.work,
    candidateTree: data.candidateTree,
    version: '0.1.0-rc.5',
    selfBootstrapRun: 'finish-run-1',
  }), /Missing self-bootstrap closeout evidence/);
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('blocked self-bootstrap evidence fails before creating a history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, { status: 'blocked', filename: 'blocked.json' });
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(() => bridgeMainToDev(bridgeOptions(data, evidence)), /evidence is not successful/);
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('self-bootstrap run mismatch fails before creating a history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, { runId: 'finish-run-other', filename: 'run-mismatch.json' });
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(() => bridgeMainToDev(bridgeOptions(data, {
    ...evidence,
    selfBootstrapRun: 'finish-run-expected',
  })), /identity does not match/);
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('stale self-bootstrap dev ref fails before creating a history bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, { devRef: 'f'.repeat(40), filename: 'stale-ref.json' });
  const head = git(data.work, 'rev-parse', 'HEAD');
  assert.throws(() => bridgeMainToDev(bridgeOptions(data, evidence)), /does not match current remote dev/);
  assert.equal(git(data.work, 'rev-parse', 'HEAD'), head);
});

test('symlinked self-bootstrap evidence is rejected', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const evidence = closeoutEvidence(data, { filename: 'real-evidence.json' });
  const link = path.join(data.root, 'evidence-link.json');
  fs.symlinkSync(evidence.selfBootstrapEvidence, link);
  assert.throws(() => bridgeMainToDev(bridgeOptions(data, {
    selfBootstrapRun: evidence.selfBootstrapRun,
    selfBootstrapEvidence: link,
  })), /regular non-symlink file/);
});
