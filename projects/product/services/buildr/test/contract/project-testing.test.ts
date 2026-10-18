import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const taskVerificationTemplate: any = YAML.parse(read('resources/workspace/skills/buildr/task-verification/templates/project-verification.yml'));

const packageManifest: any = YAML.parse(read('resources/manifest.yml'));

test('project-testing 是无状态且无 capability binding 的独立 Skill', () => {
  const packagedSkill: any = packageManifest.builtins.skills.find((item: any) => item.id === 'project-testing');
  assert.ok(packagedSkill);
  assert.equal(packagedSkill.required, false);
  assert.equal(Object.hasOwn(packagedSkill, 'provides'), false);
  assert.equal(Object.hasOwn(packagedSkill, 'requires'), false);
  assert.equal(packageManifest.capabilityContracts.some((item: any) => item.id.includes('project-testing')), false);
  assert.equal(packageManifest.initialSkillBindings.some((item: any) => item.capability.includes('project-testing')), false);
  assert.ok(packageManifest.workspaceFiles.some((entry: any) => String(entry).includes('project-testing/references/testing-model-v1.md')));
});

test('声明指导只使用 project verification v4 testing map', () => {
  assert.equal(taskVerificationTemplate.schemaVersion, 'buildr.project-verification/v4');
  assert.deepEqual(Object.keys(taskVerificationTemplate).sort(), ['schemaVersion', 'testing']);
  const testingKeys: any = Object.keys(taskVerificationTemplate.testing[0]).sort();
  for (const required of ['id', 'scope', 'purpose', 'sourcePaths', 'testRoots', 'full', 'requirements']) assert.equal(testingKeys.includes(required), true, required);
});
