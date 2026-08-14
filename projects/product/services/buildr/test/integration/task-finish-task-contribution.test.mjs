import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  adoptAgentReviewedGitCarrier,
  createIsolatedGitCarrier,
  inspectGitCarrierContainment,
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
  const packagedWorkspace = path.join(root, 'package', 'targets', 'workspace', '.buildr', 'workspace.yml');
  fs.mkdirSync(path.dirname(packagedWorkspace), { recursive: true });
  fs.writeFileSync(packagedWorkspace, 'legacy product source\n');
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

test('Task Contribution交付普通嵌套 .buildr 删除并排除OpenSpec Change receipt', (t) => {
  const { root, taskRoot } = repository(t);
  const packagedWorkspace = 'package/targets/workspace/.buildr/workspace.yml';
  fs.rmSync(path.join(taskRoot, packagedWorkspace));
  const changeReceipt = path.join(taskRoot, 'openspec', 'changes', 'demo', '.buildr', 'convergence-receipt.json');
  fs.mkdirSync(path.dirname(changeReceipt), { recursive: true });
  fs.writeFileSync(changeReceipt, '{"status":"control-only"}\n');
  git(taskRoot, ['add', '-A']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);

  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });
  const sourcePaths = git(taskRoot, ['ls-tree', '-r', '--name-only', contribution.source.tree]).split('\n');
  assert.equal(sourcePaths.includes(packagedWorkspace), false);
  assert.equal(sourcePaths.includes('openspec/changes/demo/.buildr/convergence-receipt.json'), false);

  const carrier = createIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'nested-buildr-delete', deliveryBaselineHead: baselineHead, taskContribution: contribution, message: 'delivery carrier' });
  assert.equal(carrier.changedPaths.includes(packagedWorkspace), true);
  assert.equal(fs.existsSync(path.join(carrier.root, packagedWorkspace)), false);
  assert.equal(verifyGitTaskContributionCarrier({ repositoryRoot: taskRoot, carrier }).status, 'equivalent');
  assert.equal(removeIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'nested-buildr-delete', expectedRoot: carrier.root }).status, 'removed');
});

test('未提交 active Change 归档重命名进入 Task source snapshot 且不修改原 index', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-contribution-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(root, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  const active = path.join(root, 'openspec', 'changes', 'archive-me');
  fs.mkdirSync(active, { recursive: true });
  fs.writeFileSync(path.join(active, '.openspec.yaml'), 'schema: spec-driven\n');
  fs.writeFileSync(path.join(active, 'proposal.md'), '# Active change\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'baseline active change']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const taskRoot = path.join(root, '.worktrees', 'archive-task');
  git(root, ['worktree', 'add', '-b', 'codex/archive-task', taskRoot, 'dev']);
  const archived = path.join(taskRoot, 'openspec', 'changes', 'archive', '2026-08-13-archive-me');
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.renameSync(path.join(taskRoot, 'openspec', 'changes', 'archive-me'), archived);
  const indexBefore = git(taskRoot, ['diff', '--cached', '--binary']);
  const statusBefore = git(taskRoot, ['status', '--porcelain=v1', '--untracked-files=all']);

  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });

  const sourcePaths = git(taskRoot, ['ls-tree', '-r', '--name-only', contribution.source.tree]).split('\n');
  assert.equal(sourcePaths.includes('openspec/changes/archive-me/.openspec.yaml'), false);
  assert.equal(sourcePaths.includes('openspec/changes/archive-me/proposal.md'), false);
  assert.equal(sourcePaths.includes('openspec/changes/archive/2026-08-13-archive-me/.openspec.yaml'), true);
  assert.equal(sourcePaths.includes('openspec/changes/archive/2026-08-13-archive-me/proposal.md'), true);
  assert.equal(git(taskRoot, ['diff', '--cached', '--binary']), indexBefore);
  assert.equal(git(taskRoot, ['status', '--porcelain=v1', '--untracked-files=all']), statusBefore);
});

