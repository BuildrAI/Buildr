import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createReleaseArtifact, readReleaseArtifact } from '../../scripts/release/release-artifact.mjs';
import { inspectCandidatePaths } from '../../test/verification/release/open-source-candidate.mjs';
import { readSharedCandidatePackage } from '../../test/verification/release/candidate-package.mjs';
import { resolveReleaseSmokeSource } from '../../test/verification/release/release-smoke.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('open-source candidate ignores tracked paths deleted from the frozen worktree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-open-source-deletion-'));
  try {
    fs.writeFileSync(path.join(root, 'kept.md'), 'public candidate\n');
    assert.deepEqual(inspectCandidatePaths(root, ['kept.md', 'deleted.md']), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('shared candidate package requires a matching immutable tarball and metadata pair', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-candidate-package-'));
  try {
    const tarball = path.join(root, 'buildr-ai-buildr-0.1.0.tgz');
    const metadataPath = path.join(root, 'npm-pack.json');
    fs.writeFileSync(tarball, 'fixture');
    fs.writeFileSync(metadataPath, `${JSON.stringify([{ filename: path.basename(tarball), files: [{ path: 'package.json' }] }])}\n`);
    const shared = readSharedCandidatePackage({
      BUILDR_CANDIDATE_TARBALL: tarball,
      BUILDR_CANDIDATE_PACK_METADATA: metadataPath,
    });
    assert.equal(shared.tarball, tarball);
    assert.deepEqual(shared.metadata.files, [{ path: 'package.json' }]);
    assert.throws(() => readSharedCandidatePackage({ BUILDR_CANDIDATE_TARBALL: tarball }), /requires both/);
    fs.writeFileSync(metadataPath, `${JSON.stringify([{ filename: 'other.tgz', files: [] }])}\n`);
    assert.throws(() => readSharedCandidatePackage({
      BUILDR_CANDIDATE_TARBALL: tarball,
      BUILDR_CANDIDATE_PACK_METADATA: metadataPath,
    }), /filename does not match/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('release artifact preparation packs once and detects mutated bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-artifact-'));
  try {
    const artifact = createReleaseArtifact(serviceRoot, root);
    assert.equal(artifact.manifest.schemaVersion, 'buildr.release-artifact/v1');
    assert.equal(artifact.manifest.packageName, '@buildr-ai/buildr');
    assert.equal(artifact.manifest.version.length > 0, true);
    assert.match(artifact.manifest.sha256, /^[a-f0-9]{64}$/);
    assert.match(artifact.manifest.integrity, /^sha512-/);
    assert.equal(artifact.manifest.inventory.some((entry) => entry.path === 'package.json'), true);
    assert.equal(readReleaseArtifact(artifact.manifestPath).tarball, artifact.tarball);

    const smokeSource = resolveReleaseSmokeSource({ BUILDR_RELEASE_ARTIFACT_MANIFEST: artifact.manifestPath });
    assert.equal(smokeSource.kind, 'release-artifact');
    assert.equal(smokeSource.installTarget, artifact.tarball);
    assert.equal(smokeSource.expectedVersion, artifact.manifest.version);

    fs.appendFileSync(artifact.tarball, 'mutated');
    assert.throws(() => readReleaseArtifact(artifact.manifestPath), /size does not match/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
