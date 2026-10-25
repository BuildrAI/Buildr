import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { assertReleasedIdentity } from '../helpers/variant-identity.ts';
const serviceRoot = path.resolve(import.meta.dirname, '../..');

/** A built variant, when present, must carry exactly the identity its package declares. */
async function builtVariant(directory: string) {
  try {
    return {
      manifest: JSON.parse(await fs.readFile(path.join(process.env.BUILDR_DSH_BUNDLE_ROOT ?? path.join(serviceRoot, 'build'), directory, 'package.json'), 'utf8')) as any,
      client: await fs.readFile(path.join(process.env.BUILDR_DSH_BUNDLE_ROOT ?? path.join(serviceRoot, 'build'), directory, 'lib/client.js'), 'utf8'),
    };
  } catch (error) {
    if (process.env.BUILDR_DSH_BUNDLE_ROOT !== undefined) throw error;
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
  assertReleasedIdentity(released.client);
  assert.match(released.client, /id: ENTRY_ID/);
  assert.match(released.client, /id:\s*"@buildr-ai\/buildr-dsh-plugin"/);
  assert.match(released.client, /"remote\.buildr"/);
  assert.equal(development.manifest.name, '@buildr-ai/buildr-dsh-plugin-dev');
  assert.equal(development.manifest.dsh.bundle.patch, 'cordis.dev.patch.yml');
  assert.ok(development.manifest.files.includes('cordis.dev.patch.yml'));
  assert.ok(!development.manifest.files.includes('cordis.patch.yml'));
  assert.match(development.client, /ENTRY_ID = true \? "buildr-dev" : "buildr"/);
  assert.match(development.client, /TITLE_KEY = true \? "titleDev" : "title"/);
  // A locale namespace is a registration key: sharing one means the later package is refused, which
  // is what previously kept the development entry from ever reaching its slot.
  assert.match(development.client, /LOCALE = true \? "buildr-dev" : "buildr"/);
  assert.match(development.client, /id: ENTRY_ID/);
  assert.match(development.client, /id:\s*"@buildr-ai\/buildr-dsh-plugin-dev"/);
  assert.match(development.client, /const remoteKey = LOCALE === "buildr-dev" \? "remote\.buildr-dev" : "remote\.buildr-dev";/);
});
