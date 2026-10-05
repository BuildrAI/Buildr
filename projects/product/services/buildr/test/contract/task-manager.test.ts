import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/modules/agent-assets/persistence/skill-manifest.ts';

test('task-manager contract/provider/binding 与 task-triage optional consumer 原子一致', () => {
  const manifest: any = YAML.parse(fs.readFileSync('resources/manifest.yml', 'utf8'));
  const contract: any = manifest.capabilityContracts.find((item: any) => item.id === 'buildr.task-record' && item.version === 4);
  assert.ok(contract); assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).id, 'buildr.task-record');
  assert.deepEqual(manifest.initialSkillBindings.find((item: any) => item.capability === 'buildr.task-record'), { capability: 'buildr.task-record', version: 4, provider: 'task-manager' });
  const manager: any = manifest.builtins.skills.find((item: any) => item.id === 'task-manager'); assert.equal(manager.required, false); assert.deepEqual(manager.provides, [{ capability: 'buildr.task-record', version: 4 }]);
  const triage: any = manifest.builtins.skills.find((item: any) => item.id === 'task-triage'); assert.ok(triage.requires.some((item: any) => item.capability === 'buildr.task-record' && item.version === 4 && item.mode === 'optional'));
});

test('Task Record v4 保留历史契约而只声明当前正文能力与所有消费版本', () => {
  const manifest: any = YAML.parse(fs.readFileSync('resources/manifest.yml', 'utf8'));
  const contract: any = manifest.capabilityContracts.find((item: any) => item.id === 'buildr.task-record');
  assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).version, 4);
  const predecessor = contract.replaces.find((item: any) => item.id === 'buildr.task-record' && item.version === 3);
  const historical = fs.readFileSync('test/fixtures/legacy-task-record-contract-v3.md');
  assert.equal(predecessor.integrity, `sha256-${crypto.createHash('sha256').update(historical).digest('hex')}`);
  assert.match(historical.toString('utf8'), /无正文持久化/);
  for (const skill of manifest.builtins.skills) {
    for (const reference of [...skill.provides || [], ...skill.requires || []]) {
      if (reference.capability === 'buildr.task-record') assert.equal(reference.version, 4, skill.id);
    }
  }
  const component: any = YAML.parse(fs.readFileSync('resources/workspace/components/buildr/openspec/component.yml', 'utf8'));
  for (const reference of component.contributions.skillDependencies) {
    if (reference.capability === 'buildr.task-record') assert.equal(reference.version, 4, reference.skill);
  }
});
