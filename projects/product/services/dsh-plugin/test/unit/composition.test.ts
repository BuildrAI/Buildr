import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveEntries, derivePreset, ROOT_MODULES, PRESET_MODULES, type CompositionDefinition } from '../../plugin/composition/definition.ts';
import { compositionPatch } from '../../tools/build-composition.ts';
const modules = Object.fromEntries([...Object.values(ROOT_MODULES), ...PRESET_MODULES].map((name, index) => [name, `file:///installed/producer-${index}.js`]));
const definition: CompositionDefinition = { schemaVersion: 'buildr.dsh-composition/v1', modules, presetOwner: 'file:///installed/preset-owner.js' };
function preset() { return { id: 'standard', name: 'User standard', custom: { value: 'keep' }, plugins: [
  { name: PRESET_MODULES[0], disabled: { __jsExpr: 'process.env.TEST_DISABLED' }, inject: ['agents'], config: { roots: ['../rules'] } },
  { name: 'cordis:group', group: true, isolate: { skills: true }, intercept: { tools: { mode: 'native' } }, config: PRESET_MODULES.slice(1).map(name => ({ name, config: { choice: 'user' } })) },
  { name: './unrelated.js', config: { credential: 'not-returned-in-diagnostics' } },
] }; }
test('detached preset transformation retains nested conditions, isolation, user fields and relative references', () => {
  const source = preset(), before = structuredClone(source), enhanced = derivePreset(source, modules);
  assert.deepEqual(source, before);
  assert.equal(enhanced.name, source.name); assert.deepEqual(enhanced.custom, source.custom);
  const rows = enhanced.plugins as any[];
  assert.equal(rows[0].name, modules[PRESET_MODULES[0]]);
  assert.deepEqual(rows[0].disabled, source.plugins[0].disabled);
  assert.deepEqual(rows[0].inject, source.plugins[0].inject);
  assert.deepEqual(rows[1].isolate, source.plugins[1].isolate);
  assert.deepEqual(rows[1].intercept, source.plugins[1].intercept);
  assert.deepEqual(rows[2], source.plugins[2]);
});
test('configuration edited while active is read afresh; root config omission and user disablement survive', () => {
  const roots = Object.entries(ROOT_MODULES).map(([id, name]) => ({ id, name, disabled: id === 'skill', inject: { loader: { required: true } }, isolate: { tools: 'same-realm' },
    ...(id === 'tools' ? { config: { mode: { __jsExpr: 'process.env.DSH_TOOLS_MODE' }, custom: 'before' } } : {}) }));
  const rows = [...roots, { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: preset() }];
  const before = structuredClone(rows), first = deriveEntries(rows, definition);
  assert.deepEqual(rows, before); assert.equal(Object.hasOwn(first[2], 'config'), false); assert.equal(first[2].disabled, true);
  (rows[0].config as any).custom = 'concurrent-user-edit';
  assert.equal((deriveEntries(rows, definition)[0].config as any).custom, 'concurrent-user-edit');
  assert.deepEqual(first[0].inject, roots[0].inject); assert.deepEqual(first[0].isolate, roots[0].isolate);
});
test('unknown owners and missing or duplicate preset producers fail without modifying source', () => {
  const source = preset(); source.plugins.push({ name: PRESET_MODULES[0], config: {} } as any);
  const before = structuredClone(source);
  assert.throws(() => derivePreset(source, modules), /ambiguous or missing/); assert.deepEqual(source, before);
  assert.throws(() => deriveEntries([{ id: 'tools', name: 'third-party-tools' }], definition), /unknown root owner/);
});
test('variants share one enhanced owner and component row identities but retain separate thin entry identities', () => {
  const released = compositionPatch('buildr', 'entry-a', 'runtime-composition', 'trajectory-a', []);
  const development = compositionPatch('buildr-dev', 'entry-b', 'runtime-composition', 'trajectory-b', []);
  assert.match(released, /id: buildr-composition/); assert.match(development, /id: buildr-composition/);
  assert.doesNotMatch(released + development, /buildr-enhanced-trajectory/);
  assert.doesNotMatch(released + development, /sourceBinding|nodeExecutable|cliEntry|\/Users\//);
});
