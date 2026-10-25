import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readVerifiedReadonlyBatch, readVerifiedReadonlyBytes, VERIFIED_READONLY_BATCH_SIZE } from '../../src/infrastructure/filesystem/verified-readonly-file.ts';
import { fixture, body, denied, captureOpens, captureProbes, withoutDescriptor } from '../helpers/verified-readonly-fixture.ts';

test('bounded batches preserve order, share root handles and keep the single-file contract', t => {
  const f = fixture(t); f.write('left/a.md', 'first'); f.write('left/b.md', '第二项'); f.write('right/c.md', 'third');
  const opens = captureOpens(t), probes = captureProbes(t);
  try {
    assert.deepEqual(readVerifiedReadonlyBatch([]), []);
    const absent = readVerifiedReadonlyBatch(new Array(1));
    assert.equal(absent.length, 1); assert.equal(0 in absent, true); denied(absent[0]!);
    const values = readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('left', 'b.md'), f.request('right', 'c.md')]);
    assert.deepEqual(values.map(body), ['first', '第二项', 'third']);
    assert.equal([...opens.opened.values()].filter(file => file === path.join(f.directory, 'left')).length, 1);
    if (process.platform === 'darwin') { assert.equal(probes.calls.length, 2); for (const args of probes.calls) assert.equal(args[args.indexOf('-d') + 1]!.split(',').length, 5); }
    opens.assertClosed();
    assert.equal(readVerifiedReadonlyBytes(path.join(f.directory, 'left'), 'a.md', 5).toString(), 'first');
    assert.throws(() => readVerifiedReadonlyBytes(path.join(f.directory, 'left'), '../right/c.md', 100), { code: 'readonly_root_unconfirmed' });
    opens.assertClosed();
  } finally { probes.restore(); opens.restore(); }
});

test('sixteen distinct roots stay within descriptor limits and oversized batches open nothing', t => {
  const f = fixture(t), requests = Array.from({ length: VERIFIED_READONLY_BATCH_SIZE }, (_, index) => { f.write(`r${index}/a.md`, String(index)); return f.request(`r${index}`, 'a.md'); });
  const opens = captureOpens(t), probes = captureProbes(t);
  try {
    assert.deepEqual(readVerifiedReadonlyBatch(requests).map(body), requests.map((_, index) => String(index)));
    assert.equal(opens.opened.size, 32); opens.assertClosed();
    if (process.platform === 'darwin') { assert.equal(probes.calls.length, 2); assert.equal(probes.calls[0]![probes.calls[0]!.indexOf('-d') + 1]!.split(',').length, 32); }
    const count = opens.opened.size;
    assert.throws(() => readVerifiedReadonlyBatch([...requests, requests[0]!]), { code: 'readonly_root_unconfirmed' });
    assert.equal(opens.opened.size, count);
  } finally { probes.restore(); opens.restore(); }
});

test('invalid paths, missing files, symbols, directories and size failures remain local with every handle closed', t => {
  const f = fixture(t); const good = f.write('left/good.md', 'safe'); f.write('left/large.md', 'too large'); fs.symlinkSync(good, path.join(f.directory, 'left/link.md')); fs.mkdirSync(path.join(f.directory, 'left/directory.md'));
  const opens = captureOpens(t);
  try {
    const values = readVerifiedReadonlyBatch([f.request('left', 'missing.md'), f.request('left', '../left/good.md'), f.request('left', 'link.md'), f.request('left', 'directory.md'), f.request('left', 'large.md', 2), f.request('left', 'good.md')]);
    values.slice(0, -1).forEach(denied); assert.equal(body(values.at(-1)!), 'safe'); opens.assertClosed();
  } finally { opens.restore(); }
});

test('partial-open exceptions close roots and do not suppress another valid root', t => {
  const f = fixture(t), deniedFile = f.write('left/denied.md', 'unread'), good = f.write('right/good.md', 'safe');
  const opens = captureOpens(t, file => { if (file === deniedFile) throw Object.assign(new Error('fixture denied'), { code: 'EACCES' }); });
  try {
    const values = readVerifiedReadonlyBatch([f.request('left', 'denied.md'), f.request('right', path.basename(good))]);
    denied(values[0]!); assert.equal(body(values[1]!), 'safe'); opens.assertClosed();
  } finally { opens.restore(); }
});

