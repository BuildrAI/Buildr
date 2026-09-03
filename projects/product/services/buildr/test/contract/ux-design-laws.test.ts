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
  assert.deepEqual(packaged.runtimes, ['claude-code', 'codex', 'cursor', 'qoder', 'trae', 'trae-work', 'workbuddy']);
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
  assert.match(index, /2026-09-03/);
  assert.match(index, /CC BY-NC-ND 4\.0/);
  assert.match(index, /https:\/\/note\.mowen\.cn\/detail\/j7A9Kf2PtKqhvm1qzwzJU/);
  assert.doesNotMatch(`${index}\n${references}`, /\[TODO|TBD|PLACEHOLDER/);
});

test('ux-design-laws 从真实证据选择法则并保持原型、实现和用户利益边界', () => {
  const skill: any = read(`${skillRoot}/SKILL.md`);
  assert.match(skill, /设计.*审查.*权衡/s);
  assert.match(skill, /主要用户、首要任务、使用环境、平台与输入方式/);
  assert.match(skill, /一至两个相关分组/);
  assert.match(skill, /证据.*影响.*法则.*建议.*权衡.*验证/s);
  assert.match(skill, /默认给出最重要的三至五项/);
  assert.match(skill, /法则是启发式原则/);
  assert.match(skill, /安全、隐私、无障碍与结果可逆性/);
  assert.match(skill, /真实状态/);
  assert.match(skill, /不生成原型、不修改代码/);
  assert.match(skill, /用户明确要求产出原型或实现时/);
  assert.doesNotMatch(skill, /生成自包含 HTML|浏览器验证|修改前端代码/);

  const uiPrototype: any = read('resources/workspace/skills/buildr/ui-prototype/SKILL.md');
  assert.match(uiPrototype, /未明确确认时不得使用/);
});

test('ux-design-laws Codex 元数据保持自动发现和默认提示一致', () => {
  const metadata: any = YAML.parse(read(`${skillRoot}/agents/openai.yaml`));
  assert.equal(metadata.interface.display_name, '用户体验设计法则');
  assert.match(metadata.interface.short_description, /设计、审查和权衡/);
  assert.match(metadata.interface.default_prompt, /\$ux-design-laws/);
  assert.equal(metadata.policy.allow_implicit_invocation, true);
});
