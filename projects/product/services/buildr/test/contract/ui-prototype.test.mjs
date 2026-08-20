import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const workspaceTarget = path.join(serviceRoot, 'package/targets/workspace');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');

test('ui-prototype 作为无 capability contract 的 optional builtin Skill 投射', () => {
  const manifest = YAML.parse(read('package/manifest.yml'));
  const packaged = manifest.builtins.skills.find((skill) => skill.id === 'ui-prototype');
  assert.ok(packaged);
  assert.equal(packaged.required, false);
  assert.equal(packaged.path, 'package/targets/workspace/skills/buildr/ui-prototype');
  assert.equal(packaged.target, 'skills/buildr/ui-prototype');
  assert.deepEqual(packaged.provides, undefined);
  assert.deepEqual(packaged.requires, undefined);
  assert.equal(packaged.runtimes.length, 7);
  assert.equal(manifest.capabilityContracts.some((item) => item.id.includes('ui-prototype')), false);
  assert.equal(manifest.initialSkillBindings.some((item) => item.capability.includes('ui-prototype')), false);
  assert.ok(manifest.workspaceFiles.includes('package/targets/workspace/skills/buildr/ui-prototype/SKILL.md => skills/buildr/ui-prototype/SKILL.md copy'));
  assert.equal(manifest.builtins.skills.some((skill) => skill.id === 'ui-preview'), false);
  assert.equal(manifest.workspaceFiles.some((item) => item.includes('/ui-preview/')), false);
});

test('ui-prototype Skill 保持明确确认、真实 UI、完整页面与浏览器验证边界', () => {
  const skill = read('package/targets/workspace/skills/buildr/ui-prototype/SKILL.md');
  assert.match(skill, /未明确确认时不得使用/);
  assert.match(skill, /当前对话中存在用户.*明确确认/s);
  assert.match(skill, /调查现有真实界面/);
  assert.match(skill, /完整页面/);
  assert.match(skill, /<!-- buildr:ui-prototype -->/);
  assert.match(skill, /自包含 HTML/);
  assert.match(skill, /浏览器验证/);
  assert.match(skill, /必须生成多个原型页面/);
  assert.match(skill, /逐一打开每个 HTML 文件/);
  assert.match(skill, /后续 Agent 在正式前端编辑前必须读取全部相关原型/);
  assert.match(skill, /只有用户.*明确要求忽略原型时才可以不采用/s);
  assert.match(skill, /不是正式设计稿、生产原型、像素级验收标准/);
  assert.match(skill, /编码式原型/);
  assert.doesNotMatch(skill, /ui-visual-redesign/);
});

test('UI 影响任务路由 selected Skill 并默认按已有原型开发', () => {
  const triage = read('package/targets/workspace/skills/buildr/task-triage/SKILL.md');
  const development = read('package/targets/workspace/skills/buildr/task-development/SKILL.md');
  const fragments = [
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md',
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md',
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md',
  ].map(read);
  for (const source of [triage, development, ...fragments]) {
    assert.match(source, /界面原型（UI Prototype）/);
    assert.match(source, /明确确认/);
    assert.match(source, /不.*阻塞|继续/s);
    assert.match(source, /selected `ui-prototype` Skill/);
    assert.match(source, /用户未明确要求忽略|用户没有明确要求忽略|除非用户明确要求忽略/);
    assert.match(source, /读取全部相关原型/);
  }
});

test('OpenSpec component 修改后的 UI Prototype fragments 具备 matching integrity', () => {
  const component = YAML.parse(fs.readFileSync(path.join(workspaceTarget, 'components/buildr/openspec/component.yml'), 'utf8'));
  const integrity = new Map(component.integrity.map((entry) => entry.split('=')));
  for (const relative of [
    'components/buildr/openspec/contributions/openspec-propose-sidebar.md',
    'components/buildr/openspec/contributions/openspec-update-sidebar.md',
    'components/buildr/openspec/contributions/openspec-apply-sidebar.md',
  ]) {
    const digest = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(workspaceTarget, relative))).digest('hex')}`;
    assert.equal(integrity.get(relative), digest, relative);
  }
});