test('parent replacement before leaf open reads zero foreign bytes and isolates the affected root', t => {
  const f = fixture(t), intended = f.write('left/a.md', 'trusted'), foreignFile = f.write('foreign/a.md', 'FOREIGN_BODY_NEVER_READ'); f.write('right/a.md', 'independent');
  const foreign = fs.statSync(foreignFile), originalRead = fs.readSync; let swapped = false, foreignReads = 0;
  const opens = captureOpens(t, file => { if (!swapped && file === intended) { fs.renameSync(path.join(f.directory, 'left'), path.join(f.directory, 'left-held')); fs.symlinkSync(path.join(f.directory, 'foreign'), path.join(f.directory, 'left'), 'dir'); swapped = true; } });
  const reads = t.mock.method(fs, 'readSync', ((...args: Parameters<typeof fs.readSync>) => { const stat = fs.fstatSync(args[0]); if (stat.dev === foreign.dev && stat.ino === foreign.ino) foreignReads++; return Reflect.apply(originalRead, fs, args); }) as typeof fs.readSync);
  try {
    const values = readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('right', 'a.md')]);
    assert.equal(swapped, true); assert.equal(foreignReads, 0); denied(values[0]!); assert.equal(body(values[1]!), 'independent'); opens.assertClosed();
    assert.equal(JSON.stringify(values).includes('FOREIGN_BODY_NEVER_READ'), false);
  } finally { reads.mock.restore(); opens.restore(); }
});

test('a shared root renamed during a later file read invalidates its earlier bytes only', t => {
  const f = fixture(t); f.write('left/a.md', 'first'); const later = f.write('left/b.md', 'second'); f.write('right/a.md', 'independent');
  const laterIdentity = fs.statSync(later), original = fs.readSync; let moved = false;
  const opens = captureOpens(t), reads = t.mock.method(fs, 'readSync', ((...args: Parameters<typeof fs.readSync>) => {
    const stat = fs.fstatSync(args[0]);
    if (!moved && stat.dev === laterIdentity.dev && stat.ino === laterIdentity.ino) { fs.renameSync(path.join(f.directory, 'left'), path.join(f.directory, 'left-held')); moved = true; }
    return Reflect.apply(original, fs, args);
  }) as typeof fs.readSync);
  try {
    const values = readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('left', 'b.md'), f.request('right', 'a.md')]);
    assert.equal(moved, true); denied(values[0]!); denied(values[1]!); assert.equal(body(values[2]!), 'independent'); opens.assertClosed();
  } finally { reads.mock.restore(); opens.restore(); }
});

test('a first file changed during a later read is rejected at the final batch proof', t => {
  const f = fixture(t), first = f.write('left/a.md', 'first'), later = f.write('left/b.md', 'second');
  const laterIdentity = fs.statSync(later), original = fs.readSync; let changed = false;
  const reads = t.mock.method(fs, 'readSync', ((...args: Parameters<typeof fs.readSync>) => {
    const stat = fs.fstatSync(args[0]);
    if (!changed && stat.dev === laterIdentity.dev && stat.ino === laterIdentity.ino) { fs.writeFileSync(first, 'other'); fs.utimesSync(first, new Date(), new Date(Date.now() + 2000)); changed = true; }
    return Reflect.apply(original, fs, args);
  }) as typeof fs.readSync);
  try { const values = readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('left', 'b.md')]); assert.equal(changed, true); denied(values[0]!); assert.equal(body(values[1]!), 'second'); }
  finally { reads.mock.restore(); }
});

