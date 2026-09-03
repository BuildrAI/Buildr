import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import {
  assertGeneratedArtifactManifest,
  createGeneratedArtifactManifest,
  createOwnedArtifactStaging,
  inventoryGeneratedArtifact,
} from '../../tools/build/generated-artifacts.ts';

function fixture(t: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-generated-artifacts-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('生成物manifest按逻辑名称和相对路径稳定排序且不包含绝对路径', (t) => {
  const root = fixture(t);
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  fs.mkdirSync(path.join(first, 'nested'), { recursive: true });
  fs.mkdirSync(second, { recursive: true });
  fs.writeFileSync(path.join(first, 'nested', 'b.js'), 'b\n');
  fs.writeFileSync(path.join(first, 'a.js'), 'a\n');
  fs.writeFileSync(path.join(second, 'index.d.ts'), 'export {};\n');
  const manifest = createGeneratedArtifactManifest({
    inputs: { tool: 'typescript@7.0.2', source: 'sha256-source' },
    artifacts: [{ id: 'test-context', root: second }, { id: 'web-dist', root: first }],
  });
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.id), ['test-context', 'web-dist']);
  assert.deepEqual(manifest.artifacts[1].files.map((file) => file.path), ['a.js', 'nested/b.js']);
  assert.equal(JSON.stringify(manifest).includes(root), false);
  assert.deepEqual(assertGeneratedArtifactManifest(manifest, { 'test-context': second, 'web-dist': first }), manifest);
});

test('相同输入与bytes在两个暂存根生成相同manifest identity', (t) => {
  const root = fixture(t);
  const left = path.join(root, 'left');
  const right = path.join(root, 'right');
  for (const target of [left, right]) {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'index.js'), 'export const value = 1;\n', { mode: 0o644 });
  }
  const build = (target: string) => createGeneratedArtifactManifest({ inputs: { source: 'same' }, artifacts: [{ id: 'runtime', root: target }] });
  assert.deepEqual(build(left), build(right));
});

test('manifest拒绝bytes漂移和符号链接entry', (t) => {
  const root = fixture(t);
  const output = path.join(root, 'output');
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, 'index.js'), 'before\n');
  const manifest = createGeneratedArtifactManifest({ inputs: {}, artifacts: [{ id: 'runtime', root: output }] });
  fs.writeFileSync(path.join(output, 'index.js'), 'after\n');
  assert.throws(() => assertGeneratedArtifactManifest(manifest, { runtime: output }), /generated_artifact_bytes_mismatch/);
  fs.symlinkSync(path.join(output, 'index.js'), path.join(output, 'linked.js'));
  assert.throws(() => inventoryGeneratedArtifact(output), /generated_artifact_entry_invalid/);
});

test('owned cleanup只删除自己创建的暂存且幂等', (t) => {
  const parent = fixture(t);
  const sibling = path.join(parent, 'keep');
  fs.mkdirSync(sibling);
  const staging = createOwnedArtifactStaging(parent);
  fs.writeFileSync(path.join(staging.root, 'output.js'), 'generated\n');
  staging.cleanup();
  staging.cleanup();
  assert.equal(fs.existsSync(staging.root), false);
  assert.equal(fs.existsSync(sibling), true);
});
