import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import crypto from 'node:crypto';

import { getRuntimeAdapter, SUPPORTED_AGENT_IDS } from '../../src/infrastructure/runtime/adapter-contract.mjs';
import { buildSkillContent, hasManagedSkillMarker, resolveRenderSkills } from '../../src/infrastructure/runtime/skills/render-plan.mjs';

const sections = ['Purpose', 'Consumer Obligations', 'Minimum Guarantees', 'Effects and Authorization', 'Result Evidence', 'Decision Points', 'Allowed Variations'];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-capability-runtime-'));
  fs.mkdirSync(path.join(root, 'skills', 'contracts', 'example'), { recursive: true });
  for (const id of ['provider', 'second-provider', 'required-consumer', 'optional-consumer']) {
    const directory = path.join(root, 'skills', id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${id}\ndescription: ${id}\n---\n\n# ${id}\n`);
  }
  for (const id of ['required', 'optional']) {
    fs.writeFileSync(path.join(root, 'skills', 'contracts', 'example', `${id}.md`), [
      '---',
      'schemaVersion: buildr.capability-contract/v1',
      `id: example.${id}`,
      'version: 1',
      '---',
      '',
      `# example.${id}`,
      '',
      ...sections.flatMap((section) => [`## ${section}`, '', `${section} text.`, '']),
    ].join('\n'));
  }
  return root;
}

function writeManifest(root, overrides = {}) {
  const document = {
    schemaVersion: 'buildr.skills/v2',
    contracts: [
      { id: 'example.required', version: 1, path: 'contracts/example/required.md', description: 'required fixture' },
      { id: 'example.optional', version: 1, path: 'contracts/example/optional.md', description: 'optional fixture' },
    ],
    bindings: [{ capability: 'example.required', version: 1, provider: 'provider' }],
    skills: [
      { id: 'provider', path: 'provider', provides: [{ capability: 'example.required', version: 1 }] },
      { id: 'required-consumer', path: 'required-consumer', requires: [{ capability: 'example.required', version: 1, mode: 'required' }] },
      { id: 'optional-consumer', path: 'optional-consumer', requires: [{ capability: 'example.optional', version: 1, mode: 'optional' }] },
    ],
    ...overrides,
  };
  fs.writeFileSync(path.join(root, 'skills', 'manifest.yml'), YAML.stringify(document, { lineWidth: 0 }));
  return document;
}

