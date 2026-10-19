import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');

test('package manifests 声明 task-triage optional Git Operations dependency', () => {
  const packageManifest: any = YAML.parse(read('resources/manifest.yml'));
  const dependency: any = { capability: 'buildr.git-operations', version: 1, mode: 'optional' };
  assert.ok(packageManifest.builtins.skills.find((item: any) => item.id === 'task-triage').requires.some((item: any) => JSON.stringify(item) === JSON.stringify(dependency)));
});
