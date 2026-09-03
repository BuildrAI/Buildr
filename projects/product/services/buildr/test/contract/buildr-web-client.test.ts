import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative: any): any  {
  return fs.readFileSync(path.join(productRoot, relative), 'utf8');
}

test('公共 API client 不读取 DOM session，LocalSessionAdapter 负责写头', () => {
  const client: any = read('../buildr-web/src/api/client.ts');
  const adapter: any = read('../buildr-web/src/api/LocalSessionAdapter.ts');
  assert.doesNotMatch(client, /document\.|querySelector|buildr-session/);
  assert.match(adapter, /meta\[name="buildr-session"\]/);
  assert.match(adapter, /x-buildr-session/);
  assert.match(client, /sessionAdapter\.writeHeaders/);
  assert.match(client, /getWorkspaceId/);
  assert.match(client, /\/api\/v1\/workspaces\/\$\{encodeURIComponent\(workspaceId\)\}/);
});

test('Buildr Web 生产托管指向 web-dist 且不再依赖 STATIC_ASSETS 白名单入口', () => {
  const server: any = read('src/web/http/server.ts');
  const router: any = read('src/web/http/router.ts');
  const staticFiles: any = read('src/web/http/static-files.ts');
  assert.match(staticFiles, /web-dist/);
  assert.match(staticFiles, /resolveDistFile/);
  assert.match(router, /serveDistAsset|injectedIndexHtml/);
  assert.doesNotMatch(`${server}\n${router}\n${staticFiles}`, /STATIC_ASSETS/);
  assert.ok(fs.existsSync(path.join(productRoot, '../buildr-web/package.json')));
});

test('Buildr Web 应用壳只为 Runtime 注入的 development profile 显示开发版标识和标题', () => {
  const index: any = read('../buildr-web/index.html');
  const layout: any = read('../buildr-web/src/app/AppLayout.tsx');
  const styles: any = read('../buildr-web/src/styles.css');
  const staticFiles: any = read('src/web/http/static-files.ts');
  assert.match(index, /meta name="buildr-web-profile" content="__BUILDR_WEB_PROFILE__"/);
  assert.match(staticFiles, /\['released', 'development'\]\.includes\(webProfile\?\.profile\)/);
  assert.match(staticFiles, /replace\('__BUILDR_WEB_PROFILE__', profile\)/);
  assert.match(layout, /meta\[name="buildr-web-profile"\]/);
  assert.match(layout, /profile === 'released' \|\| profile === 'development'/);
  assert.match(layout, /webProfile === 'development'[\s\S]*id="development-environment-badge"[\s\S]*开发版/);
  assert.match(layout, /webProfile === 'development' \? 'Buildr Web Dev' : 'Buildr Web'/);
  assert.match(layout, /document\.title = productTitle\(webProfile\)/);
  assert.match(layout, /document\.title = `\$\{data\.workspace\.name\} · \$\{productTitle\(webProfile\)\}`/);
  assert.doesNotMatch(layout, /location\.(?:port|hostname|href)|document\.URL/);
  assert.match(styles, /\.development-environment-badge/);
});
