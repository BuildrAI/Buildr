import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

test('clicking an embedded SVG shows the image without its encoded reference', {timeout: 45000}, async t => {
  const fixture = `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {MarkdownHost} from '/src/components/MarkdownHost.tsx';
      import {ConversationImagePreview} from '/src/features/agent-conversations/ConversationImagePreview.tsx';
      import {conversationImageSource} from '/src/features/agent-conversations/conversation-markdown-images.ts';
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120"/><!--' + 'a'.repeat(8192) + '--></svg>';
      const src = 'data:image/svg+xml;base64,' + btoa(svg);
      function Fixture() {
        const [image, setImage] = useState(null);
        return React.createElement(React.Fragment, null,
          React.createElement(MarkdownHost, {markdown: '![内嵌 SVG](' + src + ') ![普通图片](https://example.test/preview.png)', options: {imageResolver: href => conversationImageSource(undefined, href), onImageClick: setImage}}),
          image && React.createElement(ConversationImagePreview, {href: image.src, reference: image.reference, onClose: () => setImage(null)}));
      }
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
  `;
  const vite = await createServer({
    root: new URL('../..', import.meta.url).pathname,
    configFile: false, esbuild: {jsx: 'automatic'}, server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
    plugins: [{name: 'image-preview-fixture', resolveId(id) {if (id === '/fixture.js') return id;}, load(id) {if (id === '/fixture.js') return fixture;}}],
  });
  const server = http.createServer((req, res) => {
    if (req.url !== '/') return vite.middlewares(req, res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {server.closeAllConnections(); await Promise.all([vite.close(), new Promise<void>(resolve => server.close(() => resolve()))]);});
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(8000); page.on('pageerror', error => t.diagnostic(String(error)));
    page.on('response', response => {if (response.status() >= 400) t.diagnostic(response.status() + ' ' + response.url());});
    await page.route('https://example.test/preview.png', route => route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64'),
    }));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByRole('button', {name: '查看大图：内嵌 SVG'}).click();
    const dialog = page.getByRole('dialog', {name: '图片预览'});
    const image = dialog.getByRole('img', {name: '对话引用的图片'});
    await image.waitFor({state: 'visible'});
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.ac-linked-image-preview img')?.naturalWidth === 320);
    assert.doesNotMatch(await dialog.innerText(), /data:image\/svg\+xml/);
    assert.equal(await dialog.getByRole('button', {name: '复制图片路径'}).count(), 0);
    assert.equal(await dialog.getByRole('link', {name: '新窗口打开'}).count(), 0);
    await dialog.getByRole('button', {name: '关闭预览', exact: true}).click();
    await dialog.waitFor({state: 'hidden'});
    await page.getByRole('button', {name: '查看大图：普通图片'}).click();
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.ac-linked-image-preview img')?.naturalWidth === 1);
    assert.equal(await dialog.locator('.ac-linked-image-reference code').innerText(), 'https://example.test/preview.png');
    assert.equal(await dialog.getByRole('button', {name: '复制图片路径'}).count(), 1);
    assert.equal(await dialog.getByRole('link', {name: '新窗口打开'}).getAttribute('href'), 'https://example.test/preview.png');
  } finally {
    await browser.close();
  }
});
