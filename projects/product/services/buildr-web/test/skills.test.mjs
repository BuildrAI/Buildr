import assert from 'node:assert/strict';
import test from 'node:test';
import { filterSkills, resolveSkillLink, skillActionPrompt } from '../src/features/agent-assets/skill-presentation.ts';
const skill = { id: 'ux', title: '用户体验', description: '审查流程', sourceLabel: 'Buildr 提供', sourcePath: 'skills/ux', enabled: true };
test('技能搜索覆盖用途且与来源筛选相交', () => {
  assert.equal(filterSkills([skill], '审查', '').length, 1);
  assert.equal(filterSkills([skill], 'UX', 'Buildr 提供').length, 1);
  assert.equal(filterSkills([skill], '', '外部').length, 0);
});
test('资料链接保持技能根边界并支持同级与父级引用', () => {
  assert.equal(resolveSkillLink('SKILL.md', 'references/guide.md'), 'references/guide.md');
  assert.equal(resolveSkillLink('references/guide.md', '../SKILL.md#内容'), 'SKILL.md');
  for (const value of ['../secret.md', '%2e%2e/secret.md', '/etc/passwd', 'file:test', 'a\\b', '%zz']) assert.equal(resolveSkillLink('SKILL.md', value), null);
});
test('维护指令携带工作空间与技能身份，并要求重新核对源和同步', () => {
  const prompt = skillActionPrompt('/workspace/one', 'adjust', '优先三个问题', skill);
  assert.match(prompt, /\/workspace\/one/); assert.match(prompt, /"ux"/); assert.match(prompt, /优先三个问题/); assert.match(prompt, /核对维护归属/); assert.match(prompt, /必要同步/);
  assert.match(skillActionPrompt('/workspace/two', 'add', '/candidate'), /\/candidate/);
});
