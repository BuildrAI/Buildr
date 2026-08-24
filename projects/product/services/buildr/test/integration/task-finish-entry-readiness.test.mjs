import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  observeTaskFinishEntryReadiness,
  taskFinishEntryGapsError,
} from '../../src/task/application/finish/task-finish-entry-readiness.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function makeGitRoot(t, { remotes = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-entry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Entry Test']);
  git(root, ['config', 'user.email', 'entry@example.com']);
  fs.writeFileSync(path.join(root, 'README.md'), '# entry\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'baseline']);
  if (remotes) {
    const remote = path.join(root, 'remote.git');
    git(root, ['init', '--bare', remote]);
    git(root, ['remote', 'add', 'origin', remote]);
    git(root, ['push', '-u', 'origin', 'dev']);
  }
  return root;
}

function handoffFixture() {
  return {
    identity: 'sha256-handoff',
    candidate: { identity: 'sha256-candidate', generation: 1, contentTargetIdentity: 'sha256-content' },
    gates: { planning: { disposition: 'not-applicable' }, verification: { disposition: 'waived' }, completion: { disposition: 'waived' } },
    decision: { outcome: 'proceed', summary: 'ok', risks: [] },
  };
}

test('入口同时报告环境与研发缺口且不短路', (t) => {
  const root = makeGitRoot(t);
  const runtime = {
    resolveTaskEnvironmentExecution: () => ({ ready: false, blocked: { code: 'task_environment_snapshot_missing', message: 'Environment missing.' } }),
    inspectTaskDevelopment: () => ({ development: { receipt: null, applicability: { handoff: 'missing' } } }),
  };
  const observed = observeTaskFinishEntryReadiness({ runtime, root, task: 'demo-task' });
  assert.equal(observed.ready, false);
  assert.equal(observed.nextWorkflow, 'task-development');
  assert.equal(observed.identityParts, null);
  assert.equal(observed.handoff, null);
  assert.deepEqual(Object.keys(observed.gaps), ['development', 'environment', 'delivery']);
  assert.ok(observed.gaps.environment.length >= 1);
  assert.ok(observed.gaps.development.length >= 1);
  assert.equal(observed.gaps.environment[0].code, 'task_environment_snapshot_missing');
  assert.equal(observed.gaps.development[0].code, 'task_finish.development_handoff_not_current');
  // delivery may still be observed against retained root
  const error = taskFinishEntryGapsError(observed);
  assert.equal(error.code, 'task_finish.entry_gaps');
  assert.equal(error.details.nextWorkflow, 'task-development');
  assert.deepEqual(error.details.gaps, observed.gaps);
  assert.match(error.nextAction, /task-development/);
});

test('无贡献 repository 不解析 remote 且入口保持就绪', (t) => {
  const root = makeGitRoot(t, { remotes: false });
  const handoff = handoffFixture();
  const runtime = {
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      validationRoot: root,
      controller: { adapter: 'codex' },
      repositories: [{ selector: 'workspace', remote: null }],
    }),
    inspectTaskDevelopment: () => ({
      development: {
        receipt: { candidate: handoff.candidate, gates: handoff.gates, decision: handoff.decision, handoffs: [handoff] },
        applicability: { handoff: 'current' },
      },
    }),
  };
  const observed = observeTaskFinishEntryReadiness({ runtime, root, task: 'demo-task' });
  assert.equal(observed.ready, true);
  assert.equal(observed.nextWorkflow, null);
  assert.deepEqual(observed.gaps.development, []);
  assert.deepEqual(observed.gaps.environment, []);
  assert.deepEqual(observed.gaps.delivery, []);
  assert.equal(observed.identityParts.repositories[0].disposition, 'not-applicable');
  assert.equal(observed.identityParts.repositories[0].remote, null);
  assert.equal(observed.identityParts.remote, null);
});

test('全部入口就绪时返回 identityParts', (t) => {
  const root = makeGitRoot(t, { remotes: true });
  fs.writeFileSync(path.join(root, 'feature.txt'), 'Task contribution.\n');
  const handoff = handoffFixture();
  const runtime = {
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      validationRoot: root,
      controller: { adapter: 'codex' },
      repositories: [{ selector: 'workspace', remote: 'origin' }],
    }),
    inspectTaskDevelopment: () => ({
      development: {
        receipt: { candidate: handoff.candidate, gates: handoff.gates, decision: handoff.decision, handoffs: [handoff] },
        applicability: { handoff: 'current' },
      },
    }),
  };
  const observed = observeTaskFinishEntryReadiness({ runtime, root, task: 'demo-task', requestedCommitMessage: 'fix(task-finish): freeze delivery message', requireCommitMessage: true });
  assert.equal(observed.ready, true);
  assert.equal(observed.identityParts.remote, 'origin');
  assert.equal(observed.identityParts.targetBranch, 'dev');
  assert.equal(observed.identityParts.agent, 'codex');
  assert.equal(observed.identityParts.handoffIdentity, 'sha256-handoff');
  assert.equal(observed.identityParts.deliveryCommitIdentity, observed.deliveryCommit.identity);
  assert.equal(observed.identityParts.repositories[0].disposition, 'applicable');
  assert.match(observed.deliveryCommit.message, /Buildr-Task: demo-task$/);

  const missing = observeTaskFinishEntryReadiness({ runtime, root, task: 'demo-task', requireCommitMessage: true });
  assert.equal(missing.ready, false);
  assert.ok(missing.gaps.delivery.some((item) => item.code === 'task_finish.commit_message_required'));
});

