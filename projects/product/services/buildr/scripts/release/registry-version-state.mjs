#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { parseSemver } from '../../src/domain/release-version.mjs';
import { readReleaseArtifact } from './release-artifact.mjs';
import { writeJson } from './release-files.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const officialRegistry = 'https://registry.npmjs.org/';

async function responseJson(response, label) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

export async function registryVersionState(packageName, version, fetchImpl = fetch) {
  const url = new URL(`${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`, officialRegistry);
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (response.status === 404) return { package: packageName, version, published: false, registry: officialRegistry };
  if (response.status !== 200) throw new Error(`Official npm registry version check failed with HTTP ${response.status}.`);
  const metadata = await responseJson(response, 'Official npm registry version check');
  if (metadata?.name !== packageName || metadata?.version !== version || typeof metadata?.dist?.integrity !== 'string') {
    throw new Error('Official npm registry version metadata is missing the expected identity or dist.integrity.');
  }
  return {
    package: packageName,
    version,
    published: true,
    registry: officialRegistry,
    integrity: metadata.dist.integrity,
    shasum: metadata.dist.shasum ?? null,
    tarball: metadata.dist.tarball ?? null,
  };
}

export function assertRegistryArtifact(state, artifact) {
  if (!state.published) return;
  if (state.package !== artifact.packageName || state.version !== artifact.version) {
    throw new Error('Official npm registry package identity does not match the release artifact.');
  }
  if (state.integrity !== artifact.integrity) {
    throw new Error(`Official npm registry integrity mismatch for ${state.package}@${state.version}.`);
  }
}

export async function registryDistTagsState(packageName, fetchImpl = fetch) {
  const url = new URL(encodeURIComponent(packageName), officialRegistry);
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (response.status !== 200) throw new Error(`Official npm registry dist-tag check failed with HTTP ${response.status}.`);
  const metadata = await responseJson(response, 'Official npm registry dist-tag check');
  return {
    schemaVersion: 'buildr.registry-dist-tags/v1',
    package: packageName,
    tags: {
      latest: metadata?.['dist-tags']?.latest ?? null,
      next: metadata?.['dist-tags']?.next ?? null,
    },
    registry: officialRegistry,
  };
}

export async function registryTagState(packageName, npmTag, fetchImpl = fetch) {
  const state = await registryDistTagsState(packageName, fetchImpl);
  return { package: packageName, npmTag, version: state.tags[npmTag] ?? null, registry: officialRegistry };
}

function assertTagState(value, packageName, label) {
  if (!value || value.schemaVersion !== 'buildr.registry-dist-tags/v1' || value.package !== packageName) {
    throw new Error(`${label} must be a buildr.registry-dist-tags/v1 snapshot for ${packageName}.`);
  }
  if (!value.tags || typeof value.tags !== 'object' || Array.isArray(value.tags)) throw new Error(`${label}.tags must be an object.`);
  for (const tag of ['latest', 'next']) {
    if (value.tags[tag] !== null && typeof value.tags[tag] !== 'string') throw new Error(`${label}.tags.${tag} must be a string or null.`);
  }
  return value;
}

export function assertRegistryTagTransition({ packageName, version, npmTag, before, after }) {
  const parsed = parseSemver(version);
  if (!parsed) throw new Error(`Release version is not valid semver: ${version}.`);
  const expectedTag = parsed.prerelease.length ? 'next' : 'latest';
  if (npmTag !== expectedTag) throw new Error(`Release version ${version} must publish to ${expectedTag}, not ${npmTag}.`);
  const frozen = assertTagState(before, packageName, 'Before dist-tags');
  const observed = assertTagState(after, packageName, 'After dist-tags');
  const targetBefore = frozen.tags[npmTag];
  if (targetBefore) {
    const targetBeforeParsed = parseSemver(targetBefore);
    if (!targetBeforeParsed) throw new Error(`Before dist-tag ${npmTag} is not valid semver: ${targetBefore}.`);
    if (npmTag === 'next' && targetBeforeParsed.prerelease.length === 0) {
      throw new Error(`Before dist-tag next points to stable version ${targetBefore}; candidate publish is blocked.`);
    }
  }
  const targetAfter = observed.tags[npmTag];
  if (targetAfter !== version) throw new Error(`Official npm registry dist-tag ${npmTag} points to ${targetAfter ?? 'nothing'}, not ${version}.`);
  const targetAfterParsed = parseSemver(targetAfter);
  if (!targetAfterParsed || Boolean(targetAfterParsed.prerelease.length) !== (npmTag === 'next')) {
    throw new Error(`After dist-tag ${npmTag} has the wrong semver type: ${targetAfter}.`);
  }
  const otherTag = npmTag === 'next' ? 'latest' : 'next';
  if (observed.tags[otherTag] !== frozen.tags[otherTag]) {
    throw new Error(`Official npm registry non-target dist-tag ${otherTag} changed from ${frozen.tags[otherTag] ?? 'nothing'} to ${observed.tags[otherTag] ?? 'nothing'}.`);
  }
  return { targetTag: npmTag, targetVersion: version, unchangedTag: otherTag, unchangedVersion: observed.tags[otherTag] };
}

