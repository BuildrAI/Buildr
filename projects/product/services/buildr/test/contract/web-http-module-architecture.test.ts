import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root: any = path.resolve(import.meta.dirname, '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Web HTTP server 只拥有 loopback server 与资源生命周期', () => {
  const server: any = read('src/web/http/server.ts');
  assert.match(server, /createLocalWorkspaceRequestRouter/);
  assert.match(server, /server\.listen\(port, '127\.0\.0\.1'/);
  assert.match(server, /server\.once\('close'/);
  assert.match(server, /taskReadExecutor\.close/);
  assert.match(server, /crypto\.randomBytes\(32\)/);
  for (const forbidden of ['readJsonBody', 'assertWriteRequest', 'resolveDistFile', 'injectedIndexHtml', 'serveDistAsset', 'content-security-policy', 'for (const contribution of httpContributions)']) {
    assert.equal(server.includes(forbidden), false, forbidden);
  }
});

test('Web HTTP security、static、responses 与 router 各自拥有窄职责', () => {
  const session: any = read('src/web/http/session.ts');
  const staticFiles: any = read('src/web/http/static-files.ts');
  const responses: any = read('src/web/http/responses.ts');
  const router: any = read('src/web/http/router.ts');

  assert.match(session, /MAX_JSON_BODY_BYTES = 32 \* 1024/);
  assert.match(session, /origin_forbidden[\s\S]*session_forbidden[\s\S]*content_type_unsupported/);
  assert.match(session, /request_body_too_large[\s\S]*invalid_json/);
  assert.match(staticFiles, /relative\.split\('\/'\)\.some\(\(part(?:: any)?\) => part === '\.\.'\)/);
  assert.match(staticFiles, /resolveProductResource\('product\/web-dist'\)/);
  assert.match(responses, /content-security-policy[\s\S]*x-frame-options/);
  assert.match(responses, /status >= 500 \? 'Buildr Web 处理请求失败。' : error\.message/);
  assert.match(router, /authorizeWrite: \(\) => assertWriteRequest/);
  assert.match(router, /request\.headers\['x-buildr-instance'\] !== healthSecret/);
});

test('Web HTTP router 保持 shell、static、health、contribution、shutdown、workspace 与 404 顺序', () => {
  const router: any = read('src/web/http/router.ts');
  const markers: any[] = [
    "pathname === '/' || workspaceAppRoute.test(pathname)",
    'serveDistAsset(response, pathname, staticRoot)',
    "pathname === '/api/v1/health'",
    'contribution.handleTopLevel',
    "pathname === '/api/v1/app/quit'",
    'const apiMatch = workspaceApiMatch(pathname)',
    "code: 'not_found'",
  ];
  const positions: any = markers.map((marker: any) => router.indexOf(marker));
  assert.ok(positions.every((position: any) => position >= 0), JSON.stringify(positions));
  assert.deepEqual([...positions].sort((left: any, right: any) => left - right), positions);
});
