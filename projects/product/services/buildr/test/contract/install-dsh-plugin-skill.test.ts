import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const skill = fs.readFileSync(path.join(serviceRoot, 'resources/runtime/skills/install-dsh-plugin/SKILL.md'), 'utf8');
const metadata = JSON.parse(fs.readFileSync(path.resolve(serviceRoot, '../dsh-plugin/plugin/package.template.json'), 'utf8'));

test('安装技能引用当前正式插件，并在安装前核对精确版本及兼容范围', () => {
  const packages = [...skill.matchAll(/@buildr-ai\/[a-z][a-z0-9-]*/g)].map(match => match[0]);
  assert.ok(packages.length > 0);
  assert.deepEqual([...new Set(packages)], [metadata.name]);
  assert.ok(skill.includes(`npm view ${metadata.name} dist-tags --json`));
  assert.ok(skill.includes(`npm view ${metadata.name}@<目标版本> version peerDependencies --json`));
  assert.match(skill, /实际 DSH 版本/);
  assert.match(skill, /预发布版本/);
  assert.ok(skill.includes(`${metadata.name}@<已核验版本>`));
});

test('安装技能区分公开来源失效、查询未知和不兼容，不在未知状态安装', () => {
  assert.match(skill, /404.*停止安装/);
  assert.match(skill, /网络.*查询未知/);
  assert.match(skill, /查询未知.*不安装/);
  assert.match(skill, /没有兼容的公开版本.*停止安装/);
});

test('桌面受管配置使用应用管理入口，并保留重启和真实按钮验收', () => {
  assert.match(skill, /`desktop`.*应用.*插件/);
  assert.match(skill, /其他非受管配置档.*dsh plugin --profile/);
  assert.doesNotMatch(skill, /dsh plugin --profile desktop add/);
  assert.match(skill, /完整重启 DSH/);
  assert.match(skill, /真实桌面版确认/);
  assert.match(skill, /不能用“安装成功”代替/);
});
