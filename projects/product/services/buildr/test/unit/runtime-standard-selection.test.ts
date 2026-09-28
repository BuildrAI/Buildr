import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_RUNTIME_ADAPTER_ID,
  RUNTIME_ADAPTERS,
  RUNTIME_HOST_PROFILES,
  getRuntimeAdapter,
  getRuntimeAdapterFor,
  resolveRuntimeSelection,
  runtimeDiscoveryPayload,
  runtimeSkillPath,
  skillAppliesToRuntime,
} from '../../src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts';

test('standard selection keeps the real runtime identity and shares one implementation', () => {
  const standard = getRuntimeAdapter(DEFAULT_RUNTIME_ADAPTER_ID);
  for (const runtimeId of [null, 'codex', 'dsh', 'new-vendor', 'Codex', 'constructor', 'toString', '__proto__']) {
    const result = resolveRuntimeSelection({ runtimeId });
    assert.equal(result.runtimeId, runtimeId);
    assert.equal(result.adapterId, 'agents-standard');
    assert.equal(result.adapter, standard);
    assert.equal(result.host.installation, 'not-checked');
    assert.equal(result.host.sessionConsumption, 'unknown-until-adopted');
  }
  assert.equal(resolveRuntimeSelection().reason, 'standard-default');
  assert.equal(resolveRuntimeSelection({ runtimeId: 'dsh' }).reason, 'runtime-mapping');
  assert.equal(resolveRuntimeSelection({ runtimeId: 'new-vendor' }).host.known, false);
  assert.equal(Object.hasOwn(RUNTIME_ADAPTERS, 'codex'), false);
  assert.equal(Object.hasOwn(RUNTIME_ADAPTERS, 'dsh'), false);
});

test('vendor exceptions and explicit file choices never mask selection errors', () => {
  for (const runtimeId of ['claude-code', 'cursor', 'qoder', 'trae', 'trae-work', 'workbuddy']) {
    assert.equal(resolveRuntimeSelection({ runtimeId }).adapterId, runtimeId);
  }
  const overridden = resolveRuntimeSelection({ runtimeId: 'dsh', adapterId: 'claude-code' });
  assert.equal(overridden.runtimeId, 'dsh');
  assert.equal(overridden.adapterId, 'claude-code');
  assert.equal(overridden.reason, 'explicit-adapter');
  assert.equal(overridden.host.activation, undefined, 'standard-directory host hints must not certify an overridden vendor layout');
  for (const adapterId of ['missing', 'codex', 'dsh', 'constructor', 'toString', '__proto__', '']) {
    assert.throws(() => getRuntimeAdapter(adapterId), /Unsupported runtime adapter/);
    assert.throws(() => resolveRuntimeSelection({ runtimeId: 'codex', adapterId }), /Unsupported runtime adapter/);
  }
  for (const runtimeId of ['', 'a/b', 'two words', '--bad/argument']) {
    assert.throws(() => resolveRuntimeSelection({ runtimeId }), /Agent id must contain/);
  }
});

test('standard layout and runtime applicability are independent', () => {
  const skill = { id: 'example', runtimePath: 'nested/example', runtimes: ['codex'] };
  assert.equal(runtimeSkillPath(skill, 'codex'), 'example');
  assert.equal(runtimeSkillPath(skill, 'cursor'), 'example');
  assert.equal(runtimeSkillPath(skill, 'dsh'), 'example');
  assert.equal(runtimeSkillPath(skill, 'qoder'), 'nested/example');
  assert.equal(runtimeSkillPath(skill, 'dsh', 'qoder'), 'nested/example');
  assert.equal(skillAppliesToRuntime(skill, 'codex'), true);
  for (const runtime of [null, 'dsh', 'agents-standard', 'unknown-brand']) assert.equal(skillAppliesToRuntime(skill, runtime), false);
  assert.equal(skillAppliesToRuntime({ id: 'generic' }, null), true);
  assert.equal(skillAppliesToRuntime({ id: 'generic' }, 'unknown-brand'), true);
  assert.equal(skillAppliesToRuntime({ runtimes: [] }, 'codex'), false);
});

test('brand-specific metadata does not become a standard promise', () => {
  assert.equal(getRuntimeAdapterFor('dsh').traits.skills.publicationExtensions, undefined);
  assert.equal(getRuntimeAdapterFor('codex').traits.activation.skills, 'host-dependent');
  assert.equal(RUNTIME_HOST_PROFILES.codex.activation.skills, 'session-start');
  assert.equal(RUNTIME_HOST_PROFILES.dsh.activation.skills, 'immediate');
  const payload = runtimeDiscoveryPayload();
  assert.equal(payload.defaultAdapter, 'agents-standard');
  assert.equal(payload.runtimeMappings.codex, payload.runtimeMappings.dsh);
  assert.equal(payload.unknownRuntimePolicy, 'standard-default');
  assert.ok(payload.supportedAdapters.includes('agents-standard'));
});
