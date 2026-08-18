import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const workspaceTarget = path.join(serviceRoot, 'package/targets/workspace');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');

test('ui-preview 作为无 capability contract 的 optional builtin Skill 投射', () => {
  const manifest = YAML.parse(read('package/manifest.yml'));
  const packaged = manifest.builtins.skills.find((skill) => skill.id === 'ui-preview');
  assert.ok(packaged);
  assert.equal(packaged.required, false);
  assert.equal(packaged.path, 'package/targets/workspace/skills/buildr/ui-preview');
  assert.equal(packaged.target, 'skills/buildr/ui-preview');
  assert.deepEqual(packaged.provides, undefined);
  assert.deepEqual(packaged.requires, undefined);
  assert.equal(packaged.runtimes.length, 7);
  assert.equal(manifest.capabilityContracts.some((item) => item.id.includes('ui-preview')), false);
  assert.equal(manifest.initialSkillBindings.some((item) => item.capability.includes('ui-preview')), false);
  assert.ok(manifest.workspaceFiles.includes('package/targets/workspace/skills/buildr/ui-preview/SKILL.md => skills/buildr/ui-preview/SKILL.md copy'));
});

test('ui-preview Skill 保持明确确认、真实 UI、完整页面与浏览器验证边界', () => {
  const skill = read('package/targets/workspace/skills/buildr/ui-preview/SKILL.md');
  assert.match(skill, /未明确确认时不得使用/);
  assert.match(skill, /当前对话中存在用户.*明确确认/s);
  assert.match(skill, /调查现有真实界面/);
  assert.match(skill, /完整页面/);
  assert.match(skill, /<!-- buildr:ui-preview -->/);
  assert.match(skill, /自包含 HTML/);
  assert.match(skill, /浏览器验证/);
  assert.match(skill, /不是正式设计稿、生产原型、像素级验收标准/);
  assert.match(skill, /编码式原型/);
  assert.doesNotMatch(skill, /ui-visual-redesign/);
});

test('UI 影响任务只询问并在明确确认后路由独立 Skill', () => {
  const triage = read('package/targets/workspace/skills/buildr/task-triage/SKILL.md');
  const development = read('package/targets/workspace/skills/buildr/task-development/SKILL.md');
  const fragments = [
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md',
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md',
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md',
  ].map(read);
  for (const source of [triage, development, ...fragments]) {
    assert.match(source, /界面预演稿（UI Preview）/);
    assert.match(source, /明确确认/);
    assert.match(source, /不.*阻塞|继续/s);
    assert.match(source, /独立 `ui-preview` Skill/);
  }
});

test('OpenSpec component 修改后的 UI Preview fragments 具备 matching integrity', () => {
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
