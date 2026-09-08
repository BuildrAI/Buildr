import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';

import { buildGeneratedArtifactSet, generatedArtifactManifestName } from '../../tools/build/artifact-set.ts';
import { assertGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';
import { buildTestContext } from '../../tools/testing/test-context-build.ts';

test('重复生成测试库时，正在读取的模块不会消失或被无谓替换', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-test-context-readable-'));
  const output = path.join(root, 'library');
  const first = buildTestContext(output);
  const files = first.files.map((file) => path.join(output, file.path));
  const before = files.map((file) => fs.statSync(file).mtimeMs);
  const reader = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const fs = require('node:fs');
    let samples = 0; const errors = [];
    const timer = setInterval(() => {
      samples++;
      for (const file of workerData) {
        try { if (!fs.readFileSync(file).length) throw new Error('empty module'); }
        catch (error) { if (errors.length < 8) errors.push(error.message); }
      }
    }, 1);
    parentPort.on('message', () => {
      clearInterval(timer); parentPort.postMessage({ samples, errors }); parentPort.close();
    });
    parentPort.postMessage('ready');
  `, { eval: true, workerData: files });
  t.after(async () => { await reader.terminate(); fs.rmSync(root, { recursive: true, force: true }); });
  await once(reader, 'message');
  buildTestContext(output);
  const completion = once(reader, 'message');
  reader.postMessage('stop');
  const [observed] = await completion;
  assert.ok(observed.samples > 0);
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(files.map((file) => fs.statSync(file).mtimeMs), before);
});

test('Candidate输入从空暂存生成闭合且可重复的artifact set', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-artifact-set-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = await buildGeneratedArtifactSet(path.join(root, 'first'), { sourceIdentity: 'source:test' });
  const second = await buildGeneratedArtifactSet(path.join(root, 'second'), { sourceIdentity: 'source:test' });
  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(path.basename(first.manifestPath), generatedArtifactManifestName);
  assert.equal(JSON.stringify(first.manifest).includes(root), false);
  assert.deepEqual(first.manifest.artifacts.map((artifact) => artifact.id), ['backend-dto', 'test-context', 'web-dist', 'web-dto']);
  assertGeneratedArtifactManifest(first.manifest, {
    'backend-dto': path.join(first.dtoRoot, 'buildr/build/generated'),
    'web-dto': path.join(first.dtoRoot, 'buildr-web/build/generated'),
    'test-context': first.testContextRoot,
    'web-dist': first.webDistRoot,
  });
  assert.equal(first.manifest.artifacts.find((artifact) => artifact.id === 'backend-dto')?.files.length, 5);
  assert.equal(first.manifest.artifacts.find((artifact) => artifact.id === 'web-dto')?.files.length, 5);
  const libraryFiles = first.manifest.artifacts.find((artifact) => artifact.id === 'test-context')?.files.map((file) => file.path) || [];
  assert.equal(libraryFiles.length, 16);
  assert.ok(libraryFiles.includes('public.js'));
  assert.ok(libraryFiles.includes('public.d.ts'));
  assert.equal(first.manifest.artifacts.find((artifact) => artifact.id === 'web-dist')?.files.some((file) => file.path === 'index.html'), true);
});