export async function confirmRegistryRelease({ packageName, version, npmTag, integrity, beforeTags, fetchImpl = fetch }) {
  const versionState = await registryVersionState(packageName, version, fetchImpl);
  if (!versionState.published) throw new Error(`Official npm registry does not contain ${packageName}@${version}.`);
  assertRegistryArtifact(versionState, { packageName, version, integrity });
  const afterTags = await registryDistTagsState(packageName, fetchImpl);
  const transition = assertRegistryTagTransition({ packageName, version, npmTag, before: beforeTags, after: afterTags });
  return { ...versionState, npmTag, taggedVersion: afterTags.tags[npmTag], beforeTags, afterTags, transition };
}

export async function waitForRegistryRelease(contract, options = {}) {
  const attempts = options.attempts ?? 12;
  const delayMs = options.delayMs ?? 5000;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await confirmRegistryRelease({ ...contract, fetchImpl: options.fetchImpl ?? fetch });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error(`Official npm registry did not converge after ${attempts} attempts: ${lastError.message}`);
}

function parseArgs(argv) {
  const options = { version: argv[0], manifest: null, npmTag: null, requirePublished: false, wait: false, snapshotTags: null, beforeTags: null, output: null };
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--manifest') options.manifest = argv[++index];
    else if (value === '--tag') options.npmTag = argv[++index];
    else if (value === '--require-published') options.requirePublished = true;
    else if (value === '--wait') options.wait = true;
    else if (value === '--snapshot-tags') options.snapshotTags = argv[++index];
    else if (value === '--before-tags') options.beforeTags = argv[++index];
    else if (value === '--output') options.output = argv[++index];
    else throw new Error(`Unsupported registry check option: ${value}`);
  }
  if ((options.requirePublished || options.wait) && (!options.manifest || !options.npmTag || !options.beforeTags)) {
    throw new Error('--require-published and --wait require --manifest, --tag and --before-tags');
  }
  return options;
}

async function main() {
  const metadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  const options = parseArgs(process.argv.slice(2));
  const version = options.version || metadata.version;
  if (version !== metadata.version) throw new Error(`Registry check version ${version} does not match package version ${metadata.version}.`);
  const artifact = options.manifest
    ? readReleaseArtifact(options.manifest, { packageName: metadata.name, version }).manifest
    : null;

  if (options.snapshotTags) {
    const tags = await registryDistTagsState(metadata.name);
    writeJson(path.resolve(options.snapshotTags), tags);
  }

  let state;
  if (options.wait) {
    state = await waitForRegistryRelease({
      packageName: metadata.name,
      version,
      npmTag: options.npmTag,
      integrity: artifact.integrity,
      beforeTags: JSON.parse(fs.readFileSync(path.resolve(options.beforeTags), 'utf8')),
    });
  } else {
    state = await registryVersionState(metadata.name, version);
    if (artifact) assertRegistryArtifact(state, artifact);
    if (options.requirePublished && !state.published) {
      throw new Error(`Official npm registry does not contain ${metadata.name}@${version}.`);
    }
  }
  if (options.output) writeJson(path.resolve(options.output), state);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `published=${state.published}\n`);
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
