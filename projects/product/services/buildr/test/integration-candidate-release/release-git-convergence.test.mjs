import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  closeoutReleaseGitResources,
  cleanupRemoteReleaseBranch,
  convergePublishedMainToDev,
  ensureReleaseToMainPullRequest,
  inspectDevBranchPolicy,
  releaseCarrierBranchFor,
} from '../../tools/release/release-git-convergence.mjs';
import { createReleaseContext } from '../../tools/release/release-readiness.mjs';
import { createReleaseLifecycle } from '../../tools/release/release-lifecycle.mjs';
import {
  createReleaseSelection,
  freezeReleaseSelection,
  selectReleaseCommit,
} from '../../tools/release/release-selection.mjs';
import { createReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.mjs';

const mergePolicy = { source: 'github-branch-protection-readback', repository: 'BuildrAI/Buildr', branch: 'dev', allowsMergeCommits: true, requiredLinearHistory: false, identity: `sha256-${'9'.repeat(64)}` };
const policyDependencies = (observation = mergePolicy, extra = {}) => ({
  inspectBranchPolicy: () => ({ status: 'ready', observation }),
  ...extra,
});

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
    generation: frozen.generation,
    candidateCommit: updated.releaseHead,
    candidateTree: updated.releaseTree,
    authorizeReleasePush: true,
    authorizePullRequest: true,
  }, dependencies);
  assert.equal(result.status, 'ready');
  assert.equal(result.pullRequest.url, 'https://github.com/BuildrAI/Buildr/pull/100');
  const carrier = releaseCarrierBranchFor('0.1.0-rc.5', frozen.generation);
  assert.equal(git(work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5').startsWith(updated.releaseHead), true);
  assert.equal(git(work, 'ls-remote', 'origin', `refs/heads/${carrier}`).startsWith(updated.releaseHead), true);
  assert.equal(ghCalls.filter((args) => args[1] === 'create').length, 1);

  const closed = ensureReleaseToMainPullRequest({
    repo: work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
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

test('Publication后main→dev使用普通merge保留dev新内容，并且重复调用幂等', (t) => {
  const data = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const first = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence }, policyDependencies());
  assert.equal(first.status, 'passed');
  assert.equal(first.action, 'merged');
  git(data.work, 'fetch', 'origin', 'dev');
  assert.equal(git(data.work, 'show', 'origin/dev:dev-only.txt'), 'keep me');
  assert.equal(git(data.work, 'show', 'origin/dev:candidate.txt'), 'release');
  assert.equal(git(data.work, 'merge-base', '--is-ancestor', data.mainCommit, 'origin/dev'), '');
  const second = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence }, policyDependencies());
  assert.equal(second.status, 'passed');
  assert.equal(second.action, 'already-converged');
});

test('Publication后merge冲突保留公开事实并返回独立blocked状态', (t) => {
  const data = convergenceFixture({ conflict: true });
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const before = git(data.work, 'ls-remote', 'origin', 'refs/heads/dev');
  const result = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence }, policyDependencies());
  assert.equal(result.status, 'published-but-dev-convergence-blocked');
  assert.equal(result.diagnostic.code, 'published-dev-merge-conflict');
  assert.deepEqual(result.conflictPaths, ['candidate.txt']);
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/dev'), before);
});

test('remote竞争更新在push前失败关闭且不覆盖协作者dev', (t) => {
  const data = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  let racedCommit = null;
  const result = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence }, policyDependencies(mergePolicy, {
    beforeRemoteRecheck: () => {
      git(data.seed, 'checkout', 'dev');
      racedCommit = commit(data.seed, 'concurrent dev', { 'concurrent.txt': 'peer\n' });
      git(data.seed, 'push', 'origin', 'dev');
    },
  }));
  assert.equal(result.status, 'published-but-dev-convergence-blocked');
  assert.equal(result.diagnostic.code, 'published-convergence-remote-race');
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/dev').startsWith(racedCommit), true);
});

test('Publication后dev策略禁止merge commit时在创建临时提交前失败关闭', (t) => {
  const data = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const result = convergePublishedMainToDev({ repo: data.work, publicationEvidence: data.publicationEvidence }, policyDependencies({
    source: 'github-branch-protection-readback', repository: 'BuildrAI/Buildr', branch: 'dev', allowsMergeCommits: false, requiredLinearHistory: true, identity: `sha256-${'8'.repeat(64)}`,
  }));
  assert.equal(result.status, 'published-but-dev-convergence-blocked');
  assert.equal(result.diagnostic.code, 'published-dev-branch-policy-incompatible');
  assert.match(result.recoveryIdentity, /^sha256-[a-f0-9]{64}$/u);
  assert.equal(git(data.work, 'worktree', 'list', '--porcelain').includes('buildr-release-dev-convergence-'), false);
});

