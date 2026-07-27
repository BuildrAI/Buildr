import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyCanonicalPlan } from '../../src/application/openspec/canonical-applier.mjs';
import { createConvergencePlan } from '../../src/application/openspec/convergence-planner.mjs';
import { observeConvergence } from '../../src/application/openspec/convergence-observer.mjs';
import { createConvergenceReceipt, portableExecutableIdentity } from '../../src/application/openspec/convergence-model.mjs';
import { convergenceReceiptPath, runOpenSpecConvergence } from '../../src/application/openspec/openspec-converge.mjs';
import { createDeterministicSyncPlan } from '../../src/application/openspec/deterministic-sync.mjs';

const requirement = (title, body = '系统 MUST 保持行为。', scenario = '正常') => `### Requirement: ${title}\n${body}\n\n#### Scenario: ${scenario}\n- **WHEN** 输入有效\n- **THEN** 系统 MUST 成功\n`;
const canonical = (...requirements) => `# demo Specification\n\n## Purpose\n\n用于确定性收敛事务测试的完整示例能力说明，长度足以满足新能力 Purpose 权威约束。\n\n## Requirements\n\n${requirements.join('\n')}`;
const executableIdentity = { sourceKind: 'external-declared', reference: 'external:openspec', version: '1.6.0', sha256: 'fixture-executable' };

function delta(operations, hash = 'sha256-delta') {
  return { hash, operations, capabilities: new Map([['demo', { operations }]]) };
}

function planFor(content, operations, options = {}) {
  return createConvergencePlan({
    change: options.change || 'change-a', project: 'product', delta: delta(operations, options.hash), executableIdentity,
    canonicalFiles: new Map([['demo', { path: 'openspec/specs/demo/spec.md', exists: true, content }]]),
    capabilityPurposes: new Map(), activeConflicts: options.activeConflicts || [],
  });
}

test('planner相同输入产生相同identity且不依赖baseline', () => {
  const before = canonical(requirement('Existing'));
  const operations = [{ type: 'ADDED', capability: 'demo', title: 'Added', requirement: requirement('Added') }];
  const first = planFor(before, operations);
  const second = planFor(before, operations);
  assert.equal(first.status, 'safe');
  assert.equal(first.convergenceIdentity, second.convergenceIdentity);
  assert.equal(first.planIdentity, second.planIdentity);
  assert.equal(first.files[0].expectedContent.includes('Requirement: Added'), true);
  assert.equal('baseline' in first, false);
});

test('planner聚合语义冲突并拒绝可执行写入', () => {
  const before = canonical(requirement('Existing'));
  const operations = [{ type: 'MODIFIED', capability: 'demo', title: 'Missing', requirement: requirement('Missing') }];
  const plan = planFor(before, operations, { activeConflicts: [{ code: 'active-change-conflict', change: 'other' }] });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.blocked.some((item) => item.code === 'requirement-not-unique'), true);
  assert.equal(plan.blocked.some((item) => item.code === 'active-change-conflict'), true);
});

