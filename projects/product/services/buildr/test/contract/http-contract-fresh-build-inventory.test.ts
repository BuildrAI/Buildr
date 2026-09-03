import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  HTTP_CONTRACT_FRESH_BUILD_FAMILIES,
  HTTP_CONTRACT_FRESH_BUILD_FILES,
} from '../verification/http-contract-fresh-build-inventory.ts';

const buildrRoot: any = path.resolve(import.meta.dirname, '../..');
const buildrWebRoot: any = path.resolve(buildrRoot, '../buildr-web');

function root(owner: any): any  {
  return owner === 'buildr' ? buildrRoot : buildrWebRoot;
}

test('HTTP contract Fresh Build inventory闭合generator、Schema与两端DTO', () => {
  const ids: any = HTTP_CONTRACT_FRESH_BUILD_FAMILIES.map((item: any) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'HTTP contract family ids must be unique');

  const keys: any = HTTP_CONTRACT_FRESH_BUILD_FILES.map((item: any) => `${item.owner}:${item.path}`);
  assert.equal(new Set(keys).size, keys.length, 'HTTP contract Fresh Build files must be unique');
  for (const item of HTTP_CONTRACT_FRESH_BUILD_FILES) {
    assert.ok(['buildr', 'buildr-web'].includes(item.owner), `unsupported owner: ${item.owner}`);
    assert.equal(fs.existsSync(path.join(root(item.owner), item.path)), true, `${item.owner}:${item.path}`);
  }

  const packageJson: any = JSON.parse(fs.readFileSync(path.join(buildrRoot, 'package.json'), 'utf8'));
  const registeredGenerators: any = new Set(Object.values(packageJson.scripts || {}).flatMap((value: any) =>
    [...String(value).matchAll(/tools\/contracts\/[^\s]+-dto\.(?:mjs|ts)/g)].map((match: any) => match[0])));
  assert.deepEqual(
    [...new Set(HTTP_CONTRACT_FRESH_BUILD_FAMILIES.map((item: any) => item.generator.path))].sort(),
    [...registeredGenerators].sort(),
    'Every registered HTTP DTO generator must own one Fresh Build family',
  );

  for (const item of HTTP_CONTRACT_FRESH_BUILD_FAMILIES) {
    assert.ok(item.sources.length > 0, `${item.id} must declare Schema sources`);
    assert.ok(item.outputs.some((output: any) => output.owner === 'buildr'), `${item.id} must declare a Buildr DTO`);
    assert.ok(item.outputs.some((output: any) => output.owner === 'buildr-web'), `${item.id} must declare a Buildr Web DTO`);
  }
});
