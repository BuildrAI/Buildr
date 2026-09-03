import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('task-verification v4 keeps Agent orchestration and minimal Applications', () => {
  const skill = read('resources/workspace/skills/buildr/task-verification/SKILL.md');
  const contract = read('resources/workspace/skills/contracts/buildr/task-verification/v4.md');
  for (const value of ['buildr.task-verification/v4', 'buildr.project-verification/v4', 'project verification inspect', 'project verification validate', 'project verification update', 'task verification record', 'task verification inspect', '--expected-report', 'reportDigest', 'Maven、Gradle、npm、Playwright、Browser、HTTP', '不生成计划或统一运行测试']) assert.ok(`${skill}\n${contract}`.includes(value), value);
  for (const value of ['buildr verification plan', 'buildr verification run', 'task verification reconcile', 'Candidate lease', 'proceed / blocked']) assert.equal(skill.includes(value), false, value);
});

test('packaged manifest selects v4 and template is a testing map', () => {
  const manifest = YAML.parse(read('resources/manifest.yml'));
  assert.equal(manifest.capabilityContracts.find((item: any) => item.id === 'buildr.task-verification').version, 4);
  assert.equal(manifest.initialSkillBindings.find((item: any) => item.capability === 'buildr.task-verification').version, 4);
  const provider = manifest.builtins.skills.find((item: any) => item.id === 'task-verification');
  assert.deepEqual(provider.provides, [{ capability: 'buildr.task-verification', version: 4 }]);
  const template = YAML.parse(read('resources/workspace/skills/buildr/task-verification/templates/project-verification.yml'));
  assert.equal(template.schemaVersion, 'buildr.project-verification/v4');
  assert.deepEqual(Object.keys(template).sort(), ['schemaVersion', 'testing']);
});
