import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

// These tests own the static contract between packaged assets, manifests, and public guidance.
const read: any = (path: any) => fs.readFileSync(path, 'utf8');
const packageManifest: any = YAML.parse(read('resources/manifest.yml'));

test('capability-adaptation 作为 optional 管理 Skill 发布且不声明空洞 capability', () => {
  const packaged: any = packageManifest.builtins.skills.find((skill: any) => skill.id === 'capability-adaptation');
  assert.ok(packaged);
  assert.equal(packaged.required, false);
  assert.deepEqual(packaged.provides, undefined);
  assert.deepEqual(packaged.requires, undefined);
  assert.equal(Object.hasOwn(packaged, 'runtimes'), false, '通用技能不维护品牌白名单');
});
