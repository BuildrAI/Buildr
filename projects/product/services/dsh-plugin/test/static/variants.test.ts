import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
const serviceRoot = path.resolve(import.meta.dirname, '../..');
const read = (relative: string) => fs.readFile(path.join(serviceRoot, relative), 'utf8');

/** The two variants are one code base with two identities; a release ships only the first. */
test('a build-time identity difference is all that separates the released and development entries', async () => {
  const source = await read('plugin/src/client.tsx');
  assert.match(source, /__BUILDR_ENTRY_ID__/, 'the client must take its entry id from the build');
  assert.match(source, /__BUILDR_TITLE_KEY__/, 'the client must take its label from the build');
  const template = JSON.parse(await read('plugin/package.template.json')) as any;
  assert.equal(template.name, '@buildr-ai/buildr-dsh-plugin');
  assert.equal(template.dsh.bundle.patch, 'cordis.patch.yml');
  // The development entry is declared for a developer's own profile and is not the shipped one.
  const devPatch = await read('plugin/cordis.dev.patch.yml');
  assert.match(devPatch, /id: buildr-dev/);
  assert.match(devPatch, /@buildr-ai\/buildr-dsh-plugin-dev/);
});
