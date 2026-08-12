import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createBuiltinReplacement } from '../../src/application/package-maintenance/builtin-replacement.mjs';

const targetRoot = '/workspace';
const predecessorTarget = 'skills/buildr/git-ops';

function runReplacement(options = {}) {
  const calls = [];
  const changed = [];
  const findings = [];
  const restoreOutcomes = [];
  const skillsManifest = [];
  const predecessor = options.predecessor === null ? null : {
    id: 'git-ops', source: 'buildr', path: 'buildr/git-ops', runtimePath: 'git-ops',
    enabled: true, state: 'installed', ...options.predecessor,
  };
  const predecessorRecord = predecessor ? { index: 0, skill: predecessor } : null;
  if (predecessorRecord) skillsManifest.push(predecessor);
  const predecessorSnapshot = options.predecessorSnapshot === null ? null : {
    integrity: 'sha256:legacy', ...options.predecessorSnapshot,
  };
  const receipt = options.receipt === null ? null : {
    target: predecessorTarget, integrity: predecessorSnapshot?.integrity || 'sha256:legacy', ...options.receipt,
  };
  const receiptByKey = new Map(receipt ? [['skill:git-ops', receipt]] : []);
  const builtin = {
    id: 'git-operations', type: 'skill', required: false,
    target: 'skills/buildr/git-operations', runtimePath: 'git-operations',
    replaces: { id: 'git-ops', target: predecessorTarget, runtimePath: 'git-ops' },
    legacyIntegrities: options.legacyIntegrities || [],
  };
  const desired = { id: 'git-operations', source: 'buildr', path: 'buildr/git-operations', enabled: true, state: 'installed' };
  const { handleSkillReplacement } = createBuiltinReplacement({
    builtinReceiptKey: (type, id) => `${type}:${id}`,
    builtinSnapshot: (directory) => directory === path.join(targetRoot, predecessorTarget) ? predecessorSnapshot : null,
    copyDirectoryIfChanged: () => { calls.push('copy'); return options.copyChanged !== false; },
    existsDirectory: () => options.predecessorDirectoryExists !== false,
    path,
  });
  const handled = handleSkillReplacement({
    builtin, changed, checkOnly: options.checkOnly ?? true, desired,
    existing: options.existing || null, findings, isRestore: options.isRestore || false,
    liveSnapshot: options.liveSnapshot || null, newSnapshot: { integrity: 'sha256:new' }, receiptByKey,
    removeDirectory: () => calls.push('remove-directory'),
    removeReceipt: () => calls.push('remove-receipt'),
    skillsById: new Map(predecessorRecord ? [['git-ops', predecessorRecord]] : []),
    skillsManifest, sourceDir: '/package/git-operations', targetDir: '/workspace/skills/buildr/git-operations',
    restoreOutcomes, updateReceipt: () => calls.push('update-receipt'), targetRoot,
  });
  return { calls, changed, findings, handled, restoreOutcomes, skillsManifest };
}

test('builtin replacement 状态分类矩阵保持 findings 与零副作用', async (t) => {
  const cases = [
    { name: 'manifest predecessor missing but files remain', options: { predecessor: null }, status: 'modified', reason: /without a matching Buildr manifest entry/ },
    { name: 'foreign manifest source', options: { predecessor: { source: 'external' } }, status: 'modified', reason: /not Buildr-managed/ },
    { name: 'manifest target mismatch', options: { predecessor: { path: 'buildr/other' } }, status: 'modified', reason: /manifest paths do not match/ },
    { name: 'manifest runtime path mismatch', options: { predecessor: { runtimePath: 'other' } }, status: 'modified', reason: /manifest paths do not match/ },
    { name: 'replacement target occupied', options: { liveSnapshot: { integrity: 'sha256:occupied' } }, status: 'modified', reason: /target already exists/ },
    { name: 'uninstalled predecessor still has files', options: { predecessor: { state: 'uninstalled', enabled: false } }, status: 'modified', reason: /still has live files/ },
    { name: 'uninstalled predecessor without files', options: { predecessor: { state: 'uninstalled', enabled: false }, predecessorSnapshot: null, receipt: null }, status: 'uninstalled', reason: null },
    { name: 'installed predecessor source missing', options: { predecessorSnapshot: null, receipt: null }, status: 'missing', reason: /source is missing/ },
    { name: 'receipt recognizes official predecessor', options: {}, status: 'installed', reason: null },
    { name: 'legacy integrity recognizes official predecessor', options: { receipt: null, legacyIntegrities: ['sha256:legacy'] }, status: 'installed', reason: null },
    { name: 'unknown integrity needs a decision', options: { receipt: null }, status: 'modified', reason: /not a recognized official version/ },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const result = runReplacement(scenario.options);
      assert.equal(result.handled, true);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].status, scenario.status);
      if (scenario.reason) assert.match(result.findings[0].reason, scenario.reason);
      else assert.equal(result.findings[0].reason, null);
      assert.deepEqual(result.calls, []);
      assert.deepEqual(result.changed, []);
      assert.deepEqual(result.restoreOutcomes, []);
    });
  }
});

