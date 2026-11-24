import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  LOCAL_HTML_PREVIEW_LIMIT,
  LOCAL_IMAGE_PREVIEW_LIMIT,
  LOCAL_TEXT_PREVIEW_LIMIT,
  previewLocalFile,
  readLocalHtmlFile,
} from '../../src/application/local-file-preview.ts';

test('previewLocalFile supports workspace-external paths, cwd-relative paths, images, markdown, binaries and HTML', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-file-preview-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'workspace');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });

  const relativeMd = path.join(cwd, 'notes.md');
  fs.writeFileSync(relativeMd, '# hello');
  const mdPreview = await previewLocalFile({ path: 'notes.md', cwd });
  assert.equal(mdPreview.kind, 'markdown');
  assert.equal(mdPreview.path, fs.realpathSync(relativeMd));
  assert.equal(mdPreview.content, '# hello');
  assert.equal(mdPreview.truncated, false);

  const outsideTxt = path.join(outside, 'external.txt');
  fs.writeFileSync(outsideTxt, 'outside text');
  const outsidePreview = await previewLocalFile({ path: outsideTxt });
  assert.equal(outsidePreview.kind, 'text');
  assert.equal(outsidePreview.path, fs.realpathSync(outsideTxt));
  assert.equal(outsidePreview.content, 'outside text');

  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=', 'base64');
  const pngPath = path.join(outside, 'pixel.png');
  fs.writeFileSync(pngPath, pngBytes);
  const imgPreview = await previewLocalFile({ path: pngPath });
  assert.equal(imgPreview.kind, 'image');
  assert.equal(imgPreview.truncated, false);
  assert.equal(imgPreview.content, `data:image/png;base64,${pngBytes.toString('base64')}`);

  const largeHtmlPath = path.join(outside, 'prototype.html');
  const largeHtml = '<!doctype html><html><body>' + 'x'.repeat(LOCAL_TEXT_PREVIEW_LIMIT + 1024) + '</body></html>';
  fs.writeFileSync(largeHtmlPath, largeHtml);
  const htmlPreview = await previewLocalFile({ path: largeHtmlPath });
  assert.equal(htmlPreview.kind, 'html');
  assert.equal(htmlPreview.truncated, true);
  assert.equal(Buffer.byteLength(htmlPreview.content), LOCAL_TEXT_PREVIEW_LIMIT);

  const fullHtml = await readLocalHtmlFile({ path: largeHtmlPath });
  assert.equal(fullHtml.path, fs.realpathSync(largeHtmlPath));
  assert.equal(fullHtml.html, largeHtml);

  const binPath = path.join(outside, 'archive.zip');
  fs.writeFileSync(binPath, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert.equal((await previewLocalFile({ path: binPath })).kind, 'unsupported');

  const nulPath = path.join(outside, 'data.dat');
  fs.writeFileSync(nulPath, Buffer.from([0x41, 0x00, 0x42]));
  assert.equal((await previewLocalFile({ path: nulPath })).kind, 'unsupported');

  await assert.rejects(() => previewLocalFile({ path: outside }), { code: 'agent_directory_file_invalid' });
  await assert.rejects(() => previewLocalFile({ path: path.join(outside, 'missing.txt') }), { code: 'agent_directory_file_missing' });
  await assert.rejects(() => previewLocalFile({ path: 'relative-without-cwd.txt' }), { code: 'agent_directory_file_invalid' });
  await assert.rejects(() => readLocalHtmlFile({ path: outsideTxt }), { code: 'agent_directory_file_unsupported', status: 415 });

  const oversizedImg = path.join(outside, 'huge.png');
  fs.writeFileSync(oversizedImg, Buffer.alloc(LOCAL_IMAGE_PREVIEW_LIMIT + 1));
  await assert.rejects(() => previewLocalFile({ path: oversizedImg }), { code: 'agent_directory_file_too_large', status: 413 });

  const oversizedHtml = path.join(outside, 'huge.html');
  fs.writeFileSync(oversizedHtml, Buffer.alloc(LOCAL_HTML_PREVIEW_LIMIT + 1, 0x61));
  await assert.rejects(() => previewLocalFile({ path: oversizedHtml }), { code: 'agent_directory_file_too_large', status: 413 });
  await assert.rejects(() => readLocalHtmlFile({ path: oversizedHtml }), { code: 'agent_directory_file_too_large', status: 413 });
});
