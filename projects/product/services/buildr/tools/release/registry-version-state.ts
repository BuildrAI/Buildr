#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { parseSemver } from '../../src/system/installation/domain/release-version.ts';
import { readReleaseArtifact } from './release-artifact.ts';
import { writeJson } from './release-files.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const officialRegistry: any = 'https://registry.npmjs.org/';

async function responseJson(response: any, label: any): Promise<any>  {
  try {
    return await response.json();
  } catch (error: any) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

export async function registryVersionState(packageName: any, version: any, fetchImpl: any = fetch): Promise<any>  {
  const url: any = new URL(`${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`, officialRegistry);
  const response: any = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (response.status === 404) return { package: packageName, version, published: false, registry: officialRegistry };
  if (response.status !== 200) throw new Error(`Official npm registry version check failed with HTTP ${response.status}.`);
  const metadata: any = await responseJson(response, 'Official npm registry version check');
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

export function assertRegistryArtifact(state: any, artifact: any): any  {
  if (!state.published) return;
  if (state.package !== artifact.packageName || state.version !== artifact.version) {
    throw new Error('Official npm registry package identity does not match the release artifact.');
  }
  if (state.integrity !== artifact.integrity) {
    throw new Error(`Official npm registry integrity mismatch for ${state.package}@${state.version}.`);
  }
}

export async function registryDistTagsState(packageName: any, fetchImpl: any = fetch): Promise<any>  {
  const url: any = new URL(encodeURIComponent(packageName), officialRegistry);
  const response: any = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (response.status !== 200) throw new Error(`Official npm registry dist-tag check failed with HTTP ${response.status}.`);
  const metadata: any = await responseJson(response, 'Official npm registry dist-tag check');
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

export async function registryTagState(packageName: any, npmTag: any, fetchImpl: any = fetch): Promise<any>  {
  const state: any = await registryDistTagsState(packageName, fetchImpl);
  return { package: packageName, npmTag, version: state.tags[npmTag] ?? null, registry: officialRegistry };
}

function assertTagState(value: any, packageName: any, label: any): any  {
  if (!value || value.schemaVersion !== 'buildr.registry-dist-tags/v1' || value.package !== packageName) {
    throw new Error(`${label} must be a buildr.registry-dist-tags/v1 snapshot for ${packageName}.`);
  }
  if (!value.tags || typeof value.tags !== 'object' || Array.isArray(value.tags)) throw new Error(`${label}.tags must be an object.`);
  for (const tag of ['latest', 'next']) {
    if (value.tags[tag] !== null && typeof value.tags[tag] !== 'string') throw new Error(`${label}.tags.${tag} must be a string or null.`);
  }
  return value;
}

export function assertRegistryTagTransition({ packageName, version, npmTag, before, after }: any): any  {
  const parsed: any = parseSemver(version);
  if (!parsed) throw new Error(`Release version is not valid semver: ${version}.`);
  const expectedTag: any = parsed.prerelease.length ? 'next' : 'latest';
  if (npmTag !== expectedTag) throw new Error(`Release version ${version} must publish to ${expectedTag}, not ${npmTag}.`);
  const frozen: any = assertTagState(before, packageName, 'Before dist-tags');
  const observed: any = assertTagState(after, packageName, 'After dist-tags');
  const targetBefore: any = frozen.tags[npmTag];
  if (targetBefore) {
    const targetBeforeParsed: any = parseSemver(targetBefore);
    if (!targetBeforeParsed) throw new Error(`Before dist-tag ${npmTag} is not valid semver: ${targetBefore}.`);
    if (npmTag === 'next' && targetBeforeParsed.prerelease.length === 0) {
      throw new Error(`Before dist-tag next points to stable version ${targetBefore}; candidate publish is blocked.`);
    }
  }
  const targetAfter: any = observed.tags[npmTag];
  if (targetAfter !== version) throw new Error(`Official npm registry dist-tag ${npmTag} points to ${targetAfter ?? 'nothing'}, not ${version}.`);
  const targetAfterParsed: any = parseSemver(targetAfter);
  if (!targetAfterParsed || Boolean(targetAfterParsed.prerelease.length) !== (npmTag === 'next')) {
    throw new Error(`After dist-tag ${npmTag} has the wrong semver type: ${targetAfter}.`);
  }
  const otherTag: any = npmTag === 'next' ? 'latest' : 'next';
  if (observed.tags[otherTag] !== frozen.tags[otherTag]) {
    throw new Error(`Official npm registry non-target dist-tag ${otherTag} changed from ${frozen.tags[otherTag] ?? 'nothing'} to ${observed.tags[otherTag] ?? 'nothing'}.`);
  }
  return { targetTag: npmTag, targetVersion: version, unchangedTag: otherTag, unchangedVersion: observed.tags[otherTag] };
}

export async function confirmRegistryRelease({ packageName, version, npmTag, integrity, beforeTags, fetchImpl = fetch }: any): Promise<any>  {
  const versionState: any = await registryVersionState(packageName, version, fetchImpl);
  if (!versionState.published) throw new Error(`Official npm registry does not contain ${packageName}@${version}.`);
  assertRegistryArtifact(versionState, { packageName, version, integrity });
  const afterTags: any = await registryDistTagsState(packageName, fetchImpl);
  const transition: any = assertRegistryTagTransition({ packageName, version, npmTag, before: beforeTags, after: afterTags });
  return { ...versionState, npmTag, taggedVersion: afterTags.tags[npmTag], beforeTags, afterTags, transition };
}

export async function waitForRegistryRelease(contract: any, options: any = {}): Promise<any>  {
  const attempts: any = options.attempts ?? 12;
  const delayMs: any = options.delayMs ?? 5000;
  const sleep: any = options.sleep ?? ((milliseconds: any) => new Promise((resolve: any) => setTimeout(resolve, milliseconds)));
  let lastError: any;
  for (let attempt: any = 1; attempt <= attempts; attempt += 1) {
    try {
      return await confirmRegistryRelease({ ...contract, fetchImpl: options.fetchImpl ?? fetch });
    } catch (error: any) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error(`Official npm registry did not converge after ${attempts} attempts: ${lastError.message}`);
}

function parseArgs(argv: any): any  {
  const options: any = { version: argv[0], manifest: null, npmTag: null, requirePublished: false, wait: false, snapshotTags: null, beforeTags: null, output: null };
  for (let index: any = 1; index < argv.length; index += 1) {
    const value: any = argv[index];
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

async function main(): Promise<any>  {
  const metadata: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  const options: any = parseArgs(process.argv.slice(2));
  const version: any = options.version || metadata.version;
  if (version !== metadata.version) throw new Error(`Registry check version ${version} does not match package version ${metadata.version}.`);
  const artifact: any = options.manifest
    ? readReleaseArtifact(options.manifest, { packageName: metadata.name, version }).manifest
    : null;

  if (options.snapshotTags) {
    const tags: any = await registryDistTagsState(metadata.name);
    writeJson(path.resolve(options.snapshotTags), tags);
  }

  let state: any;
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
  main().catch((error: any) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
