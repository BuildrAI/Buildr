import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWindowsReadonlyResponse, WINDOWS_READONLY_SCRIPT } from '../../src/infrastructure/filesystem/verified-readonly-file-windows.ts';

const requests = [{ root: 'C:\\authorized', relative: 'a.md', maxBytes: 3 }, { root: 'C:\\other', relative: 'b.md', maxBytes: 4 }];
const response = (results: unknown, schemaVersion = 'buildr.windows-verified-readonly/v1') => Buffer.from(JSON.stringify({ schemaVersion, results }));
const good = [{ index: 0, ok: true, bytes: Buffer.from('abc').toString('base64') }, { index: 1, ok: false, bytes: null }];

test('Windows reader protocol preserves ordered independent results, bounded bytes and empty files', () => {
  const values = parseWindowsReadonlyResponse(response(good), requests);
  assert.equal(values[0]!.ok, true);
  if (values[0]!.ok) assert.equal(values[0]!.bytes.toString(), 'abc');
  assert.equal(values[1]!.ok, false);
  if (!values[1]!.ok) assert.equal(Reflect.get(values[1]!.error, 'code'), 'readonly_root_unconfirmed');
  const empty = parseWindowsReadonlyResponse(response([{ index: 0, ok: true, bytes: '' }]), requests.slice(0, 1));
  assert.equal(empty[0]!.ok, true);
  if (empty[0]!.ok) assert.equal(empty[0]!.bytes.length, 0);
});

test('Windows reader rejects incomplete, reordered, duplicate and body-bearing denial responses', () => {
  for (const rows of [[], [good[0]], [...good, good[0]], [good[1], good[0]], [good[0], { ...good[1], index: 0 }], [good[0], { ...good[1], bytes: 'Zg==' }], [good[0], { ...good[1], ok: 'false' }], [good[0], { ...good[1], foreign: true }]]) {
    assert.throws(() => parseWindowsReadonlyResponse(response(rows), requests));
  }
  assert.throws(() => parseWindowsReadonlyResponse(response(good, 'untrusted'), requests));
  assert.throws(() => parseWindowsReadonlyResponse(Buffer.from('{"schemaVersion":'), requests));
  assert.throws(() => parseWindowsReadonlyResponse(Buffer.from([0xff]), requests));
});

test('Windows reader accepts only canonical base64 within the requested byte bound', () => {
  for (const bytes of ['abcdZg==', 'YWJjZA==', 'YWJj\n', 'YQ', 'YR==', '@@@@', 42]) {
    assert.throws(() => parseWindowsReadonlyResponse(response([{ ...good[0], bytes }, good[1]]), requests));
  }
});

test('bounded Windows helper fits the native process command line without caller code interpolation', () => {
  const encoded = Buffer.from(WINDOWS_READONLY_SCRIPT, 'utf16le').toString('base64');
  assert.ok(encoded.length + 1024 < 32767, `Windows command line would exceed its native bound: ${encoded.length}`);
  assert.equal(Buffer.from(encoded, 'base64').toString('utf16le'), WINDOWS_READONLY_SCRIPT);
});
