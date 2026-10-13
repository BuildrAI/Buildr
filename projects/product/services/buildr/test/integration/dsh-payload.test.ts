import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';
import { createGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';
import { buildApplicationPayload } from '../../tools/release/application-payload.ts';

test('Buildr payload includes the desktop bridge while excluding the retired DSH runtime and independent plugin', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-without-dsh-plugin-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const generated = createGeneratedReleaseInputs(path.join(root, 'generated'));
  const manifest = createGeneratedArtifactManifest({ inputs: { source: 'fixture:no-dsh' }, artifacts: [
    { id: 'test-context', root: generated.testContextRoot },
    { id: 'web-dist', root: generated.webDistRoot },
  ] });
  const result = await buildApplicationPayload(path.join(root, 'payload'), 'b'.repeat(40), {
    generatedArtifactManifest: manifest, webDistRoot: generated.webDistRoot,
  });
  assert.equal(result.manifest.files.some((file: { path: string }) => file.path.includes('/dsh-plugin/')), false);
  assert.equal(result.manifest.files.some((file: { path: string }) => file.path === 'resources/runtime/dsh-agent.mts' || file.path.startsWith('resources/product/resources/runtime/dsh/')), false);
  assert.equal(fs.existsSync(path.join(result.root, 'resources/runtime/dsh-agent.mts')), false);
  const runtime = fs.readFileSync(path.join(result.root, 'runtime/buildr.cjs'), 'utf8');
  assert.ok(runtime.includes('buildr.dsh-desktop-bridge/v1'), 'The actual payload retains the existing desktop transport.');
  for (const retired of ['DshAcpServer', 'dshRuntimeInvocation', 'BUILDR_DSH_INSTALL_ANCHOR', 'runtime/dsh-agent.mts']) assert.equal(runtime.includes(retired), false, retired);
  await assert.rejects(buildApplicationPayload(path.join(root, 'rejected'), 'b'.repeat(40), {
    generatedArtifactManifest: manifest, webDistRoot: generated.webDistRoot, dshPluginRoot: root,
  }), /independently released DSH plugin/);
});
