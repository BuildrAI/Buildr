import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { ConversationView, PendingRequestView, RunStatus, RunView } from '../../src/contracts.ts';

const NOW = '2026-11-01T00:00:00.000Z';
const run = (id: string, status: RunStatus, extra: Partial<RunView> = {}): RunView =>
  ({ id, participantId: 'p', provider: 'codex', generation: 'g', status, accepted: true, tools: [], startedAt: NOW, updatedAt: NOW, ...extra });
const approval = (conversationId: string, runId: string): PendingRequestView =>
  ({ id: 'permit-one', kind: 'approval', title: 'Write a file?', options: [{ id: 'allow-once', label: 'Allow once' }, { id: 'deny', label: 'Deny' }], conversationId, workspaceId: 'workspace-one', participantId: 'p', runId, generation: 'g' });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-list-'));
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const service = createAgentService({
    dataRoot: path.join(root, 'profile'), executors: [], modelProviders: [],
    generationAlive: () => true,
    resolveWorkspace: (id: string) => { assert.equal(id, 'workspace-one'); return { rootPath: workspace }; },
  });
  const repository = new ConversationRepository(path.join(root, 'profile', 'agent-service'));
  return { root, service, repository, async close() { repository.stopReadModels(); await service.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('list filters by active and attention, projects summary fields, always returns activityCounts and honors limit', async t => {
  const f = fixture(); t.after(() => f.close());
  const names = ['running', 'pending', 'failed', 'unknown', 'done'] as const;
  const ids: Record<string, string> = {};
  for (const name of names) ids[name] = (await f.service.conversations.create('workspace-one', { title: name })).id;

  const seed = (name: string, mutate: (view: ConversationView) => void) => {
    const record = f.repository.readConversation(ids[name])!;
    const prior = record.view.revision;
    mutate(record.view);
    record.view.revision = randomUUID();
    f.repository.saveConversation(record, prior);
  };
  seed('running', view => { view.run = run('run-running', 'running'); });
  seed('pending', view => { view.run = run('run-pending', 'waiting-approval'); view.requests = [approval(view.id, 'run-pending')]; });
  seed('failed', view => { view.run = run('run-failed', 'failed', { diagnostic: 'boom' }); });
  seed('unknown', view => { view.run = run('run-unknown', 'unknown'); });
  seed('done', view => { view.run = run('run-done', 'completed'); });

  const activeIds = ['running', 'pending', 'unknown'].map(name => ids[name]).sort();
  const attentionIds = ['pending', 'failed', 'unknown'].map(name => ids[name]).sort();
  const allIds = names.map(name => ids[name]).sort();

  const all = f.service.conversations.list('workspace-one');
  assert.deepEqual(all.conversations.map(c => c.id).sort(), allIds);
  assert.ok(all.activityCounts, 'activityCounts is always present');
  assert.equal(all.activityCounts.active, 3, 'active count is independent of the page limit');
  for (const key of ['active', 'running', 'waiting', 'unseen', 'unknown', 'attention'] as const) assert.equal(typeof all.activityCounts[key], 'number');
  assert.equal(all.nextCursor, undefined);
  for (const view of all.conversations as ConversationView[]) assert.deepEqual(view.entries, [], 'list observations never carry entries');

  const active = f.service.conversations.list('workspace-one', { active: true });
  assert.deepEqual(active.conversations.map(c => c.id).sort(), activeIds);
  assert.equal(active.activityCounts.active, 3);

  const attention = f.service.conversations.list('workspace-one', { attention: true });
  assert.deepEqual(attention.conversations.map(c => c.id).sort(), attentionIds);
  assert.equal(attention.activityCounts.active, 3);

  const summary = f.service.conversations.list('workspace-one', { fields: 'summary' });
  assert.equal(summary.conversations.length, 5);
  assert.equal(summary.activityCounts.active, 3);
  for (const item of summary.conversations) {
    assert.deepEqual(Object.keys(item).sort(), ['active', 'id', 'pendingDecisionCount', 'runStatus', 'title', 'updatedAt']);
    const full = f.service.conversations.read('workspace-one', item.id);
    assert.equal(item.title, full.title);
    assert.equal(item.runStatus, full.run?.status ?? null);
    assert.equal(item.active, full.activity?.active ?? false);
    assert.equal(item.pendingDecisionCount, full.activity?.pendingDecisionCount ?? 0);
    assert.equal(item.updatedAt, full.updatedAt);
  }

  const activeSummary = f.service.conversations.list('workspace-one', { active: true, fields: 'summary' });
  assert.deepEqual(activeSummary.conversations.map(c => c.id).sort(), activeIds);
  for (const item of activeSummary.conversations) assert.deepEqual(Object.keys(item).sort(), ['active', 'id', 'pendingDecisionCount', 'runStatus', 'title', 'updatedAt']);

  const limited = f.service.conversations.list('workspace-one', { limit: 2 });
  assert.equal(limited.conversations.length, 2, 'limit bounds the page');
  assert.ok(limited.nextCursor, 'a further page is offered');
  assert.equal(limited.activityCounts.active, 3, 'counts span the whole workspace, not the page');
  const seen = new Set(limited.conversations.map(c => c.id));
  let cursor: string | undefined = limited.nextCursor;
  while (cursor) {
    const currentCursor: string = cursor;
    const page = f.service.conversations.list('workspace-one', { limit: 2, cursor: currentCursor });
    for (const c of page.conversations) seen.add(c.id);
    cursor = page.nextCursor;
  }
  assert.deepEqual([...seen].sort(), allIds, 'paging covers every conversation exactly once');
});

test('list activityCounts stays zero without creating storage for an empty workspace', async t => {
  const f = fixture(); t.after(() => f.close());
  const result = f.service.conversations.list('workspace-one');
  assert.deepEqual(result.conversations, []);
  assert.equal(result.nextCursor, undefined);
  assert.deepEqual(result.activityCounts, { active: 0, running: 0, waiting: 0, unseen: 0, unknown: 0, attention: 0 });
});

test('active and attention filters are applied before the page limit', async t => {
  const f = fixture(); t.after(() => f.close());
  const names = ['done-newer', 'done-newest', 'active-one', 'active-two', 'unknown', 'failed', 'waiting'] as const;
  const ids: Record<string, string> = {};
  for (const name of names) ids[name] = (await f.service.conversations.create('workspace-one', { title: name })).id;

  const seed = (name: string, updatedAt: string, mutate: (view: ConversationView) => void) => {
    const record = f.repository.readConversation(ids[name])!;
    const prior = record.view.revision;
    mutate(record.view);
    record.view.updatedAt = updatedAt;
    record.view.revision = randomUUID();
    f.repository.saveConversation(record, prior);
  };
  seed('done-newer', '2026-11-01T05:00:00.000Z', view => { view.run = run('run-done-newer', 'completed'); });
  seed('done-newest', '2026-11-01T06:00:00.000Z', view => { view.run = run('run-done-newest', 'completed'); });
  seed('active-one', '2026-11-01T04:00:00.000Z', view => { view.run = run('run-active-one', 'running'); });
  seed('active-two', '2026-11-01T03:00:00.000Z', view => { view.run = run('run-active-two', 'running'); });
  seed('unknown', '2026-11-01T02:00:00.000Z', view => { view.run = run('run-unknown', 'unknown'); });
  seed('failed', '2026-11-01T01:00:00.000Z', view => { view.run = run('run-failed', 'failed'); });
  seed('waiting', '2026-11-01T00:00:00.000Z', view => {
    view.run = run('run-waiting', 'waiting-approval');
    view.requests = [approval(view.id, 'run-waiting')];
  });

  const active = f.service.conversations.list('workspace-one', { active: true, limit: 2 });
  assert.equal(active.conversations.length, 2, 'matching rows fill the page despite newer non-matching rows');
  assert.deepEqual(active.conversations.map(item => item.id), [ids['active-one'], ids['active-two']]);
  assert.ok(active.nextCursor, 'another active page remains');

  const attention = f.service.conversations.list('workspace-one', { attention: true, limit: 2 });
  assert.equal(attention.conversations.length, 2, 'attention is filtered before LIMIT');
  assert.deepEqual(attention.conversations.map(item => item.id), [ids['unknown'], ids['failed']]);
  assert.ok(attention.nextCursor, 'the waiting conversation remains on the next page');
});
