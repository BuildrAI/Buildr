import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';
import { createGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';
import { buildApplicationPayload } from '../../tools/release/application-payload.ts';

test('Buildr release payload excludes the independently published DSH plugin', async t => {
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
  await assert.rejects(buildApplicationPayload(path.join(root, 'rejected'), 'b'.repeat(40), {
    generatedArtifactManifest: manifest, webDistRoot: generated.webDistRoot, dshPluginRoot: root,
  }), /independently released DSH plugin/);
});
