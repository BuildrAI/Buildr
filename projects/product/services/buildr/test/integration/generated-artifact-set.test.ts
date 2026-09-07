import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildGeneratedArtifactSet, generatedArtifactManifestName } from '../../tools/build/artifact-set.ts';
import { assertGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';

test('Candidate输入从空暂存生成闭合且可重复的artifact set', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-artifact-set-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = await buildGeneratedArtifactSet(path.join(root, 'first'), { sourceIdentity: 'source:test' });
  const second = await buildGeneratedArtifactSet(path.join(root, 'second'), { sourceIdentity: 'source:test' });
  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(path.basename(first.manifestPath), generatedArtifactManifestName);
  assert.equal(JSON.stringify(first.manifest).includes(root), false);
  assert.deepEqual(first.manifest.artifacts.map((artifact) => artifact.id), ['backend-dto', 'test-context', 'web-dist', 'web-dto']);
  assertGeneratedArtifactManifest(first.manifest, {
    'backend-dto': path.join(first.dtoRoot, 'buildr/src'),
    'web-dto': path.join(first.dtoRoot, 'buildr-web/src'),
    'test-context': first.testContextRoot,
    'web-dist': first.webDistRoot,
  });
  assert.equal(first.manifest.artifacts.find((artifact) => artifact.id === 'backend-dto')?.files.length, 5);
  assert.equal(first.manifest.artifacts.find((artifact) => artifact.id === 'web-dto')?.files.length, 5);
  assert.equal(first.manifest.artifacts.find((artifact) => artifact.id === 'test-context')?.files.length, 14);
  assert.equal(first.manifest.artifacts.find((artifact) => artifact.id === 'web-dist')?.files.some((file) => file.path === 'index.html'), true);
});
