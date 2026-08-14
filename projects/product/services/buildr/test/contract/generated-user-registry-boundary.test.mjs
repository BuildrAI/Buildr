import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { GENERATED_USER_REGISTRY_PACKAGE_SOURCES } from '../../src/infrastructure/product-layout.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

function mappingSource(entry) {
  if (typeof entry === 'string') return entry.split(/\s+=>\s+/u, 1)[0].trim();
  return entry?.source;
}

test('用户 Registry 不作为产品包源或映射存在', () => {
  const manifest = YAML.parse(fs.readFileSync(path.join(serviceRoot, 'package/manifest.yml'), 'utf8'));
  const mappedSources = [...manifest.workspaceFiles, ...manifest.projectFiles].map(mappingSource);

  assert.deepEqual(GENERATED_USER_REGISTRY_PACKAGE_SOURCES, [
    'package/targets/workspace/.buildr/workspace.yml',
    'package/targets/workspace/projects/manifest.yml',
    'package/targets/workspace/rules/manifest.yml',
    'package/targets/workspace/skills/manifest.yml',
    'package/targets/workspace/commands/manifest.yml',
    'package/targets/workspace/components/manifest.yml',
    'package/targets/workspace/projects/capabilities.yml',
    'package/targets/workspace/projects/commands.yml',
    'package/targets/workspace/projects/services/manifest.yml',
  ]);
  for (const relativePath of GENERATED_USER_REGISTRY_PACKAGE_SOURCES) {
    assert.equal(fs.existsSync(path.join(serviceRoot, relativePath)), false, relativePath);
    assert.equal(mappedSources.includes(relativePath), false, relativePath);
  }
});

test('产品内容 YAML 仍由包发布，不与用户 Registry 混淆', () => {
  const targetRoot = path.join(serviceRoot, 'package/targets/workspace');
  const yamlFiles = fs.readdirSync(targetRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => path.relative(targetRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
  assert.equal(yamlFiles.every((relativePath) => relativePath.startsWith('skills/') || relativePath.startsWith('commands/buildr/') || relativePath.startsWith('components/buildr/')), true);
  for (const relativePath of [
    'package/targets/workspace/components/buildr/openspec/component.yml',
    'package/targets/workspace/commands/buildr/openspec/manifest.yml',
    'package/targets/workspace/skills/buildr/task-manager/agents/openai.yaml',
  ]) {
    assert.equal(fs.statSync(path.join(serviceRoot, relativePath)).isFile(), true, relativePath);
  }
});
