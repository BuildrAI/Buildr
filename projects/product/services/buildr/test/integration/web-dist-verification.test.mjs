import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compareWebDistTrees, describeWebDistTree, verifyTrackedWebDist } from '../verification/web-dist.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-dist-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const tracked = path.join(root, 'tracked');
  fs.mkdirSync(path.join(tracked, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(tracked, 'index.html'), '<main>Buildr</main>');
  fs.writeFileSync(path.join(tracked, 'assets/app.js'), 'console.log("buildr")');
  return { root, tracked };
}

test('staging web-dist exact match passes without mutating the tracked tree and cleans staging', (t) => {
  const { root, tracked } = fixture(t);
  const before = describeWebDistTree(tracked);
  let stagingRoot;
  const result = verifyTrackedWebDist({
    trackedRoot: tracked,
    temporaryParent: root,
    build(target) {
      stagingRoot = target;
      fs.cpSync(tracked, target, { recursive: true });
    },
  });
  assert.deepEqual(result, { status: 'passed', fileCount: 2 });
  assert.deepEqual(describeWebDistTree(tracked), before);
  assert.equal(fs.existsSync(path.dirname(stagingRoot)), false, 'owned staging root must be cleaned');
});

test('staging web-dist drift fails with a bounded diagnostic and still preserves tracked bytes', (t) => {
  const { root, tracked } = fixture(t);
  const before = describeWebDistTree(tracked);
  let stagingRoot;
  assert.throws(() => verifyTrackedWebDist({
    trackedRoot: tracked,
    temporaryParent: root,
    build(target) {
      stagingRoot = target;
      fs.cpSync(tracked, target, { recursive: true });
      fs.writeFileSync(path.join(target, 'assets/app.js'), 'stale');
      fs.writeFileSync(path.join(target, 'assets/extra.css'), 'body{}');
    },
  }), (error) => error.code === 'web_dist_drift'
    && error.details.drift.some((entry) => entry.kind === 'content' && entry.path === 'assets/app.js')
    && error.details.drift.some((entry) => entry.kind === 'unexpected' && entry.path === 'assets/extra.css'));
  assert.deepEqual(describeWebDistTree(tracked), before);
  assert.equal(fs.existsSync(path.dirname(stagingRoot)), false, 'failed staging root must be cleaned');
});

test('tree comparison distinguishes missing files and entry types', (t) => {
  const { root, tracked } = fixture(t);
  const other = path.join(root, 'other');
  fs.mkdirSync(path.join(other, 'index.html'), { recursive: true });
  const result = compareWebDistTrees(tracked, other);
  assert.equal(result.ok, false);
  assert.ok(result.drift.some((entry) => entry.kind === 'type' && entry.path === 'index.html'));
  assert.ok(result.drift.some((entry) => entry.kind === 'missing' && entry.path === 'assets/app.js'));
});
