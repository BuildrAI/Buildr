import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { createAgentService } from '../../src/index.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-unknown-settle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new ConversationRepository(directory);
}
function record(id: string, workspaceId = 'w1'): StoredConversation {
  return { view: { id, workspaceId, cwd: '/workspace', title: '测试标题', revision: 'r0', hidden: false, updatedAt: '2026-11-11T00:00:00Z', participants: [], entries: [], requests: [] }, participants: [], sources: {}, attachments: {}, attempts: [], requests: {} } as unknown as StoredConversation;
}
function message(r: StoredConversation, id: string, text: string) {
  r.view.entries.push({ id, sequence: r.view.entries.length + 1, text, kind: 'message', role: 'user', createdAt: r.view.updatedAt } as never);
}
function withRetainedUnknown(r: StoredConversation) {
  const at = r.view.updatedAt;
  r.view.run = { id: 'current', participantId: 'p', provider: 'codex', generation: 'g', status: 'completed', accepted: true, tools: [], startedAt: at, updatedAt: at } as never;
  r.view.retainedRuns = [{ id: 'old', participantId: 'p', provider: 'qoder-cn', generation: 'old-gen', status: 'unknown', accepted: true, stopRequested: true, executionState: 'unknown', tools: [{ id: 't', label: '命令', status: 'unknown', canStop: false }], diagnostic: 'Qoder CN 本轮仍有未确认结束的工具，结果未知。', startedAt: at, updatedAt: at }] as never;
}
function seen(repo: ConversationRepository, id: string) {
  const row = repo.querySummaries(['w1'], { limit: 50 }).conversations.find(value => value.id === id)!;
  repo.markSeen('w1', id, row.activity!.version);
}

test('retained unknown activity is visible as pending confirmation and settles back to normal history', t => {
  const repo = fixture(t), pinned = record('pinned'), draft = record('draft');
  message(pinned, 'user', '早先输入');
  withRetainedUnknown(pinned);
  draft.view.updatedAt = '2026-11-11T01:00:00Z';
  message(draft, 'user', '较新输入');
  repo.saveConversation(pinned); repo.saveConversation(draft);
  seen(repo, 'pinned'); seen(repo, 'draft');
  const before = repo.querySummaries(['w1'], { limit: 10, draftConversationIds: ['draft'] });
  assert.equal(before.activityCounts.unknown, 1, 'residual active rows count as pending confirmation');
  assert.equal(before.activityCounts.attention, 1);
  assert.equal(repo.querySummaries(['w1'], { limit: 10, activityState: 'unknown' }).total, 1);
  assert.deepEqual(before.conversations.map(value => value.id), ['pinned', 'draft'], 'visible pending confirmation precedes drafts');
  assert.equal(before.conversations[0]!.activity!.active, true);
  const stored = repo.readConversation('pinned')!;
  stored.view.retainedRuns![0]!.attentionSettled = true;
  repo.saveConversation(stored, stored.view.revision);
  seen(repo, 'pinned');
  const after = repo.querySummaries(['w1'], { limit: 10, draftConversationIds: ['draft'] });
  assert.equal(after.activityCounts.unknown, 0);
  assert.equal(after.activityCounts.active, 0);
  assert.equal(repo.querySummaries(['w1'], { limit: 10, activityState: 'unknown' }).total, 0);
  assert.deepEqual(after.conversations.map(value => value.id), ['draft', 'pinned'], 'settled history sorts below drafts');
  const settled = after.conversations.find(value => value.id === 'pinned')!;
  assert.equal(settled.activity!.active, false);
  assert.equal(settled.retainedRuns![0]!.status, 'unknown', 'unknown evidence is preserved');
  assert.equal(settled.retainedRuns![0]!.attentionSettled, true);
  // Legacy summaries without compact activity facts keep the same interpretation with zero writes.
  const db = new DatabaseSync(repo.filename);
  db.prepare("UPDATE conversations SET summary=json_remove(summary,'$.activity') WHERE id=?").run('pinned');
  db.close();
  const bytes = fs.readFileSync(repo.filename);
  const legacy = repo.querySummaries(['w1'], { limit: 10, draftConversationIds: ['draft'] });
  assert.deepEqual(legacy.conversations.map(value => value.id), ['draft', 'pinned']);
  assert.equal(legacy.activityCounts.unknown, 0);
  assert.deepEqual(fs.readFileSync(repo.filename), bytes, 'legacy interpretation stays zero-write');
});

test('settleRetainedRun validates identity and preconditions, preserves evidence, and is idempotent', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-unknown-settle-app-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = createAgentService({ dataRoot: path.join(root, 'data'), executors: [], resolveWorkspace: () => ({ rootPath: root }) });
  t.after(() => service.close());
  const chat = await service.conversations.create('scope', {});
  const repo = new ConversationRepository(path.join(root, 'data', 'agent-service'));
  t.after(() => repo.stopReadModels());
  const stored = repo.readConversation(chat.id)!;
  withRetainedUnknown(stored);
  repo.saveConversation(stored, chat.revision);
  const control = { expectedRevision: stored.view.revision, runId: 'old', participantId: 'p', generation: 'old-gen' };
  await assert.rejects(service.conversations.settleRetainedRun('scope', chat.id, { ...control, runId: 'missing' }), /身份已变化/);
  await assert.rejects(service.conversations.settleRetainedRun('scope', chat.id, { ...control, expectedRevision: 'stale' }), /变化/);
  const current = repo.readConversation(chat.id)!;
  current.view.retainedRuns![0]!.tools = [{ id: 't', label: '命令', status: 'running', canStop: true }] as never;
  repo.saveConversation(current, current.view.revision);
  await assert.rejects(service.conversations.settleRetainedRun('scope', chat.id, { ...control, expectedRevision: current.view.revision }), /在途工作/);
  const running = repo.readConversation(chat.id)!;
  running.view.retainedRuns![0]!.tools = [{ id: 't', label: '命令', status: 'unknown', canStop: false }] as never;
  running.view.requests = [{ id: 'q', runId: 'old' }] as never;
  repo.saveConversation(running, running.view.revision);
  await assert.rejects(service.conversations.settleRetainedRun('scope', chat.id, { ...control, expectedRevision: running.view.revision }), /在途工作/);
  const ready = repo.readConversation(chat.id)!;
  ready.view.requests = [];
  repo.saveConversation(ready, ready.view.revision);
  const before = service.conversations.read('scope', chat.id);
  const priorDiagnostic = before.retainedRuns!.find(run => run.id === 'old')!.diagnostic;
  const view = await service.conversations.settleRetainedRun('scope', chat.id, { ...control, expectedRevision: before.revision });
  const settled = view.retainedRuns!.find(run => run.id === 'old')!;
  assert.equal(settled.attentionSettled, true);
  assert.equal(settled.status, 'unknown');
  assert.equal(settled.tools[0]!.status, 'unknown');
  assert.equal(settled.diagnostic, priorDiagnostic, 'settlement never rewrites the diagnostic');
  assert.equal(settled.stopRequested, true);
  const again = await service.conversations.settleRetainedRun('scope', chat.id, { ...control, expectedRevision: view.revision });
  assert.equal(again.revision, view.revision, 'repeated settlement is a no-op');
});
