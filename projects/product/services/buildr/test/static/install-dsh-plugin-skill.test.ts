import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const skill = fs.readFileSync(path.join(serviceRoot, 'resources/runtime/skills/install-dsh-plugin/SKILL.md'), 'utf8');
const metadata = JSON.parse(fs.readFileSync(path.resolve(serviceRoot, '../dsh-plugin/plugin/package.template.json'), 'utf8'));

test('安装技能引用当前正式插件包身份', () => {
  const packages = [...skill.matchAll(/@buildr-ai\/[a-z][a-z0-9-]*/g)].map(match => match[0]);
  assert.ok(packages.length > 0);
  assert.deepEqual([...new Set(packages)], [metadata.name]);
});
