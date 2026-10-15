import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context } from '@deepseek-ai/cordis';
import {
  applyPresetChanges, PRESET_PRODUCERS, PresetAdapterError, rawConfigDigest,
  rollbackPresetChanges, snapshotPresetOwners,
} from '../../tools/capture-preset-adapter.ts';
import type { PresetChangePlan } from '../../tools/capture-preset-adapter.ts';
type Raw = Record<string, any>;
function fixture() {
  const cfg: Raw = { id: 'standard', name: 'Standard', persona: { greeting: 'keep me' }, permissions: { read: true },
    plugins: [
      { name: PRESET_PRODUCERS[0], config: { agents: { __jsExpr: 'agentPresets.current' } }, disabled: { __jsExpr: '!process.env.HOME' }, inject: ['agent'] },
      { id: 'group-id', name: 'cordis:group', group: true, isolate: { skill: 'preset-realm' }, config: [
        { name: PRESET_PRODUCERS[1], config: { roots: ['/workspace'] }, inject: { skill: { required: true } } },
        { name: 'cordis:group', group: true, config: [
          { name: PRESET_PRODUCERS[2], config: { namespace: 'skills' } },
          { name: PRESET_PRODUCERS[3], config: { readOnly: true } },
        ] },
      ] },
      { name: PRESET_PRODUCERS[4], disabled: false, config: { shell: '/bin/zsh' } },
      { name: '@deepseek-ai/dsh-tool-unrelated', config: { value: 'keep me' } },
    ] };
  const entry = { id: 'include:preset-standard', options: { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: cfg },
    ctx: { baseUrl: 'file:///official/composition/' }, fiber: { state: 2 } };
  let entries = [entry], edits = 0, broken = false;
  let onEdit: ((count: number) => void) | undefined;
  let beforeChange: (() => void) | undefined;
  let onResolve: (() => void) | undefined;
  let modifyInventory: ((rows: Raw[]) => Raw[]) | undefined;
  function leafRows(list: Raw[]): Raw[] { return list.flatMap(row => row.group === true ? leafRows(row.config) : [row]); }
  const fake = {
    configEditor: { entries: () => entries, edit: async (target: unknown, change: (current: Raw, inherited: Raw) => Raw) => {
      assert.equal(target, entry); beforeChange?.();
      const next = change(structuredClone(entry.options.config), {});
      entry.options.config = structuredClone(next); edits++; onEdit?.(edits);
    } },
    agentPresets: {
      resolve: async (id: string) => { onResolve?.(); return { id, ...(broken ? { broken: 'test child activation failure' } : {}) }; },
      compositionInventory: async () => [{ id: 'standard', rows: modifyInventory?.(leafRows(entry.options.config.plugins).map(row => ({
        moduleName: row.name, enabled: row.disabled === true ? false : true, fiberState: 2,
      }))) ?? leafRows(entry.options.config.plugins).map(row => ({ moduleName: row.name, enabled: row.disabled === true ? false : true, fiberState: 2 })) }],
    },
  };
  const ctx = fake as unknown as Context;
  function plan(): PresetChangePlan {
    const snapshot = snapshotPresetOwners(ctx); assert.equal(snapshot.refused.length, 0);
    const owner = snapshot.owners[0]!;
    return { presetId: owner.presetId, ownerEntryId: owner.ownerEntryId, optionsId: owner.optionsId,
      module: owner.module, baseURL: owner.baseURL, fullRawConfigDigest: owner.fullRawConfigDigest,
      changes: owner.selected.map((row, index) => ({ path: row.path, beforeName: row.name, beforeRowDigest: row.rawRowDigest,
        afterURL: `file:///task-owned/graph/producer-${index}.js`, afterFileSha256: 'd'.repeat(64) })) };
  }
  return { ctx, entry, plan, get edits() { return edits; }, raw: () => entry.options.config,
    setEntries: (next: typeof entries) => { entries = next; },
    beforeChange: (hook?: () => void) => { beforeChange = hook; },
    afterEdit: (hook?: (count: number) => void) => { onEdit = hook; },
    onResolve: (hook?: () => void) => { onResolve = hook; },
    setBroken: (value: boolean) => { broken = value; },
    inventory: (hook?: (rows: Raw[]) => Raw[]) => { modifyInventory = hook; },
  };
}
function at(cfg: Raw, path: number[]): Raw {
  let list = cfg.plugins; let row: Raw;
  for (const index of path) { row = list[index]; list = row!.config; }
  return row!;
}
async function rejects(operation: Promise<unknown>, code: string): Promise<PresetAdapterError> {
  try { await operation; assert.fail('Expected refusal'); }
  catch (error) { assert.ok(error instanceof PresetAdapterError); assert.equal(error.code, code); return error; }
}

