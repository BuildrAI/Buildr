import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Candidate-only owner: release convergence across real Git histories.

import { bridgeMainToDev } from '../../scripts/release/bridge-main-to-dev.mjs';
import { checkReleaseConvergence } from '../../scripts/release/release-convergence.mjs';
import {
  releaseAuthorityProbeSchema,
  releasePublishAuthority,
  sha256,
} from '../../scripts/release/release-authority.mjs';

function differentTree(tree) {
  return `${tree.slice(0, -1)}${tree.endsWith('0') ? '1' : '0'}`;
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

function writeVersion(cwd, version, marker) {
  fs.mkdirSync(path.join(cwd, 'projects', 'product', 'services', 'buildr'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'projects', 'product', 'services', 'buildr', 'package.json'), `${JSON.stringify({ name: '@buildr-ai/buildr', version })}\n`);
  fs.writeFileSync(path.join(cwd, 'candidate.txt'), `${marker}\n`);
  fs.mkdirSync(path.join(cwd, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.github', 'workflows', 'publish.yml'), 'name: fixture\n');
  git(cwd, 'add', '.');
}

function authorityEvidence(repo, overrides = {}) {
  const sourceCommit = git(repo, 'rev-parse', 'origin/main');
  const workflowSource = git(repo, 'show', 'origin/main:.github/workflows/publish.yml');
  const observedAt = new Date().toISOString();
  return {
    schemaVersion: releaseAuthorityProbeSchema,
    status: 'ready',
    expected: releasePublishAuthority,
    sourceCommit,
    workflow: { path: '.github/workflows/publish.yml', sha256: sha256(`${workflowSource}\n`) },
    artifact: { name: 'release-authority-probe-42-1' },
    github: { repository: 'BuildrAI/Buildr', workflow: 'publish.yml', workflowRef: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main', environment: 'npm-production', event: 'workflow_dispatch', runId: 42, runAttempt: 1, headSha: sourceCommit, runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/42' },
    npm: { package: '@buildr-ai/buildr', registry: 'https://registry.npmjs.org', exchange: { status: 201, tokenType: 'oidc', created: observedAt, expires: new Date(Date.now() + 60 * 60 * 1000).toISOString() } },
    findings: [],
    observedAt,
    ...overrides,
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-convergence-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const work = path.join(root, 'work');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'dev');
  git(seed, 'config', 'user.name', 'Buildr Test');
  git(seed, 'config', 'user.email', 'buildr@example.com');
  writeVersion(seed, '0.1.0-rc.3', 'base');
  git(seed, 'commit', '-m', 'base');
  const candidateBase = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'branch', 'main');
  writeVersion(seed, '0.1.0-rc.5', 'candidate');
  git(seed, 'commit', '-m', 'candidate');
  const candidateTree = git(seed, 'rev-parse', 'HEAD^{tree}');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev');
  git(seed, 'checkout', 'main');
  git(seed, 'checkout', 'dev', '--', '.');
  git(seed, 'commit', '-m', 'squash candidate');
  git(seed, 'push', 'origin', 'main');
  git(root, 'clone', '--branch', 'dev', remote, work);
  git(work, 'config', 'user.name', 'Buildr Test');
  git(work, 'config', 'user.email', 'buildr@example.com');
  return { root, seed, work, candidateBase, candidateTree };
}

function selfBootstrapEvidence(data) {
  const runId = 'finish-run-release-rc5';
  const taskId = 'release-0.1.0-rc.5';
  const devRef = git(data.work, 'rev-parse', 'origin/dev');
  const evidencePath = path.join(data.root, 'self-bootstrap-closeout.json');
  const phase = (id, status, outputIdentity = null) => ({
    id, status, inputIdentity: null, outputIdentity, effects: [], diagnostic: null,
  });
  fs.writeFileSync(evidencePath, `${JSON.stringify({
    schemaVersion: 'buildr.self-bootstrap-closeout-result/v1',
    status: 'not-applicable',
    runId,
    taskId,
    mode: 'complete',
    plan: { runId, taskId, remote: 'origin', targetBranch: 'dev', baseRef: devRef },
    recoveryPlan: null,
    developmentEntryIdentity: null,
    phases: [
      phase('preflight', 'not-applicable'),
      phase('plan', 'passed', 'sha256-plan'),
      phase('sync', 'not-applicable'),
      phase('commit', 'not-applicable'),
      phase('push', 'not-applicable'),
      phase('install-local-app', 'not-applicable'),
      phase('verify-development-entry', 'not-applicable'),
      phase('finalize', 'not-applicable'),
    ],
    effects: [],
    diagnostic: null,
  })}\n`);
  return { selfBootstrapRun: runId, selfBootstrapEvidence: evidencePath };
}

test('release convergence requires dev candidate before main and ancestry after bridge', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const pre = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-main' });
  assert.equal(pre.ok, true);
  const beforeBridge = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'post-main' });
  assert.equal(beforeBridge.ok, false);
  assert.equal(beforeBridge.findings.some((item) => item.code === 'main_not_ancestor_of_dev'), true);
  bridgeMainToDev({
    repo: data.work,
    version: '0.1.0-rc.5',
    candidateTree: data.candidateTree,
    ...selfBootstrapEvidence(data),
  });
  const afterBridge = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'post-main' });
  assert.equal(afterBridge.ok, true);

  const missing = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag' });
  assert.equal(missing.ok, false);
  assert.equal(missing.findings.some((item) => item.code === 'release_authority_evidence_missing'), true);

  const ready = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag', authorityEvidence: authorityEvidence(data.work) });
  assert.equal(ready.ok, true);

  const stale = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag', authorityEvidence: authorityEvidence(data.work, { sourceCommit: 'b'.repeat(40) }) });
  assert.equal(stale.ok, false);
  assert.equal(stale.findings.some((item) => item.code === 'release_authority_source_commit_mismatch'), true);

  const workflowDrift = authorityEvidence(data.work);
  workflowDrift.workflow.sha256 = '0'.repeat(64);
  const drifted = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag', authorityEvidence: workflowDrift });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.findings.some((item) => item.code === 'release_authority_workflow_mismatch'), true);

  const expired = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag', authorityEvidence: authorityEvidence(data.work, { observedAt: '2026-01-01T00:00:00.000Z' }) });
  assert.equal(expired.ok, false);
  assert.equal(expired.findings.some((item) => item.code === 'release_authority_evidence_stale'), true);

  assert.throws(
    () => checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'post-main', authorityEvidence: authorityEvidence(data.work) }),
    /only accepted by the pre-tag stage/,
  );
});

test('release convergence rejects stale version, tree and unintegrated release task', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  git(data.work, 'checkout', '-b', 'tasks/release-0.1.0-rc.6', data.candidateBase);
  fs.writeFileSync(path.join(data.work, 'unintegrated.txt'), 'release\n');
  git(data.work, 'add', '.');
  git(data.work, 'commit', '-m', 'unintegrated release task');
  git(data.work, 'checkout', 'dev');
  const result = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.6', candidateBase: data.candidateBase, candidateTree: differentTree(data.candidateTree), stage: 'pre-main' });
  assert.equal(result.ok, false);
  for (const code of ['dev_tree_mismatch', 'dev_version_mismatch', 'release_task_not_integrated']) {
    assert.equal(result.findings.some((item) => item.code === code), true, code);
  }
});
