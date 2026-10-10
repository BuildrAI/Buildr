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
      manifest: JSON.parse(await fs.readFile(path.join(process.env.BUILDR_DSH_BUNDLE_ROOT ?? path.join(serviceRoot, 'build'), directory, 'package.json'), 'utf8')) as any,
      client: await fs.readFile(path.join(process.env.BUILDR_DSH_BUNDLE_ROOT ?? path.join(serviceRoot, 'build'), directory, 'lib/client.js'), 'utf8'),
    };
  } catch (error) {
    if (process.env.BUILDR_DSH_BUNDLE_ROOT !== undefined) throw error;
    return null;
  }
}

/** Remove only the three exact unreachable identity expressions controlled by the released LOCALE constant. */
function assertReleasedIdentity(client: string): void {
  assert.match(client, /LOCALE = false \? "buildr-dev" : "buildr"/);
  const declarations = 'false ? "buildr-dev" : "buildr"';
  const remote = 'const remoteKey = LOCALE === "buildr-dev" ? "remote.buildr-dev" : "remote.buildr";';
  const view = client.match(/label: \(\) => ctx\d*\.locale\.bind\(LOCALE\)\(LOCALE === "buildr-dev" \? "sourceViewDev" : "sourceView"\)/)?.[0];
  assert.ok(client.includes(remote), 'source readers must select the released Remote namespace from the fixed LOCALE');
  assert.ok(view !== undefined, 'the source tab must select its released label from the fixed LOCALE');
  const reachable = client.replace(declarations, '"buildr"').replace(remote, 'const remoteKey = "remote.buildr";').replace(view!, 'label: () => ctx.locale.bind(LOCALE)("sourceView")');
  assert.equal(/"(?:buildr-dev|remote\.buildr-dev|@buildr-ai\/buildr-dsh-plugin-dev)"/.test(reachable), false,
    'the released entry must not resolve to the development identity');
}
test('released identity scanning does not excuse another development literal or a different conditional', () => {
  const fixture = 'var LOCALE = false ? "buildr-dev" : "buildr";\nconst remoteKey = LOCALE === "buildr-dev" ? "remote.buildr-dev" : "remote.buildr";\nlabel: () => ctx.locale.bind(LOCALE)(LOCALE === "buildr-dev" ? "sourceViewDev" : "sourceView")';
  assert.doesNotThrow(() => assertReleasedIdentity(fixture));
  for (const extra of ['\nconst other = "buildr-dev";', '\nconst namespace = "remote.buildr-dev";', '\nconst name = "@buildr-ai/buildr-dsh-plugin-dev";']) assert.throws(() => assertReleasedIdentity(fixture + extra), /development identity/);
  assert.throws(() => assertReleasedIdentity(fixture.replace('LOCALE === "buildr-dev" ? "remote.buildr-dev"', 'enabled ? "remote.buildr-dev"')), /source readers/);
});

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
