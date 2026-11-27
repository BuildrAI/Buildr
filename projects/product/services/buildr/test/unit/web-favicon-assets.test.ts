import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PUBLIC_ICON_PATHS, serveDistAsset } from '../../src/web/http/static-files.ts';

const productRoot = path.resolve(import.meta.dirname, '../../../..');

test('Buildr 和 Buildr Harness Web 页面入口声明多尺寸非占位图标且公共图标文件存在', () => {
  const buildrHtml = fs.readFileSync(path.join(productRoot, 'services/buildr-web/index.html'), 'utf8');
  assert.doesNotMatch(buildrHtml, /data:image\/png;base64/u);
  assert.ok(buildrHtml.includes('<title>Buildr</title>'), 'buildr-web index.html missing Buildr title');
  assert.ok(fs.statSync(path.join(productRoot, 'assets/branding/buildr-icon.png')).isFile(), 'missing buildr-icon.png');
  assert.equal(fs.existsSync(path.join(productRoot, 'assets/branding/buildr-development-icon.png')), false, 'legacy buildr-development-icon.png should be removed');
  for (const href of ['/favicon.ico', '/favicon-32x32.png', '/icon-192.png', '/apple-touch-icon.png']) {
    assert.ok(buildrHtml.includes(`href="${href}"`), `buildr-web index.html missing ${href}`);
    assert.ok(fs.statSync(path.join(productRoot, 'services/buildr-web/public', href.slice(1))).isFile(), `buildr-web/public missing ${href}`);
  }

  const harnessHtml = fs.readFileSync(path.join(productRoot, 'services/buildr-harness-web/index.html'), 'utf8');
  for (const href of ['./favicon.ico', './favicon-32x32.png', './icon-192.png', './apple-touch-icon.png']) {
    assert.ok(harnessHtml.includes(`href="${href}"`), `buildr-harness-web index.html missing ${href}`);
    assert.ok(fs.statSync(path.join(productRoot, 'services/buildr-harness-web/public', href.slice(2))).isFile(), `buildr-harness-web/public missing ${href}`);
  }
});

test('serveDistAsset 为公共页签图标返回可缓存响应头并支持 HEAD 请求', async t => {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-static-icons-'));
  t.after(() => fs.rmSync(staticRoot, { recursive: true, force: true }));
  const ico = Buffer.from('ico-bytes');
  const png = Buffer.from('png-bytes');
  fs.writeFileSync(path.join(staticRoot, 'favicon.ico'), ico);
  fs.writeFileSync(path.join(staticRoot, 'apple-touch-icon.png'), png);

  const callServe = async (pathname: string, method: string) => {
    let status = 0;
    let headers: Record<string, string | number> = {};
    let body: Buffer | undefined;
    const response = {
      writeHead(code: number, value: Record<string, string | number>) { status = code; headers = value; },
      end(chunk?: Buffer) { body = chunk; },
    };
    const handled = await serveDistAsset(response, pathname, staticRoot, { method, headers: {} });
    return { handled, status, headers, body };
  };

  assert.ok(PUBLIC_ICON_PATHS.has('/favicon.ico'));
  const getIcon = await callServe('/favicon.ico', 'GET');
  assert.equal(getIcon.handled, true);
  assert.equal(getIcon.status, 200);
  assert.equal(getIcon.headers['content-type'], 'image/x-icon');
  assert.equal(getIcon.headers['cache-control'], 'public, max-age=3600');
  assert.deepEqual(getIcon.body, ico);

  const headTouch = await callServe('/apple-touch-icon.png', 'HEAD');
  assert.equal(headTouch.handled, true);
  assert.equal(headTouch.status, 200);
  assert.equal(headTouch.headers['content-type'], 'image/png');
  assert.equal(headTouch.headers['cache-control'], 'public, max-age=3600');
  assert.equal(headTouch.headers['content-length'], png.length);
  assert.equal(headTouch.body, undefined);
});
