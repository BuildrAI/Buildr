import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyComposition } from '../../tools/verify-composition.ts';
import { ownedBuildRoot } from '../../tools/prepare-source-sdk.ts';
import { createSdkRequire } from '../../tools/sdk-require.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hostRange = '>=0.2.0-0 <0.3.0-0';
const supportedHosts = ['0.2.0-0', '0.2.0-rc.2', '0.2.0', '0.2.1-rc.2', '0.2.1', '0.2.99-rc.1', '0.2.99'];
const unsupportedHosts = ['0.1.99', '0.1.99-rc.1', '0.3.0-0', '0.3.0-alpha.1', '0.3.0', '0.3.1', '1.0.0'];

for (const [variant, variable] of [['release', 'BUILDR_DSH_COMPOSITION_ROOT'], ['development', 'BUILDR_DSH_COMPOSITION_DEV_ROOT']] as const) {
  test(`${variant} composition and every nested package admit only DSH 0.2.x while retaining exact source identity`, async t => {
    const bundle = process.env[variable];
    if (!bundle) return t.skip('full verification supplies its actually built composition');
    const sdk = process.env.BUILDR_DSH_SDK_ROOT ?? process.env.BUILDR_DSH_SOURCE_SDK_ROOT;
    assert.ok(sdk, 'version matching uses the pinned SDK semver implementation');
    const semver = createSdkRequire(sdk)('semver');
    const compatiblePackages: string[] = [];
    async function visit(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.name === 'package.json') {
          const metadata = JSON.parse(await readFile(file, 'utf8'));
          const peers = metadata.peerDependencies ?? {};
          const label = relative(bundle!, file);
          if (metadata.name?.startsWith('@deepseek-ai/dsh-')) assert.equal(peers['@deepseek-ai/dsh'], hostRange, `${label} must declare the supported Host series`);
          for (const [name, range] of Object.entries(peers)) {
            if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue;
            assert.equal(range, hostRange, `${label}: ${name} must share the Host series`);
            // The upstream DSH loader opts in to prerelease matching.
            for (const version of supportedHosts) assert.equal(semver.satisfies(version, range, { includePrerelease: true }), true, `${label}: ${name} rejects ${version}`);
            for (const version of unsupportedHosts) assert.equal(semver.satisfies(version, range, { includePrerelease: true }), false, `${label}: ${name} admits ${version}`);
          }
          if (peers['@deepseek-ai/dsh']) compatiblePackages.push(label);
        }
      }
    }
    await visit(bundle);
    assert.ok(compatiblePackages.includes('package.json'), 'inspect the public package');
    assert.ok(compatiblePackages.some(file => /^runtime-entry-[^/]+\/package.json$/.test(file)), 'inspect the nested entry');
    assert.ok(compatiblePackages.some(file => /^runtime-host-[^/]+\/packages\/.+\/package.json$/.test(file)), 'inspect the copied Host packages');
    assert.ok(compatiblePackages.some(file => /^runtime-trajectory-[^/]+\/package.json$/.test(file)), 'inspect the trajectory package');
    const metadata = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8'));
    const source = metadata.buildrDshSourceSdk;
    assert.equal(source.upstream.version, '0.2.0-rc.2');
    assert.equal(source.upstream.commit, '639ed015397290b3745d163aafe02ffee4aa3f84');
    assert.match(source.sourceManifestSha256, /^[a-f0-9]{64}$/);
    assert.match(source.sourcePatchSha256, /^[a-f0-9]{64}$/);
    const entry = JSON.parse(await readFile(join(bundle, metadata.buildrComposition.entryDirectory, 'package.json'), 'utf8'));
    assert.deepEqual(entry.buildrDshSourceSdk, source, 'compatibility normalization preserves the exact entry attestation');
  });
}

test('the complete composition survives relocation and rejects a missing installed producer', async t => {
  const bundle = process.env.BUILDR_DSH_COMPOSITION_ROOT;
  if (!bundle) return t.skip('full verification supplies its actually built composition');
  const stage = await mkdtemp(join(ownedBuildRoot(root), 'dsh-composition-package-test-'));
  const relocated = join(stage, 'relocated');
  await cp(bundle, relocated, { recursive: true });
  const checked = await verifyComposition(relocated);
  assert.ok(checked.fileCount > 31, 'the installable package includes the producer and presentation components');
  const manifest = JSON.parse(await readFile(join(relocated, 'package.json'), 'utf8'));
  const gateway = JSON.parse(await readFile(join(relocated, manifest.buildrComposition.entryDirectory, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dsh.client, gateway.dsh.client, 'both native resolution branches find the same public Client declaration');
  const owner = JSON.parse(await readFile(join(relocated, 'runtime-composition/package.json'), 'utf8'));
  assert.equal(owner.dsh?.client, undefined, 'the composition Host owns no duplicate Client declaration');
  const definition = JSON.parse(await readFile(join(relocated, 'runtime-composition/definition.json'), 'utf8'));
  const producer = join(relocated, 'runtime-composition', definition.modules['@deepseek-ai/dsh-tools']);
  await rm(producer);
  await assert.rejects(verifyComposition(relocated), /composition bytes differ/);
  await rm(stage, { recursive: true });
});

test('the complete composition rejects an added install hook', async t => {
  const bundle = process.env.BUILDR_DSH_COMPOSITION_DEV_ROOT;
  if (!bundle) return t.skip('full verification supplies its actually built development composition');
  const stage = await mkdtemp(join(ownedBuildRoot(root), 'dsh-composition-hook-test-'));
  const relocated = join(stage, 'relocated'); await cp(bundle, relocated, { recursive: true });
  const file = join(relocated, 'package.json'), manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.scripts = { postinstall: 'node install.js' }; await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(verifyComposition(relocated), /installation hooks/);
  await rm(stage, { recursive: true });
});
