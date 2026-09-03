import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Candidate-only owner: release convergence across real Git histories.

import { checkReleaseConvergence } from '../../tools/release/release-convergence.ts';
import {
  releaseAuthorityProbeSchema,
  releasePublishAuthority,
  sha256,
} from '../../tools/release/release-authority.ts';

function differentTree(tree: any): any  {
  return `${tree.slice(0, -1)}${tree.endsWith('0') ? '1' : '0'}`;
}

function git(cwd: any, ...args: any[]): any  {
  const result: any = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

function writeVersion(cwd: any, version: any, marker: any): any  {
  fs.mkdirSync(path.join(cwd, 'projects', 'product', 'services', 'buildr'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'projects', 'product', 'services', 'buildr', 'package.json'), `${JSON.stringify({ name: '@buildr-ai/buildr', version })}\n`);
  fs.writeFileSync(path.join(cwd, 'candidate.txt'), `${marker}\n`);
  fs.mkdirSync(path.join(cwd, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.github', 'workflows', 'publish.yml'), 'name: fixture\n');
  git(cwd, 'add', '.');
}

function authorityEvidence(repo: any, overrides: any = {}): any  {
  const sourceCommit: any = git(repo, 'rev-parse', 'origin/main');
  const workflowSource: any = git(repo, 'show', 'origin/main:.github/workflows/publish.yml');
  const observedAt: any = new Date().toISOString();
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

function fixture(): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-convergence-'));
  const remote: any = path.join(root, 'remote.git');
  const seed: any = path.join(root, 'seed');
  const work: any = path.join(root, 'work');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'dev');
  git(seed, 'config', 'user.name', 'Buildr Test');
  git(seed, 'config', 'user.email', 'buildr@example.com');
  writeVersion(seed, '0.1.0-rc.3', 'base');
  git(seed, 'commit', '-m', 'base');
  git(seed, 'branch', 'main');
  git(seed, 'checkout', '-b', 'release-0.1.0-rc.5');
  writeVersion(seed, '0.1.0-rc.5', 'candidate');
  git(seed, 'commit', '-m', 'candidate');
  const releaseCommit: any = git(seed, 'rev-parse', 'HEAD');
  const candidateBase: any = releaseCommit;
  const candidateTree: any = git(seed, 'rev-parse', 'HEAD^{tree}');
  git(seed, 'checkout', 'dev');
  fs.writeFileSync(path.join(seed, 'dev-only.txt'), 'new dev content\n');
  git(seed, 'add', 'dev-only.txt');
  git(seed, 'commit', '-m', 'continue dev after release freeze');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev', 'release-0.1.0-rc.5');
  git(seed, 'checkout', 'main');
  git(seed, 'checkout', 'release-0.1.0-rc.5', '--', '.');
  git(seed, 'commit', '-m', 'squash candidate');
  git(seed, 'push', 'origin', 'main');
  git(root, 'clone', '--branch', 'dev', remote, work);
  git(work, 'config', 'user.name', 'Buildr Test');
  git(work, 'config', 'user.email', 'buildr@example.com');
  return { root, seed, work, candidateBase, candidateTree };
}

test('release convergence binds the frozen release tree while allowing dev to advance independently', (t: any) => {
  const data: any = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const pre: any = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-main' });
  assert.equal(pre.ok, true);
  assert.notEqual(spawnSync('git', ['merge-base', '--is-ancestor', data.candidateBase, 'origin/dev'], { cwd: data.work }).status, 0);
  assert.notEqual(pre.trees.dev, data.candidateTree);
  assert.equal(pre.trees.release, data.candidateTree);
  const afterMain: any = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'post-main' });
  assert.equal(afterMain.ok, true);

  const missing: any = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag' });
  assert.equal(missing.ok, false);
  assert.equal(missing.findings.some((item: any) => item.code === 'release_authority_evidence_missing'), true);

  const ready: any = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag', authorityEvidence: authorityEvidence(data.work) });
  assert.equal(ready.ok, true);

  const stale: any = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag', authorityEvidence: authorityEvidence(data.work, { sourceCommit: 'b'.repeat(40) }) });
  assert.equal(stale.ok, false);
  assert.equal(stale.findings.some((item: any) => item.code === 'release_authority_source_commit_mismatch'), true);

  const workflowDrift: any = authorityEvidence(data.work);
  workflowDrift.workflow.sha256 = '0'.repeat(64);
  const drifted: any = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag', authorityEvidence: workflowDrift });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.findings.some((item: any) => item.code === 'release_authority_workflow_mismatch'), true);

  const expired: any = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'pre-tag', authorityEvidence: authorityEvidence(data.work, { observedAt: '2026-01-01T00:00:00.000Z' }) });
  assert.equal(expired.ok, false);
  assert.equal(expired.findings.some((item: any) => item.code === 'release_authority_evidence_stale'), true);

  assert.throws(
    () => checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: data.candidateTree, stage: 'post-main', authorityEvidence: authorityEvidence(data.work) }),
    /only accepted by the pre-tag stage/,
  );
});

test('release convergence rejects stale release tree and unintegrated release task', (t: any) => {
  const data: any = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  git(data.work, 'checkout', '-b', 'tasks/release-0.1.0-rc.5', data.candidateBase);
  fs.writeFileSync(path.join(data.work, 'unintegrated.txt'), 'release\n');
  git(data.work, 'add', '.');
  git(data.work, 'commit', '-m', 'unintegrated release task');
  git(data.work, 'checkout', 'dev');
  const result: any = checkReleaseConvergence({ repo: data.work, version: '0.1.0-rc.5', candidateBase: data.candidateBase, candidateTree: differentTree(data.candidateTree), stage: 'pre-main' });
  assert.equal(result.ok, false);
  for (const code of ['release_tree_mismatch', 'release_task_not_integrated']) {
    assert.equal(result.findings.some((item: any) => item.code === code), true, code);
  }
});
