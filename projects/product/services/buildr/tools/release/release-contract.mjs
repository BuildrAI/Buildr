#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { parseSemver } from '../../src/system/installation/domain/release-version.ts';
import { extractReleaseNotes } from './release-notes.mjs';
import { parseArguments, writeJson } from './release-files.mjs';
import { releasePublishAuthority } from './release-authority.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(productRoot, '../../../..');

export const releaseContractSchemaVersion = 'buildr.release-contract/v2';
export const releaseProtocolIdentity = 'buildr.web-protocol/v1';
export const githubRepository = 'BuildrAI/Buildr';

function assertVersion(version) {
  const parsed = parseSemver(version);
  if (!parsed || parsed.version !== version) throw new Error(`Unsupported release version: ${version}`);
  return parsed;
}

function assertCommit(value) {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error('Release source commit must be a full lowercase 40-character Git commit.');
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function resolveReleaseContract(version, refName, options = {}) {
  const parsedVersion = assertVersion(version);
  if (refName !== `v${version}`) throw new Error(`Release tag ${refName} does not match package version ${version}.`);
  const prerelease = parsedVersion.prerelease.length > 0;
  const base = { version, refName, npmTag: prerelease ? 'next' : 'latest', prerelease };
  if (!options.sourceCommit) return base;
  const sourceCommit = assertCommit(options.sourceCommit);
  const protocolIdentity = options.protocolIdentity ?? releaseProtocolIdentity;
  if (protocolIdentity !== releaseProtocolIdentity) throw new Error(`Unsupported protocol identity: ${protocolIdentity}`);
  if (typeof options.releaseNotes !== 'string' || !options.releaseNotes.trim()) throw new Error('Release notes are required by the release contract.');
  if (typeof options.enginesNode !== 'string' || !options.enginesNode.trim()) throw new Error('Release contract requires the npm package engines.node range.');
  return {
    schemaVersion: releaseContractSchemaVersion,
    packageName: '@buildr-ai/buildr',
    ...base,
    tag: refName,
    sourceTag: refName,
    sourceCommit,
    protocolIdentity,
    enginesNode: options.enginesNode,
    releaseNotes: { title: refName, sha256: sha256(options.releaseNotes), source: 'CHANGELOG.md' },
    github: {
      repository: githubRepository,
      releaseUrl: `https://github.com/${githubRepository}/releases/tag/${refName}`,
      latest: !prerelease,
      binaryAssets: false,
    },
    publishAuthority: releasePublishAuthority,
    distribution: {
      channel: 'npm',
      registry: 'https://registry.npmjs.org/',
      package: '@buildr-ai/buildr',
    },
  };
}

function main() {
  const parsed = parseArguments(process.argv.slice(2));
  const metadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  const refName = parsed.positionals[0] || process.env.GITHUB_REF_NAME || '';
  const changelog = fs.readFileSync(path.join(workspaceRoot, 'CHANGELOG.md'), 'utf8');
  const releaseNotes = extractReleaseNotes(changelog, metadata.version);
  const contract = resolveReleaseContract(metadata.version, refName, {
    sourceCommit: parsed.option('source-commit', process.env.GITHUB_SHA),
    protocolIdentity: parsed.option('protocol-identity', releaseProtocolIdentity),
    enginesNode: metadata.engines?.node,
    releaseNotes,
  });
  const output = parsed.option('output');
  if (output) writeJson(path.resolve(output), contract);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, [
      `version=${contract.version}`,
      `npm_tag=${contract.npmTag}`,
      `prerelease=${contract.prerelease}`,
      ...(output ? [`contract=${path.resolve(output)}`] : []),
      '',
    ].join('\n'));
  }
  process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
