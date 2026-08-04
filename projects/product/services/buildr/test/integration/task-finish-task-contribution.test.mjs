import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  adoptAgentReviewedGitCarrier,
  createIsolatedGitCarrier,
  observeGitTaskContribution,
  removeIsolatedGitCarrier,
  verifyDeliveredGitTaskContribution,
  verifyGitTaskContributionCarrier,
} from '../../src/application/task-finish/git-task-contribution.mjs';
import { registerGitWorktreeProvider } from '../../src/application/worktree/git-worktree-provider.mjs';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-contribution-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(root, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  fs.writeFileSync(path.join(root, 'shared.txt'), 'baseline\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'baseline']);
  const taskRoot = path.join(root, '.worktrees', 'task');
  git(root, ['worktree', 'add', '-b', 'codex/task', taskRoot, 'dev']);
  git(taskRoot, ['config', 'user.name', 'Buildr Test']);
  git(taskRoot, ['config', 'user.email', 'buildr@example.com']);
  return { root, taskRoot };
}

test('最新 Delivery Baseline 上干净应用时 Task Contribution identity 保持等价', (t) => {
  const { root, taskRoot } = repository(t);
  fs.writeFileSync(path.join(taskRoot, 'feature.txt'), 'candidate contribution\n');
  git(taskRoot, ['add', 'feature.txt']);
  git(taskRoot, ['commit', '-m', 'candidate']);
  fs.writeFileSync(path.join(root, 'baseline-advance.txt'), 'advanced independently\n');
  git(root, ['add', 'baseline-advance.txt']);
  git(root, ['commit', '-m', 'advance baseline']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);

  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });
  const carrier = createIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'clean-reuse', deliveryBaselineHead: baselineHead, taskContribution: contribution, message: 'delivery carrier' });

  assert.equal(carrier.taskContribution.appliedIdentity, contribution.identity);
  assert.equal(carrier.changes.find((change) => change.path === 'feature.txt').afterBlob.length, 40);
  assert.equal(verifyGitTaskContributionCarrier({ repositoryRoot: taskRoot, carrier }).status, 'equivalent');
  assert.equal(git(carrier.root, ['show', 'HEAD:baseline-advance.txt']), 'advanced independently');
  assert.equal(git(carrier.root, ['show', 'HEAD:feature.txt']), 'candidate contribution');
  assert.equal(removeIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'clean-reuse', expectedRoot: carrier.root }).status, 'removed');
});

test('Delivery Baseline 与 Task Contribution 冲突时保留隔离 carrier 供 Agent-reviewed adaptation', (t) => {
  const { root, taskRoot } = repository(t);
  fs.writeFileSync(path.join(taskRoot, 'shared.txt'), 'task meaning\n');
  git(taskRoot, ['add', 'shared.txt']);
  git(taskRoot, ['commit', '-m', 'candidate']);
  fs.writeFileSync(path.join(root, 'shared.txt'), 'baseline meaning\n');
  git(root, ['add', 'shared.txt']);
  git(root, ['commit', '-m', 'conflicting baseline']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });

  const carrier = createIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'conflict', deliveryBaselineHead: baselineHead, taskContribution: contribution, message: 'delivery carrier' });
  assert.equal(carrier.status, 'adaptation-required');
  assert.equal(carrier.conflict.code, 'task-finish.contribution-apply-conflict');
  assert.equal(git(carrier.root, ['status', '--porcelain']), '');
  assert.equal(git(carrier.root, ['show', 'HEAD:shared.txt']), 'baseline meaning');

  fs.writeFileSync(path.join(carrier.root, 'shared.txt'), 'agent-reviewed compatible meaning\n');
  git(carrier.root, ['add', 'shared.txt']);
  git(carrier.root, ['commit', '-m', 'adapt delivery carrier']);
  const adopted = adoptAgentReviewedGitCarrier({ repositoryRoot: taskRoot, carrier });
  assert.equal(adopted.status, 'adopted');
  assert.equal(adopted.changes[0].beforeMode, '100644');
  assert.equal(adopted.changes[0].afterBlob.length, 40);
  const adaptedCarrier = { ...carrier, ...adopted, reuseMode: 'agent-reviewed-delivery-adaptation' };
  const verified = verifyGitTaskContributionCarrier({ repositoryRoot: taskRoot, carrier: adaptedCarrier });
  assert.equal(verified.status, 'equivalent');
  assert.equal(verified.reuseMode, 'agent-reviewed-delivery-adaptation');
  const cleanupProof = verifyDeliveredGitTaskContribution({ taskRoot, targetRef: adaptedCarrier.head, proof: adaptedCarrier });
  assert.equal(cleanupProof.status, 'equivalent');
  assert.equal(cleanupProof.reuseMode, 'agent-reviewed-delivery-adaptation');
  assert.equal(removeIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'conflict', expectedRoot: carrier.root }).status, 'removed');
});

