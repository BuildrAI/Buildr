import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  convergePublishedMainToDev,
  ensureReleaseToMainPullRequest,
  inspectDevBranchPolicy,
  reconcilePublishedReleaseWithDev,
  releaseCarrierBranchFor,
} from '../../../tools/release/release-git-convergence.ts';
import { createReleaseContext } from '../../../tools/release/release-readiness.ts';
import {
  createReleaseSelection,
  freezeReleaseSelection,
  inspectReleaseSelection,
  selectReleaseCommit,
} from '../../../tools/release/release-selection.ts';
import { createReleaseTransactionEvidence } from '../../../tools/release/release-transaction-evidence.ts';
import { commit, configure, convergenceFixture, git, releaseWorktree } from './helpers.ts';

test('release→main creates one PR from the frozen release source after explicit authorization', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-main-pr-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote: any = path.join(root, 'remote.git');
  const seed: any = path.join(root, 'seed');
  const work: any = path.join(root, 'work');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'dev');
  configure(seed);
  const base: any = commit(seed, 'base', { 'base.txt': 'base\n' });
  git(seed, 'branch', 'main', base);
  const selected: any = commit(seed, 'selected', { 'selected.txt': 'selected\n' });
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev', 'main');
  const release: any = releaseWorktree(root, remote, base);
  const created: any = createReleaseSelection({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', baseline: base, executionBinding: release.binding() });
  assert.equal(created.status, 'passed');
  const updated: any = selectReleaseCommit({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', source: selected, executionBinding: release.binding() });
  const frozen: any = freezeReleaseSelection({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', executionBinding: release.binding() });
  assert.equal(frozen.status, 'passed');
  const ghCalls: any[] = [];
  const dependencies: any = {
    execute: (command: any, args: any, options: any) => {
      if (command === 'gh') {
        ghCalls.push(args);
        if (args[1] === 'list') return { status: 0, stdout: '[]', stderr: '' };
        return { status: 0, stdout: 'https://github.com/BuildrAI/Buildr/pull/100\n', stderr: '' };
      }
      return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8' });
    },
  };
  const result: any = ensureReleaseToMainPullRequest({
    repo: release.work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
    candidateCommit: updated.releaseHead,
    candidateTree: updated.releaseTree,
    authorizeReleasePush: true,
    authorizePullRequest: true,
  }, dependencies);
  assert.equal(result.status, 'ready');
  assert.equal(result.pullRequest.url, 'https://github.com/BuildrAI/Buildr/pull/100');
  const carrier: any = releaseCarrierBranchFor('0.1.0-rc.5', frozen.generation);
  assert.equal(git(release.work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5').startsWith(updated.releaseHead), true);
  assert.equal(git(release.work, 'ls-remote', 'origin', `refs/heads/${carrier}`).startsWith(updated.releaseHead), true);
  assert.equal(ghCalls.filter((args: any) => args[1] === 'create').length, 1);

  const closed: any = ensureReleaseToMainPullRequest({
    repo: release.work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
    candidateCommit: updated.releaseHead,
    candidateTree: updated.releaseTree,
  }, {
    execute: (command: any, args: any, options: any) => command === 'gh'
      ? {
          status: 0,
          stdout: JSON.stringify([{
            number: 100,
            state: 'CLOSED',
            mergedAt: null,
            headRefOid: updated.releaseHead,
            headRefName: carrier,
            baseRefName: 'main',
            url: 'https://github.com/BuildrAI/Buildr/pull/100',
          }]),
          stderr: '',
        }
      : spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8' }),
  });
  assert.equal(closed.status, 'blocked');
  assert.equal(closed.diagnostic.code, 'release-main-pr-closed');
});

test('Publication后只读核验selection的dev来源，并保留dev线性历史和后续内容', (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const before: any = git(data.work, 'ls-remote', 'origin', 'refs/heads/dev');
  const executed: any[] = [];
  const first: any = reconcilePublishedReleaseWithDev({ repo: data.work, publicationEvidence: data.publicationEvidence }, {
    execute: (command: any, args: any, options: any) => {
      executed.push([command, ...args]);
      return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8' });
    },
    inspectBranchPolicy: () => { throw new Error('dev branch policy must not be read during reconciliation'); },
  });
  assert.equal(first.status, 'passed', JSON.stringify(first));
  assert.equal(first.action, 'verified');
  assert.deepEqual(first.effects, []);
  assert.deepEqual(first.reconciliation.sourceCommits, [data.selected]);
  assert.equal(first.reconciliation.devHead, data.devCommit);
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/dev'), before);
  assert.equal(executed.some((entry: any) => ['push', 'merge', 'commit', 'worktree'].includes(entry[1])), false);
  assert.equal(git(data.work, 'show', 'origin/dev:dev-only.txt'), 'keep me');
  assert.equal(git(data.work, 'show', 'origin/dev:candidate.txt'), 'release');
  const ancestry: any = spawnSync('git', ['merge-base', '--is-ancestor', data.mainCommit, 'origin/dev'], { cwd: data.work });
  assert.notEqual(ancestry.status, 0);
  const second: any = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(second.status, 'passed');
  assert.equal(second.operation, 'reconcile-dev');
  assert.equal(second.identity, first.identity);
});

test('Publication上下文以精确dev提交冻结selection identity时仍可完成来源核验', (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const exactSelection: any = inspectReleaseSelection({ version: '0.1.0-rc.5', repo: data.work, devRef: data.devCommit });
  const { schemaVersion: _schemaVersion, identity: _identity, ...contextInput }: any = data.publicationEvidence.context;
  const context: any = createReleaseContext({
    ...contextInput,
    selection: { ...contextInput.selection, identity: exactSelection.selectionIdentity },
  });
  const evidence: any = createReleaseTransactionEvidence({
    context,
    publish: data.publicationEvidence.publish,
    outcome: 'passed',
    publicFacts: {
      version: '0.1.0-rc.5',
      tagCommit: data.publicationEvidence.release.tagCommit,
      npmDistTag: 'next',
      registryPublished: true,
      registryIntegrity: data.publicationEvidence.release.registryIntegrity,
      githubRelease: data.publicationEvidence.release.githubRelease,
      registrySmoke: 'passed',
    },
  });
  const result: any = reconcilePublishedReleaseWithDev({ repo: data.work, publicationEvidence: evidence });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.reconciliation.devHead, data.devCommit);
});

test('current dev不再包含selected source时保留Publication并阻止收尾', (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  git(data.seed, 'checkout', '--orphan', 'rewritten-dev');
  git(data.seed, 'rm', '-rf', '.');
  const rewritten: any = commit(data.seed, 'rewritten dev', { 'replacement.txt': 'replacement\n' });
  git(data.seed, 'push', '--force', 'origin', `${rewritten}:refs/heads/dev`);
  git(data.work, 'fetch', 'origin', 'dev');
  const result: any = reconcilePublishedReleaseWithDev({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(result.status, 'published-but-dev-reconciliation-blocked');
  assert.equal(result.diagnostic.code, 'published-release-selection-invalid');
  assert.match(result.recoveryIdentity, /^sha256-[a-f0-9]{64}$/u);
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/dev').startsWith(rewritten), true);
});

test('published main漂移时返回稳定reconciliation blocker且不写dev', (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const beforeDev: any = git(data.work, 'ls-remote', 'origin', 'refs/heads/dev');
  git(data.seed, 'checkout', 'main');
  const advancedMain: any = commit(data.seed, 'advance main', { 'main-only.txt': 'drift\n' });
  git(data.seed, 'push', 'origin', 'main');
  const result: any = reconcilePublishedReleaseWithDev({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(result.status, 'published-but-dev-reconciliation-blocked');
  assert.equal(result.diagnostic.code, 'published-main-ref-drift');
  assert.equal(result.refs.main, advancedMain);
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/dev'), beforeDev);
});

test('正式remote release ref漂移时阻止reconciliation', (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  git(data.work, 'push', '--force', 'origin', `${data.devCommit}:refs/heads/release-0.1.0-rc.5`);
  const result: any = reconcilePublishedReleaseWithDev({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(result.status, 'published-but-dev-reconciliation-blocked');
  assert.equal(result.diagnostic.code, 'published-release-ref-drift');
  assert.equal(result.expectedRelease, data.releaseCommit);
});

test('dev branch policy observation来自GitHub保护规则readback并形成稳定identity', () => {
  const result: any = inspectDevBranchPolicy({ repo: process.cwd(), repository: 'BuildrAI/Buildr', dev: 'dev' }, {
    execute: (command: any, args: any) => {
      assert.equal(command, 'gh');
      assert.deepEqual(args, ['api', 'repos/BuildrAI/Buildr/branches/dev/protection']);
      return { status: 0, stdout: JSON.stringify({ required_linear_history: { enabled: true } }), stderr: '' };
    },
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.observation.source, 'github-branch-protection-readback');
  assert.equal(result.observation.requiredLinearHistory, true);
  assert.equal(result.observation.allowsMergeCommits, false);
  assert.match(result.observation.identity, /^sha256-[a-f0-9]{64}$/u);
});