function writeDependencyComponent(root, { mode = 'required', state = 'installed', dependencySkill = 'required-consumer' } = {}) {
  const componentRoot = path.join(root, 'components', 'workspace', 'dependency-fixture');
  const fragmentRelative = 'components/workspace/dependency-fixture/contributions/consumer.md';
  const fragmentFile = path.join(root, fragmentRelative);
  fs.mkdirSync(path.dirname(fragmentFile), { recursive: true });
  fs.writeFileSync(fragmentFile, '## Component dependency boundary\n');
  const integrity = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(fragmentFile)).digest('hex')}`;
  fs.writeFileSync(path.join(componentRoot, 'component.yml'), YAML.stringify({
    schemaVersion: 'buildr.component/v1',
    id: 'dependency-fixture',
    kind: 'addon',
    version: '1.0.0',
    source: 'workspace',
    members: { rules: [], skills: [], commandCollections: [], skillContributions: [fragmentRelative] },
    contributions: {
      skillFragments: [`required-consumer@prepend=${fragmentRelative}`],
      skillDependencies: [{ skill: dependencySkill, capability: 'example.required', version: 1, mode }],
    },
    integrity: [`${fragmentRelative}=${integrity}`],
  }, { lineWidth: 0 }));
  fs.mkdirSync(path.join(root, 'components'), { recursive: true });
  fs.writeFileSync(path.join(root, 'components', 'manifest.yml'), YAML.stringify({
    schemaVersion: 'buildr.components/v1',
    components: [{ id: 'dependency-fixture', source: 'workspace', path: 'components/workspace/dependency-fixture', enabled: true, required: false, state }],
  }, { lineWidth: 0 }));
}

test('全部 supported adapters 投射一致的 ready/degraded binding，且不修改 Skill source', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeManifest(root);
  const sourceFile = path.join(root, 'skills', 'required-consumer', 'SKILL.md');
  const sourceBefore = fs.readFileSync(sourceFile, 'utf8');

  for (const runtime of SUPPORTED_AGENT_IDS) {
    const skills = resolveRenderSkills(root, '.', runtime);
    const required = skills.find((skill) => skill.id === 'required-consumer');
    const optional = skills.find((skill) => skill.id === 'optional-consumer');
    assert.equal(required.capabilityBindings.readiness, 'ready', runtime);
    assert.equal(optional.capabilityBindings.readiness, 'degraded', runtime);
    const requiredContent = buildSkillContent(root, { ...required, runtime });
    const optionalContent = buildSkillContent(root, { ...optional, runtime });
    assert.match(requiredContent, /buildr:capability-bindings begin/);
    assert.match(requiredContent, /Consumer readiness: `ready`/);
    assert.match(requiredContent, /contract SHA-256: `[a-f0-9]{64}`/);
    assert.match(requiredContent, new RegExp(`${getRuntimeAdapter(runtime).traits.skills.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/skills/provider/SKILL\\.md`));
    assert.match(optionalContent, /Consumer readiness: `degraded` \(`missing_provider`\)/);
    assert.doesNotMatch(optionalContent, /\*\*Safety stop:\*\*/);
    assert.equal(hasManagedSkillMarker(requiredContent), true);
  }

  assert.equal(fs.readFileSync(sourceFile, 'utf8'), sourceBefore);
});

test('Component dependency contribution 拒绝未接收 fragment 的 target', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeManifest(root);
  writeDependencyComponent(root, { dependencySkill: 'optional-consumer' });
  assert.throws(() => resolveRenderSkills(root, '.', 'codex'), /dependency target must also receive a Skill fragment: optional-consumer/);
});

test('required provider 缺失时保留 blocked consumer，binding 或 contract 变化会改变 managed hash', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const blockedDocument = writeManifest(root, {
    bindings: [],
    skills: [
      { id: 'required-consumer', path: 'required-consumer', requires: [{ capability: 'example.required', version: 1, mode: 'required' }] },
    ],
  });
  let consumer = resolveRenderSkills(root, '.', 'codex').find((skill) => skill.id === 'required-consumer');
  const blocked = buildSkillContent(root, { ...consumer, runtime: 'codex' });
  assert.equal(consumer.capabilityBindings.readiness, 'blocked');
  assert.match(blocked, /Consumer readiness: `blocked` \(`missing_provider`\)/);
  assert.match(blocked, /\*\*Safety stop:\*\*/);

  blockedDocument.bindings = [{ capability: 'example.required', version: 1, provider: 'provider' }];
  blockedDocument.skills.unshift({ id: 'provider', path: 'provider', provides: [{ capability: 'example.required', version: 1 }] });
  fs.writeFileSync(path.join(root, 'skills', 'manifest.yml'), YAML.stringify(blockedDocument, { lineWidth: 0 }));
  consumer = resolveRenderSkills(root, '.', 'codex').find((skill) => skill.id === 'required-consumer');
  const ready = buildSkillContent(root, { ...consumer, runtime: 'codex' });
  assert.equal(consumer.capabilityBindings.readiness, 'ready');
  assert.notEqual(ready.match(/Hash: ([a-f0-9]+)/)?.[1], blocked.match(/Hash: ([a-f0-9]+)/)?.[1]);

  const contractFile = path.join(root, 'skills', 'contracts', 'example', 'required.md');
  fs.appendFileSync(contractFile, '\nProvider-neutral clarification.\n');
  consumer = resolveRenderSkills(root, '.', 'codex').find((skill) => skill.id === 'required-consumer');
  const contractChanged = buildSkillContent(root, { ...consumer, runtime: 'codex' });
  assert.notEqual(contractChanged.match(/Hash: ([a-f0-9]+)/)?.[1], ready.match(/Hash: ([a-f0-9]+)/)?.[1]);
});

test('Component dependency contribution 与 fragment 同生命周期合并且 required 覆盖 optional', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeManifest(root, {
    bindings: [],
    skills: [{ id: 'required-consumer', path: 'required-consumer', requires: [{ capability: 'example.required', version: 1, mode: 'optional' }] }],
  });
  writeDependencyComponent(root);

  let consumer = resolveRenderSkills(root, '.', 'codex').find((skill) => skill.id === 'required-consumer');
  assert.deepEqual(consumer.requires, [{ capability: 'example.required', version: 1, mode: 'required' }]);
  assert.equal(consumer.skillDependencyContributions.length, 1);
  assert.equal(consumer.skillDependencyContributions[0].componentId, 'dependency-fixture');
  assert.equal(consumer.skillContributions.length, 1);
  assert.equal(consumer.capabilityBindings.readiness, 'blocked');

  writeDependencyComponent(root, { state: 'uninstalled' });
  consumer = resolveRenderSkills(root, '.', 'codex').find((skill) => skill.id === 'required-consumer');
  assert.deepEqual(consumer.requires, [{ capability: 'example.required', version: 1, mode: 'optional' }]);
  assert.equal(consumer.skillDependencyContributions, undefined);
  assert.equal(consumer.skillContributions, undefined);
  assert.equal(consumer.capabilityBindings.readiness, 'degraded');
});
