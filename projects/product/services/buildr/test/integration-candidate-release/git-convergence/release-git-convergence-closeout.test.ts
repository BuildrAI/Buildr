import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

import { releaseCarrierBranchFor } from '../../../tools/release/release-git-convergence.ts';
import { createReleaseContext } from '../../../tools/release/release-readiness.ts';
import { createReleaseLifecycle } from '../../../tools/release/release-lifecycle.ts';
import { createReleaseTransactionEvidence } from '../../../tools/release/release-transaction-evidence.ts';
import {
  cleanupRemoteReleaseBranch,
  closeoutReleaseGitResources,
  convergenceFixture,
  digest,
  git,
  runReleaseOrchestration,
} from './helpers.ts';

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
