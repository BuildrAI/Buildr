import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

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
