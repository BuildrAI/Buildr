import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { describeWebDistTree, inspectLocalWebToolchain, verifyGeneratedWebDist } from '../verification/web-dist.ts';

function fixture(t: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-dist-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root };
}

function fakeBuild(target: any): any  {
  fs.mkdirSync(path.join(target, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(target, 'index.html'), '<main>Buildr</main>');
  fs.writeFileSync(path.join(target, 'assets/app.js'), 'console.log("buildr")');
  fs.writeFileSync(path.join(target, 'assets/app.css'), 'body{}');
}

test('staging web-dist生成闭合manifest并清理owned root', (t: any) => {
  const { root }: any = fixture(t);
  let stagingRoot: any;
  const result: any = verifyGeneratedWebDist({
    temporaryParent: root,
    build(target: any): any  {
      stagingRoot = target;
      fakeBuild(target);
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.fileCount, 3);
  assert.equal(result.manifest.artifacts[0].id, 'web-dist');
  assert.equal(fs.existsSync(path.dirname(stagingRoot)), false, 'owned staging root must be cleaned');
});

test('staging web-dist缺失资源时在Browser前失败并清理', (t: any) => {
  const { root }: any = fixture(t);
  let stagingRoot: any;
  assert.throws(() => verifyGeneratedWebDist({
    temporaryParent: root,
    build(target: any): any  {
      stagingRoot = target;
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'index.html'), '<main>missing assets</main>');
    },
  }), (error: any) => error.code === 'web_dist_inventory_invalid');
  assert.equal(fs.existsSync(path.dirname(stagingRoot)), false, 'failed staging root must be cleaned');
});

test('显式staging输出被保留且不读取陈旧本地dist', (t: any) => {
  const { root }: any = fixture(t);
  const stale: any = path.join(root, 'stale-local-dist');
  const output: any = path.join(root, 'explicit-staging');
  fs.mkdirSync(stale);
  fs.writeFileSync(path.join(stale, 'stale.js'), 'stale');
  const result: any = verifyGeneratedWebDist({ outputRoot: output, build: fakeBuild });
  assert.equal(result.root, output);
  assert.equal(describeWebDistTree(output).length, 3);
  assert.equal(fs.readFileSync(path.join(stale, 'stale.js'), 'utf8'), 'stale');
});

test('Browser build preflight只接受Buildr Web本地TypeScript和Vite', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-toolchain-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  const missing: any = inspectLocalWebToolchain(root);
  assert.equal(missing.status, 'blocked');
  assert.deepEqual(missing.missing, ['typescript', 'vite']);
  for (const name of ['tsc', 'vite']) fs.writeFileSync(path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name), 'fixture');
  const ready: any = inspectLocalWebToolchain(root);
  assert.equal(ready.status, 'ready');
  assert.ok(ready.tools.typescript.startsWith(root));
  assert.ok(ready.tools.vite.startsWith(root));
});
