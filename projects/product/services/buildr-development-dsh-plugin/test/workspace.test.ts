import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL,
  linkDestination,
  liveCarrier,
  matchingCarriers,
  parseGuestMessage,
  preferredCarrier,
  sameDirectory,
  sessionSelection,
  shouldNotifyChatActive,
  toolAddress,
  toolId,
  workspaceDisplayName,
  type Session,
  type SessionCatalog,
} from '../src/workspace.ts';

const scope = { id: 'work', path: '/fixtures/repo' };
const message = (data: object) => parseGuestMessage(CHANNEL + JSON.stringify(data));
const catalog = (byId: Record<string, Session>, options: Partial<SessionCatalog> = {}): SessionCatalog => ({
  phase: 'ready',
  ids: Object.keys(byId),
  byId,
  ...options,
});

test('a saved association is reused only while its live session still belongs to this directory', () => {
  const bindings = new Map([['work', 'first'], ['other', 'second']]);
  const sessions = catalog({ first: { cwd: '/fixtures/repo/' }, second: { cwd: '/fixtures/other' } });
  assert.equal(liveCarrier(scope, bindings, sessions, []), 'first');
  assert.equal(liveCarrier({ id: 'other', path: '/fixtures/other' }, bindings, sessions, []), 'second');
  assert.equal(liveCarrier({ id: 'work', path: '/fixtures/other' }, bindings, sessions, []), undefined);
  assert.equal(liveCarrier(scope, new Map(), sessions, []), undefined);
  assert.equal(sameDirectory({ cwd: '/fixtures/repo-suffix' }, scope), false);
});

test('auto-connect waits for the catalog and uses the only available exact directory', () => {
  const byId = {
    good: { cwd: scope.path + '/' },
    parent: { cwd: '/fixtures' },
    child: { cwd: scope.path + '/nested' },
    sub: { cwd: scope.path, origin: 'subagent' },
    old: { cwd: scope.path, formatStatus: 'migration-required' },
    archived: { cwd: scope.path },
    elsewhere: { cwd: scope.path },
  } satisfies Record<string, Session>;
  const ids = Object.keys(byId);
  const bindings = new Map([['other', 'elsewhere']]);
  assert.equal(preferredCarrier(scope, bindings, catalog(byId, { ids, phase: 'pending' }), ['archived']), undefined);
  assert.deepEqual(matchingCarriers(scope, bindings, catalog(byId, { ids }), ['archived']), ['good']);
  assert.equal(preferredCarrier(scope, bindings, catalog(byId, { ids }), ['archived']), 'good');
});

test('bridge uses isolated Buildr Development tool IDs and validates workspace/reveal/link messages', () => {
  assert.equal(toolId('explorer'), 'buildr-development-explorer');
  assert.equal(toolId('source-control'), 'buildr-development-source-control');
  assert.equal(toolAddress('explorer'), 'dsh-resource://buildr-development/explorer');
  assert.equal(toolAddress('source-control'), 'dsh-resource://buildr-development/source-control');

  assert.deepEqual(message({ kind: 'workspace', scope: { ...scope, session: 'ignored' } }), { kind: 'workspace', scope });
  assert.equal(message({ kind: 'workspace', scope: { id: 'work', path: 'relative' } }), undefined);
  for (const url of ['file:///tmp/example', 'javascript:alert(1)', 'https://user@example.com', '/relative']) {
    assert.equal(message({ kind: 'link', url }), undefined);
  }
  assert.deepEqual(
    message({ kind: 'link', url: 'https://platform.openai.com/settings/organization/billing/overview' }),
    { kind: 'link', url: 'https://platform.openai.com/settings/organization/billing/overview', external: false },
  );
});

test('link destination, file reveal, shell commands and visibility rules match host contract', () => {
  assert.equal(linkDestination('sidebar', false, true), 'sidebar');
  assert.equal(linkDestination('new-tab', false, true), 'external');
  assert.equal(linkDestination('sidebar', false, false), 'offer');
  assert.equal(linkDestination('sidebar', true, false), 'external');

  const file = { workspaceId: 'work', revision: 'observed', path: 'src/entry.ts', line: 4, checkout: { repositoryId: 'repo', checkoutId: 'checkout' } };
  assert.deepEqual(message({ kind: 'reveal', file }), { kind: 'reveal', file });
  for (const bad of ['../sibling', '/tmp/file', 'foo/../../bar', 'C:/escape', 'foo\\bar']) {
    assert.equal(message({ kind: 'reveal', file: { ...file, path: bad } }), undefined);
  }
  for (const action of ['leave', 'toggle-right'] as const) assert.deepEqual(message({ kind: 'shell', action }), { kind: 'shell', action });
  assert.equal(sessionSelection('carrier', 'carrier'), 'align');
  assert.equal(sessionSelection('carrier', 'other'), 'leave');
  assert.equal(shouldNotifyChatActive(true, 'visible'), true);
  assert.equal(shouldNotifyChatActive(false, 'visible'), false);
  assert.equal(workspaceDisplayName({ id: 'w', path: '/a/b', name: 'My Workspace' }), 'My Workspace');
  assert.equal(workspaceDisplayName({ id: 'w', path: '/a/b' }), 'b');
});
