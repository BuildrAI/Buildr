import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { continueConvergenceRecoveryReceipt, createConvergenceRecoveryReceipt, inspectConvergenceRecovery } from '../../src/task/openspec/application/convergence-recovery.ts';
import {
  applyDeterministicSyncPlan,
  DETERMINISTIC_SYNC_PLAN_SCHEMA,
  deterministicSyncContentDigest,
  deterministicSyncPlanIdentity,
} from '../../src/task/openspec/application/deterministic-sync.ts';

function fixture(t: any): any  {
  const projectRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-convergence-recovery-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const relative: any = 'openspec/specs/demo/spec.md';
  const file: any = path.join(projectRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before: any = '# demo\n\n### Requirement: One\nBefore.\n\n#### Scenario: A\n- **WHEN** a\n- **THEN** a\n';
  const expected: any = before.replace('Before.', 'After.');
  fs.writeFileSync(file, expected);
  const syncPlan: any = {
    schemaVersion: DETERMINISTIC_SYNC_PLAN_SCHEMA,
    change: 'demo-change', project: 'product', deltaHash: 'sha256-old', status: 'safe', blocked: [],
    operations: [{ capability: 'demo', type: 'MODIFIED', requirement: 'One', status: 'safe', reason: 'unique-structural-result' }],
    files: [{ path: relative, beforeDigest: deterministicSyncContentDigest(before), expectedDigest: deterministicSyncContentDigest(expected), before, expected }],
  };
  syncPlan.identity = deterministicSyncPlanIdentity(syncPlan);
  const baseline: any = { schemaVersion: 'buildr.openspec-contract-baseline/v1', change: 'demo-change', project: 'product', upstreamVersion: '1.6.0', deltaHash: 'sha256-old', adopted: false, targets: [] };
  const executableIdentity: any = { sourceKind: 'external-declared', reference: 'external:openspec', version: '1.6.0', sha256: 'binary-1' };
  const receipt: any = {
    schemaVersion: 'buildr.openspec-convergence-receipt/v2', change: 'demo-change', project: 'product', deltaHash: 'sha256-old', stage: 'post-sync', openspecExecutableIdentity: executableIdentity,
    transitions: [{ stage: 'sync-plan', planIdentity: syncPlan.identity }, { stage: 'sync-apply', planIdentity: syncPlan.identity }, { stage: 'post-sync' }],
  };
  return { projectRoot, file, before, expected, syncPlan, baseline, executableIdentity, receipt };
}

function inspect(state: any): any  {
  return inspectConvergenceRecovery({
    projectRoot: state.projectRoot,
    change: 'demo-change',
    project: 'product',
    newDeltaHash: 'sha256-new',
    receipt: state.receipt,
    baseline: state.baseline,
    syncPlan: state.syncPlan,
    executableIdentity: state.executableIdentity,
  });
}

test('post-sync精确匹配时生成身份绑定的反向恢复计划', (t: any) => {
  const state: any = fixture(t);
  const result: any = inspect(state);
  assert.equal(result.status, 'recoverable-stale-receipt');
  assert.equal(result.canonicalState, 'post-sync');
  assert.match(result.identity, /^sha256-/);
  assert.equal(result.reversePlan.files[0].expected, state.before);
  assert.deepEqual(result.effects, ['canonical-spec-restore', 'contract-baseline-rebind']);
  const receipt: any = createConvergenceRecoveryReceipt(result);
  assert.equal(receipt.stage, 'planned');
  assert.equal(receipt.oldPlanIdentity, state.syncPlan.identity);
});

test('反向恢复复用确定性同步的严格验证和原子替换', (t: any) => {
  const state: any = fixture(t);
  const result: any = inspect(state);
  const applied: any = applyDeterministicSyncPlan({
    projectRoot: state.projectRoot,
    plan: result.reversePlan,
    validateExpected: ({ files }: any) => ({ status: 'passed', expectedDigests: Object.fromEntries(files.map((item: any) => [item.path, item.digest])) }),
  });
  assert.equal(applied.status, 'passed');
  assert.equal(fs.readFileSync(state.file, 'utf8'), state.before);
  const resumed: any = inspect(state);
  assert.equal(resumed.status, 'recoverable-stale-receipt');
  assert.equal(resumed.canonicalState, 'pre-sync');
  assert.equal(resumed.identity, result.identity);
  assert.deepEqual(resumed.effects, ['contract-baseline-rebind']);
});

test('canonical额外漂移需要语义处理且零写入', (t: any) => {
  const state: any = fixture(t);
  fs.writeFileSync(state.file, state.expected.replace('After.', 'External drift.'));
  const result: any = inspect(state);
  assert.equal(result.status, 'semantic-resolution-required');
  assert.equal(result.code, 'convergence-recovery-canonical-drift');
  assert.deepEqual(result.effects, []);
  assert.match(fs.readFileSync(state.file, 'utf8'), /External drift/);
});

test('缺少旧计划或证明链不匹配时明确不可恢复', (t: any) => {
  const state: any = fixture(t);
  const missing: any = inspectConvergenceRecovery({
    projectRoot: state.projectRoot, change: 'demo-change', project: 'product', newDeltaHash: 'sha256-new',
    receipt: state.receipt, baseline: state.baseline, syncPlan: null, executableIdentity: state.executableIdentity,
  });
  assert.equal(missing.status, 'recovery-unprovable');
  assert.deepEqual(missing.missingEvidence, ['deterministic-sync-plan']);
  const mismatch: any = inspectConvergenceRecovery({
    projectRoot: state.projectRoot, change: 'demo-change', project: 'product', newDeltaHash: 'sha256-new',
    receipt: state.receipt, baseline: { ...state.baseline, deltaHash: 'sha256-other' }, syncPlan: state.syncPlan, executableIdentity: state.executableIdentity,
  });
  assert.equal(mismatch.status, 'recovery-unprovable');
  assert.equal(mismatch.code, 'convergence-recovery-chain-mismatch');
});

test('连续delta修订轮换已完成凭证并保留历史链', (t: any) => {
  const firstPlan: any = inspect(fixture(t));
  const first: any = createConvergenceRecoveryReceipt(firstPlan, 'completed', [{ stage: 'completed' }]);
  const secondPlan: any = { ...firstPlan, identity: 'sha256-second', oldDeltaHash: firstPlan.newDeltaHash, newDeltaHash: 'sha256-third' };
  const rotated: any = continueConvergenceRecoveryReceipt(secondPlan, first);
  assert.equal(rotated.status, 'ready');
  assert.equal(rotated.disposition, 'rotated');
  assert.equal(rotated.receipt.stage, 'planned');
  assert.equal(rotated.receipt.history.length, 1);
  assert.equal(rotated.receipt.history[0].identity, first.identity);
  assert.equal(rotated.receipt.history[0].newDeltaHash, secondPlan.oldDeltaHash);
  assert.equal(continueConvergenceRecoveryReceipt(secondPlan, rotated.receipt).disposition, 'resumed');

  const unrelated: any = continueConvergenceRecoveryReceipt({ ...secondPlan, oldDeltaHash: 'sha256-unrelated' }, first);
  assert.equal(unrelated.status, 'recovery-unprovable');
  assert.equal(unrelated.code, 'convergence-recovery-receipt-mismatch');
});