test('dev branch policy observation来自GitHub保护规则readback并形成稳定identity', () => {
  const result = inspectDevBranchPolicy({ repo: process.cwd(), repository: 'BuildrAI/Buildr', dev: 'dev' }, {
    execute: (command, args) => {
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

test('黄金生命周期以同一active Task等待授权并在零中间资源closeout后完成', (t) => {
  const data = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  git(data.work, 'fetch', 'origin');
  const created = createReleaseSelection({ version: '0.1.0-rc.5', repo: data.work, devRef: 'origin/dev', baseline: data.devCommit });
  assert.equal(created.status, 'passed', JSON.stringify(created));
  const frozen = freezeReleaseSelection({ version: '0.1.0-rc.5', repo: data.work, devRef: 'origin/dev' });
  assert.equal(frozen.status, 'passed', JSON.stringify(frozen));
  const taskId = 'release-0.1.0-rc.5';
  const contextDigest = `sha256-${'7'.repeat(64)}`;
  const candidateIdentity = `sha256-${'6'.repeat(64)}`;
  const waiting = createReleaseLifecycle({
    version: '0.1.0-rc.5',
    releaseTask: { taskId, status: 'active', recordDigest: `sha256-${'5'.repeat(64)}` },
    selection: { status: 'frozen', generation: frozen.generation, identity: frozen.selectionIdentity },
    candidate: { status: 'passed', identity: candidateIdentity },
    readiness: { status: 'ready', contextDigest },
    publication: { status: 'not-started' },
    convergence: { status: 'pending' },
    closeout: { status: 'pending' },
  });
  assert.equal(waiting.phase, 'awaiting-publication-authorization');
  assert.equal(waiting.releaseTask.taskId, taskId);
  git(data.work, 'checkout', 'dev');
  git(data.work, 'push', '--force', 'origin', `${data.devCommit}:release-0.1.0-rc.5`);
  const carrier = releaseCarrierBranchFor('0.1.0-rc.5', frozen.generation);
  git(data.work, 'branch', carrier, data.devCommit);
  git(data.work, 'push', 'origin', `${carrier}:${carrier}`);
  const unknown = closeoutReleaseGitResources({
    repo: data.work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
    expectedCommit: data.mainCommit,
    authorizeCarrierCleanup: true,
    authorizeLocalSelectionCleanup: true,
  });
  assert.equal(unknown.status, 'blocked');
  assert.equal(unknown.diagnostic.code, 'release-closeout-identity-unknown');
  assert.equal(git(data.work, 'ls-remote', 'origin', `refs/heads/${carrier}`).startsWith(data.devCommit), true);
  const first = closeoutReleaseGitResources({
    repo: data.work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
    expectedCommit: data.devCommit,
    authorizeCarrierCleanup: true,
    authorizeLocalSelectionCleanup: true,
  });
  assert.equal(first.status, 'passed', JSON.stringify(first));
  assert.equal(first.formalReleaseRef.disposition, 'retained-and-verified');
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5').startsWith(data.devCommit), true);
  assert.equal(git(data.work, 'ls-remote', 'origin', `refs/heads/${carrier}`), '');
  const second = closeoutReleaseGitResources({
    repo: data.work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
    expectedCommit: data.devCommit,
    authorizeCarrierCleanup: true,
    authorizeLocalSelectionCleanup: true,
  });
  assert.equal(second.status, 'passed', JSON.stringify(second));
  assert.equal(second.action, 'already-cleaned');
  assert.equal(second.identity, first.identity);
  const closed = createReleaseLifecycle({
    version: '0.1.0-rc.5',
    releaseTask: { taskId, status: 'completed', recordDigest: `sha256-${'4'.repeat(64)}`, noChange: true },
    selection: { status: 'frozen', generation: frozen.generation, identity: frozen.selectionIdentity },
    candidate: { status: 'passed', identity: candidateIdentity },
    readiness: { status: 'ready', contextDigest },
    publication: { status: 'passed', runId: 42, evidenceIdentity: data.publicationEvidence.identity },
    convergence: { status: 'passed', recoveryIdentity: `sha256-${'3'.repeat(64)}` },
    closeout: { status: 'passed', identity: first.identity, formalReleaseRef: first.formalReleaseRef },
  });
  assert.equal(closed.status, 'passed');
  assert.equal(closed.phase, 'closed');
  assert.equal(closed.releaseTask.taskId, waiting.releaseTask.taskId);
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
