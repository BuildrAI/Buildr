#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { parseSemver } from '../../src/system/installation/domain/release-version.ts';
import { extractReleaseNotes } from './release-notes.ts';
import { parseArguments, writeJson } from './release-files.ts';
import { releasePublishAuthority } from './release-authority.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot: any = path.resolve(productRoot, '../../../..');

export const releaseContractSchemaVersion: any = 'buildr.release-contract/v2';
export const releaseProtocolIdentity: any = 'buildr.web-protocol/v1';
export const githubRepository: any = 'BuildrAI/Buildr';

function assertVersion(version: any): any  {
  const parsed: any = parseSemver(version);
  if (!parsed || parsed.version !== version) throw new Error(`Unsupported release version: ${version}`);
  return parsed;
}

function assertCommit(value: any): any  {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error('Release source commit must be a full lowercase 40-character Git commit.');
  return value;
}

function sha256(value: any): any  {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function resolveReleaseContract(version: any, refName: any, options: any = {}): any  {
  const parsedVersion: any = assertVersion(version);
  if (refName !== `v${version}`) throw new Error(`Release tag ${refName} does not match package version ${version}.`);
  const prerelease: any = parsedVersion.prerelease.length > 0;
  const base: any = { version, refName, npmTag: prerelease ? 'next' : 'latest', prerelease };
  if (!options.sourceCommit) return base;
  const sourceCommit: any = assertCommit(options.sourceCommit);
  const protocolIdentity: any = options.protocolIdentity ?? releaseProtocolIdentity;
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

function main(): any  {
  const parsed: any = parseArguments(process.argv.slice(2));
  const metadata: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  const refName: any = parsed.positionals[0] || process.env.GITHUB_REF_NAME || '';
  const changelog: any = fs.readFileSync(path.join(workspaceRoot, 'CHANGELOG.md'), 'utf8');
  const releaseNotes: any = extractReleaseNotes(changelog, metadata.version);
  const contract: any = resolveReleaseContract(metadata.version, refName, {
    sourceCommit: parsed.option('source-commit', process.env.GITHUB_SHA),
    protocolIdentity: parsed.option('protocol-identity', releaseProtocolIdentity),
    enginesNode: metadata.engines?.node,
    releaseNotes,
  });
  const output: any = parsed.option('output');
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