test('新 target 保留 carrier 的逐路径结果时形成 exact containment evidence', (t) => {
  const { root, taskRoot } = repository(t);
  fs.writeFileSync(path.join(taskRoot, 'feature.txt'), 'candidate contribution\n');
  fs.rmSync(path.join(taskRoot, 'shared.txt'));
  git(taskRoot, ['add', '-A']);
  git(taskRoot, ['commit', '-m', 'candidate']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });
  const carrier = createIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'contained', deliveryBaselineHead: baselineHead, taskContribution: contribution, message: 'delivery carrier' });

  git(root, ['merge', '--ff-only', carrier.head]);
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'later target work\n');
  git(root, ['add', 'unrelated.txt']);
  git(root, ['commit', '-m', 'advance target independently']);
  const targetRef = git(root, ['rev-parse', 'HEAD']);
  const contained = inspectGitCarrierContainment({ repositoryRoot: root, targetRef, carrier });
  assert.equal(contained.status, 'contained', JSON.stringify(contained, null, 2));
  assert.equal(contained.checkedPaths.every((entry) => entry.exact), true);
  assert.match(contained.identity, /^sha256-[0-9a-f]{64}$/);

  const nonAncestor = inspectGitCarrierContainment({ repositoryRoot: root, targetRef: git(taskRoot, ['rev-parse', 'HEAD']), carrier });
  assert.equal(nonAncestor.status, 'not-contained');
  assert.equal(nonAncestor.code, 'task-finish.carrier-not-ancestor');
  const unreadable = inspectGitCarrierContainment({ repositoryRoot: root, targetRef: 'refs/heads/does-not-exist', carrier });
  assert.equal(unreadable.status, 'unprovable');
  assert.equal(unreadable.code, 'task-finish.carrier-ancestry-unreadable');

  fs.writeFileSync(path.join(root, 'feature.txt'), 'overwritten after carrier\n');
  git(root, ['add', 'feature.txt']);
  git(root, ['commit', '-m', 'replace carrier result']);
  const rejected = inspectGitCarrierContainment({ repositoryRoot: root, targetRef: 'HEAD', carrier });
  assert.equal(rejected.status, 'not-contained');
  assert.equal(rejected.code, 'task-finish.carrier-path-not-contained');
  assert.equal(removeIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'contained', expectedRoot: carrier.root }).status, 'removed');
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
  git(carrier.root, ['commit', '-m', 'delivery carrier']);
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
  fs.writeFileSync(path.join(carrier.root, 'managed-runtime.txt'), 'post-carrier convergence\n');
  git(carrier.root, ['add', 'managed-runtime.txt']);
  git(carrier.root, ['commit', '-m', 'workspace convergence']);
  const convergenceHead = git(carrier.root, ['rev-parse', 'HEAD']);
  const convergedProof = verifyDeliveredGitTaskContribution({ taskRoot, targetRef: convergenceHead, proof: adaptedCarrier });
  assert.equal(convergedProof.status, 'equivalent');
  assert.equal(convergedProof.reuseMode, 'agent-reviewed-delivery-adaptation');
  assert.equal(removeIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'conflict', expectedRoot: carrier.root }).status, 'removed');
});

test('Agent 显式确认时采用 clean baseline carrier 作为零差异 adaptation', (t) => {
  const { root, taskRoot } = repository(t);
  fs.writeFileSync(path.join(taskRoot, 'shared.txt'), 'task meaning\n');
  git(taskRoot, ['add', 'shared.txt']);
  git(taskRoot, ['commit', '-m', 'candidate']);
  fs.writeFileSync(path.join(root, 'shared.txt'), 'baseline already satisfies task meaning\n');
  git(root, ['add', 'shared.txt']);
  git(root, ['commit', '-m', 'advance target with reviewed meaning']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });
  const carrier = createIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'zero-delta', deliveryBaselineHead: baselineHead, taskContribution: contribution, message: 'delivery carrier' });
  assert.equal(carrier.status, 'adaptation-required');

  const missingConfirmation = adoptAgentReviewedGitCarrier({ repositoryRoot: taskRoot, carrier });
  assert.equal(missingConfirmation.status, 'blocked');
  assert.equal(missingConfirmation.code, 'task-finish.delivery-adaptation-missing');

  const adopted = adoptAgentReviewedGitCarrier({ repositoryRoot: taskRoot, carrier, acceptZeroDelta: true });
  assert.equal(adopted.status, 'adopted');
  assert.equal(adopted.zeroDelta, true);
  assert.equal(adopted.head, baselineHead);
  assert.equal(adopted.tree, carrier.deliveryBaseline.tree);
  assert.deepEqual(adopted.changedPaths, []);
  assert.deepEqual(adopted.changes, []);
  assert.deepEqual(adopted.activationPaths, ['shared.txt']);
  assert.equal(adopted.deliveryCommit, carrier.deliveryCommit);

  const adaptedCarrier = { ...carrier, ...adopted, reuseMode: 'agent-reviewed-delivery-adaptation' };
  const verified = verifyGitTaskContributionCarrier({ repositoryRoot: taskRoot, carrier: adaptedCarrier });
  assert.equal(verified.status, 'equivalent');
  assert.equal(verified.appliedIdentity, adopted.carrierDeltaIdentity);
  const cleanupProof = verifyDeliveredGitTaskContribution({ taskRoot, targetRef: baselineHead, proof: adaptedCarrier });
  assert.equal(cleanupProof.status, 'equivalent');
  assert.equal(cleanupProof.carrierIdentity, adopted.carrierDeltaIdentity);
  assert.equal(removeIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'zero-delta', expectedRoot: carrier.root }).status, 'removed');
});

test('Agent-reviewed adaptation改变冻结message时保持blocked', (t) => {
  const { root, taskRoot } = repository(t);
  fs.writeFileSync(path.join(taskRoot, 'shared.txt'), 'task meaning\n');
  git(taskRoot, ['add', 'shared.txt']);
  git(taskRoot, ['commit', '-m', 'candidate']);
  fs.writeFileSync(path.join(root, 'shared.txt'), 'baseline meaning\n');
  git(root, ['add', 'shared.txt']);
  git(root, ['commit', '-m', 'conflicting baseline']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const contribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: baselineHead });
  const carrier = createIsolatedGitCarrier({ repositoryRoot: taskRoot, workspaceRoot: root, runId: 'message-drift', deliveryBaselineHead: baselineHead, taskContribution: contribution, message: 'fix(carrier): preserve semantics' });
  assert.equal(carrier.status, 'adaptation-required');

  fs.writeFileSync(path.join(carrier.root, 'shared.txt'), 'agent-reviewed compatible meaning\n');
  git(carrier.root, ['add', 'shared.txt']);
  git(carrier.root, ['commit', '-m', 'wrong subject']);
  const adopted = adoptAgentReviewedGitCarrier({ repositoryRoot: taskRoot, carrier });
  assert.equal(adopted.status, 'blocked');
  assert.equal(adopted.code, 'task-finish.commit-message-mismatch');
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
