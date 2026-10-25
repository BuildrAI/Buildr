import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const read = (relative: string): string => fs.readFileSync(path.resolve(relative), 'utf8');

type CapabilityReference = { capability?: unknown; version?: unknown; mode?: unknown };
type SkillEntry = { id?: unknown; required?: unknown; provides?: CapabilityReference[]; requires?: CapabilityReference[] };
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

test('Task Retrospective 是按需纯 Skill，只依赖 Task Record v4', () => {
  const value = manifest();
  const retrospective = value.builtins?.skills?.find((item) => item.id === 'task-retrospective');
  assert.ok(retrospective);
  assert.equal(retrospective.required, false);
  assert.deepEqual(retrospective.provides ?? [], []);
  assert.ok(retrospective.requires?.some((item) => item.capability === 'buildr.task-record' && item.version === 4 && item.mode === 'required'));
  assert.equal(value.capabilityContracts?.some((item) => item.id === 'buildr.task-retrospective'), false);
  assert.equal(value.initialSkillBindings?.some((item) => item.capability === 'buildr.task-retrospective'), false);
});
