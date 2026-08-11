import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnCommandSync } from '../../../src/infrastructure/process.mjs';

export const CANDIDATE_TARBALL_ENV = 'BUILDR_CANDIDATE_TARBALL';
export const CANDIDATE_PACK_METADATA_ENV = 'BUILDR_CANDIDATE_PACK_METADATA';

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
  if (!tarballValue && !metadataValue) return null;
  if (!tarballValue || !metadataValue) throw new Error('shared candidate package requires both tarball and pack metadata');

  const tarball = path.resolve(tarballValue);
  const metadataPath = path.resolve(metadataValue);
  if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) throw new Error(`shared candidate tarball is missing: ${tarball}`);
  if (!fs.statSync(metadataPath, { throwIfNoEntry: false })?.isFile()) throw new Error(`shared candidate pack metadata is missing: ${metadataPath}`);
  const metadata = parsePackMetadata(metadataPath);
  if (path.basename(tarball) !== metadata.filename) throw new Error('shared candidate tarball filename does not match pack metadata');
  return { tarball, metadataPath, metadata };
}

export function createCandidatePackage(productRoot, destination, options = {}) {
  const npmExecutable = options.npmExecutable ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  fs.mkdirSync(destination, { recursive: true });
  const result = spawnCommandSync(npmExecutable, ['pack', productRoot, '--pack-destination', destination, '--json'], {
    cwd: productRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`npm pack failed with exit ${result.status}: ${(result.stderr || '').trim()}`);
  const metadataPath = path.join(destination, 'npm-pack.json');
  fs.writeFileSync(metadataPath, `${result.stdout.trim()}\n`, 'utf8');
  const metadata = parsePackMetadata(metadataPath);
  const tarball = path.join(destination, metadata.filename);
  if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) throw new Error(`npm pack did not create expected tarball: ${tarball}`);
  return { tarball, metadataPath, metadata, stdout: result.stdout, stderr: result.stderr };
}
