import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const forbiddenNodeBoundaries = new Set([
  'child_process', 'cluster', 'dgram', 'fs', 'http', 'http2', 'https', 'net', 'tls', 'worker_threads',
]);

function directBoundaryImports(layer) {
  const directory = path.join(productRoot, 'test', layer);
  const violations = [];
  for (const file of fs.readdirSync(directory).filter((entry) => entry.endsWith('.test.mjs')).sort()) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"]node:([^/'"]+)/g)) {
      if (forbiddenNodeBoundaries.has(match[1])) violations.push(`${layer}/${file}: node:${match[1]}`);
    }
  }
  return violations;
}

test('Unit 与 Component 不直接穿过真实进程、网络或文件系统边界', () => {
  assert.deepEqual(directBoundaryImports('unit'), []);
  assert.deepEqual(directBoundaryImports('component'), []);
});
