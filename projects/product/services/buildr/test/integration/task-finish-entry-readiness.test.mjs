import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  observeTaskFinishEntryReadiness,
  taskFinishEntryGapsError,
} from '../../src/application/task-finish/task-finish-entry-readiness.mjs';

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
  assert.ok(observed.gaps.environment.length >= 1);
  assert.ok(observed.gaps.development.length >= 1);
  assert.equal(observed.gaps.environment[0].code, 'task_environment_snapshot_missing');
  assert.equal(observed.gaps.development[0].code, 'task_finish.development_handoff_not_current');
  // delivery may still be observed against retained root
  const error = taskFinishEntryGapsError(observed);
  assert.equal(error.code, 'task_finish.entry_gaps');
  assert.equal(error.details.nextWorkflow, 'task-development');
  assert.ok(error.details.gaps.environment.length >= 1);
  assert.ok(error.details.gaps.development.length >= 1);
});

test('仅交付 remote 缺口时不误标为研发', (t) => {
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
  assert.equal(observed.ready, false);
  assert.equal(observed.nextWorkflow, null);
  assert.deepEqual(observed.gaps.development, []);
  assert.deepEqual(observed.gaps.environment, []);
  assert.ok(observed.gaps.delivery.some((item) => item.code === 'task_finish.remote_unavailable'));
});

test('全部入口就绪时返回 identityParts', (t) => {
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
  const observed = observeTaskFinishEntryReadiness({ runtime, root, task: 'demo-task', requestedCommitMessage: 'fix(task-finish): freeze delivery message', requireCommitMessage: true });
  assert.equal(observed.ready, true);
  assert.equal(observed.identityParts.remote, 'origin');
  assert.equal(observed.identityParts.targetBranch, 'dev');
  assert.equal(observed.identityParts.handoffIdentity, 'sha256-handoff');
  assert.equal(observed.identityParts.deliveryCommitIdentity, observed.deliveryCommit.identity);
  assert.match(observed.deliveryCommit.message, /Buildr-Task: demo-task$/);

  const missing = observeTaskFinishEntryReadiness({ runtime, root, task: 'demo-task', requireCommitMessage: true });
  assert.equal(missing.ready, false);
  assert.ok(missing.gaps.delivery.some((item) => item.code === 'task_finish.commit_message_required'));
});
