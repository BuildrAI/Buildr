import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archivedChangeRoots } from '../../src/modules/openspec/application/change-location.ts';

function archive(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-archive-location-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const archiveRoot = path.join(root, 'archive');
  fs.mkdirSync(archiveRoot, { recursive: true });
  const add = (name: string, marker = true) => {
    const dir = path.join(archiveRoot, name);
    fs.mkdirSync(dir);
    if (marker) fs.writeFileSync(path.join(dir, '.openspec.yaml'), 'schema: spec-driven\n');
    return dir;
  };
  return { archiveRoot, add };
}

test('带日期的变更名归档为同名目录时仍可识别', (t) => {
  const f = archive(t);
  const dir = f.add('2026-11-06-cjk-strong');
  assert.deepEqual(archivedChangeRoots(f.archiveRoot, '2026-11-06-cjk-strong'), [dir]);
});

test('不带日期的变更名接受上游补的日期前缀', (t) => {
  const f = archive(t);
  const dir = f.add('2026-11-06-demo');
  assert.deepEqual(archivedChangeRoots(f.archiveRoot, 'demo'), [dir]);
});

test('多个候选、缺少 .openspec.yaml 或归档目录不存在时不猜测', (t) => {
  const f = archive(t);
  f.add('2026-11-05-demo');
  f.add('2026-11-06-demo');
  assert.equal(archivedChangeRoots(f.archiveRoot, 'demo').length, 2);
  f.add('2026-11-07-other', false);
  assert.deepEqual(archivedChangeRoots(f.archiveRoot, 'other'), []);
  assert.deepEqual(archivedChangeRoots(path.join(f.archiveRoot, 'missing'), 'demo'), []);
});
