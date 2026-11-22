import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const read = (relative: string): string => fs.readFileSync(path.resolve(relative), 'utf8');

type CapabilityReference = { capability?: unknown; version?: unknown; mode?: unknown };
type SkillEntry = { id?: unknown; required?: unknown; retired?: boolean; provides?: CapabilityReference[]; requires?: CapabilityReference[] };
type ContractEntry = { id?: unknown; version?: unknown };
type BindingEntry = { capability?: unknown };
type Manifest = { builtins?: { skills?: SkillEntry[] }; capabilityContracts?: ContractEntry[]; initialSkillBindings?: BindingEntry[] };

function isManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const contractsValid = !('capabilityContracts' in value) || value.capabilityContracts === undefined || Array.isArray(value.capabilityContracts);
  const bindingsValid = !('initialSkillBindings' in value) || value.initialSkillBindings === undefined || Array.isArray(value.initialSkillBindings);
  const builtinsValid = !('builtins' in value) || value.builtins === undefined || (value.builtins !== null && typeof value.builtins === 'object' && !Array.isArray(value.builtins));
  return contractsValid && bindingsValid && builtinsValid;
}

function manifest(): Manifest {
  const parsed: unknown = YAML.parse(read('resources/manifest.yml'));
  assert.ok(isManifest(parsed));
  return parsed;
}

test('复盘由任务管理按需承接，不再独立安装', () => {
  const value = manifest();
  const retrospective = value.builtins?.skills?.find((item) => item.id === 'task-retrospective');
  assert.ok(retrospective);
  assert.equal(retrospective.retired, true);
  assert.ok(read('resources/workspace/skills/buildr/task-manager/references/retrospective.md').length > 0);
  assert.equal(value.capabilityContracts?.some((item) => item.id === 'buildr.task-retrospective'), false);
  assert.equal(value.initialSkillBindings?.some((item) => item.capability === 'buildr.task-retrospective'), false);
});
