import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compatibilityVersion, parsePackageCompatibility } from '../../tools/release/package-compatibility.ts';
import { mainCompatibilityFixture, pluginCompatibilityFixture } from '../helpers/package-compatibility-fixtures.ts';

test('public compatibility declarations have one service authority and preserve independent main operation', () => {
  const main = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const plugin = JSON.parse(readFileSync(new URL('../../../dsh-plugin/package.json', import.meta.url), 'utf8'));
  const template = JSON.parse(readFileSync(new URL('../../../dsh-plugin/plugin/package.template.json', import.meta.url), 'utf8'));
  assert.equal(compatibilityVersion(main.version), main.version);
  assert.equal(compatibilityVersion(plugin.version), plugin.version);
  assert.deepEqual(parsePackageCompatibility(main.buildrCompatibility), parsePackageCompatibility(mainCompatibilityFixture));
  assert.deepEqual(parsePackageCompatibility(plugin.buildrCompatibility), parsePackageCompatibility(pluginCompatibilityFixture));
  assert.deepEqual(main.buildrCompatibility.requires, []);
  assert.equal(Object.hasOwn(template, 'buildrCompatibility'), false);
  assert.equal(Object.hasOwn(main.dependencies ?? {}, '@buildr-ai/buildr-dsh-plugin'), false);
});
