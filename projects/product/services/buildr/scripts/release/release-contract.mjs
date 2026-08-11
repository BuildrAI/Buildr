#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function resolveReleaseContract(version, refName) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Unsupported release version: ${version}`);
  if (refName !== `v${version}`) throw new Error(`Release tag ${refName} does not match package version ${version}.`);
  const prerelease = version.includes('-');
  return {
    version,
    refName,
    npmTag: prerelease ? 'next' : 'latest',
    prerelease,
  };
}

function main() {
  const metadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  const contract = resolveReleaseContract(metadata.version, process.argv[2] || process.env.GITHUB_REF_NAME || '');
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${contract.version}\nnpm_tag=${contract.npmTag}\nprerelease=${contract.prerelease}\n`);
  }
  process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
