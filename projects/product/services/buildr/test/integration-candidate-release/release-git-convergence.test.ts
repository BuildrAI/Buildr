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
  reconcilePublishedReleaseWithDev,
  releaseCarrierBranchFor,
} from '../../tools/release/release-git-convergence.ts';
import { createReleaseContext } from '../../tools/release/release-readiness.ts';
import { createReleaseLifecycle } from '../../tools/release/release-lifecycle.ts';
import {
  createReleaseSelection,
  freezeReleaseSelection,
  selectReleaseCommit,
} from '../../tools/release/release-selection.ts';
import { createReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.ts';
import { createReleaseExecutionBinding } from '../../tools/release/release-execution-binding.ts';
import { runReleaseOrchestration } from '../../tools/release/release-orchestration-runner.ts';

const digest: any = (value: any) => `sha256-${String(value).padStart(64, '0')}`;

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

function convergenceFixture(): any  {
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
  const selected: any = commit(seed, 'release source on dev', {
    'candidate.txt': 'release\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.5"}\n',
  });
  const selectedTree: any = git(seed, 'rev-parse', `${selected}^{tree}`);
  const devCommit: any = commit(seed, 'continue dev', { 'dev-only.txt': 'keep me\n' });
  const devTree: any = git(seed, 'rev-parse', `${devCommit}^{tree}`);
  git(seed, 'checkout', 'main');
  git(seed, 'checkout', selected, '--', '.');
  const mainCommit: any = commit(seed, 'squash release', {});
  git(seed, 'tag', '-a', 'v0.1.0-rc.5', mainCommit, '-m', 'release 0.1.0-rc.5');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev', 'main', 'refs/tags/v0.1.0-rc.5');
  const release: any = releaseWorktree(root, remote, base);
  const created: any = createReleaseSelection({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', baseline: base, executionBinding: release.binding() });
  assert.equal(created.status, 'passed', JSON.stringify(created));
  const updated: any = selectReleaseCommit({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', source: selected, executionBinding: release.binding() });
  assert.equal(updated.status, 'passed', JSON.stringify(updated));
  const frozen: any = freezeReleaseSelection({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', executionBinding: release.binding() });
  assert.equal(frozen.status, 'passed', JSON.stringify(frozen));
  const releaseCommit: any = frozen.releaseHead;
  const releaseTree: any = frozen.releaseTree;
  assert.equal(releaseTree, selectedTree);
  git(release.work, 'push', 'origin', `${releaseCommit}:refs/heads/release-0.1.0-rc.5`);
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
  return { root, remote, seed, controller: release.controller, work: release.work, binding: release.binding, base, selected, frozen, releaseCommit, releaseTree, mainCommit, devCommit, publicationEvidence };
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
  assert.equal(unknown.diagnostic.code, 'release-closeout-identity-unknown');
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
