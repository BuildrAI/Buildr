import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/agent-assets/infrastructure/runtime/skills/manifests.ts';

const target = path.resolve('resources/workspace');

test('task-manager contract/provider/binding 与 task-triage optional consumer 原子一致', () => {
  const manifest = YAML.parse(fs.readFileSync('resources/manifest.yml', 'utf8'));
  const contract = manifest.capabilityContracts.find((item) => item.id === 'buildr.task-record' && item.version === 3);
  assert.ok(contract); assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).id, 'buildr.task-record');
  assert.deepEqual(manifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-record'), { capability: 'buildr.task-record', version: 3, provider: 'task-manager' });
  const manager = manifest.builtins.skills.find((item) => item.id === 'task-manager'); assert.equal(manager.required, false); assert.deepEqual(manager.provides, [{ capability: 'buildr.task-record', version: 3 }]);
  const triage = manifest.builtins.skills.find((item) => item.id === 'task-triage'); assert.ok(triage.requires.some((item) => item.capability === 'buildr.task-record' && item.version === 3 && item.mode === 'optional'));
});
