import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative) {
  return fs.readFileSync(path.join(productRoot, relative), 'utf8');
}

test('公共 API client 不读取 DOM session，LocalSessionAdapter 负责写头', () => {
  const client = read('../buildr-web/src/api/client.ts');
  const adapter = read('../buildr-web/src/api/LocalSessionAdapter.ts');
  assert.doesNotMatch(client, /document\.|querySelector|buildr-session/);
  assert.match(adapter, /meta\[name="buildr-session"\]/);
  assert.match(adapter, /x-buildr-session/);
  assert.match(client, /sessionAdapter\.writeHeaders/);
  assert.match(client, /getWorkspaceId/);
  assert.match(client, /\/api\/v1\/workspaces\/\$\{encodeURIComponent\(workspaceId\)\}/);
});

test('Buildr Web 生产托管指向 web-dist 且不再依赖 STATIC_ASSETS 白名单入口', () => {
  const server = read('src/interfaces/local-app/http/server.mjs');
  assert.match(server, /web-dist/);
  assert.match(server, /resolveDistFile/);
  assert.match(server, /serveDistAsset|injectedIndexHtml/);
  assert.doesNotMatch(server, /STATIC_ASSETS/);
  assert.ok(fs.existsSync(path.join(productRoot, '../buildr-web/package.json')));
});
