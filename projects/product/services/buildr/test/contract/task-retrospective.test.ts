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

test('Task Retrospective 是按需纯 Skill，只依赖 Task Record v3', () => {
  const value = manifest();
  const retrospective = value.builtins?.skills?.find((item) => item.id === 'task-retrospective');
  assert.ok(retrospective);
  assert.equal(retrospective.required, false);
  assert.deepEqual(retrospective.provides ?? [], []);
  assert.ok(retrospective.requires?.some((item) => item.capability === 'buildr.task-record' && item.version === 3 && item.mode === 'required'));
  assert.equal(value.capabilityContracts?.some((item) => item.id === 'buildr.task-retrospective'), false);
  assert.equal(value.initialSkillBindings?.some((item) => item.capability === 'buildr.task-retrospective'), false);
});

test('Task Retrospective Skill 只生成本机文档并由用户决定是否行动', () => {
  const skill = read('resources/workspace/skills/buildr/task-retrospective/SKILL.md');
  for (const required of [
    '.buildr/local/task-retrospectives/<task-id>.md',
    'pending-decision',
    'decided',
    '当前真正可达',
    '普通Task',
    '用户明确要求',
  ]) assert.ok(skill.includes(required), required);
  assert.match(skill, /Token、完整耗时或调用次数不可得时直接标记缺失/);
  assert.match(skill, /查看零写入/);
  assert.match(skill, /用户决定不行动时不创建Task/);
  assert.doesNotMatch(skill, /__internal task-retrospective|--include-report|--max-bytes|handled\|no-action|--retrospective-source/);
});

test('旧复盘 Application、Driver、能力契约和持久化实现已退出', () => {
  for (const relative of [
    'src/task/application/task-retrospective-application.mjs',
    'src/task/domain/task-retrospective.mjs',
    'src/task/interfaces/http/task-retrospective-http.mjs',
    'src/task/interfaces/internal/task-retrospective-driver.mjs',
    'src/task/persistence/task-retrospective-repository.mjs',
    'resources/workspace/skills/contracts/buildr/task-retrospective/v2.md',
  ]) assert.equal(fs.existsSync(path.resolve(relative)), false, relative);
});
