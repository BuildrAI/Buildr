import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/agent-assets/infrastructure/runtime/skills/manifests.ts';

const target: any = path.resolve('resources/workspace');

test('task-manager contract/provider/binding 与 task-triage optional consumer 原子一致', () => {
  const manifest: any = YAML.parse(fs.readFileSync('resources/manifest.yml', 'utf8'));
  const contract: any = manifest.capabilityContracts.find((item: any) => item.id === 'buildr.task-record' && item.version === 3);
  assert.ok(contract); assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).id, 'buildr.task-record');
  assert.deepEqual(manifest.initialSkillBindings.find((item: any) => item.capability === 'buildr.task-record'), { capability: 'buildr.task-record', version: 3, provider: 'task-manager' });
  const manager: any = manifest.builtins.skills.find((item: any) => item.id === 'task-manager'); assert.equal(manager.required, false); assert.deepEqual(manager.provides, [{ capability: 'buildr.task-record', version: 3 }]);
  const triage: any = manifest.builtins.skills.find((item: any) => item.id === 'task-triage'); assert.ok(triage.requires.some((item: any) => item.capability === 'buildr.task-record' && item.version === 3 && item.mode === 'optional'));
});
