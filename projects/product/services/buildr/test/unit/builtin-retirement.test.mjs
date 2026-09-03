import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { retireOrphanedBuiltinSkills } from '../../src/agent-assets/application/package-maintenance/builtin-retirement.ts';

function run(options = {}) {
  const targetRoot = '/workspace';
  const receipt = { type: 'skill', id: 'retired-board', target: 'skills/buildr/retired-board', integrity: 'sha256-owned' };
  const receipts = { builtins: [receipt] };
  const receiptByKey = new Map([['skill:retired-board', receipt]]);
  const skillsManifest = options.manifest === null ? [] : [{ id: 'retired-board', source: 'buildr', path: 'buildr/retired-board', enabled: true, state: 'installed', ...options.manifest }];
  const changed = [];
  const findings = [];
  const calls = [];
  retireOrphanedBuiltinSkills({
    manifest: { builtins: { skills: [] } }, receipts, receiptByKey, skillsManifest, targetRoot,
    builtinReceiptKey: (type, id) => `${type}:${id}`,
    builtinSnapshot: () => options.live === null ? null : { integrity: options.live || 'sha256-owned' },
    existsDirectory: () => options.live !== null,
    path, removeDirectory: () => calls.push('remove-directory'),
    removeReceipt: () => calls.push('remove-receipt'), changed, findings,
    checkOnly: options.checkOnly ?? false,
  });
  return { calls, changed, findings, skillsManifest };
}

test('receipt-owned orphan builtin Skill is removed from files, manifest, and receipt', () => {
  const result = run();
  assert.deepEqual(result.calls, ['remove-directory', 'remove-receipt']);
  assert.deepEqual(result.changed, ['skills/buildr/retired-board']);
  assert.deepEqual(result.skillsManifest, []);
  assert.equal(result.findings[0].status, 'retired');
});

test('orphan retirement preflight is read-only and declares convergence', () => {
  const result = run({ checkOnly: true });
  assert.deepEqual(result.calls, []);
  assert.equal(result.findings[0].status, 'retired');
  assert.equal(result.findings[0].converge, true);
});

test('modified or foreign orphan builtin is preserved and reported', async (t) => {
  for (const options of [{ live: 'sha256-user-edit' }, { manifest: { source: 'external' } }, { manifest: null }]) {
    await t.test(JSON.stringify(options), () => {
      const result = run(options);
      assert.deepEqual(result.calls, []);
      assert.equal(result.skillsManifest.length, options.manifest === null ? 0 : 1);
      assert.equal(result.findings[0].status, 'modified');
    });
  }
});

test('already absent receipt-owned files still retire stale manifest metadata', () => {
  const result = run({ live: null });
  assert.deepEqual(result.calls, ['remove-receipt']);
  assert.deepEqual(result.skillsManifest, []);
  assert.equal(result.findings[0].status, 'retired');
});

test('receipt-only orphan retires without removing an unrelated manifest entry', () => {
  const targetRoot = '/workspace';
  const receipt = { type: 'skill', id: 'retired-board', target: 'skills/buildr/retired-board', integrity: 'sha256-owned' };
  const skillsManifest = [{ id: 'unrelated', source: 'buildr', path: 'buildr/unrelated' }];
  const findings = [];
  const calls = [];
  retireOrphanedBuiltinSkills({
    manifest: { builtins: { skills: [] } }, receipts: { builtins: [receipt] },
    receiptByKey: new Map([['skill:retired-board', receipt]]), skillsManifest, targetRoot,
    builtinReceiptKey: (type, id) => `${type}:${id}`, builtinSnapshot: () => null,
    existsDirectory: () => false, path, removeDirectory: () => calls.push('remove-directory'),
    removeReceipt: () => calls.push('remove-receipt'), changed: [], findings, checkOnly: false,
  });
  assert.deepEqual(calls, ['remove-receipt']);
  assert.deepEqual(skillsManifest, [{ id: 'unrelated', source: 'buildr', path: 'buildr/unrelated' }]);
  assert.equal(findings[0].status, 'retired');
});

test('receipt referenced by a current replacement is left to replacement handling', () => {
  const targetRoot = '/workspace';
  const receipt = { type: 'skill', id: 'legacy', target: 'skills/buildr/legacy', integrity: 'sha256-owned' };
  const findings = [];
  retireOrphanedBuiltinSkills({
    manifest: { builtins: { skills: [{ id: 'current', replaces: { id: 'legacy' } }] } },
    receipts: { builtins: [receipt] }, receiptByKey: new Map([['skill:legacy', receipt]]),
    skillsManifest: [], targetRoot, builtinReceiptKey: (type, id) => `${type}:${id}`,
    builtinSnapshot: () => null, existsDirectory: () => false, path, removeDirectory() {},
    removeReceipt() {}, changed: [], findings, checkOnly: false,
  });
  assert.deepEqual(findings, []);
});
