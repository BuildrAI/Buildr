import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const workspaceTarget: any = path.join(serviceRoot, 'resources/workspace');
const read: any = (relative: any) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');

test('ui-prototype 作为无 capability contract 的 optional builtin Skill 投射', () => {
  const manifest: any = YAML.parse(read('resources/manifest.yml'));
  const packaged: any = manifest.builtins.skills.find((skill: any) => skill.id === 'ui-prototype');
  assert.ok(packaged);
  assert.equal(packaged.required, false);
  assert.equal(packaged.path, 'resources/workspace/skills/buildr/ui-prototype');
  assert.equal(packaged.target, 'skills/buildr/ui-prototype');
  assert.deepEqual(packaged.provides, undefined);
  assert.deepEqual(packaged.requires, undefined);
  assert.equal(Object.hasOwn(packaged, 'runtimes'), false, '通用技能不维护品牌白名单');
  assert.equal(manifest.capabilityContracts.some((item: any) => item.id.includes('ui-prototype')), false);
  assert.equal(manifest.initialSkillBindings.some((item: any) => item.capability.includes('ui-prototype')), false);
  assert.ok(manifest.workspaceFiles.includes('resources/workspace/skills/buildr/ui-prototype/SKILL.md => skills/buildr/ui-prototype/SKILL.md copy'));
  for (const file of ['assets/feature-notes.js','assets/feature-notes.css','references/feature-notes.md']) {
    assert.ok(manifest.workspaceFiles.includes(`resources/workspace/skills/buildr/ui-prototype/${file} => skills/buildr/ui-prototype/${file} copy`));
    assert.ok(fs.existsSync(path.join(workspaceTarget,'skills/buildr/ui-prototype',file)));
  }
  assert.equal(manifest.builtins.skills.some((skill: any) => skill.id === 'ui-preview'), false);
  assert.equal(manifest.workspaceFiles.some((item: any) => item.includes('/ui-preview/')), false);
});

test('OpenSpec component 修改后的 UI Prototype fragments 具备 matching integrity', () => {
  const component: any = YAML.parse(fs.readFileSync(path.join(workspaceTarget, 'components/buildr/openspec/component.yml'), 'utf8'));
  const integrity: any = new Map(component.integrity.map((entry: any) => entry.split('=')));
  for (const relative of [
    'components/buildr/openspec/contributions/openspec-propose-sidebar.md',
    'components/buildr/openspec/contributions/openspec-update-sidebar.md',
    'components/buildr/openspec/contributions/openspec-apply-sidebar.md',
  ]) {
    const digest: any = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(workspaceTarget, relative))).digest('hex')}`;
    assert.equal(integrity.get(relative), digest, relative);
  }
});
