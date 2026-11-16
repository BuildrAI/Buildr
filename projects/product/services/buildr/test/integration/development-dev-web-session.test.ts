import assert from 'node:assert/strict';
import test from 'node:test';

import {
  developmentApiProxy,
  developmentSessionPlugin,
  injectDevelopmentSession,
  parseDevelopmentHostSession,
} from '../../tools/development/dev-web-session.ts';

const hostPage = '<html><head><meta name="buildr-session" content="abc123" /></head><body></body></html>';

test('development session reads the host token and image cookie', () => {
  const session = parseDevelopmentHostSession(hostPage, [
    'buildr-frame=abc123; Path=/harness/; HttpOnly',
    'buildr-image=abc123; Path=/api/v1/conversation-image; HttpOnly',
  ]);
  assert.deepEqual(session, {
    token: 'abc123',
    imageCookie: 'buildr-image=abc123; Path=/api/v1/conversation-image; HttpOnly',
  });
});

test('development session rejects a host page without a token', () => {
  assert.throws(() => parseDevelopmentHostSession('<html><head></head></html>'), /session token/);
});

test('buildr-web development HTML replaces the build placeholders', () => {
  const html = [
    '<head>',
    '<meta name="buildr-session" content="__BUILDR_SESSION_TOKEN__" />',
    '<meta name="buildr-preview" content="__BUILDR_PREVIEW_IDENTITY__" />',
    '<meta name="buildr-web-profile" content="__BUILDR_WEB_PROFILE__" />',
    '</head>',
  ].join('');
  const injected = injectDevelopmentSession(html, { token: 'dev-token', imageCookie: null }, {
    profile: 'development',
    replacePlaceholders: true,
  });
  assert.match(injected, /name="buildr-session" content="dev-token"/);
  assert.match(injected, /name="buildr-preview" content=""/);
  assert.match(injected, /name="buildr-web-profile" content="development"/);
  assert.doesNotMatch(injected, /__BUILDR_/);
});

test('harness development HTML receives the same session and harness profile', () => {
  const injected = injectDevelopmentSession('<html><head><title>Buildr Harness</title></head></html>', {
    token: 'dev-token',
    imageCookie: null,
  }, { profile: 'development-harness' });
  assert.match(injected, /<meta name="buildr-session" content="dev-token"><meta name="buildr-web-profile" content="development-harness"><\/head>/);
});

test('development API proxy targets the host and rewrites Origin', () => {
  const proxy = developmentApiProxy('http://127.0.0.1:4458');
  assert.equal(proxy.target, 'http://127.0.0.1:4458');
  assert.equal(proxy.changeOrigin, true);
  let seenOrigin: string | null = null;
  proxy.configure({
    on(event: string, handler: (request: any) => void) {
      assert.equal(event, 'proxyReq');
      handler({ setHeader(name: string, value: string) { if (name === 'origin') seenOrigin = value; } });
    },
  });
  assert.equal(seenOrigin, 'http://127.0.0.1:4458');
});

test('development session plugin is serve-only and named for diagnostics', () => {
  const plugin = developmentSessionPlugin({ hostUrl: 'http://127.0.0.1:4458' });
  assert.equal(plugin.name, 'buildr-development-session');
  assert.equal(plugin.apply, 'serve');
});
