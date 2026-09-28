import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';
import { createGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';
import { buildApplicationPayload } from '../../tools/release/application-payload.ts';
import { assertUnboundDshPlugin } from '../../tools/dsh/plugin-artifact.ts';

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-payload-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bundle = path.join(root, 'dsh-plugin');
  fs.mkdirSync(path.join(bundle, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(bundle, 'package.json'), JSON.stringify({ name: '@buildr-ai/dsh-plugin', version: '0.1.0', private: true, dsh: { bundle: { patch: 'cordis.patch.yml' } } }));
  fs.writeFileSync(path.join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'buildr', name: '@buildr-ai/dsh-plugin', disabled: true }] }]));
  fs.writeFileSync(path.join(bundle, 'lib/index.js'), 'export function apply() {}\n');
  fs.writeFileSync(path.join(bundle, 'lib/client.js'), '// compiled client fixture\n');
  const generated = createGeneratedReleaseInputs(path.join(root, 'generated'));
  const manifest = () => createGeneratedArtifactManifest({ inputs: { source: 'fixture:dsh' }, artifacts: [
    { id: 'test-context', root: generated.testContextRoot }, { id: 'web-dist', root: generated.webDistRoot }, { id: 'dsh-plugin', root: bundle },
  ] });
  return { root, bundle, generated, manifest };
}

test('payload consumes an explicit identity-bound DSH artifact and excludes plugin source', async t => {
  const value = fixture(t);
  const result = await buildApplicationPayload(path.join(value.root, 'payload'), 'b'.repeat(40), {
    generatedArtifactManifest: value.manifest(), webDistRoot: value.generated.webDistRoot, dshPluginRoot: value.bundle,
  });
  const files = result.manifest.files.map((file: any) => file.path);
  assert.ok(files.includes('resources/product/build/dsh-plugin/lib/client.js'));
  assert.ok(files.includes('resources/product/build/dsh-plugin/cordis.patch.yml'));
  assert.equal(files.some((file: string) => file.includes('/resources/runtime/dsh/')), false);
  assert.equal(files.some((file: string) => /\.(?:ts|tsx|mts)$/.test(file) && !file.endsWith('.d.ts')), false);
  assert.deepEqual(fs.readFileSync(path.join(result.root, 'resources/product/build/dsh-plugin/lib/client.js')), fs.readFileSync(path.join(value.bundle, 'lib/client.js')));
});

test('payload refuses local bindings, source code, missing roots and artifact drift before writing', async t => {
  const value = fixture(t);
  const output = path.join(value.root, 'not-created');
  const options = { generatedArtifactManifest: value.manifest(), webDistRoot: value.generated.webDistRoot, dshPluginRoot: value.bundle };
  await assert.rejects(buildApplicationPayload(output, 'b'.repeat(40), { ...options, dshPluginRoot: undefined }), /matching manifest and explicit root/);
  fs.appendFileSync(path.join(value.bundle, 'lib/client.js'), '// changed\n');
  await assert.rejects(buildApplicationPayload(output, 'b'.repeat(40), options), /generated_artifact_bytes_mismatch: dsh-plugin/);
  fs.writeFileSync(path.join(value.bundle, 'cordis.patch.yml'), JSON.stringify([{ id: 'buildr', name: '@buildr-ai/dsh-plugin', config: { binding: { nodeExecutable: '/local/private/path' } } }]));
  await assert.rejects(buildApplicationPayload(output, 'b'.repeat(40), { ...options, generatedArtifactManifest: value.manifest() }), /must_be_unbound/);
  fs.writeFileSync(path.join(value.bundle, 'lib/source.ts'), 'export const source = true;\n');
  assert.throws(() => assertUnboundDshPlugin(value.bundle), /contains_typescript_source/);
  assert.equal(fs.existsSync(output), false);
});

/**
 * A release that loses its DSH plugin does so silently, because the payload only carries the
 * artifact when the manifest declares it. These guard the three places where that can happen.
 */
test('a release candidate refuses to build without the DSH plugin artifact, unless excluded', async () => {
  const { resolveReleaseDshPluginRoot } = await import('../../tools/build/artifact-set.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-plugin-root-'));
  try {
    const bundle = path.join(root, 'bundle');
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, 'package.json'), JSON.stringify({ name: '@buildr-ai/dsh-plugin' }));
    // The conventional location is searched only under the given service root, so this stays
    // independent from whether the machine running the tests happens to have a built artifact.
    const empty = path.join(root, 'service');
    fs.mkdirSync(empty, { recursive: true });
    assert.equal(resolveReleaseDshPluginRoot({ BUILDR_DSH_PLUGIN_ROOT: bundle }, empty), bundle);
    assert.equal(resolveReleaseDshPluginRoot({ BUILDR_DSH_PLUGIN_EXCLUDE: '1' }, empty), undefined);
    assert.throws(() => resolveReleaseDshPluginRoot({}, empty), /dsh_plugin_artifact_missing/);
    // The conventional build output is picked up without naming it, which is what a release does.
    fs.mkdirSync(path.join(empty, 'build/dsh-plugin'), { recursive: true });
    fs.writeFileSync(path.join(empty, 'build/dsh-plugin/package.json'), JSON.stringify({ name: '@buildr-ai/dsh-plugin' }));
    assert.equal(resolveReleaseDshPluginRoot({}, empty), path.join(empty, 'build/dsh-plugin'));
    // A declared root that is not a bundle is refused rather than copied as a mystery directory.
    assert.throws(() => resolveReleaseDshPluginRoot({ BUILDR_DSH_PLUGIN_ROOT: root }, empty), /not_a_bundle/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('payload verification refuses a payload that declares the plugin but ships none of it', async t => {
  const { verifyApplicationPayload } = await import('../../src/infrastructure/product-resources/index.ts');
  const value = fixture(t);
  const result = await buildApplicationPayload(path.join(value.root, 'payload'), 'b'.repeat(40), {
    generatedArtifactManifest: value.manifest(), webDistRoot: value.generated.webDistRoot, dshPluginRoot: value.bundle,
  });
  verifyApplicationPayload(result.root, { layout: 'frozen' });
  for (const file of result.manifest.files) {
    if (file.path.startsWith('resources/product/build/dsh-plugin/')) {
      fs.rmSync(path.join(result.root, file.path), { force: true });
    }
  }
  assert.throws(() => verifyApplicationPayload(result.root, { layout: 'frozen' }), /missing|digest|declares the DSH plugin/);
});
