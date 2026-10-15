import assert from 'node:assert/strict';
import test from 'node:test';
import { createBindingMaintenance } from '../../plugin/binding-maintenance.ts';

const target = { nodeExecutable: '/verified/node', cliEntry: '/verified/buildr.mjs', nodeSha256: 'sha256-' + 'a'.repeat(64), cliSha256: 'sha256-' + 'b'.repeat(64) };
function fixture() {
  const other = { options: { id: 'other', name: 'other-module', config: { keep: true } } };
  const own = { options: { id: 'buildr-dev', name: '@buildr-ai/buildr-dsh-plugin-dev', config: { sourceBinding: { untouched: true }, timeoutMs: 456 } as Record<string, unknown> } };
  const entries = [own, other]; let edits = 0;
  const editor = { entries: () => entries, async edit(entry: typeof own, change: (raw: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>) {
    assert.equal(entry, own); edits++; entry.options.config = change({ ...entry.options.config }, {});
  } };
  return { own, other, entries, editor, edits: () => edits, maintenance: createBindingMaintenance(editor, own.options.id, own.options.name) };
}
test('native binding maintenance only changes its own field, preserves fresh unrelated configuration and restores absence', async () => {
  const f = fixture(), before = f.maintenance.read();
  assert.equal(before.binding, null);
  f.own.options.config.concurrent = 'keep-current';
  const saved = await f.maintenance.update({ expectedRevision: before.revision, binding: target });
  assert.deepEqual(saved.binding, target);
  assert.deepEqual(f.own.options.config, { sourceBinding: { untouched: true }, timeoutMs: 456, concurrent: 'keep-current', binding: target });
  assert.deepEqual(f.other.options.config, { keep: true });
  await f.maintenance.update({ expectedRevision: saved.revision, binding: before.binding });
  assert.equal(Object.hasOwn(f.own.options.config, 'binding'), false);
  assert.equal(f.own.options.config.concurrent, 'keep-current'); assert.equal(f.edits(), 2);
});
test('observed binding conflicts cannot overwrite another maintainer and unknown fields cannot edit a profile', async () => {
  const f = fixture(), before = f.maintenance.read(); f.own.options.config.binding = target;
  await assert.rejects(f.maintenance.update({ expectedRevision: before.revision, binding: null }), (error: any) => error.code === 'agent_dsh_binding_conflict');
  assert.deepEqual(f.maintenance.read().binding, target);
  const observed = f.maintenance.read(), count = f.edits();
  for (const extra of [{ other: true }, { sourceBinding: {} }, { config: { binding: null } }]) {
    await assert.rejects(f.maintenance.update({ expectedRevision: observed.revision, binding: null, ...extra } as any));
  }
  for (const invalid of [{ ...target, cliEntry: 'relative' }, { ...target, cliSha256: 'not-a-hash' }, { ...target, arguments: ['arbitrary'] }]) {
    await assert.rejects(f.maintenance.update({ expectedRevision: observed.revision, binding: invalid } as any));
  }
  assert.equal(f.edits(), count);
});
test('duplicate or foreign entry identities cannot be maintained', () => {
  const f = fixture();
  const foreign = createBindingMaintenance(f.editor, 'other', f.own.options.name);
  assert.throws(() => foreign.read(), (error: any) => error.code === 'agent_dsh_binding_unavailable');
  f.entries.push({ options: { ...f.own.options, config: {} } });
  assert.throws(() => f.maintenance.read(), (error: any) => error.code === 'agent_dsh_binding_unavailable');
});