test('Task source 在 proof 后漂移时 cleanup 拒绝贡献复用', (t) => {
  const { root, taskRoot } = repository(t);
  fs.writeFileSync(path.join(taskRoot, 'feature.txt'), 'candidate contribution\n');
  git(taskRoot, ['add', 'feature.txt']);
  git(taskRoot, ['commit', '-m', 'candidate']);
  fs.writeFileSync(path.join(root, 'baseline-advance.txt'), 'advanced independently\n');
  git(root, ['add', 'baseline-advance.txt']);
  git(root, ['commit', '-m', 'advance baseline']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });
  const carrier = createIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'source-drift', deliveryBaselineHead: baselineHead, taskContribution: contribution, message: 'delivery carrier' });
  fs.writeFileSync(path.join(taskRoot, 'feature.txt'), 'drifted contribution\n');

  const result = verifyDeliveredGitTaskContribution({ taskRoot, targetRef: carrier.head, proof: carrier });
  assert.equal(result.status, 'stale');
  assert.equal(result.code, 'git_worktree_contribution_source_drift');
  assert.equal(removeIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'source-drift', expectedRoot: carrier.root }).status, 'removed');
});

test('Git provider 独立复算等价贡献后清理非 ancestor Task worktree', (t) => {
  const { root, taskRoot } = repository(t);
  fs.writeFileSync(path.join(taskRoot, 'feature.txt'), 'candidate contribution\n');
  git(taskRoot, ['add', 'feature.txt']);
  git(taskRoot, ['commit', '-m', 'candidate']);
  const taskHead = git(taskRoot, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(root, 'baseline-advance.txt'), 'advanced independently\n');
  git(root, ['add', 'baseline-advance.txt']);
  git(root, ['commit', '-m', 'advance baseline']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });
  const carrier = createIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'provider-cleanup', deliveryBaselineHead: baselineHead, taskContribution: contribution, message: 'delivery carrier' });
  git(root, ['merge', '--ff-only', carrier.head]);
  assert.notEqual(spawnSync('git', ['merge-base', '--is-ancestor', taskHead, carrier.head], { cwd: root }).status, 0);

  const runtime = registerGitWorktreeProvider({
    assertCanonicalTaskWorkspace: () => root,
    atomicWriteJson: (target, value) => {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
    },
    removePath: (target) => fs.rmSync(target, { force: true }),
  });
  runtime.writeGitWorktreeEvidence(root, {
    schemaVersion: 'buildr.git-worktree-evidence/v1',
    taskId: 'task',
    workspaceRoot: root,
    branch: 'codex/task',
    planDigest: `sha256-${'0'.repeat(64)}`,
    status: 'ready',
    repositories: [{
      selector: 'workspace', entityType: 'workspace', sourcePath: '.', sourceRepository: fs.realpathSync(root),
      checkoutPath: fs.realpathSync(taskRoot), branch: 'codex/task', startPoint: 'dev', head: taskHead,
      clean: true, registered: true, remote: null, remoteUrl: null, state: 'ready', diagnostic: null,
    }],
    effects: [],
    updatedAt: new Date().toISOString(),
  });
  const result = runtime.cleanupGitWorktrees({ workspaceRoot: root, taskId: 'task', integratedRefs: { workspace: 'dev' }, integratedContributions: { workspace: carrier } });

  assert.equal(result.status, 'cleaned', JSON.stringify(result, null, 2));
  assert.equal(fs.existsSync(taskRoot), false);
  assert.notEqual(spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/codex/task'], { cwd: root }).status, 0);
  assert.equal(removeIsolatedGitCarrier({ repositoryRoot: root, workspaceRoot: root, runId: 'provider-cleanup', expectedRoot: carrier.root }).status, 'removed');
});
