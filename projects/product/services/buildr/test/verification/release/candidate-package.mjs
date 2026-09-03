import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnCommandSync } from '../../../src/infrastructure/process.mjs';
import { buildApplicationPayload } from '../../../tools/release/application-payload.mjs';
import { createReleaseArtifact, readReleaseArtifact } from '../../../tools/release/release-artifact.mjs';

export const CANDIDATE_TARBALL_ENV = 'BUILDR_CANDIDATE_TARBALL';
export const CANDIDATE_PACK_METADATA_ENV = 'BUILDR_CANDIDATE_PACK_METADATA';
export const CANDIDATE_RELEASE_MANIFEST_ENV = 'BUILDR_CANDIDATE_RELEASE_MANIFEST';

function parsePackMetadata(metadataPath) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    throw new Error(`candidate pack metadata is invalid: ${error.message}`);
  }
  if (!Array.isArray(payload) || payload.length !== 1 || typeof payload[0]?.filename !== 'string' || !Array.isArray(payload[0]?.files)) {
    throw new Error('candidate pack metadata must contain exactly one npm pack result with files');
  }
  return payload[0];
}

export function readSharedCandidatePackage(env = process.env) {
  const tarballValue = env[CANDIDATE_TARBALL_ENV];
  const metadataValue = env[CANDIDATE_PACK_METADATA_ENV];
  const manifestValue = env[CANDIDATE_RELEASE_MANIFEST_ENV];
  if (!tarballValue && !metadataValue && !manifestValue) return null;
  if (!tarballValue || !metadataValue) throw new Error('shared candidate package requires both tarball and pack metadata');

  const tarball = path.resolve(tarballValue);
  const metadataPath = path.resolve(metadataValue);
  if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) throw new Error(`shared candidate tarball is missing: ${tarball}`);
  if (!fs.statSync(metadataPath, { throwIfNoEntry: false })?.isFile()) throw new Error(`shared candidate pack metadata is missing: ${metadataPath}`);
  const metadata = parsePackMetadata(metadataPath);
  if (path.basename(tarball) !== metadata.filename) throw new Error('shared candidate tarball filename does not match pack metadata');
  if (!manifestValue) return { tarball, metadataPath, metadata };
  const artifact = readReleaseArtifact(manifestValue, {
    packageName: metadata.name,
    version: metadata.version,
  });
  if (artifact.tarball !== tarball) throw new Error('shared candidate release manifest does not bind the candidate tarball');
  return { tarball, metadataPath, metadata, manifestPath: artifact.manifestPath, manifest: artifact.manifest };
}

export async function createCandidatePackage(productRoot, destination, options = {}) {
  const { buildGeneratedArtifactSet } = await import('../../../tools/build/artifact-set.ts');
  const npmExecutable = options.npmExecutable ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  fs.mkdirSync(destination, { recursive: true });
  const source = spawnCommandSync('git', ['rev-parse', 'HEAD'], {
    cwd: productRoot,
    encoding: 'utf8',
  });
  if (source.status !== 0 || !/^[a-f0-9]{40,64}$/.test(source.stdout.trim())) {
    throw new Error(`candidate source commit is unavailable: ${(source.stderr || source.stdout || '').trim()}`);
  }
  const generated = await buildGeneratedArtifactSet(path.join(destination, 'generated-artifacts'), { sourceIdentity: source.stdout.trim() });
  const payload = await buildApplicationPayload(path.join(destination, 'application-payload'), source.stdout.trim(), {
    generatedArtifactManifest: generated.manifest,
    webDistRoot: generated.webDistRoot,
  });
  const artifact = createReleaseArtifact(payload.root, destination, { npmExecutable, testContextRoot: generated.testContextRoot });
  const metadata = parsePackMetadata(artifact.packMetadataPath);
  return {
    tarball: artifact.tarball,
    metadataPath: artifact.packMetadataPath,
    metadata,
    manifestPath: artifact.manifestPath,
    manifest: artifact.manifest,
    payloadRoot: payload.root,
    payloadManifest: payload.manifest,
    generatedArtifactManifest: generated.manifest,
    stdout: '',
    stderr: '',
  };
}
