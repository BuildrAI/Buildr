import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  closeoutReleaseGitResources as closeoutReleaseGitResourcesActual,
  cleanupRemoteReleaseBranch as cleanupRemoteReleaseBranchActual,
  convergePublishedMainToDev,
  ensureReleaseToMainPullRequest,
  inspectDevBranchPolicy,
  reconcilePublishedReleaseWithDev,
  releaseCarrierBranchFor,
} from '../../tools/release/release-git-convergence.ts';
import { createReleaseContext } from '../../tools/release/release-readiness.ts';
import { createReleaseLifecycle } from '../../tools/release/release-lifecycle.ts';
import {
  createReleaseSelection,
  freezeReleaseSelection,
  inspectReleaseSelection,
  selectReleaseCommit,
} from '../../tools/release/release-selection.ts';
import { createReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.ts';
import { createReleaseExecutionBinding } from '../../tools/release/release-execution-binding.ts';
import { runReleaseOrchestration as runReleaseOrchestrationActual } from '../../tools/release/release-orchestration-runner.ts';

const digest: any = (value: any) => `sha256-${String(value).padStart(64, '0')}`;

function inactiveGithub(command: string, args: string[], options: any): any {
  if (command === 'git' && args[0] === 'remote' && args[1] === 'get-url') return { status: 0, stdout: 'https://github.com/BuildrAI/Buildr.git\n' };
  if (command !== 'gh') return spawnSync(command, args, { ...options, encoding: 'utf8' });
  assert.deepEqual(args.slice(0, 3), ['api', '--paginate', '--slurp']);
  const endpoint = args[3];
  assert.match(endpoint, /^repos\/BuildrAI\/Buildr\/(?:pulls\?|actions\/runs\?)/u);
  return { status: 0, stdout: JSON.stringify(endpoint.includes('/pulls?') ? [[]] : [{ total_count: 0, workflow_runs: [] }]) };
}

function closeoutReleaseGitResources(options: any, dependencies: any = {}): any {
  return closeoutReleaseGitResourcesActual(options, { execute: inactiveGithub, ...dependencies });
}

function cleanupRemoteReleaseBranch(options: any, dependencies: any = {}): any {
  return cleanupRemoteReleaseBranchActual(options, { execute: inactiveGithub, ...dependencies });
}

function runReleaseOrchestration(options: any, dependencies: any = {}): any {
  return runReleaseOrchestrationActual(options, { ...dependencies, gitDependencies: { execute: inactiveGithub, ...dependencies.gitDependencies } });
}

function git(cwd: any, ...args: any[]): any  {
  const result: any = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

function write(cwd: any, file: any, value: any): any  {
  const target: any = path.join(cwd, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function commit(cwd: any, message: any, files: any): any  {
  for (const [file, value] of Object.entries(files)) write(cwd, file, value);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function configure(cwd: any): any  {
  git(cwd, 'config', 'user.name', 'Buildr Test');
  git(cwd, 'config', 'user.email', 'buildr@example.com');
}

function releaseWorktree(root: any, remote: any, baseline: any, version: any = '0.1.0-rc.5'): any  {
  const controller: any = path.join(root, 'controller');
  const work: any = path.join(root, 'work');
  git(root, 'clone', '--branch', 'dev', remote, controller);
  configure(controller);
  git(controller, 'worktree', 'add', '-b', `codex/release-${version}`, work, baseline);
  configure(work);
  const providerEvidence: any = path.join(root, 'provider.json');
  fs.writeFileSync(providerEvidence, JSON.stringify({ schemaVersion: 'buildr.git-worktree-evidence/v1', taskId: `release-${version}`, workspaceRoot: controller, branch: `codex/release-${version}`, planDigest: digest('1'), status: 'ready', repositories: [{ selector: 'workspace', checkoutPath: work, branch: `codex/release-${version}` }], effects: [], updatedAt: '2026-08-28T00:00:00.000Z' }));
  const task: any = { taskId: `release-${version}`, status: 'active' };
  return { controller, work, binding: () => {
    const head: any = git(work, 'rev-parse', 'HEAD');
    const repository: any = { selector: 'workspace', checkoutPath: work, branch: `codex/release-${version}`, head, state: 'ready' };
    return createReleaseExecutionBinding({ version, task, workspaceRoot: controller, repo: work, worktreeResult: { status: 'ready', taskId: task.taskId, evidencePath: providerEvidence, repositories: [repository] } });
  } };
}

function convergenceFixture(preserveSource = true, previousGeneration = false): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-git-convergence-'));
  const remote: any = path.join(root, 'remote.git');
  const seed: any = path.join(root, 'seed');
  const work: any = path.join(root, 'work');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'dev');
  configure(seed);
  const packageFile: any = 'projects/product/services/buildr/package.json';
  const base: any = commit(seed, 'base', {
    'candidate.txt': 'base\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.4"}\n',
  });
  git(seed, 'branch', 'main', base);
  const earlier = previousGeneration ? commit(seed, 'earlier release source on dev', {
    'candidate.txt': 'earlier release\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.5"}\n',
  }) : null;
  const selected: any = commit(seed, 'release source on dev', {
    'candidate.txt': 'release\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.5"}\n',
  });
  const selectedTree: any = git(seed, 'rev-parse', `${selected}^{tree}`);
  const devCommit: any = commit(seed, 'continue dev', { 'dev-only.txt': 'keep me\n' });
  const devTree: any = git(seed, 'rev-parse', `${devCommit}^{tree}`);
  git(seed, 'checkout', 'main');
  git(seed, 'checkout', selected, '--', '.');
  let mainCommit: any = commit(seed, 'squash release', {});
  git(seed, 'tag', '-a', 'v0.1.0-rc.5', mainCommit, '-m', 'release 0.1.0-rc.5');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev', 'main', 'refs/tags/v0.1.0-rc.5');
  const release: any = releaseWorktree(root, remote, base);
  const created: any = createReleaseSelection({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', baseline: base, executionBinding: release.binding() });
  assert.equal(created.status, 'passed', JSON.stringify(created));
  let previousReleaseCommit: string | null = null;
  if (earlier) {
    const previous = selectReleaseCommit({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', source: earlier, executionBinding: release.binding() });
    assert.equal(previous.status, 'passed', JSON.stringify(previous));
    previousReleaseCommit = previous.releaseHead;
  }
  const updated: any = selectReleaseCommit({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', source: selected, executionBinding: release.binding() });
  assert.equal(updated.status, 'passed', JSON.stringify(updated));
  const frozen: any = freezeReleaseSelection({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', executionBinding: release.binding() });
  assert.equal(frozen.status, 'passed', JSON.stringify(frozen));
  const releaseCommit: any = frozen.releaseHead;
  const releaseTree: any = frozen.releaseTree;
  assert.equal(releaseTree, selectedTree);
  git(release.work, 'push', 'origin', `${releaseCommit}:refs/heads/release-0.1.0-rc.5`);
  if (preserveSource) {
    git(seed, 'fetch', 'origin', 'release-0.1.0-rc.5');
    git(seed, 'merge', '--no-ff', releaseCommit, '-m', 'preserve release source');
    mainCommit = git(seed, 'rev-parse', 'HEAD');
    git(seed, 'tag', '-f', '-a', 'v0.1.0-rc.5', mainCommit, '-m', 'release 0.1.0-rc.5');
    git(seed, 'push', 'origin', 'main', '+refs/tags/v0.1.0-rc.5');
    git(release.work, 'fetch', 'origin', 'main', '+refs/tags/v0.1.0-rc.5:refs/tags/v0.1.0-rc.5');
  }
  const context: any = createReleaseContext({
    selection: {
      identity: frozen.selectionIdentity,
      version: frozen.version,
      branch: frozen.branch,
      releaseHead: frozen.releaseHead,
      releaseTree: frozen.releaseTree,
      generation: frozen.generation,
      status: 'frozen',
    },
    release: { version: '0.1.0-rc.5', sourceCommit: releaseCommit, sourceTree: releaseTree },
    convergence: { mainCommit, mainTree: releaseTree, devCommit, devTree },
  });
  const publicationEvidence: any = createReleaseTransactionEvidence({
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
  return { root, remote, seed, controller: release.controller, work: release.work, binding: release.binding, base, selected, frozen, releaseCommit, releaseTree, previousReleaseCommit, mainCommit, devCommit, publicationEvidence };
}

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

test('黄金生命周期以同一active Task等待授权并在零中间资源closeout后完成', (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const frozen: any = data.frozen;
  const taskId: any = 'release-0.1.0-rc.5';
  const contextDigest: any = `sha256-${'7'.repeat(64)}`;
  const candidateIdentity: any = `sha256-${'6'.repeat(64)}`;
  const waiting: any = createReleaseLifecycle({
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
  const carrier: any = releaseCarrierBranchFor('0.1.0-rc.5', frozen.generation);
  git(data.work, 'branch', carrier, data.devCommit);
  git(data.work, 'push', 'origin', `${carrier}:${carrier}`);
  const unknown: any = closeoutReleaseGitResources({
    repo: data.work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
    expectedCommit: data.releaseCommit,
    authorizeCarrierCleanup: true,
    authorizeLocalSelectionCleanup: true,
    publicationEvidence: data.publicationEvidence,
  });
  assert.equal(unknown.status, 'blocked');
  assert.equal(unknown.diagnostic.code, 'release-cleanup-partial');
  assert.equal(git(data.work, 'ls-remote', 'origin', `refs/heads/${carrier}`).startsWith(data.devCommit), true);
  git(data.work, 'branch', '-f', carrier, data.releaseCommit);
  git(data.work, 'push', '--force', 'origin', `${carrier}:${carrier}`);
  const first: any = closeoutReleaseGitResources({
    repo: data.work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
    expectedCommit: data.releaseCommit,
    authorizeCarrierCleanup: true,
    authorizeLocalSelectionCleanup: true,
    publicationEvidence: data.publicationEvidence,
  });
  assert.equal(first.status, 'passed', JSON.stringify(first));
  assert.equal(first.formalReleaseRef.disposition, 'retained-and-verified');
  assert.equal(first.tag.local, 'absent');
  assert.equal(first.tag.remote, 'retained-and-verified');
  assert.equal(spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/tags/v0.1.0-rc.5'], { cwd: data.controller }).status, 1);
  assert.notEqual(git(data.controller, 'ls-remote', 'origin', 'refs/tags/v0.1.0-rc.5'), '');
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5').startsWith(data.releaseCommit), true);
  assert.equal(git(data.work, 'ls-remote', 'origin', `refs/heads/${carrier}`), '');
  const second: any = closeoutReleaseGitResources({
    repo: data.work,
    version: '0.1.0-rc.5',
    generation: frozen.generation,
    expectedCommit: data.releaseCommit,
    authorizeCarrierCleanup: true,
    authorizeLocalSelectionCleanup: true,
    publicationEvidence: data.publicationEvidence,
  });
  assert.equal(second.status, 'passed', JSON.stringify(second));
  assert.equal(second.action, 'already-cleaned');
  assert.equal(second.identity, first.identity);
  const closed: any = createReleaseLifecycle({
    version: '0.1.0-rc.5',
    releaseTask: { taskId, status: 'completed', recordDigest: `sha256-${'4'.repeat(64)}` },
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

test('本地Tag漂移在任何发布资源删除前阻止closeout', (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const carrier: any = releaseCarrierBranchFor('0.1.0-rc.5', data.frozen.generation);
  git(data.controller, 'branch', carrier, data.releaseCommit);
  git(data.controller, 'push', 'origin', `${carrier}:${carrier}`);
  git(data.controller, 'tag', '-f', 'v0.1.0-rc.5', data.base);

  const blocked: any = closeoutReleaseGitResources({
    repo: data.controller,
    version: '0.1.0-rc.5',
    generation: data.frozen.generation,
    expectedCommit: data.releaseCommit,
    authorizeCarrierCleanup: true,
    authorizeLocalSelectionCleanup: true,
    publicationEvidence: data.publicationEvidence,
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'release-closeout-local-tag-drift');
  assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${carrier}`), '');
  assert.equal(git(data.controller, 'rev-parse', 'release-0.1.0-rc.5'), data.releaseCommit);
});

test('发布编排真实调用Git closeout并把精确交付映射直接交给Worktree owner', async (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const version: any = '0.1.0-rc.5';
  const taskId: any = `release-${version}`;
  const carrier: any = releaseCarrierBranchFor(version, data.frozen.generation);
  git(data.controller, 'branch', carrier, data.releaseCommit);
  git(data.controller, 'push', 'origin', `${carrier}:${carrier}`);
  let task: any = { taskId, status: 'active', result: null };
  const controllerCalls: any[] = [];
  const orchestrationContext: any = createReleaseContext({
    selection: data.publicationEvidence.context.selection,
    release: data.publicationEvidence.context.release,
    candidate: { status: 'passed', runId: 42, runAttempt: 1, aggregateIdentity: digest('4') },
    convergence: data.publicationEvidence.context.convergence,
  });
  const orchestrationEvidence: any = createReleaseTransactionEvidence({
    context: orchestrationContext,
    publish: data.publicationEvidence.publish,
    outcome: 'passed',
    publicFacts: {
      version,
      tagCommit: data.publicationEvidence.release.tagCommit,
      npmDistTag: data.publicationEvidence.release.npmDistTag,
      registryPublished: true,
      registryIntegrity: data.publicationEvidence.release.registryIntegrity,
      githubRelease: data.publicationEvidence.release.githubRelease,
      registrySmoke: 'passed',
    },
  });
  const dependencies: any = {
    inspectHostedReleaseTransaction: async () => ({ status: 'passed', evidence: orchestrationEvidence }),
    reconcilePublishedReleaseWithDev: () => ({ status: 'passed', identity: digest('9'), recoveryIdentity: digest('8'), effects: [], nextActions: [] }),
    inspectTask: () => ({ record: task, recordDigest: digest(task.status === 'active' ? '7' : '6') }),
    resolveRetainedController: () => ({ executable: process.execPath, argsPrefix: [], workspaceRoot: data.controller }),
    invokeRetainedController: (_controller: any, args: any) => {
      controllerCalls.push(args);
      if (args[0] === 'task' && args[1] === 'complete') {
        task = { ...task, status: 'completed', result: { summary: 'closed' } };
        return { status: 'completed', effects: [{ type: 'task-completed' }] };
      }
      if (args[0] === 'worktree' && args[1] === 'cleanup') {
        return { status: 'cleaned', effects: [{ type: 'worktree-cleaned' }] };
      }
      return { status: 'ready', effects: [] };
    },
  };
  const options: any = {
    action: 'closeout', version, releaseTask: taskId, publishRunId: 42,
    repo: data.controller, canonicalWorkspace: data.controller,
    authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
  };
  const closed: any = await runReleaseOrchestration(options, dependencies);
  assert.equal(closed.status, 'passed', JSON.stringify(closed));
  assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${carrier}`), '');
  assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/release-${version}`).startsWith(data.releaseCommit), true);
  assert.deepEqual(controllerCalls[1].slice(3, 7), ['--expected-source', `workspace=${data.releaseCommit}`, '--delivered-ref', `workspace=${data.mainCommit}`]);
  const repeated: any = await runReleaseOrchestration(options, dependencies);
  assert.equal(repeated.status, 'passed', JSON.stringify(repeated));
  assert.equal(controllerCalls.filter((args: any) => args[0] === 'task' && args[1] === 'complete').length, 1);
});

test('remote release branch cleanup展示精确公开事实并要求独立授权', (t: any) => {
  const data: any = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const pending: any = cleanupRemoteReleaseBranch({ repo: data.work, publicationEvidence: data.publicationEvidence });
  assert.equal(pending.status, 'blocked');
  assert.equal(pending.diagnostic.code, 'remote-release-delete-authorization-required');
  assert.equal(pending.actualCommit, data.releaseCommit);
  const deleted: any = cleanupRemoteReleaseBranch({ repo: data.work, publicationEvidence: data.publicationEvidence, authorizeRemoteDelete: true });
  assert.equal(deleted.status, 'passed');
  assert.equal(deleted.action, 'deleted');
  assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5'), '');
});


test('authorized closeout deletes the formal branch and resumes after Task completion failure', async t => {
  const data = convergenceFixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const version = '0.1.0-rc.5';
  const remoteTagBefore = git(data.controller, 'ls-remote', 'origin', `refs/tags/v${version}`);
  let task: any = { taskId: `release-${version}`, status: 'active', result: null };
  let attempts = 0;
  const context = createReleaseContext({ selection: data.publicationEvidence.context.selection,
    release: data.publicationEvidence.context.release, convergence: data.publicationEvidence.context.convergence,
    candidate: { status: 'passed', runId: 42, runAttempt: 1, aggregateIdentity: digest('4') } });
  const evidence = createReleaseTransactionEvidence({ context, publish: data.publicationEvidence.publish, outcome: 'passed',
    publicFacts: { version, tagCommit: data.mainCommit, npmDistTag: 'next', registryPublished: true,
      registryIntegrity: data.publicationEvidence.release.registryIntegrity, githubRelease: data.publicationEvidence.release.githubRelease, registrySmoke: 'passed' } });
  const dependencies = {
    inspectHostedReleaseTransaction: async () => ({ status: 'passed', evidence }),
    inspectTask: () => ({ record: task, recordDigest: digest('8') }),
    resolveRetainedController: () => ({ workspaceRoot: data.controller }),
    invokeRetainedController: (_controller: any, args: string[]) => {
      if (args[0] === 'task') {
        if (++attempts === 1) return { status: 'blocked', effects: [], nextActions: ['retry record'] };
        task = { ...task, status: 'completed', result: { summary: 'closed' } };
        return { status: 'completed', effects: [] };
      }
      return { status: args[0] === 'worktree' ? 'cleaned' : 'ready', effects: [] };
    },
  };
  const options = { action: 'closeout', version, releaseTask: task.taskId, publishRunId: 42,
    repo: data.controller, canonicalWorkspace: data.controller,
    authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true, authorizeRemoteDelete: true };
  const first = await runReleaseOrchestration(options, dependencies);
  assert.equal(first.status, 'blocked', JSON.stringify(first));
  assert.equal(first.outcomes.publication, 'passed');
  assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/release-${version}`), '');
  const resumed = await runReleaseOrchestration(options, dependencies);
  assert.equal(resumed.status, 'passed', JSON.stringify(resumed));
  assert.equal(resumed.lifecycle.facts.closeout.formalReleaseRef.disposition, 'cleaned-and-verified');
  assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/tags/v${version}`), remoteTagBefore);
  const repeated = await runReleaseOrchestration(options, dependencies);
  assert.equal(repeated.status, 'passed', JSON.stringify(repeated));
  assert.equal(attempts, 2);
  assert.deepEqual(repeated.steps.find((item: any) => item.operation === 'closeout').effects, []);
});

test('formal branch deletion requires live Tag and retained source history, not just matching trees', t => {
  for (const failure of ['missing-tag', 'source-not-retained', 'branch-drift']) {
    const data = convergenceFixture(failure !== 'source-not-retained');
    t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
    if (failure === 'missing-tag') git(data.seed, 'push', 'origin', ':refs/tags/v0.1.0-rc.5');
    if (failure === 'branch-drift') git(data.work, 'push', '--force', 'origin', `${data.devCommit}:refs/heads/release-0.1.0-rc.5`);
    const before = git(data.work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5');
    const result = cleanupRemoteReleaseBranch({ repo: data.work, publicationEvidence: data.publicationEvidence, authorizeRemoteDelete: true });
    assert.equal(result.status, 'blocked', `${failure}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.effects, []);
    assert.equal(git(data.work, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5'), before);
  }
});

function multiGenerationCloseout(data: any, policy = 'delete-owned-release-branches/v2'): any {
  const version = '0.1.0-rc.5';
  const earlier = releaseCarrierBranchFor(version, data.frozen.generation - 1);
  const current = releaseCarrierBranchFor(version, data.frozen.generation);
  for (const [branch, commit] of [[earlier, data.previousReleaseCommit], [current, data.releaseCommit]]) {
    git(data.controller, 'push', 'origin', `${commit}:refs/heads/${branch}`);
    git(data.controller, 'branch', branch, commit);
  }
  return { earlier, current, options: { repo: data.controller, version, generation: data.frozen.generation,
    expectedCommit: data.releaseCommit, publicationEvidence: data.publicationEvidence, cleanupPolicy: policy,
    authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true, authorizeRemoteDelete: true } };
}

test('v2 cleans every proved generation, keeps other versions, and reconstructs ownership after local selection cleanup', t => {
  const data = convergenceFixture(true, true);
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const { earlier, current, options } = multiGenerationCloseout(data);
  const unrelated = 'codex/release-main-0.1.0-rc.50-g1';
  git(data.controller, 'push', 'origin', `${data.previousReleaseCommit}:refs/heads/${unrelated}`);
  const tagBefore = git(data.controller, 'ls-remote', 'origin', 'refs/tags/v0.1.0-rc.5');
  const cleaned = closeoutReleaseGitResources(options);
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned));
  assert.equal(cleaned.branches.find((item: any) => item.ref === `refs/heads/${earlier}`).expectedCommit, data.previousReleaseCommit);
  for (const branch of [earlier, current, 'release-0.1.0-rc.5']) assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${branch}`), '');
  assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${unrelated}`), '');
  assert.equal(git(data.controller, 'ls-remote', 'origin', 'refs/tags/v0.1.0-rc.5'), tagBefore);
  assert.equal(git(data.controller, 'for-each-ref', '--format=%(refname)', 'refs/buildr/release/0.1.0-rc.5/'), '');
  // Simulate a remote deletion response that was lost before the caller saw it.
  git(data.controller, 'push', 'origin', `${data.previousReleaseCommit}:refs/heads/${earlier}`);
  const resumed = closeoutReleaseGitResources(options);
  assert.equal(resumed.status, 'passed', JSON.stringify(resumed));
  assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${earlier}`), '');
  const repeated = closeoutReleaseGitResources(options);
  assert.equal(repeated.action, 'already-cleaned');
  assert.deepEqual(repeated.effects, []);
  assert.ok(repeated.branches.every((item: any) => item.disposition === 'already-cleaned'));
});

test('v1 keeps earlier generations and continues to accept a CLI string generation', t => {
  const data = convergenceFixture(true, true);
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const { earlier, current, options } = multiGenerationCloseout(data, 'delete-owned-release-branches/v1');
  const cleaned = closeoutReleaseGitResources({ ...options, generation: String(options.generation) });
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned));
  assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${earlier}`), '');
  assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${current}`), '');
  assert.equal(cleaned.resources.carriers, undefined, 'a v1 result cannot claim all generations are absent');
});

test('v2 retains only a drifted, active, unknown, or failed generation and reports recoverable partial effects', async t => {
  for (const failure of ['drift', 'head-pr', 'base-pr', 'run', 'query', 'malformed-pr', 'incomplete-runs', 'delete-failure']) {
    await t.test(failure, child => {
      const data = convergenceFixture(true, true);
      child.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
      const { earlier, current, options } = multiGenerationCloseout(data);
      if (failure === 'drift') git(data.controller, 'push', '--force', 'origin', `${data.devCommit}:refs/heads/${earlier}`);
      const execute = (command: string, args: string[], execOptions: any): any => {
        const endpoint = args[3] ?? '';
        const body = (value: any) => ({ status: 0, stdout: JSON.stringify(value) });
        if (command === 'gh' && endpoint.includes('/pulls?')) {
          if (failure === 'head-pr' || failure === 'base-pr') return body([[], [{ number: 99, state: 'open',
            head: { ref: failure === 'head-pr' ? earlier : 'another-branch', repo: { full_name: 'BuildrAI/Buildr' } },
            base: { ref: failure === 'base-pr' ? earlier : 'main' } }]]);
          // An invalid identity is unknown for every branch, so inject it only
          // while inspecting the old generation (identified below via a hook).
        }
        if (command === 'gh' && endpoint.includes(`branch=${encodeURIComponent(earlier)}&`)) {
          if (failure === 'run') return body([{ total_count: 1, workflow_runs: [] }, { total_count: 1, workflow_runs: [{ id: 8, head_branch: earlier, status: 'in_progress' }] }]);
          if (failure === 'query') return { status: 1, stderr: 'GitHub unavailable' };
          if (failure === 'incomplete-runs') return body([{ total_count: 2, workflow_runs: [] }]);
        }
        if (failure === 'delete-failure' && command === 'git' && args[0] === 'push' && args.includes(`:refs/heads/${earlier}`)) return { status: 1, stderr: 'injected push failure' };
        return inactiveGithub(command, args, execOptions);
      };
      let inspectedBranch = '';
      const dependencies = { execute: (command: string, args: string[], execOptions: any) => {
        // Branch iteration reads PRs before runs. The deterministic branch list
        // starts with the earlier carrier, letting this response exercise an
        // invalid PR identity without making unrelated reads unavailable.
        if (command === 'gh' && args[3]?.includes('/pulls?')) {
          inspectedBranch = inspectedBranch ? 'later' : earlier;
          if (failure === 'malformed-pr' && inspectedBranch === earlier) return { status: 0, stdout: JSON.stringify([[{ number: 99, state: 'open', head: { ref: earlier, repo: {} }, base: { ref: 'main' } }]]) };
        }
        return execute(command, args, execOptions);
      } };
      const partial = closeoutReleaseGitResources(options, dependencies);
      assert.equal(partial.status, 'blocked', `${failure}: ${JSON.stringify(partial)}`);
      assert.equal(partial.diagnostic.code, 'release-cleanup-partial');
      assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${earlier}`), '');
      assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${current}`), '');
      assert.equal(git(data.controller, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5'), '');
      assert.equal(partial.branches.find((item: any) => item.ref === `refs/heads/${earlier}`).disposition, 'retained');
      assert.ok(partial.effects.some((item: any) => item.type === 'remote-release-branch-deleted'));
      if (failure === 'delete-failure') assert.ok(partial.effects.some((item: any) => item.ref === `refs/heads/${earlier}` && item.state === 'not-applied'));
      if (failure === 'drift') git(data.controller, 'push', '--force', 'origin', `${data.previousReleaseCommit}:refs/heads/${earlier}`);
      const resumed = closeoutReleaseGitResources(options);
      assert.equal(resumed.status, 'passed', JSON.stringify(resumed));
      assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${earlier}`), '');
    });
  }
});

test('root preservation or repository mismatch prevents all generation deletions', async t => {
  for (const failure of ['missing-tag', 'repository', 'remote-fetch', 'remote-push']) await t.test(failure, child => {
    const data = convergenceFixture(true, true);
    child.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
    const { earlier, current, options } = multiGenerationCloseout(data);
    if (failure === 'missing-tag') git(data.controller, 'push', 'origin', ':refs/tags/v0.1.0-rc.5');
    if (failure === 'repository') options.repository = 'someone/else';
    const blocked = closeoutReleaseGitResources(options, { execute: (command: string, args: string[], execOptions: any) => {
      if (command === 'git' && args[0] === 'remote' && args[1] === 'get-url'
          && ((failure === 'remote-push' && args.includes('--push')) || (failure === 'remote-fetch' && !args.includes('--push')))) {
        return { status: 0, stdout: 'git@github.com:someone/else.git\n' };
      }
      return inactiveGithub(command, args, execOptions);
    } });
    assert.equal(blocked.status, 'blocked', JSON.stringify(blocked));
    assert.deepEqual(blocked.effects, []);
    for (const branch of [earlier, current, 'release-0.1.0-rc.5']) assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${branch}`), '');
  });
});

test('v1 and narrow formal cleanup retain branches with active uses', t => {
  const data = convergenceFixture(true, true);
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const { current, options } = multiGenerationCloseout(data, 'delete-owned-release-branches/v1');
  const execute = (command: string, args: string[], execOptions: any): any => {
    if (command === 'gh' && args[3]?.includes('/pulls?')) return { status: 0, stdout: JSON.stringify([[{ number: 99, state: 'open',
      head: { ref: current, repo: { full_name: 'BuildrAI/Buildr' } }, base: { ref: 'release-0.1.0-rc.5' } }]]) };
    return inactiveGithub(command, args, execOptions);
  };
  const broad = closeoutReleaseGitResources(options, { execute });
  const narrow = cleanupRemoteReleaseBranch(options, { execute });
  assert.equal(broad.status, 'blocked', JSON.stringify(broad));
  assert.equal(narrow.status, 'blocked', JSON.stringify(narrow));
  assert.deepEqual(broad.effects, []);
  assert.deepEqual(narrow.effects, []);
});

test('orchestration isolates a drifted formal branch while cleaning safe carriers', async t => {
  const data = convergenceFixture(true, true);
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const { earlier, current, options } = multiGenerationCloseout(data);
  git(data.controller, 'push', '--force', 'origin', `${data.devCommit}:refs/heads/release-0.1.0-rc.5`);
  const partial = await runReleaseOrchestration({ ...options, action: 'closeout', releaseTask: 'release-0.1.0-rc.5', publishRunId: 42 }, {
    inspectHostedReleaseTransaction: async () => ({ status: 'passed', evidence: data.publicationEvidence }),
  });
  assert.equal(partial.status, 'blocked', JSON.stringify(partial));
  assert.equal(partial.outcomes.publication, 'passed');
  assert.equal(partial.cleanup.branches.find((item: any) => item.ref === 'refs/heads/release-0.1.0-rc.5').disposition, 'retained');
  for (const branch of [earlier, current]) assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${branch}`), '');
  assert.ok(git(data.controller, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5').startsWith(data.devCommit));
});
