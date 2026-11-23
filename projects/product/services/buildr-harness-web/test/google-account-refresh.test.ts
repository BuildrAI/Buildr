import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAccountRefresh, googleRefreshIsDue, GOOGLE_REFRESH_FRESH_MS } from '../src/features/agent-conversations/google-account-refresh.ts';
import type { ModelAccount } from '../src/features/agent-conversations/types.ts';

const now = Date.parse('2026-11-23T00:00:00Z');
function account(age: number, edits: Partial<ModelAccount> = {}): ModelAccount {
  const observedAt = new Date(now - age).toISOString();
  return { id: 'native-antigravity', provider: 'native-antigravity', label: 'Google AI', identity: 'google', revision: 'observed', enabled: true, status: 'ready', models: [], observedAt, quota: { available: true, observedAt }, ...edits };
}
test('Google foreground refresh requires a stale, enabled, authenticated Google account', () => {
  assert.equal(googleRefreshIsDue(account(GOOGLE_REFRESH_FRESH_MS - 1), now), false);
  assert.equal(googleRefreshIsDue(account(GOOGLE_REFRESH_FRESH_MS), now), true);
  assert.equal(googleRefreshIsDue(account(0, { quota: undefined }), now), true);
  for (const edits of [{id: 'native-codex'}, {enabled: false}, {sourceEnabled: false}, {status: 'expired'}] as Partial<ModelAccount>[]) {
    assert.equal(googleRefreshIsDue(account(GOOGLE_REFRESH_FRESH_MS, edits), now), false);
  }
});
test('shared Google check joins concurrent surfaces and paces retries for the same identity', async () => {
  const snapshot = account(GOOGLE_REFRESH_FRESH_MS);
  let clock = now, calls = 0;
  const run = createGoogleAccountRefresh(async (checked, action) => {
    calls++; assert.equal(action, 'check'); assert.equal(checked.revision, 'observed');
    throw Error('temporary failure');
  }, () => clock);
  const first = run(snapshot)!;
  assert.equal(run(snapshot), first);
  await assert.rejects(first, /temporary failure/);
  assert.equal(calls, 1);
  assert.equal(run(snapshot), undefined);
  clock += GOOGLE_REFRESH_FRESH_MS;
  await assert.rejects(run(snapshot)!, /temporary failure/);
  assert.equal(calls, 2);
});

test('visible poller stops in a hidden or disposed surface and resumes on visibility', async t => {
  const { createVisiblePoller } = await import('../src/lib/visible-poller.ts');
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  let reads = 0;
  const poller = createVisiblePoller({ document: doc, window: new EventTarget(), interval: () => 300_000, read: async () => { reads++; } });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  try {
    await poller.request();
    assert.equal(reads, 1);
    t.mock.timers.tick(300_000); await flush();
    assert.equal(reads, 2);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    t.mock.timers.tick(600_000); await flush();
    assert.equal(reads, 2);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); await flush();
    assert.equal(reads, 3);
    poller.dispose(); t.mock.timers.tick(600_000); await flush();
    assert.equal(reads, 3);
  } finally { poller.dispose(); }
});
