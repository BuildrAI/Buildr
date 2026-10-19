import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { assetIntegrity } from '../../src/modules/agent-assets/infrastructure/component-source.ts';
import { parseCapabilityContract } from '../../src/modules/agent-assets/persistence/skill-manifest.ts';
import { validateTaskRecordSkillCommands } from '../../tools/verification/package-check/static-validation.ts';

const workspace = path.resolve(import.meta.dirname, '../../resources/workspace');
const read = (relative: string): string => fs.readFileSync(path.join(workspace, relative), 'utf8');
const skill = (id: string): string => read(`skills/buildr/${id}/SKILL.md`);
const fragment = (name: string): string => read(`components/buildr/openspec/contributions/${name}.md`);

test('task-manager 保持记录命令兼容，形成记录正文并保护过程材料与显式导入', () => {
  const manager = skill('task-manager');
  assert.deepEqual(validateTaskRecordSkillCommands(manager), []);
});

test('current-knowledge v4 退役变更说明，不接管任务正文与所有过程报告', () => {
  assert.equal(assetIntegrity(path.join(workspace, 'skills/contracts/buildr/current-knowledge-maintenance/v3.md')), 'sha256-8449c6486d0db88f78d775d6e367a278b726376b84d896cbd77c568e9940b64b', '旧 v3 协作保证必须原样保留');
  for (const [id, version] of [['task-record', 4], ['task-review', 2], ['task-verification', 4], ['current-knowledge-maintenance', 4]] as const) {
    const parsed = parseCapabilityContract(path.join(workspace, `skills/contracts/buildr/${id}/v${version}.md`));
    assert.equal(parsed.id, `buildr.${id}`);
    assert.equal(parsed.version, version);
  }
});

test('OpenSpec source integrity 使用真实成员内容，增强只迁移 knowledge v4 requires', () => {
  const component = YAML.parse(read('components/buildr/openspec/component.yml'));
  for (const entry of component.integrity as string[]) {
    const [relative, expected] = entry.split('=');
    assert.equal(assetIntegrity(path.join(workspace, relative)), expected, relative);
  }
  for (const id of ['openspec-propose', 'openspec-update-change', 'openspec-apply-change']) {
    assert.ok(component.contributions.skillDependencies.some((entry: { skill: string; capability: string; version: number; mode: string }) => entry.skill === id && entry.capability === 'buildr.current-knowledge-maintenance' && entry.version === 4 && entry.mode === 'required'));
  }
});

test('变更说明退役保持 OpenSpec 1.13.0 上游来源不变', () => {
  const component = YAML.parse(read('components/buildr/openspec/component.yml'));
  assert.deepEqual(component.upstream, { name: '@fission-ai/openspec', version: '1.13.0' });
  const upstream = {
    'openspec-explore': '500fca4e0ae48c58f11af0467d0ec6adc48912e2236cbd4d7eda6d63771f7754',
    'openspec-propose': '45600f776574c2e4f653c0c483f5c4c3f2c9698a800a5b1eb01e9b745d8082d6',
    'openspec-update-change': 'ccfbfe61f4d64cafed50a6652c46a19491106dbd9d8df25a3b65b5fae24616a5',
    'openspec-apply-change': '3784f26f0ff6008e677e0262d5549e26c7b16f8856e5d32e0bf9452bee64e1ff',
    'openspec-sync-specs': 'f6bb88404830058a17feb7e261a1aeab884a6fb89bdee4cf1a9ad33000064e1e',
    'openspec-archive-change': '917e77290f5cc266f4e881cda18e527b69ed7b4d0e4cfbaf4ce710f4b763a8de',
  };
  for (const [id, digest] of Object.entries(upstream)) {
    const relative = `skills/openspec/${id}`;
    assert.equal(assetIntegrity(path.join(workspace, relative)), `sha256-${digest}`, id);
    assert.ok(component.integrity.includes(`${relative}=sha256-${digest}`), id);
  }
});