test('Finish --agent 与 Environment adapter 不一致时不创建 identity', (t) => {
  const root = makeGitRoot(t, { remotes: true });
  const handoff = handoffFixture();
  const runtime = {
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      validationRoot: root,
      controller: { adapter: 'codex' },
      repositories: [{ selector: 'workspace', remote: 'origin' }],
    }),
    inspectTaskDevelopment: () => ({
      development: {
        receipt: { candidate: handoff.candidate, gates: handoff.gates, decision: handoff.decision, handoffs: [handoff] },
        applicability: { handoff: 'current' },
      },
    }),
  };
  const observed = observeTaskFinishEntryReadiness({
    runtime,
    root,
    task: 'demo-task',
    requestedAgent: 'cursor',
    requestedCommitMessage: 'fix(task-finish): freeze delivery message',
    requireCommitMessage: true,
  });
  assert.equal(observed.ready, false);
  assert.equal(observed.identityParts, null);
  assert.ok(observed.gaps.environment.some((item) => item.code === 'task_finish.environment_mismatch'));
});

test('reconcile在Environment缺失时从handoff、Task scope与Git topology解析delivery context', (t) => {
  const root = makeGitRoot(t, { remotes: true });
  const taskRoot = path.join(root, '.worktrees', 'demo-task');
  fs.appendFileSync(path.join(root, '.gitignore'), '/.worktrees/\n');
  git(root, ['add', '.gitignore']);
  git(root, ['commit', '-m', 'ignore task worktrees']);
  git(root, ['push', 'origin', 'dev']);
  git(root, ['worktree', 'add', '-b', 'codex/demo-task', taskRoot, 'dev']);
  fs.writeFileSync(path.join(taskRoot, 'feature.txt'), 'environmentless reconciliation\n');
  git(taskRoot, ['add', 'feature.txt']);
  git(taskRoot, ['commit', '-m', 'task source']);
  const handoff = handoffFixture();
  const receipt = {
    candidate: handoff.candidate,
    gates: handoff.gates,
    decision: handoff.decision,
    handoffs: [handoff],
    contentTarget: { components: [{ selector: 'workspace', kind: 'workspace', sourcePath: '.', observer: 'git', identity: `sha256-${'1'.repeat(64)}` }] },
  };
  const runtime = {
    resolveTaskEnvironmentExecution: () => ({ ready: false, blocked: { code: 'task_environment_snapshot_missing', message: 'Environment missing.' } }),
    inspectTaskDevelopment: () => ({ development: { receipt, applicability: { handoff: 'current' } } }),
    inspectTaskRecord: () => ({ record: { taskId: 'demo-task', scope: { projects: [], services: [] }, changes: [] } }),
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, projects: {} }),
    readGitWorktreeEvidence: () => ({ evidence: { repositories: [{ selector: 'workspace', sourcePath: '.', sourceRepository: root, checkoutPath: taskRoot, branch: 'codex/demo-task', remote: 'origin' }] } }),
  };
  const observed = observeTaskFinishEntryReadiness({ runtime, root, task: 'demo-task', allowEnvironmentless: true });
  assert.equal(observed.ready, true);
  assert.deepEqual(observed.gaps.environment, []);
  assert.deepEqual(observed.gaps.delivery, []);
  assert.equal(observed.identityParts.contextSource, 'handoff-scope-git');
  assert.equal(observed.identityParts.environmentAvailable, false);
  assert.equal(observed.identityParts.agent, 'agent-led-reconciliation');
  assert.equal(observed.identityParts.repositories[0].taskRoot, fs.realpathSync(taskRoot));
  assert.equal(observed.identityParts.repositories[0].remote, 'origin');

  const ambiguous = observeTaskFinishEntryReadiness({ runtime, root, task: 'demo-task', allowEnvironmentless: true, requestedRemote: 'missing' });
  assert.equal(ambiguous.ready, false);
  assert.equal(ambiguous.identityParts, null);
  assert.ok(ambiguous.gaps.delivery.some((item) => item.code === 'task_finish.remote_unavailable'));
});
