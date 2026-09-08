import fs from 'node:fs';
import path from 'node:path';

import { RESOURCE_WORKSPACE_ROOT } from '../product-layout.ts';
import { resolveProductRoot } from '../product-resources/index.ts';
import { atomicWriteFile } from './atomic-files.ts';

const START = '<!-- buildr:required begin -->';
const END = '<!-- buildr:required end -->';
const pattern = () => /<!-- buildr:required begin -->(?:(?!<!-- buildr:required begin -->)[\s\S])*?<!-- buildr:required end -->/g;
const sourceFile = () => path.join(resolveProductRoot(), RESOURCE_WORKSPACE_ROOT, 'AGENTS.md');

function packageRequiredBlock(): string {
  const source = fs.readFileSync(sourceFile(), 'utf8');
  const blocks = [...source.matchAll(pattern())];
  if (blocks.length !== 1) throw new Error('Package AGENTS.md must contain exactly one Buildr required block.');
  return blocks[0][0];
}

export function ensureRootRequiredBlock(targetRoot: string, changed: string[] = []): boolean {
  const file = path.join(targetRoot, 'AGENTS.md');
  const existing = fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file, 'utf8') : '';
  const block = packageRequiredBlock();
  let inserted = false;
  let next = '';
  let offset = 0;
  const withoutMarkers = (text: string) => text.replaceAll(START, '').replaceAll(END, '');
  for (const match of existing.matchAll(pattern())) {
    next += withoutMarkers(existing.slice(offset, match.index));
    next += inserted ? '' : block;
    inserted = true;
    offset = match.index! + match[0].length;
  }
  next += withoutMarkers(existing.slice(offset));
  if (!inserted) next = `${block}\n${next}`;
  if (next === existing) return false;
  atomicWriteFile(file, next, 'utf8');
  changed.push('AGENTS.md');
  return true;
}

export function rootRequiredBlockStatus(targetRoot: string) {
  const file = path.join(targetRoot, 'AGENTS.md');
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return { exists: false, valid: false, path: 'AGENTS.md' };
  const content = fs.readFileSync(file, 'utf8');
  const blocks = [...content.matchAll(pattern())];
  return {
    exists: true,
    valid: blocks.length === 1 && blocks[0][0] === packageRequiredBlock()
      && content.split(START).length === 2 && content.split(END).length === 2,
    path: 'AGENTS.md',
  };
}
