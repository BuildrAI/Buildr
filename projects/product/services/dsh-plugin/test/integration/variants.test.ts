import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { channelForPackage } from '../../plugin/platform.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const read = async (relative: string): Promise<string> => fs.readFile(path.join(serviceRoot, relative), 'utf8');

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

test('the package name alone decides which Buildr installation an entry serves', () => {
  assert.equal(channelForPackage('@buildr-ai/buildr-dsh-plugin'), 'npm');
  assert.equal(channelForPackage('@buildr-ai/buildr-dsh-plugin-dev'), 'development');
});

/** A built variant, when present, must carry exactly the identity its package declares. */
async function builtVariant(directory: string) {
  try {
    return {
      manifest: JSON.parse(await read(`build/${directory}/package.json`)) as any,
      client: await read(`build/${directory}/lib/client.js`),
    };
  } catch {
    return null;
  }
}

test('built variants carry their own identity and never each other', async t => {
  const released = await builtVariant('dsh-plugin');
  const development = await builtVariant('dsh-plugin-dev');
  if (released === null || development === null) return t.skip('variants are not built in this workspace');
  assert.equal(released.manifest.name, '@buildr-ai/buildr-dsh-plugin');
  assert.equal(released.manifest.dsh.bundle.patch, 'cordis.patch.yml');
  assert.match(released.client, /ENTRY_ID = true \? "buildr" : "buildr"/);
  assert.match(released.client, /TITLE_KEY = false \? "titleDev" : "title"/);
  assert.match(released.client, /LOCALE = false \? "buildr-dev" : "buildr"/);
  // The literal appears only as the untaken branch of the build-time ternary; what matters is that
  // the released build resolves every identity to the released one.
  assert.equal(/"buildr-dev"/.test(released.client.replace(/false \? "buildr-dev" : "buildr"/g, '')), false,
    'the released entry must not resolve to the development identity');
  assert.equal(development.manifest.name, '@buildr-ai/buildr-dsh-plugin-dev');
  assert.equal(development.manifest.dsh.bundle.patch, 'cordis.dev.patch.yml');
  assert.ok(development.manifest.files.includes('cordis.dev.patch.yml'));
  assert.ok(!development.manifest.files.includes('cordis.patch.yml'));
  assert.match(development.client, /ENTRY_ID = true \? "buildr-dev" : "buildr"/);
  assert.match(development.client, /TITLE_KEY = true \? "titleDev" : "title"/);
  // A locale namespace is a registration key: sharing one means the later package is refused, which
  // is what previously kept the development entry from ever reaching its slot.
  assert.match(development.client, /LOCALE = true \? "buildr-dev" : "buildr"/);
});
