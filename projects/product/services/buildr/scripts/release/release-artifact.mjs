#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const releaseArtifactSchemaVersion = 'buildr.release-artifact/v1';
export const releaseArtifactManifestName = 'release-artifact.json';
export const releasePackMetadataName = 'npm-pack.json';

function parsePackResult(stdout) {
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`npm pack metadata is invalid: ${error.message}`);
  }
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error('release artifact preparation must produce exactly one npm tarball');
  }
  const [metadata] = payload;
  if (
    typeof metadata?.name !== 'string'
    || typeof metadata?.version !== 'string'
    || typeof metadata?.filename !== 'string'
    || path.basename(metadata.filename) !== metadata.filename
    || !Array.isArray(metadata?.files)
  ) {
    throw new Error('npm pack metadata is missing package identity, filename, or inventory');
  }
  return metadata;
}

function digest(buffer, algorithm, encoding = 'hex') {
  return crypto.createHash(algorithm).update(buffer).digest(encoding);
}

function normalizedInventory(files) {
  return files.map((entry) => ({
    path: entry.path,
    size: entry.size,
    ...(Number.isInteger(entry.mode) ? { mode: entry.mode } : {}),
  }));
}

export function createReleaseArtifact(root, destination, options = {}) {
  const npmExecutable = options.npmExecutable ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  fs.mkdirSync(destination, { recursive: true });
  const result = spawnCommandSync(npmExecutable, ['pack', root, '--pack-destination', destination, '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`npm pack failed with exit ${result.status}: ${(result.stderr || '').trim()}`);
  }

  const metadata = parsePackResult(result.stdout);
  const tarball = path.join(destination, metadata.filename);
  if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`npm pack did not create expected tarball: ${tarball}`);
  }
  const buffer = fs.readFileSync(tarball);
  const integrity = `sha512-${digest(buffer, 'sha512', 'base64')}`;
  if (metadata.integrity && metadata.integrity !== integrity) {
    throw new Error('npm pack integrity does not match the generated tarball bytes');
  }

  const packMetadataPath = path.join(destination, releasePackMetadataName);
  fs.writeFileSync(packMetadataPath, `${result.stdout.trim()}\n`, 'utf8');
  const manifest = {
    schemaVersion: releaseArtifactSchemaVersion,
    packageName: metadata.name,
    version: metadata.version,
    filename: metadata.filename,
    size: buffer.length,
    sha256: digest(buffer, 'sha256'),
    integrity,
    packMetadata: releasePackMetadataName,
    inventory: normalizedInventory(metadata.files),
  };
  const manifestPath = path.join(destination, releaseArtifactManifestName);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, manifestPath, packMetadataPath, tarball };
}

export function readReleaseArtifact(manifestValue, expected = {}) {
  const manifestPath = path.resolve(manifestValue);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`release artifact manifest is invalid: ${error.message}`);
  }
  if (
    manifest?.schemaVersion !== releaseArtifactSchemaVersion
    || typeof manifest?.packageName !== 'string'
    || typeof manifest?.version !== 'string'
    || typeof manifest?.filename !== 'string'
    || path.basename(manifest.filename) !== manifest.filename
    || !Number.isInteger(manifest?.size)
    || !/^[a-f0-9]{64}$/.test(manifest?.sha256 || '')
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(manifest?.integrity || '')
    || !Array.isArray(manifest?.inventory)
  ) {
    throw new Error('release artifact manifest does not satisfy buildr.release-artifact/v1');
  }
  if (expected.packageName && manifest.packageName !== expected.packageName) {
    throw new Error(`release artifact package ${manifest.packageName} does not match ${expected.packageName}`);
  }
  if (expected.version && manifest.version !== expected.version) {
    throw new Error(`release artifact version ${manifest.version} does not match ${expected.version}`);
  }

  const tarball = path.join(path.dirname(manifestPath), manifest.filename);
  if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`release artifact tarball is missing: ${tarball}`);
  }
  const buffer = fs.readFileSync(tarball);
  if (buffer.length !== manifest.size) throw new Error('release artifact tarball size does not match manifest');
  if (digest(buffer, 'sha256') !== manifest.sha256) throw new Error('release artifact tarball SHA-256 does not match manifest');
  if (`sha512-${digest(buffer, 'sha512', 'base64')}` !== manifest.integrity) {
    throw new Error('release artifact tarball integrity does not match manifest');
  }
  return { manifest, manifestPath, tarball };
}

function appendGitHubOutput(artifact) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, [
    `tarball=${artifact.tarball}`,
    `manifest=${artifact.manifestPath}`,
    `pack_metadata=${artifact.packMetadataPath}`,
    `filename=${artifact.manifest.filename}`,
    `integrity=${artifact.manifest.integrity}`,
    '',
  ].join('\n'));
}

function main() {
  const destination = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) throw new Error('Usage: release-artifact.mjs <destination>');
  const artifact = createReleaseArtifact(productRoot, destination);
  appendGitHubOutput(artifact);
  process.stdout.write(`${JSON.stringify(artifact.manifest, null, 2)}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
