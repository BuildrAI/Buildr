import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupRemoteReleaseBranch,
  convergePublishedMainToDev,
  ensureReleaseToMainPullRequest,
} from '../../tools/release/release-git-convergence.mjs';
import { createReleaseContext } from '../../tools/release/release-readiness.mjs';
import {
  createReleaseSelection,
  freezeReleaseSelection,
  selectReleaseCommit,
} from '../../tools/release/release-selection.mjs';
import { createReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

function write(cwd, file, value) {
  const target = path.join(cwd, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function commit(cwd, message, files) {
  for (const [file, value] of Object.entries(files)) write(cwd, file, value);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function configure(cwd) {
  git(cwd, 'config', 'user.name', 'Buildr Test');
  git(cwd, 'config', 'user.email', 'buildr@example.com');
}

function convergenceFixture({ conflict = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-git-convergence-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const work = path.join(root, 'work');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'dev');
  configure(seed);
  const packageFile = 'projects/product/services/buildr/package.json';
  const base = commit(seed, 'base', {
    'candidate.txt': 'base\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.4"}\n',
  });
  git(seed, 'branch', 'main', base);
  git(seed, 'checkout', '-b', 'release-0.1.0-rc.5', base);
  const releaseCommit = commit(seed, 'release', {
    'candidate.txt': 'release\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.5"}\n',
  });
  const releaseTree = git(seed, 'rev-parse', `${releaseCommit}^{tree}`);
  git(seed, 'checkout', 'main');
  git(seed, 'checkout', 'release-0.1.0-rc.5', '--', '.');
  const mainCommit = commit(seed, 'squash release', {});
  git(seed, 'checkout', 'dev');
  const devFiles = conflict ? { 'candidate.txt': 'dev conflict\n' } : { 'dev-only.txt': 'keep me\n' };
  const devCommit = commit(seed, 'continue dev', devFiles);
  const devTree = git(seed, 'rev-parse', `${devCommit}^{tree}`);
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev', 'main', 'release-0.1.0-rc.5');
  git(root, 'clone', '--branch', 'dev', remote, work);
  configure(work);
  const context = createReleaseContext({
    release: { version: '0.1.0-rc.5', sourceCommit: releaseCommit, sourceTree: releaseTree },
    convergence: { mainCommit, mainTree: releaseTree, devCommit, devTree },
  });
  const publicationEvidence = createReleaseTransactionEvidence({
    context,
    publish: {
      repository: 'BuildrAI/Buildr',
      workflow: '.github/workflows/publish.yml',
      runId: 42,
      runAttempt: 1,
      runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/42',
      headSha: mainCommit,
    },
    outcome: 'passed',
    publicFacts: {
      version: '0.1.0-rc.5',
      tagCommit: mainCommit,
      npmDistTag: 'next',
      registryPublished: true,
      registryIntegrity: 'sha512-YnVpbGRy',
      githubRelease: 'https://github.com/BuildrAI/Buildr/releases/tag/v0.1.0-rc.5',
      registrySmoke: 'passed',
    },
  });
  return { root, remote, seed, work, releaseCommit, releaseTree, mainCommit, devCommit, publicationEvidence };
}

test('release→main creates one PR from the frozen release source after explicit authorization', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-main-pr-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const work = path.join(root, 'work');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'dev');
  configure(seed);
  const base = commit(seed, 'base', { 'base.txt': 'base\n' });
  git(seed, 'branch', 'main', base);
  const selected = commit(seed, 'selected', { 'selected.txt': 'selected\n' });
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev', 'main');
  git(root, 'clone', '--branch', 'dev', remote, work);
  configure(work);
  const created = createReleaseSelection({ version: '0.1.0-rc.5', repo: work, devRef: 'origin/dev', baseline: base });
  assert.equal(created.status, 'passed');
  const updated = selectReleaseCommit({ version: '0.1.0-rc.5', repo: work, devRef: 'origin/dev', source: selected });
  const frozen = freezeReleaseSelection({ version: '0.1.0-rc.5', repo: work, devRef: 'origin/dev' });
  assert.equal(frozen.status, 'passed');
  const ghCalls = [];
  const dependencies = {
    execute: (command, args, options) => {
      if (command === 'gh') {
        ghCalls.push(args);
        if (args[1] === 'list') return { status: 0, stdout: '[]', stderr: '' };
        return { status: 0, stdout: 'https://github.com/BuildrAI/Buildr/pull/100\n', stderr: '' };
      }
      return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8' });
    },
  };
  const result = ensureReleaseToMainPullRequest({
    repo: work,
    version: '0.1.0-rc.5',
    candidateCommit: updated.releaseHead,
    candidateTree: updated.releaseTree,
    authorizeReleasePush: true,
    authorizePullRequest: true,
  }, dependencies);
  assert.equal(result.status, 'ready');
  assert.equal(result.pullRequest.url, 'https://github.com/BuildrAI/Buildr/pull/100');
  assert.equal(git(work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5').startsWith(updated.releaseHead), true);
  assert.equal(ghCalls.filter((args) => args[1] === 'create').length, 1);

  const closed = ensureReleaseToMainPullRequest({
    repo: work,
    version: '0.1.0-rc.5',
    candidateCommit: updated.releaseHead,
    candidateTree: updated.releaseTree,
  }, {
    execute: (command, args, options) => command === 'gh'
      ? {
          status: 0,
          stdout: JSON.stringify([{
            number: 100,
            state: 'CLOSED',
            mergedAt: null,
            headRefOid: updated.releaseHead,
            headRefName: 'release-0.1.0-rc.5',
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

test('Publication后main→dev使用普通merge保留dev新内容，并且重复调用幂等', (t) => {
  const data = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const first = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(first.status, 'passed');
  assert.equal(first.action, 'merged');
  git(data.work, 'fetch', 'origin', 'dev');
  assert.equal(git(data.work, 'show', 'origin/dev:dev-only.txt'), 'keep me');
  assert.equal(git(data.work, 'show', 'origin/dev:candidate.txt'), 'release');
  assert.equal(git(data.work, 'merge-base', '--is-ancestor', data.mainCommit, 'origin/dev'), '');
  const second = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(second.status, 'passed');
  assert.equal(second.action, 'already-converged');
});

test('Publication后merge冲突保留公开事实并返回独立blocked状态', (t) => {
  const data = convergenceFixture({ conflict: true });
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const before = git(data.work, 'ls-remote', 'origin', 'refs/heads/dev');
  const result = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(result.status, 'published-but-dev-convergence-blocked');
  assert.equal(result.diagnostic.code, 'published-dev-merge-conflict');
  assert.deepEqual(result.conflictPaths, ['candidate.txt']);
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/dev'), before);
});

test('remote竞争更新在push前失败关闭且不覆盖协作者dev', (t) => {
  const data = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  let racedCommit = null;
  const result = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence }, {
    beforeRemoteRecheck: () => {
      git(data.seed, 'checkout', 'dev');
      racedCommit = commit(data.seed, 'concurrent dev', { 'concurrent.txt': 'peer\n' });
      git(data.seed, 'push', 'origin', 'dev');
    },
  });
  assert.equal(result.status, 'published-but-dev-convergence-blocked');
  assert.equal(result.diagnostic.code, 'published-convergence-remote-race');
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/dev').startsWith(racedCommit), true);
});

test('remote release branch cleanup展示精确公开事实并要求独立授权', (t) => {
  const data = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const pending = cleanupRemoteReleaseBranch({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(pending.status, 'blocked');
  assert.equal(pending.diagnostic.code, 'remote-release-delete-authorization-required');
  assert.equal(pending.actualCommit, data.releaseCommit);
  const deleted = cleanupRemoteReleaseBranch({ repo: data.work, publicationEvidence: data.publicationEvidence, authorizeRemoteDelete: true });
  assert.equal(deleted.status, 'passed');
  assert.equal(deleted.action, 'deleted');
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5'), '');
});
