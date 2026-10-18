import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const skillRoot: any = 'resources/workspace/skills/buildr/ux-design-laws';
const referenceFiles: any[] = [
  'references/foundations-and-strategy.md',
  'references/information-and-decisions.md',
  'references/visual-perception-and-layout.md',
  'references/actions-and-feedback.md',
  'references/journey-motivation-and-memory.md',
];
const companionFiles: any[] = [
  'SKILL.md',
  'agents/openai.yaml',
  'references/law-index.md',
  ...referenceFiles,
];

test('ux-design-laws 作为无 capability contract 的 optional builtin Skill 投射完整目录', () => {
  const manifest: any = YAML.parse(read('resources/manifest.yml'));
  const skill: any = read(`${skillRoot}/SKILL.md`);
  const frontmatterDescription: any = skill.match(/^description: (.+)$/m)?.[1];
  const packaged: any = manifest.builtins.skills.find((entry: any) => entry.id === 'ux-design-laws');

  assert.ok(packaged);
  assert.equal(packaged.path, skillRoot);
  assert.equal(packaged.target, 'skills/buildr/ux-design-laws');
  assert.equal(packaged.description, frontmatterDescription);
  assert.equal(packaged.required, false);
  assert.equal(Object.hasOwn(packaged, 'runtimes'), false, '通用技能不维护品牌白名单');
  assert.equal(packaged.provides, undefined);
  assert.equal(packaged.requires, undefined);
  assert.equal(manifest.capabilityContracts.some((entry: any) => entry.id.includes('ux-design-laws')), false);
  assert.equal(manifest.initialSkillBindings.some((entry: any) => entry.capability.includes('ux-design-laws')), false);

  for (const relative of companionFiles) {
    assert.equal(fs.existsSync(path.join(serviceRoot, skillRoot, relative)), true, relative);
    assert.ok(
      manifest.workspaceFiles.includes(`${skillRoot}/${relative} => skills/buildr/ux-design-laws/${relative} copy`),
      relative,
    );
  }
});

test('ux-design-laws 覆盖 30 个主题并保持卡片和来源完整', () => {
  const references: any = referenceFiles.map((relative: any) => read(`${skillRoot}/${relative}`)).join('\n');
  const lawHeadings: any = [...references.matchAll(/^## .+（.+）$/gm)].map(([heading]: any) => heading);
  const sourceUrls: any = [...references.matchAll(/https:\/\/lawsofux\.com\/[^)]+/g)].map(([url]: any) => url);

  assert.equal(lawHeadings.length, 30);
  assert.equal(new Set(lawHeadings).size, 30);
  assert.equal(sourceUrls.length, 30);
  assert.equal(new Set(sourceUrls).size, 30);
  for (const field of ['关注', '信号', '动作', '警戒', '验证', '来源']) {
    assert.equal((references.match(new RegExp(`^- \\*\\*${field}\\*\\*：`, 'gm')) || []).length, 30, field);
  }

  const index: any = read(`${skillRoot}/references/law-index.md`);
  assert.match(index, /CC BY-NC-ND 4\.0/);
  assert.match(index, /https:\/\/note\.mowen\.cn\/detail\/j7A9Kf2PtKqhvm1qzwzJU/);
  assert.doesNotMatch(`${index}\n${references}`, /\[TODO|TBD|PLACEHOLDER/);
});

test('ux-design-laws Codex 元数据保持自动发现和默认提示一致', () => {
  const metadata: any = YAML.parse(read(`${skillRoot}/agents/openai.yaml`));
  assert.match(metadata.interface.default_prompt, /\$ux-design-laws/);
  assert.equal(metadata.policy.allow_implicit_invocation, true);
});
