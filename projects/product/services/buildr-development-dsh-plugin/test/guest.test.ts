import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedGuestScriptSource, isTrustedGuestUrl } from '../src/guest.ts';
import { parseGuestMessage } from '../src/workspace.ts';

test('center SPA routes stay trusted across workspace navigation while tool frames keep exact hash routing', () => {
  const origin = 'http://127.0.0.1:4458';
  assert.equal(isTrustedGuestUrl(`${origin}/#dsh=development`, origin, '#dsh=development', false), true);
  assert.equal(isTrustedGuestUrl(`${origin}/workspaces/ws-1/overview`, origin, '#dsh=development', false), true);
  assert.equal(isTrustedGuestUrl(`${origin}/workspaces/ws-1/tasks/t-1?tab=spec`, origin, '#dsh=development', false), true);
  assert.equal(isTrustedGuestUrl(`${origin}/api/v1/workspaces`, origin, '#dsh=development', false), false);
  assert.equal(isTrustedGuestUrl('http://127.0.0.1:4459/workspaces/ws-1', origin, '#dsh=development', false), false);

  const toolHash = '#dsh=explorer&workspace=ws-1';
  assert.equal(isTrustedGuestUrl(`${origin}/${toolHash}`, origin, toolHash, true), true);
  assert.equal(isTrustedGuestUrl(`${origin}/workspaces/ws-1/overview${toolHash}`, origin, toolHash, true), false);
  assert.equal(isTrustedGuestUrl(`${origin}/#dsh=source-control&workspace=ws-1`, origin, toolHash, true), false);
});

test('console script source validation accepts released assets and dev vite sources on exact origin', () => {
  const origin = 'http://127.0.0.1:4458';
  assert.equal(isTrustedGuestScriptSource(`${origin}/assets/index-abc123.js`, origin, true), true);
  assert.equal(isTrustedGuestScriptSource(`${origin}/src/app/dsh-desktop.tsx`, origin, true), false);
  assert.equal(isTrustedGuestScriptSource(`${origin}/src/app/dsh-desktop.tsx`, origin, false), true);
  assert.equal(isTrustedGuestScriptSource(`${origin}/@fs/repo/src/main.tsx`, origin, false), true);
  assert.equal(isTrustedGuestScriptSource('http://127.0.0.1:9999/assets/index.js', origin, false), false);
  assert.equal(isTrustedGuestScriptSource(undefined, origin, false), false);
});

test('guest bridge isolates Buildr Development channel prefix from Harness messages', () => {
  assert.equal(parseGuestMessage('buildr-harness-desktop/v1:{"kind":"shell","action":"leave"}'), undefined);
  assert.deepEqual(
    parseGuestMessage('buildr-development-desktop/v1:{"kind":"shell","action":"leave"}'),
    { kind: 'shell', action: 'leave' },
  );
});