test('snapshot retains only paths and hashes for nested raw rows and never emits config or method bodies', () => {
  const f = fixture();
  f.raw().plugins[0].config.instructions = 'PRIVATE_METHOD_BODY';
  const value = snapshotPresetOwners(f.ctx), owner = value.owners[0]!;
  assert.deepEqual(owner.selected.map(row => row.path), [[0], [1, 0], [1, 1, 0], [1, 1, 1], [2]]);
  assert.deepEqual(Object.keys(owner.selected[0]!).sort(), ['name','path','rawRowDigest']);
  assert.equal(owner.selected[0]!.rawRowDigest, rawConfigDigest(f.raw().plugins[0]));
  assert.equal(JSON.stringify(value).includes('!process.env.HOME'), false);
  assert.equal(JSON.stringify(value).includes('agentPresets.current'), false);
  assert.equal(JSON.stringify(value).includes('greeting'), false);
  assert.equal(JSON.stringify(value).includes('permissions'), false);
  assert.equal(JSON.stringify(value).includes('tool-unrelated'), false);
  assert.equal(JSON.stringify(value).includes('PRIVATE_METHOD_BODY'), false);
  assert.equal(owner.fullRawConfigDigest, rawConfigDigest(f.raw()));
});
test('credential keys anywhere refuse that preset and never expose their values', () => {
  for (const key of ['token', 'api_key', 'clientSecret', 'password', 'credentials', 'apiToken', 'GITHUB_TOKEN', 'AWS_SESSION_TOKEN']) {
    const f = fixture(); f.raw().unrelated = { [key]: 'SENSITIVE' };
    const snapshot = snapshotPresetOwners(f.ctx);
    assert.equal(snapshot.owners.length, 0); assert.equal(snapshot.refused[0]!.code, 'credential-key');
    assert.equal(JSON.stringify(snapshot).includes('SENSITIVE'), false);
  }
  const f = fixture(); f.raw().plugins[0].config.env = { GITHUB_TOKEN: 'SELECTED_ROW_SECRET' };
  const value = snapshotPresetOwners(f.ctx); assert.equal(value.owners.length, 0);
  assert.equal(JSON.stringify(value).includes('SELECTED_ROW_SECRET'), false);
});
test('missing, aliased and duplicate producer declarations refuse rather than guessing', () => {
  for (const kind of ['missing', 'alias', 'duplicate']) {
    const f = fixture();
    if (kind === 'missing') f.raw().plugins.splice(2, 1);
    if (kind === 'alias') f.raw().plugins[2].name = './tool-bash.js';
    if (kind === 'duplicate') f.raw().plugins.push(structuredClone(f.raw().plugins[2]));
    assert.equal(snapshotPresetOwners(f.ctx).owners.length, 0);
  }
});
test('apply changes exactly five names and preserves all remaining raw configuration', async () => {
  const f = fixture(), plan = f.plan(), before = structuredClone(f.raw());
  const saved = await applyPresetChanges(f.ctx, plan);
  const restored = structuredClone(f.raw());
  for (const change of plan.changes) { assert.equal(at(restored, change.path).name, change.afterURL); at(restored, change.path).name = change.beforeName; }
  assert.deepEqual(restored, before); assert.equal(f.edits, 1); assert.equal(saved.status, 'applied');
  assert.equal(saved.graphVerification, 'runner-owned');
  assert.equal(JSON.stringify(saved).includes('greeting'), false);
  assert.equal(JSON.stringify(saved).includes('agents'), false);
});
test('apply performs full raw CAS inside the public edit callback after external reconciliation', async () => {
  const f = fixture(), plan = f.plan(); f.beforeChange(() => { f.raw().persona.greeting = 'new user value'; });
  await rejects(applyPresetChanges(f.ctx, plan), 'stale-preset-config');
  assert.equal(f.edits, 0); assert.equal(f.raw().persona.greeting, 'new user value');
});
test('apply rejects stale selected row digest and duplicate or missing change references', async () => {
  const f = fixture(); const stale = f.plan(); stale.changes[0]!.beforeRowDigest = 'a'.repeat(64);
  await rejects(applyPresetChanges(f.ctx, stale), 'stale-producer-row');
  const duplicate = f.plan(); duplicate.changes[1]!.path = duplicate.changes[0]!.path;
  await rejects(applyPresetChanges(f.ctx, duplicate), 'duplicate-change-path');
  const missing = f.plan(); missing.changes.pop();
  await rejects(applyPresetChanges(f.ctx, missing), 'invalid-change-count');
  const alias = f.plan(); alias.changes[0]!.beforeName = './agent-instructions.js';
  await rejects(applyPresetChanges(f.ctx, alias), 'invalid-change-producer'); assert.equal(f.edits, 0);
});
test('owner identity and inactive declaration are not replaced with a standing or guessed owner', async () => {
  const f = fixture(), plan = f.plan(); f.entry.ctx.baseUrl = 'file:///changed/';
  await rejects(applyPresetChanges(f.ctx, plan), 'owner-identity-conflict');
  f.entry.fiber.state = 0; assert.equal(snapshotPresetOwners(f.ctx).refused[0]!.code, 'owner-inactive');
  const g = fixture(), p = g.plan(); g.setEntries([]); await rejects(applyPresetChanges(g.ctx, p), 'owner-unavailable');
  const h = fixture(), hp = h.plan(); h.beforeChange(() => { h.entry.ctx.baseUrl = 'file:///changed-after-reconcile/'; });
  await rejects(applyPresetChanges(h.ctx, hp), 'owner-identity-conflict'); assert.equal(h.edits, 0);
});
test('broken post-edit preset is compensated through public edit and returns only a metadata receipt', async () => {
  const f = fixture(), plan = f.plan(), before = structuredClone(f.raw()); f.afterEdit(count => f.setBroken(count === 1));
  const error = await rejects(applyPresetChanges(f.ctx, plan), 'postcondition-failed-compensated');
  assert.equal(f.edits, 2); assert.deepEqual(f.raw(), before); assert.equal(error.receipt!.status, 'compensated');
  assert.equal(error.receipt!.compensationWrittenConfigDigest, rawConfigDigest(before));
  assert.equal(error.receipt!.finalConfigDigest, rawConfigDigest(f.raw()));
  assert.equal(JSON.stringify(error.receipt).includes('greeting'), false);
});
test('post-edit compensation refuses full candidate drift and preserves the concurrent change', async () => {
  const f = fixture(), plan = f.plan(); f.afterEdit(count => { if (count === 1) f.setBroken(true); });
  f.onResolve(() => { f.raw().persona.greeting = 'concurrent user value'; });
  const error = await rejects(applyPresetChanges(f.ctx, plan), 'postcondition-failed-compensation-refused');
  assert.equal(f.edits, 1); assert.equal(f.raw().persona.greeting, 'concurrent user value');
  assert.equal(at(f.raw(), plan.changes[0]!.path).name, plan.changes[0]!.afterURL); assert.equal(error.receipt!.status, 'refused');
  assert.equal(error.receipt!.compensationWrittenConfigDigest, undefined);
  assert.notEqual(error.receipt!.finalConfigDigest, error.receipt!.candidateConfigDigest);
  assert.equal(error.receipt!.finalConfigDigest, rawConfigDigest(f.raw()));
});
test('apply compensation write with an unusable original generation reports refusal and the observed original configuration', async () => {
  const f = fixture(), plan = f.plan(), before = structuredClone(f.raw());
  f.afterEdit(count => f.setBroken(count >= 1));
  const error = await rejects(applyPresetChanges(f.ctx, plan), 'postcondition-failed-compensation-refused');
  assert.equal(f.edits, 2); assert.deepEqual(f.raw(), before);
  assert.equal(error.receipt!.status, 'refused');
  assert.equal(error.receipt!.compensationWrittenConfigDigest, rawConfigDigest(before));
  assert.equal(error.receipt!.finalConfigDigest, rawConfigDigest(f.raw()));
  assert.notEqual(error.receipt!.finalConfigDigest, error.receipt!.candidateConfigDigest);
});
test('apply compensation refusal omits a final hash when the owner cannot be observed', async () => {
  const f = fixture(), plan = f.plan(); f.afterEdit(count => f.setBroken(count === 1));
  f.onResolve(() => { if (f.edits === 1) f.setEntries([]); });
  const error = await rejects(applyPresetChanges(f.ctx, plan), 'postcondition-failed-compensation-refused');
  assert.equal(f.edits, 1); assert.equal(error.receipt!.status, 'refused');
  assert.equal(Object.hasOwn(error.receipt!, 'finalConfigDigest'), false);
  assert.equal(Object.hasOwn(error.receipt!, 'compensationWrittenConfigDigest'), false);
});
test('apply compensation reports its write separately from a later observed unrelated change', async () => {
  const f = fixture(), plan = f.plan(), before = structuredClone(f.raw());
  f.afterEdit(count => f.setBroken(count === 1));
  f.onResolve(() => { if (f.edits === 2) f.raw().persona.greeting = 'later user value'; });
  const error = await rejects(applyPresetChanges(f.ctx, plan), 'postcondition-failed-compensated');
  assert.equal(f.edits, 2); assert.equal(error.receipt!.status, 'compensated');
  assert.equal(error.receipt!.compensationWrittenConfigDigest, rawConfigDigest(before));
  assert.notEqual(error.receipt!.finalConfigDigest, error.receipt!.compensationWrittenConfigDigest);
  assert.equal(error.receipt!.finalConfigDigest, rawConfigDigest(f.raw()));
  assert.equal(JSON.stringify(error.receipt).includes('later user value'), false);
});
test('eligible pending or absent current-generation producer is not counted as a successful edit', async () => {
  for (const missing of [false, true]) {
    const f = fixture(); f.inventory(rows => f.edits === 1 ? (missing ? rows.slice(1) : rows.map((row, i) => i ? row : { ...row, fiberState: 0 })) : rows);
    await rejects(applyPresetChanges(f.ctx, f.plan()), 'postcondition-failed-compensated'); assert.equal(f.edits, 2);
  }
});
test('intentionally disabled current-generation row retains its condition rather than being forced active', async () => {
  const f = fixture(); f.raw().plugins[2].disabled = true; const plan = f.plan();
  await applyPresetChanges(f.ctx, plan); assert.equal(f.raw().plugins[2].disabled, true);
});
test('ordinary rollback restores only names and preserves unrelated and same-producer user settings', async () => {
  const f = fixture(), plan = f.plan(), saved = await applyPresetChanges(f.ctx, plan);
  f.raw().persona.greeting = 'new user persona'; const row = at(f.raw(), plan.changes[0]!.path);
  row.config = { agents: ['new agent'], additional: 'new setting' }; row.disabled = true; row.inject = ['new service'];
  f.raw().permissions.write = true;
  const beforeRollback = structuredClone(f.raw()), result = await rollbackPresetChanges(f.ctx, saved);
  for (const change of plan.changes) at(beforeRollback, change.path).name = change.beforeName;
  assert.deepEqual(f.raw(), beforeRollback); assert.equal(result.status, 'rolled-back');
  assert.equal(result.finalConfigDigest, rawConfigDigest(f.raw()));
});
test('ordinary rollback refuses user changes to a target name without changing anything', async () => {
  const f = fixture(), plan = f.plan(), saved = await applyPresetChanges(f.ctx, plan);
  at(f.raw(), plan.changes[2]!.path).name = 'user:replacement'; const before = structuredClone(f.raw());
  await rejects(rollbackPresetChanges(f.ctx, saved), 'rollback-target-conflict'); assert.deepEqual(f.raw(), before); assert.equal(f.edits, 1);
});
test('broken rollback generation compensates only names to the complete configuration observed before rollback', async () => {
  const f = fixture(), plan = f.plan(), saved = await applyPresetChanges(f.ctx, plan);
  f.raw().persona.greeting = 'user edit before rollback';
  at(f.raw(), plan.changes[0]!.path).config.instructions = 'PRIVATE_METHOD_BODY';
  const beforeRollback = structuredClone(f.raw()), beforeRollbackDigest = rawConfigDigest(beforeRollback);
  const expectedRollback = structuredClone(beforeRollback);
  for (const change of plan.changes) at(expectedRollback, change.path).name = change.beforeName;
  f.afterEdit(count => f.setBroken(count === 2));
  const error = await rejects(rollbackPresetChanges(f.ctx, saved), 'rollback-postcondition-failed-compensated');
  assert.equal(f.edits, 3); assert.deepEqual(f.raw(), beforeRollback);
  assert.equal(error.receipt!.status, 'compensated');
  assert.equal(error.receipt!.rollbackBeforeConfigDigest, beforeRollbackDigest);
  assert.notEqual(error.receipt!.rollbackBeforeConfigDigest, saved.candidateConfigDigest);
  assert.equal(error.receipt!.rollbackWrittenConfigDigest, rawConfigDigest(expectedRollback));
  assert.equal(error.receipt!.compensationWrittenConfigDigest, beforeRollbackDigest);
  assert.equal(error.receipt!.finalConfigDigest, rawConfigDigest(f.raw()));
  assert.equal(JSON.stringify(error.receipt).includes('PRIVATE_METHOD_BODY'), false);
  assert.equal(JSON.stringify(error.receipt).includes('user edit before rollback'), false);
});
test('rollback compensation checks full raw CAS inside edit and preserves a concurrent unrelated change', async () => {
  const f = fixture(), plan = f.plan(), saved = await applyPresetChanges(f.ctx, plan);
  f.afterEdit(count => f.setBroken(count === 2));
  f.beforeChange(() => { if (f.edits === 2) f.raw().permissions.write = true; });
  const error = await rejects(rollbackPresetChanges(f.ctx, saved), 'rollback-postcondition-failed-compensation-refused');
  assert.equal(f.edits, 2); assert.equal(f.raw().permissions.write, true);
  for (const change of plan.changes) assert.equal(at(f.raw(), change.path).name, change.beforeName);
  assert.equal(error.receipt!.status, 'refused');
  assert.equal(error.receipt!.compensationWrittenConfigDigest, undefined);
  assert.notEqual(error.receipt!.finalConfigDigest, error.receipt!.rollbackWrittenConfigDigest);
  assert.equal(error.receipt!.finalConfigDigest, rawConfigDigest(f.raw()));
});
test('compensation write without an available candidate generation remains a partial refusal', async () => {
  const f = fixture(), plan = f.plan(), saved = await applyPresetChanges(f.ctx, plan);
  const beforeRollback = structuredClone(f.raw());
  f.afterEdit(count => f.setBroken(count >= 2));
  const error = await rejects(rollbackPresetChanges(f.ctx, saved), 'rollback-postcondition-failed-compensation-refused');
  assert.equal(f.edits, 3); assert.deepEqual(f.raw(), beforeRollback);
  assert.equal(error.receipt!.status, 'refused');
  assert.equal(error.receipt!.compensationWrittenConfigDigest, rawConfigDigest(beforeRollback));
  assert.equal(error.receipt!.finalConfigDigest, rawConfigDigest(f.raw()));
});
test('rollback refusal reports its write without claiming an unobservable latest configuration', async () => {
  const f = fixture(), saved = await applyPresetChanges(f.ctx, f.plan());
  f.afterEdit(count => f.setBroken(count === 2));
  f.onResolve(() => { if (f.edits === 2) f.setEntries([]); });
  const error = await rejects(rollbackPresetChanges(f.ctx, saved), 'rollback-postcondition-failed-compensation-refused');
  assert.equal(f.edits, 2); assert.equal(error.receipt!.status, 'refused');
  assert.equal(error.receipt!.rollbackWrittenConfigDigest, rawConfigDigest(f.raw()));
  assert.equal(Object.hasOwn(error.receipt!, 'finalConfigDigest'), false);
  assert.equal(Object.hasOwn(error.receipt!, 'compensationWrittenConfigDigest'), false);
});
test('successful compensation observes later unrelated edits rather than calling its write hash final', async () => {
  const f = fixture(), saved = await applyPresetChanges(f.ctx, f.plan());
  f.afterEdit(count => f.setBroken(count === 2));
  f.onResolve(() => { if (f.edits === 3) f.raw().persona.greeting = 'user edit during compensation verification'; });
  const error = await rejects(rollbackPresetChanges(f.ctx, saved), 'rollback-postcondition-failed-compensated');
  assert.equal(f.edits, 3); assert.equal(error.receipt!.status, 'compensated');
  assert.equal(f.raw().persona.greeting, 'user edit during compensation verification');
  assert.notEqual(error.receipt!.finalConfigDigest, error.receipt!.compensationWrittenConfigDigest);
  assert.equal(error.receipt!.finalConfigDigest, rawConfigDigest(f.raw()));
});
test('final metadata observes unrelated user changes during asynchronous current-generation checks', async () => {
  const f = fixture(), plan = f.plan(); f.onResolve(() => { f.raw().persona.greeting = 'changed during apply verification'; });
  const saved = await applyPresetChanges(f.ctx, plan);
  assert.notEqual(saved.finalConfigDigest, saved.candidateConfigDigest);
  assert.equal(saved.finalConfigDigest, rawConfigDigest(f.raw())); assert.equal(f.edits, 1);
  f.onResolve(() => { f.raw().persona.greeting = 'changed during rollback verification'; });
  const rolledBack = await rollbackPresetChanges(f.ctx, saved);
  assert.equal(rolledBack.finalConfigDigest, rawConfigDigest(f.raw()));
  assert.equal(f.raw().persona.greeting, 'changed during rollback verification');
});
test('graph root enforcement rejects foreign files and content hash mismatches before edit', async () => {
  const f = fixture(), root = dirname(fileURLToPath(import.meta.url));
  const wrongHash = f.plan(); wrongHash.allowedGraphRoot = root; wrongHash.changes[0]!.afterURL = import.meta.url;
  await rejects(applyPresetChanges(f.ctx, wrongHash), 'graph-hash-conflict');
  const outside = f.plan(); outside.allowedGraphRoot = root; outside.changes[0]!.afterURL = new URL('../../plugin/source-gateway.ts', import.meta.url).href;
  await rejects(applyPresetChanges(f.ctx, outside), 'graph-ownership-conflict'); assert.equal(f.edits, 0);
});
test('malformed URL, duplicate after URL and invalid group path refuse before mutation', async () => {
  const f = fixture(), badURL = f.plan(); badURL.changes[0]!.afterURL = 'https://example.invalid/producer.js';
  await rejects(applyPresetChanges(f.ctx, badURL), 'invalid-producer-url');
  const duplicate = f.plan(); duplicate.changes[1]!.afterURL = duplicate.changes[0]!.afterURL;
  await rejects(applyPresetChanges(f.ctx, duplicate), 'duplicate-producer-url');
  const path = f.plan(); path.changes[0]!.path = [0, 0];
  await rejects(applyPresetChanges(f.ctx, path), 'row-path-not-group'); assert.equal(f.edits, 0);
});