test('observer只按before expected实际digest判断恢复状态', () => {
  const before = canonical(requirement('Existing'));
  const plan = planFor(before, [{ type: 'ADDED', capability: 'demo', title: 'Added', requirement: requirement('Added') }]);
  const receipt = createConvergenceReceipt({ plan, executableIdentity });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-observer-'));
  try {
    const file = path.join(root, receipt.files[0].path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, receipt.files[0].beforeContent);
    assert.equal(observeConvergence({ projectRoot: root, receipt, io: fs }).disposition, 'planned-not-applied');
    fs.writeFileSync(file, receipt.files[0].expectedContent);
    assert.equal(observeConvergence({ projectRoot: root, receipt, io: fs }).disposition, 'applied-and-matched');
    fs.writeFileSync(file, `${receipt.files[0].expectedContent}\nunknown\n`);
    assert.equal(observeConvergence({ projectRoot: root, receipt, io: fs }).disposition, 'state-unknown');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('observer遇到多文件before expected混合状态时fail closed', () => {
  const operations = [
    { type: 'ADDED', capability: 'demo', title: 'Added', requirement: requirement('Added') },
    { type: 'ADDED', capability: 'other', title: 'Other Added', requirement: requirement('Other Added') },
  ];
  const plan = createConvergencePlan({
    change: 'change-a', project: 'product', executableIdentity,
    delta: { hash: 'sha256-two-files', operations, capabilities: new Map([['demo', {}], ['other', {}]]) },
    canonicalFiles: new Map([
      ['demo', { path: 'openspec/specs/demo/spec.md', exists: true, content: canonical(requirement('Existing')) }],
      ['other', { path: 'openspec/specs/other/spec.md', exists: true, content: canonical(requirement('Other Existing')) }],
    ]),
    capabilityPurposes: new Map(), activeConflicts: [],
  });
  const receipt = createConvergenceReceipt({ plan, executableIdentity });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-observer-mixed-'));
  try {
    receipt.files.forEach((item, index) => {
      const file = path.join(root, item.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, index === 0 ? item.beforeContent : item.expectedContent);
    });
    assert.equal(observeConvergence({ projectRoot: root, receipt, io: fs }).disposition, 'state-unknown');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('canonical applier在before漂移时整批零写入', () => {
  const before = canonical(requirement('Existing'));
  const plan = planFor(before, [{ type: 'ADDED', capability: 'demo', title: 'Added', requirement: requirement('Added') }]);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-applier-'));
  try {
    const file = path.join(root, plan.files[0].path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${before}\nconcurrent\n`);
    const applied = applyCanonicalPlan({ projectRoot: root, plan, currentDeltaDigest: plan.deltaDigest, currentExecutableIdentity: executableIdentity, io: fs });
    assert.equal(applied.status, 'input-changed');
    assert.equal(fs.readFileSync(file, 'utf8').endsWith('concurrent\n'), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function journey(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-converge-journey-'));
  const changeRoot = path.join(root, 'openspec', 'changes', 'change-a');
  const file = path.join(root, 'openspec', 'specs', 'demo', 'spec.md');
  fs.mkdirSync(changeRoot, { recursive: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canonical(requirement('Existing')));
  const operations = [{ type: 'ADDED', capability: 'demo', title: 'Added', requirement: requirement('Added') }];
  const context = { change: 'change-a', project: 'product', projectRoot: root, changeRoot, archived: false, delta: delta(operations, options.hash) };
  let archiveCalls = 0;
  let currentExecutableIdentity = executableIdentity;
  const archivedRoot = path.join(root, 'openspec', 'changes', 'archive', '2026-07-27-change-a');
  const run = () => runOpenSpecConvergence({
    context,
    executable: '/fixture/openspec', executableIdentity: currentExecutableIdentity,
    capabilityPurposes: new Map(), activeConflicts: options.activeConflicts || [],
    validateProjected: options.validateProjected || (() => ({ status: 'passed', durationMs: 1, commandCount: 1 })),
    validateActual: options.validateActual || (() => ({ status: 'passed', durationMs: 1, commandCount: 1 })),
    archive: () => {
      archiveCalls += 1;
      if (options.archiveFailsOnce && archiveCalls === 1) return { status: 'blocked', code: 'archive-failed', durationMs: 1, commandCount: 1 };
      fs.mkdirSync(path.dirname(archivedRoot), { recursive: true });
      fs.renameSync(changeRoot, archivedRoot);
      context.changeRoot = archivedRoot; context.archived = true;
      return { status: 'passed', durationMs: 1, commandCount: 1 };
    },
    resolveArchivedChangeRoot: () => archivedRoot,
    writeReceipt: (target, value) => { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); },
    io: fs,
  });
  return {
    root, file, changeRoot, archivedRoot, context, run, archiveCalls: () => archiveCalls,
    setExecutableIdentity: (value) => { currentExecutableIdentity = value; },
  };
}

test('完整journey正常应用归档并重复执行幂等', () => {
  const fixture = journey();
  try {
    const first = fixture.run();
    assert.equal(first.status, 'passed');
    assert.equal(first.disposition, 'archived');
    assert.equal(fs.readFileSync(fixture.file, 'utf8').includes('Requirement: Added'), true);
    const second = fixture.run();
    assert.equal(second.status, 'passed');
    assert.equal(second.disposition, 'archived');
    assert.equal(fixture.archiveCalls(), 1);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('projected strict失败时canonical零写入', () => {
  const fixture = journey({ validateProjected: () => ({ status: 'blocked', code: 'projected-strict-validation-failed', durationMs: 1, commandCount: 1 }) });
  try {
    const before = fs.readFileSync(fixture.file, 'utf8');
    const result = fixture.run();
    assert.equal(result.status, 'blocked');
    assert.equal(fs.readFileSync(fixture.file, 'utf8'), before);
    assert.equal(fs.existsSync(convergenceReceiptPath(fixture.changeRoot)), false);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('apply完成receipt仍planned时按actual expected继续确认', () => {
  const fixture = journey({ archiveFailsOnce: true });
  try {
    const first = fixture.run();
    assert.equal(first.status, 'blocked');
    const receiptFile = convergenceReceiptPath(fixture.changeRoot);
    const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    receipt.disposition = 'planned-not-applied';
    fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
    const second = fixture.run();
    assert.equal(second.status, 'passed');
    assert.equal(second.execution.some((item) => item.id === 'apply'), false);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('archive失败后只重试确认与archive', () => {
  const fixture = journey({ archiveFailsOnce: true });
  try {
    assert.equal(fixture.run().status, 'blocked');
    const second = fixture.run();
    assert.equal(second.status, 'passed');
    assert.equal(second.execution.some((item) => item.id === 'plan' || item.id === 'apply' || item.id === 'projected-validation'), false);
    assert.equal(fixture.archiveCalls(), 2);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('delta在收尾期间变化时丢弃旧计划并以当前canonical重新规划', () => {
  const fixture = journey({ archiveFailsOnce: true });
  try {
    assert.equal(fixture.run().status, 'blocked');
    const nextOperations = [{ type: 'ADDED', capability: 'demo', title: 'Added Again', requirement: requirement('Added Again') }];
    fixture.context.delta = delta(nextOperations, 'sha256-delta-next');
    const result = fixture.run();
    assert.equal(result.status, 'passed');
    assert.equal(result.execution.some((item) => item.id === 'plan'), true);
    const content = fs.readFileSync(fixture.file, 'utf8');
    assert.equal(content.includes('Requirement: Added'), true);
    assert.equal(content.includes('Requirement: Added Again'), true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('executable identity变化时旧验证不复用并重新规划验证', () => {
  const fixture = journey({ archiveFailsOnce: true });
  try {
    assert.equal(fixture.run().status, 'blocked');
    fixture.setExecutableIdentity({ ...executableIdentity, sha256: 'fixture-executable-next' });
    const result = fixture.run();
    assert.equal(result.status, 'passed');
    assert.equal(result.execution.some((item) => item.id === 'plan'), true);
    assert.equal(result.execution.some((item) => item.id === 'projected-validation'), true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('旧convergence receipt缺少plan时返回recovery-unprovable且不写canonical', () => {
  const fixture = journey();
  try {
    const before = fs.readFileSync(fixture.file, 'utf8');
    const legacyFile = path.join(fixture.changeRoot, '.buildr', 'deterministic-convergence.json');
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    fs.writeFileSync(legacyFile, JSON.stringify({ schemaVersion: 'buildr.openspec-convergence-receipt/v2' }));
    const result = fixture.run();
    assert.equal(result.status, 'recovery-unprovable');
    assert.equal(result.code, 'legacy-plan-missing');
    assert.equal(fs.readFileSync(fixture.file, 'utf8'), before);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('完整旧plan与post-sync receipt按真实expected迁移且不恢复canonical', () => {
  const fixture = journey();
  try {
    const oldPlan = createDeterministicSyncPlan({
      change: fixture.context.change, project: fixture.context.project, projectRoot: fixture.root,
      delta: fixture.context.delta, baseline: { targets: [] }, capabilityPurposes: new Map(),
    });
    fs.writeFileSync(fixture.file, oldPlan.files[0].expected);
    const buildrRoot = path.join(fixture.changeRoot, '.buildr');
    fs.mkdirSync(buildrRoot, { recursive: true });
    fs.writeFileSync(path.join(buildrRoot, 'deterministic-sync-plan.json'), `${JSON.stringify(oldPlan, null, 2)}\n`);
    fs.writeFileSync(path.join(buildrRoot, 'deterministic-convergence.json'), `${JSON.stringify({
      schemaVersion: 'buildr.openspec-convergence-receipt/v2',
      change: fixture.context.change,
      project: fixture.context.project,
      deltaHash: fixture.context.delta.hash,
      stage: 'post-sync',
      planIdentity: oldPlan.identity,
      openspecExecutableIdentity: executableIdentity,
    }, null, 2)}\n`);
    const result = fixture.run();
    assert.equal(result.status, 'passed');
    assert.equal(result.execution.some((item) => item.id === 'apply'), false);
    assert.equal(fs.readFileSync(fixture.file, 'utf8'), oldPlan.files[0].expected);
    assert.equal(fs.existsSync(path.join(fixture.archivedRoot, '.buildr', 'convergence-receipt.json')), true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('孤立旧recovery receipt无法证明时fail closed', () => {
  const fixture = journey();
  try {
    const recoveryFile = path.join(fixture.changeRoot, '.buildr', 'convergence-recovery.json');
    fs.mkdirSync(path.dirname(recoveryFile), { recursive: true });
    fs.writeFileSync(recoveryFile, JSON.stringify({ schemaVersion: 'legacy-recovery' }));
    const result = fixture.run();
    assert.equal(result.status, 'recovery-unprovable');
    assert.equal(result.code, 'legacy-recovery-without-convergence');
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('portable executable identity不保存机器绝对路径', () => {
  const identity = portableExecutableIdentity({ projectRoot: '/workspace/project', executable: '/Users/example/bin/openspec', version: '1.6.0', sha256: 'abc' });
  assert.equal(identity.reference, 'external:openspec');
  assert.equal(JSON.stringify(identity).includes('/Users/example'), false);
});
