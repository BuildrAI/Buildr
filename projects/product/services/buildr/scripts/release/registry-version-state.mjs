#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const officialRegistry = 'https://registry.npmjs.org/';

export async function registryVersionState(packageName, version, fetchImpl = fetch) {
  const url = new URL(`${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`, officialRegistry);
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (response.status === 200) return { package: packageName, version, published: true, registry: officialRegistry };
  if (response.status === 404) return { package: packageName, version, published: false, registry: officialRegistry };
  throw new Error(`Official npm registry version check failed with HTTP ${response.status}.`);
}

async function main() {
  const metadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  const version = process.argv[2] || metadata.version;
  if (version !== metadata.version) throw new Error(`Registry check version ${version} does not match package version ${metadata.version}.`);
  const state = await registryVersionState(metadata.name, version);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `published=${state.published}\n`);
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