test('builtin restore 分类矩阵区分 ready、blocked 与 explicit override', async (t) => {
  const cases = [
    { name: 'recognized predecessor is ready', options: {}, status: 'installed', outcome: 'ready', reason: null },
    { name: 'unknown integrity is explicitly accepted', options: { receipt: null }, status: 'installed', outcome: 'ready', reason: /accepted by explicit builtin restore/ },
    { name: 'uninstalled predecessor with files is restorable', options: { predecessor: { state: 'uninstalled', enabled: false } }, status: 'installed', outcome: 'ready', reason: null },
    { name: 'uninstalled predecessor without files is blocked', options: { predecessor: { state: 'uninstalled', enabled: false }, predecessorSnapshot: null, receipt: null }, status: 'missing', outcome: 'blocked', reason: null },
    { name: 'foreign predecessor remains blocked', options: { predecessor: { source: 'external' } }, status: 'modified', outcome: 'blocked', reason: /not Buildr-managed/ },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const result = runReplacement({ ...scenario.options, isRestore: true });
      assert.equal(result.findings[0].status, scenario.status);
      assert.equal(result.restoreOutcomes[0].status, scenario.outcome);
      if (scenario.reason) assert.match(result.findings[0].reason, scenario.reason);
      assert.deepEqual(result.calls, []);
      assert.deepEqual(result.changed, []);
    });
  }
});

test('builtin replacement mutation callbacks 只在可执行状态发生', async (t) => {
  await t.test('installed predecessor is atomically replaced', () => {
    const result = runReplacement({ checkOnly: false, isRestore: true, receipt: null });
    assert.deepEqual(result.calls, ['remove-receipt', 'remove-directory', 'copy', 'update-receipt']);
    assert.deepEqual(result.changed, [predecessorTarget, 'skills/buildr/git-operations']);
    assert.equal(result.skillsManifest[0].id, 'git-operations');
    assert.equal(result.restoreOutcomes[0].status, 'restored');
  });
  await t.test('uninstalled predecessor migrates metadata without installing files', () => {
    const result = runReplacement({
      checkOnly: false, predecessor: { state: 'uninstalled', enabled: false, reason: 'user choice' },
      predecessorSnapshot: null, receipt: null,
    });
    assert.deepEqual(result.calls, ['remove-receipt']);
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.skillsManifest[0], {
      id: 'git-operations', source: 'buildr', path: 'buildr/git-operations', enabled: false, state: 'uninstalled', reason: 'user choice',
    });
  });
  await t.test('blocked classification never mutates', () => {
    const result = runReplacement({ checkOnly: false, receipt: null });
    assert.equal(result.findings[0].status, 'modified');
    assert.deepEqual(result.calls, []);
    assert.deepEqual(result.changed, []);
  });
  await t.test('current and predecessor identities conflict without mutation', () => {
    const result = runReplacement({ checkOnly: false, isRestore: true, existing: { id: 'git-operations' } });
    assert.equal(result.findings[0].status, 'modified');
    assert.equal(result.restoreOutcomes[0].status, 'blocked');
    assert.deepEqual(result.calls, []);
  });
  await t.test('current identity without predecessor is not a replacement', () => {
    const result = runReplacement({ predecessor: null, predecessorSnapshot: null, receipt: null, existing: { id: 'git-operations' } });
    assert.equal(result.handled, false);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.calls, []);
  });
});
