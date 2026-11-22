import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { deriveEntries, derivePreset, ROOT_MODULES, PRESET_MODULES, type CompositionDefinition } from '../../plugin/composition/definition.ts';
import {
  collectActiveTargetModules,
  compareModuleContract,
  probeCompositionCompatibility,
} from '../../plugin/composition/compatibility.ts';
import {
  COMPOSITION_GUARD_SCHEMA,
  createStartupCircuitBreaker,
  guardFilePath,
  readCompositionIdentity,
  readHostVersion,
} from '../../plugin/composition/circuit-breaker.ts';
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

test('variants share one enhanced owner without statically disabling official DSH rows', () => {
  const released = compositionPatch('buildr', '@buildr-ai/buildr-dsh-plugin', 'runtime-composition', 'trajectory-a', [
    { entryId: 'ui-settings-agent-loop', name: '@deepseek-ai/dsh-client-ui-settings-agent-loop', directory: 'runtime-client-1' },
  ]);
  const development = compositionPatch('buildr-dev', '@buildr-ai/buildr-dsh-plugin-dev', 'runtime-composition', 'trajectory-b', []);
  assert.match(released, /id: buildr-composition/); assert.match(development, /id: buildr-composition/);
  assert.match(released, /id: buildr\n      name: '@buildr-ai\/buildr-dsh-plugin'/);
  assert.match(development, /id: buildr-dev\n      name: '@buildr-ai\/buildr-dsh-plugin-dev'/);
  assert.doesNotMatch(released + development, /disabled: true/);
  assert.doesNotMatch(released + development, /id: tools|id: skill|id: preset-standard|id: ui-trajectory|id: ui-settings-agent-loop/);
  assert.doesNotMatch(released + development, /buildr-enhanced-trajectory/);
  assert.doesNotMatch(released + development, /sourceBinding|nodeExecutable|cliEntry|\/Users\//);
});

test('module contract probe detects missing class methods, export shape changes, live additions, and import errors', async () => {
  class StockTools {
    register() {}
    setExecutor() {}
  }
  class EnhancedToolsMissing {
    register() {}
  }
  class EnhancedToolsMatching extends EnhancedToolsMissing {
    setExecutor() {}
  }

  const missingMethod = compareModuleContract('@deepseek-ai/dsh-tools', { default: StockTools }, { default: EnhancedToolsMissing });
  assert.equal(missingMethod.compatible, false);
  if (!missingMethod.compatible) assert.match(missingMethod.reason, /setExecutor/);

  assert.equal(compareModuleContract('@deepseek-ai/dsh-tools', { default: StockTools }, { default: EnhancedToolsMatching }).compatible, true);

  const liveAdded = compareModuleContract(
    '@deepseek-ai/dsh-tools',
    { default: StockTools },
    { default: EnhancedToolsMatching },
    { register() {}, setExecutor() {}, selectExecutor() {} },
  );
  assert.equal(liveAdded.compatible, false);
  if (!liveAdded.compatible) assert.match(liveAdded.reason, /selectExecutor/);

  class StockTrajectory {
    forSession() {}
  }
  const shapeChanged = compareModuleContract('@deepseek-ai/dsh-client-ui-trajectory', { default: StockTrajectory }, { apply() {} });
  assert.equal(shapeChanged.compatible, false);
  if (!shapeChanged.compatible) assert.match(shapeChanged.reason, /class service/);

  assert.equal(compareModuleContract('@deepseek-ai/dsh-tool-fs', { apply() {} }, { apply() {} }).compatible, true);

  const rows = [
    ...Object.entries(ROOT_MODULES).map(([id, name]) => ({ id, name })),
    { id: 'ui-trajectory', name: '@deepseek-ai/dsh-client-ui-trajectory', disabled: true },
    { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: preset() },
  ];
  const activeTargets = collectActiveTargetModules(rows, definition);
  assert.equal(activeTargets.includes('@deepseek-ai/dsh-client-ui-trajectory'), false, 'disabled modules are skipped');
  assert.equal(activeTargets.includes('@deepseek-ai/dsh-tools'), true);
  assert.equal(activeTargets.includes(PRESET_MODULES[0]), true);

  const fullDefinition: CompositionDefinition = {
    schemaVersion: 'buildr.dsh-composition/v1',
    modules: {
      ...modules,
      '@deepseek-ai/dsh-client-ui-trajectory': 'file:///installed/trajectory.js',
    },
    presetOwner: 'file:///installed/preset-owner.js',
  };
  const failedImportProbe = await probeCompositionCompatibility({
    rows: rows.map(row => row.id === 'ui-trajectory' ? { ...row, disabled: false } : row),
    definition: fullDefinition,
    baseUrl: 'file:///installed/',
    async importModule(specifier) {
      if (specifier === '@deepseek-ai/dsh-tools') return { default: StockTools };
      if (specifier === modules['@deepseek-ai/dsh-tools']) throw new Error("Cannot find package '@deepseek-ai/dsh-scope'");
      if (specifier === '@deepseek-ai/dsh-client-ui-trajectory') return { default: StockTrajectory };
      if (specifier === 'file:///installed/trajectory.js') return { apply() {} };
      if (specifier === 'file:///installed/preset-owner.js') return class {};
      return { apply() {} };
    },
  });
  assert.equal(failedImportProbe.compatible, false);
  if (!failedImportProbe.compatible) {
    assert.ok(failedImportProbe.incompatibleModules.includes('@deepseek-ai/dsh-tools'));
    assert.ok(failedImportProbe.incompatibleModules.includes('@deepseek-ai/dsh-client-ui-trajectory'));
    assert.match(failedImportProbe.detail, /dsh-scope/);
  }
});

test('startup circuit breaker guards cross-process crashes, ignores same-pid reload, resets on version change, and clears on disable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buildr-circuit-breaker-'));
  try {
    const installAnchor = join(dir, 'app', 'package.json');
    mkdirSync(join(dir, 'app'), { recursive: true });
    writeFileSync(installAnchor, JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.2-rc.5' }));
    assert.equal(readHostVersion(installAnchor), '0.2.2-rc.5');
    assert.equal(readHostVersion(join(dir, 'missing', 'package.json')), null);

    const pkgDir = join(dir, 'plugin');
    const compDir = join(pkgDir, 'runtime-composition');
    mkdirSync(compDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
      name: '@buildr-ai/buildr-dsh-plugin',
      version: '0.1.0-rc.5',
      buildrComposition: { patchSha256: 'abc123' },
    }));
    const entryUrl = pathToFileURL(join(compDir, 'index.js')).href;
    const compId = readCompositionIdentity(entryUrl);
    assert.equal(compId, '@buildr-ai/buildr-dsh-plugin@0.1.0-rc.5:abc123');
    assert.equal(compId.includes(dir), false);

    const guardFile = guardFilePath(dir);
    const proc1 = createStartupCircuitBreaker({ guardFile, hostVersion: '0.2.2-rc.5', compositionIdentity: compId, pid: 1001 });
    assert.deepEqual(proc1.check(), { allowed: true });
    proc1.markAttempting();
    assert.deepEqual(proc1.check(), { allowed: true }, 'same-pid reload while attempting is allowed');

    const proc2 = createStartupCircuitBreaker({ guardFile, hostVersion: '0.2.2-rc.5', compositionIdentity: compId, pid: 1002 });
    const blocked = proc2.check();
    assert.equal(blocked.allowed, false);
    if (!blocked.allowed) assert.equal(blocked.reason, 'circuit-breaker');
    const persisted = JSON.parse(readFileSync(guardFile, 'utf8'));
    assert.equal(persisted.schemaVersion, COMPOSITION_GUARD_SCHEMA);
    assert.equal(persisted.state, 'tripped');

    const proc3 = createStartupCircuitBreaker({ guardFile, hostVersion: '0.2.2-rc.5', compositionIdentity: compId, pid: 1003 });
    assert.equal(proc3.check().allowed, false);

    const upgradedHost = createStartupCircuitBreaker({ guardFile, hostVersion: '0.2.2-rc.6', compositionIdentity: compId, pid: 1004 });
    assert.deepEqual(upgradedHost.check(), { allowed: true });
    upgradedHost.markAttempting();
    upgradedHost.markReady();
    assert.equal(JSON.parse(readFileSync(guardFile, 'utf8')).state, 'ready');

    const nextBootSameHost = createStartupCircuitBreaker({ guardFile, hostVersion: '0.2.2-rc.6', compositionIdentity: compId, pid: 1005 });
    assert.deepEqual(nextBootSameHost.check(), { allowed: true });

    proc3.clear();
    assert.deepEqual(proc3.check(), { allowed: true });

    writeFileSync(guardFile, '{broken-json');
    assert.deepEqual(proc3.check(), { allowed: true }, 'corrupt guard file fails open to probe');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
