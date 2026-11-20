import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractAntigravityToolOutput,
  MAX_DIFF_BYTES,
} from '../../src/executors/antigravity/events.ts';

test('extractAntigravityToolOutput generates compact unified diff for small edit', () => {
  const result = extractAntigravityToolOutput([
    { type: 'diff', path: 'src/index.ts', oldText: 'old\n', newText: 'new\n' },
  ]);
  assert.equal(result.hasDiff, true);
  assert.equal(
    result.fullText,
    '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,1 @@\n-old\n+new',
  );
  assert.equal(result.previewText, result.fullText);
});

test('extractAntigravityToolOutput produces compact single hunk for localized change in large file', () => {
  const totalLines = 14_000;
  const oldLines = Array.from({ length: totalLines }, (_, i) => `public void line_${i + 1}() { // padding content for realistic file width }`);
  const newLines = [...oldLines];
  newLines[7_000] = 'public void line_7001_updated() { // changed line 1 }';
  newLines[7_001] = 'public void line_7002_updated() { // changed line 2 }';
  const oldText = oldLines.join('\n') + '\n';
  const newText = newLines.join('\n') + '\n';

  assert.ok(Buffer.byteLength(oldText, 'utf8') > 700 * 1024);
  const result = extractAntigravityToolOutput([
    { type: 'diff', path: 'src/PsOrderServiceImpl.java', oldText, newText },
  ]);
  assert.equal(result.hasDiff, true);
  assert.ok(Buffer.byteLength(result.fullText, 'utf8') < 4 * 1024, `expected compact hunk, got ${Buffer.byteLength(result.fullText, 'utf8')} bytes`);
  assert.match(result.fullText, /^--- a\/src\/PsOrderServiceImpl\.java\n\+\+\+ b\/src\/PsOrderServiceImpl\.java\n@@ -6998,8 \+6998,8 @@/m);
  assert.ok(result.fullText.includes('-public void line_7001()'));
  assert.ok(result.fullText.includes('+public void line_7001_updated()'));
  assert.ok(!result.fullText.includes('line_1('));
  assert.ok(!result.fullText.includes('line_14000('));
});

test('extractAntigravityToolOutput splits distant edits in large file into separate hunks', () => {
  const totalLines = 12_500;
  const oldLines = Array.from({ length: totalLines }, (_, i) => `line_${i + 1}`);
  const newLines = [...oldLines];
  newLines[4] = 'line_5_changed';
  newLines[11_999] = 'line_12000_changed';

  const result = extractAntigravityToolOutput([
    { type: 'diff', path: 'src/Multi.java', oldText: oldLines.join('\n') + '\n', newText: newLines.join('\n') + '\n' },
  ]);
  assert.equal(result.hasDiff, true);
  const hunkHeaders = result.fullText.match(/^@@ .+ @@$/gm) ?? [];
  assert.equal(hunkHeaders.length, 2, `expected 2 hunks, got: ${result.fullText}`);
  assert.equal(hunkHeaders[0], '@@ -2,7 +2,7 @@');
  assert.equal(hunkHeaders[1], '@@ -11997,7 +11997,7 @@');
  assert.ok(!result.fullText.includes('line_5000'));
});

test('extractAntigravityToolOutput handles identical, new, deleted, and trailing-newline-only diffs', () => {
  const identical = extractAntigravityToolOutput([
    { type: 'diff', path: 'same.ts', oldText: 'a\nb\n', newText: 'a\nb\n' },
  ]);
  assert.equal(identical.hasDiff, true);
  assert.equal(identical.fullText, '--- a/same.ts\n+++ b/same.ts');

  const created = extractAntigravityToolOutput([
    { type: 'diff', path: 'new.ts', oldText: '', newText: 'one\ntwo\n' },
  ]);
  assert.equal(created.fullText, '--- a/new.ts\n+++ b/new.ts\n@@ -0,0 +1,2 @@\n+one\n+two');

  const deleted = extractAntigravityToolOutput([
    { type: 'diff', path: 'gone.ts', oldText: 'one\ntwo\n', newText: '' },
  ]);
  assert.equal(deleted.fullText, '--- a/gone.ts\n+++ b/gone.ts\n@@ -1,2 +0,0 @@\n-one\n-two');

  const eolOnly = extractAntigravityToolOutput([
    { type: 'diff', path: 'eol.ts', oldText: 'first\nsecond\n', newText: 'first\nsecond' },
  ]);
  assert.equal(eolOnly.fullText, '--- a/eol.ts\n+++ b/eol.ts\n@@ -2,1 +2,1 @@\n-second\n+second');
});

test('extractAntigravityToolOutput caps oversized diffs at MAX_DIFF_BYTES without splitting UTF-8 characters', () => {
  const hugeLines = Array.from({ length: 12_000 }, (_, i) => `中文测试行-${i}-${'数据'.repeat(10)}`);
  const hugeNew = hugeLines.join('\n') + '\n';
  assert.ok(Buffer.byteLength(hugeNew, 'utf8') > 400 * 1024);

  const createdHuge = extractAntigravityToolOutput([
    { type: 'diff', path: 'huge-new.txt', oldText: '', newText: hugeNew },
  ]);
  assert.ok(Buffer.byteLength(createdHuge.fullText, 'utf8') <= MAX_DIFF_BYTES);
  assert.match(createdHuge.fullText, /差异内容超出容量已截断/);
  assert.ok(!createdHuge.fullText.includes('\uFFFD'));

  // Large rewrite exceeding MAX_MYERS_EDIT_DISTANCE (> 1000 changed lines in middle)
  const hugeOldLines = Array.from({ length: 1_500 }, (_, i) => `旧行-${i}-${'内容'.repeat(150)}`);
  const hugeNewLines = Array.from({ length: 1_500 }, (_, i) => `新行-${i}-${'变更'.repeat(150)}`);
  const rewriteHuge = extractAntigravityToolOutput([
    {
      type: 'diff',
      path: 'huge-rewrite.txt',
      oldText: 'head\n' + hugeOldLines.join('\n') + '\ntail\n',
      newText: 'head\n' + hugeNewLines.join('\n') + '\ntail\n',
    },
  ]);
  assert.ok(Buffer.byteLength(rewriteHuge.fullText, 'utf8') <= MAX_DIFF_BYTES);
  assert.match(rewriteHuge.fullText, /差异内容超出容量已截断/);
  assert.ok(!rewriteHuge.fullText.includes('\uFFFD'));
});
