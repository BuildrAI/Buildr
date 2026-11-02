import { readVerifiedReadonlyBytes } from './verified-readonly-file.ts';
import fs from 'node:fs';
import path from 'node:path';

import { RESOURCE_WORKSPACE_ROOT } from '../product-layout.ts';
import { resolveProductRoot } from '../product-resources/index.ts';

const pattern = () => /<!-- buildr:required begin -->(?:(?!<!-- buildr:required begin -->)[\s\S])*?<!-- buildr:required end -->/g;
const sourceFile = () => path.join(resolveProductRoot(), RESOURCE_WORKSPACE_ROOT, 'AGENTS.md');

// Historical source proof only. Never install or repair this block in user workspaces.
export function readPackageRequiredBlock(options: { requireRootProof?: boolean } = {}): string {
  const root = path.resolve(resolveProductRoot());
  const source = options.requireRootProof
    ? new TextDecoder('utf-8', { fatal: true }).decode(readVerifiedReadonlyBytes(root, path.join(RESOURCE_WORKSPACE_ROOT, 'AGENTS.md').split(path.sep).join('/'), 512 * 1024))
    : fs.readFileSync(sourceFile(), 'utf8');
  const blocks = [...source.matchAll(pattern())];
  if (blocks.length !== 1) throw new Error('Package AGENTS.md must contain exactly one Buildr required block.');
  return blocks[0][0];
}