test('a leaf replaced during another read never returns its earlier body under the new name', t => {
  const f = fixture(t), first = f.write('left/a.md', 'first'), later = f.write('left/b.md', 'second');
  const laterIdentity = fs.statSync(later), original = fs.readSync; let replaced = false;
  const opens = captureOpens(t), reads = t.mock.method(fs, 'readSync', ((...args: Parameters<typeof fs.readSync>) => {
    const stat = fs.fstatSync(args[0]);
    if (!replaced && stat.dev === laterIdentity.dev && stat.ino === laterIdentity.ino) { fs.renameSync(first, `${first}.held`); fs.writeFileSync(first, 'replacement'); replaced = true; }
    return Reflect.apply(original, fs, args);
  }) as typeof fs.readSync);
  try { const values = readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('left', 'b.md')]); assert.equal(replaced, true); denied(values[0]!); assert.equal(body(values[1]!), 'second'); opens.assertClosed(); }
  finally { reads.mock.restore(); opens.restore(); }
});

test('post-proof metadata changes suppress only the changed file', { skip: process.platform !== 'darwin' }, t => {
  const f = fixture(t), first = f.write('left/a.md', 'first'); f.write('left/b.md', 'second');
  const opens = captureOpens(t), probes = captureProbes(t, (bytes, _args, count) => { if (count === 2) { fs.writeFileSync(first, 'other'); fs.utimesSync(first, new Date(), new Date(Date.now() + 2000)); } return bytes; });
  try { const values = readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('left', 'b.md')]); denied(values[0]!); assert.equal(body(values[1]!), 'second'); assert.equal(probes.calls.length, 2); opens.assertClosed(); }
  finally { probes.restore(); opens.restore(); }
});

test('missing kernel descriptor records affect only their file or shared root', { skip: process.platform !== 'darwin' }, t => {
  const f = fixture(t); const leaf = f.write('left/a.md', 'first'); f.write('left/b.md', 'second'); f.write('right/a.md', 'independent');
  for (const missing of [leaf, path.join(f.directory, 'left')]) {
    const opens = captureOpens(t), probes = captureProbes(t, (bytes, _args, count) => {
      if (count !== 1) return bytes;
      const descriptor = [...opens.opened].find(([, file]) => file === missing)?.[0]; assert.notEqual(descriptor, undefined);
      return withoutDescriptor(bytes, descriptor!);
    });
    try {
      const values = readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('left', 'b.md'), f.request('right', 'a.md')]);
      denied(values[0]!); if (missing === leaf) assert.equal(body(values[1]!), 'second'); else denied(values[1]!);
      assert.equal(body(values[2]!), 'independent'); opens.assertClosed();
    } finally { probes.restore(); opens.restore(); }
  }
});

test('untrusted whole-kernel queries deliver no batch bytes and release every descriptor', { skip: process.platform !== 'darwin' }, t => {
  const f = fixture(t), left = fs.statSync(f.write('left/a.md', 'first')), right = fs.statSync(f.write('right/a.md', 'second'));
  for (const fault of ['owner', 'format', 'post-timeout']) {
    const originalRead = fs.readSync; let bodyReads = 0;
    const reads = t.mock.method(fs, 'readSync', ((...args: Parameters<typeof fs.readSync>) => {
      const stat = fs.fstatSync(args[0]); if ([left, right].some(item => stat.dev === item.dev && stat.ino === item.ino)) bodyReads++;
      return Reflect.apply(originalRead, fs, args);
    }) as typeof fs.readSync);
    const opens = captureOpens(t), probes = captureProbes(t, (bytes, _args, count) => {
      if (fault === 'owner') return Buffer.from(`p${process.pid + 1}\0`);
      if (fault === 'format') return Buffer.from(`p${process.pid}\0unexpected\0`);
      if (count === 2) throw Object.assign(new Error('fixture query timeout'), { code: 'ETIMEDOUT' });
      return bytes;
    });
    try { readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('right', 'a.md')]).forEach(denied); if (fault === 'post-timeout') assert.ok(bodyReads > 0); else assert.equal(bodyReads, 0); opens.assertClosed(); }
    finally { probes.restore(); opens.restore(); reads.mock.restore(); }
  }
});
