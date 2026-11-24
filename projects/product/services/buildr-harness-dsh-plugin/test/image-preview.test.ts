import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePreviewImage } from '../src/image-preview.ts';
import { CHANNEL, parseGuestMessage } from '../src/workspace.ts';

const id = '87b5213d-a44b-4dab-83b2-000000000000';
const png = 'data:image/png;base64,aGVsbG8=';

test('preview console requests carry an identifier, not image contents', () => {
  const message = (value: object) => parseGuestMessage(CHANNEL + JSON.stringify(value));
  assert.deepEqual(message({ kind: 'image-preview', id, source: png }), { kind: 'image-preview', id });
  assert.equal(message({ kind: 'image-preview', id: '../../a' }), undefined);
});

test('host accepts only a current bounded bitmap and rejects URLs and SVG', () => {
  const value = { name: '截图', source: png, expiresAt: 1200 };
  assert.deepEqual(parsePreviewImage(value, 1000), { name: '截图', source: png });
  for (const source of ['https://example.invalid/image.png', 'file:///image.png', 'data:image/svg+xml;base64,aA==', 'data:image/png;base64,' + 'A'.repeat(12_000_000)]) {
    assert.equal(parsePreviewImage({ ...value, source }, 1000), undefined);
  }
  for (const expiresAt of [1000, 2501, Infinity, NaN]) assert.equal(parsePreviewImage({ ...value, expiresAt }, 1000), undefined);
});
