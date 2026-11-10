#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { inspectLocalWebToolchain, buildWebDist } from '../../tools/build/web-dist.ts';
import { createGeneratedArtifactManifest, createOwnedArtifactStaging, inventoryGeneratedArtifact } from '../../tools/build/generated-artifacts.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot: any = path.resolve(productRoot, '../buildr-web');

export { inspectLocalWebToolchain, buildWebDist };

export function describeWebDistTree(root: any): any  {
  return inventoryGeneratedArtifact(root);
}

function defaultBuild(stagingRoot: any): any  {
  buildWebDist(stagingRoot, webRoot);
}

export function verifyGeneratedWebDist({ outputRoot = null, build = defaultBuild, temporaryParent = os.tmpdir() }: any = {}): any  {
  const owned: any = outputRoot ? null : createOwnedArtifactStaging(temporaryParent, 'buildr-web-dist-verification-');
  const stagingRoot: any = path.resolve(outputRoot || path.join(owned.root, 'web-dist'));
  try {
    build(stagingRoot);
    const files: any = inventoryGeneratedArtifact(stagingRoot);
    if (!files.some((entry: any) => entry.path === 'index.html')) throw Object.assign(new Error('Buildr Web staging dist is missing index.html.'), { code: 'web_dist_inventory_invalid' });
    if (!files.some((entry: any) => entry.path.endsWith('.js')) || !files.some((entry: any) => entry.path.endsWith('.css'))) throw Object.assign(new Error('Buildr Web staging dist must contain JavaScript and CSS assets.'), { code: 'web_dist_inventory_invalid' });
    const manifest: any = createGeneratedArtifactManifest({ inputs: { source: 'current-buildr-web' }, artifacts: [{ id: 'web-dist', root: stagingRoot }] });
    return { status: 'passed', root: stagingRoot, fileCount: files.length, manifest };
  } finally {
    owned?.cleanup();
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const outputIndex: any = process.argv.indexOf('--output');
    const outputRoot: any = outputIndex < 0 ? null : process.argv[outputIndex + 1];
    if (outputIndex >= 0 && (!outputRoot || outputRoot.startsWith('--'))) throw new Error('--output requires a directory.');
    const result: any = verifyGeneratedWebDist({ outputRoot });
    process.stdout.write(`${JSON.stringify({ status: result.status, root: outputRoot ? result.root : null, fileCount: result.fileCount, manifest: result.manifest }, null, 2)}\n`);
  } catch (error: any) {
    process.stderr.write(`${error.code || 'web_dist_build_failed'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
