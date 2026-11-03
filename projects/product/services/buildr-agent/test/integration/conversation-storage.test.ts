import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { ConversationEntryStore } from '../../src/persistence/conversation-entry-store.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';
import { controlRoot, writePrivate } from '../../src/process/ownership.ts';
import { writeLegacyConversationDatabase } from '../support/legacy-conversation-database.ts';

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-conversation-storage-'));
  const directory = path.join(root, 'agent-service'), repo = new ConversationRepository(directory);
  t.after(() => { repo.stopReadModels(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, directory, repo };
}
function record(id = 'chat'): StoredConversation {
  return { view: { id, workspaceId: 'ws', revision: 'r1', cwd: '/workspace', title: '历史', updatedAt: '2026-11-02T00:00:00Z', hidden: false,
    entries: [], participants: [], requests: [] }, participants: [], sources: {}, requests: {}, attempts: [], attachments: {} };
}
function tool(id: string, status: 'completed' | 'running' = 'completed') {
  return { id, sequence: 1, kind: 'tool' as const, role: 'system' as const, status, text: ('真实日志 ' + id + '\n').repeat(5000), input: 'command '.repeat(4000), createdAt: 'now' };
}
function backups(directory: string) { return fs.readdirSync(directory).filter(name => name.startsWith('conversations.pre-v6-')); }

test('entry revisions are stored once across main/inherited positions, small previews reuse bodies and late repairs remain exact', t => {
  const { repo } = fixture(t), r = record();
  const entry = tool('stable');
  r.view.entries = [entry, { id: 'visible', sequence: 2, kind: 'message', role: 'user', text: '可以搜索 ABC 中文', createdAt: 'now' }];
  r.inheritedContext = { entries: [entry], outcomes: {}, pendingQuestions: [] };
  repo.saveConversation(r);
  const db = new DatabaseSync(repo.filename); t.after(() => db.close());
  assert.equal(db.prepare('SELECT count(*) AS n FROM conversation_entry_contents').get()!.n, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM conversation_read_entries').get()!.n, 3);
  assert.equal(db.prepare("SELECT codec FROM conversation_entry_contents WHERE codec='zstd'").get()!.codec, 'zstd');
  assert.equal(db.prepare("SELECT compact FROM conversation_read_entries WHERE id='visible'").get()!.compact, null);
  const header = JSON.parse(db.prepare('SELECT body FROM conversations').get()!.body as string);
  assert.deepEqual(header.view.entries, []); assert.deepEqual(header.inheritedContext.entries, []);
  assert.deepEqual(repo.readConversation(r.view.id)!.view.entries, r.view.entries);
  assert.deepEqual(repo.readConversation(r.view.id)!.inheritedContext, r.inheritedContext);
  assert.equal(repo.querySummaries(['ws'], { query: 'ABC 中文', limit: 10 }).total, 1);
  assert.equal(repo.querySummaries(['ws'], { query: '真实日志', limit: 10 }).total, 0);
  const detail = repo.readPage(r.view.id, undefined, undefined, true)!.view.entries[0].detail!;
  r.view.revision = 'r2'; r.view.entries[0] = { ...entry, text: entry.text + '\n迟到结果' };
  repo.saveConversation(r, 'r1');
  assert.throws(() => repo.readEntry(r.view.id, entry.id, detail.revision), { code: 'agent_entry_changed' });
  assert.equal(repo.readConversation(r.view.id)!.inheritedContext!.entries[0].text, entry.text, 'old pinned inherited revision remains available');
  assert.deepEqual(repo.readPage(r.view.id)!.view.entries, r.view.entries);
});

test('running tools remain raw and bad codec, size, compressed bytes or missing payload fail explicitly', t => {
  const { repo } = fixture(t), r = record(); r.view.entries = [tool('running', 'running'), { ...tool('done'), sequence: 2 }];
  repo.saveConversation(r);
  const db = new DatabaseSync(repo.filename); t.after(() => db.close());
  assert.equal(db.prepare(`SELECT c.codec FROM conversation_entry_contents c JOIN conversation_read_entries e USING(conversation_id,content_revision) WHERE e.id='running'`).get()!.codec, 'raw');
  const rev = repo.readPage(r.view.id, undefined, undefined, true)!.view.entries[1].detail!.revision;
  const original = db.prepare('SELECT * FROM conversation_entry_contents WHERE content_revision=?').get(rev)!;
  for (const [column, value] of [['codec', 'future-codec'], ['body_bytes', 1024 * 1024 * 1024], ['body', Buffer.from('not zstd')]] as const) {
    db.prepare(`UPDATE conversation_entry_contents SET ${column}=? WHERE content_revision=?`).run(value, rev);
    assert.throws(() => repo.readEntry(r.view.id, 'done', rev), { code: 'agent_entry_corrupt' });
    db.prepare(`UPDATE conversation_entry_contents SET ${column}=? WHERE content_revision=?`).run(original[column]!, rev);
  }
  db.prepare('DELETE FROM conversation_entry_contents WHERE content_revision=?').run(rev);
  assert.throws(() => repo.readEntry(r.view.id, 'done', rev), { code: 'agent_entry_corrupt' });
});

test('v4 reads do not migrate; write migrates canonical data, verifies then deletes its WAL-aware backup and rejects old writers', t => {
  const { repo, directory } = fixture(t), r = record(); r.view.entries = [tool('legacy')];
  writeLegacyConversationDatabase(repo.filename, [r], true);
  const before = fs.readFileSync(repo.filename);
  assert.deepEqual(repo.readConversation(r.view.id)!.view.entries, r.view.entries);
  assert.deepEqual(fs.readFileSync(repo.filename), before); assert.deepEqual(backups(directory), []);
  const old = new DatabaseSync(repo.filename); old.exec('PRAGMA journal_mode=WAL');
  r.view.title = 'committed WAL title'; old.prepare('UPDATE conversations SET body=? WHERE id=?').run(JSON.stringify(r), r.view.id);
  r.view.revision = 'r2'; repo.saveConversation(r, 'r1');
  assert.equal(old.prepare('PRAGMA user_version').get()!.user_version, 6);
  assert.throws(() => old.prepare('UPDATE conversations SET body=? WHERE id=?').run(JSON.stringify(r), r.view.id), /agent_storage_writer_incompatible/);
  old.close();
  assert.deepEqual(backups(directory), [], 'verified migration immediately deletes its exact backup');
  assert.deepEqual(repo.readConversation(r.view.id)!.view.entries, r.view.entries);
  assert.equal(repo.readConversation(r.view.id)!.view.revision, 'r2', 'new writes are not overwritten by backup');
});

test('migration refuses a live retained process and preserves source bytes without forcing work to stop', async t => {
  const { repo, root, directory } = fixture(t), r = record(); r.view.entries = [tool('legacy')];
  writeLegacyConversationDatabase(repo.filename, [r]);
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(async () => { if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; } });
  const generation = randomUUID();
  writePrivate(path.join(controlRoot(root), 'instances', generation + '.json'), { identity: { dataRoot: root, generation, pid: child.pid }, origin: 'http://127.0.0.1:1', token: 'fixture' });
  const before = fs.readFileSync(repo.filename);
  assert.throws(() => repo.saveConversation(r, 'r1'), { code: 'agent_storage_migration_busy' });
  assert.deepEqual(fs.readFileSync(repo.filename), before); assert.deepEqual(backups(directory), []); assert.equal(child.exitCode, null);
});

test('conversion failure rolls back canonical data and schema, leaving its verified backup and future legacy reads intact', t => {
  const { repo, directory } = fixture(t), r = record(); r.view.entries = [tool('legacy')];
  writeLegacyConversationDatabase(repo.filename, [r]);
  const db = new DatabaseSync(repo.filename);
  db.prepare('UPDATE conversations SET id=?').run('mismatched'); db.close();
  assert.throws(() => repo.startReadModels(), { code: 'agent_storage_unavailable' });
  const check = new DatabaseSync(repo.filename, { readOnly: true }); t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get()!.user_version, 4);
  assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='conversation_entry_contents'").get()!.n, 0);
  assert.deepEqual(JSON.parse(check.prepare('SELECT body FROM conversations').get()!.body as string).view.entries, r.view.entries);
  assert.equal(backups(directory).length, 1);
});

test('backup failure leaves legacy database untouched, and missing positions cannot become an empty history', t => {
  const { repo } = fixture(t), r = record(); r.view.entries = [tool('legacy')];
  writeLegacyConversationDatabase(repo.filename, [r]);
  const before = fs.readFileSync(repo.filename), open = fs.openSync;
  fs.openSync = ((filename: fs.PathLike, ...args: any[]) => {
    if (String(filename).includes('conversations.pre-v6-')) throw Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' });
    return (open as any)(filename, ...args);
  }) as typeof fs.openSync;
  try { assert.throws(() => repo.startReadModels(), { code: 'agent_storage_unavailable' }); }
  finally { fs.openSync = open; }
  assert.deepEqual(fs.readFileSync(repo.filename), before);
  repo.startReadModels();
  const db = new DatabaseSync(repo.filename); t.after(() => db.close());
  db.prepare('DELETE FROM conversation_read_entries WHERE conversation_id=?').run(r.view.id);
  assert.throws(() => repo.readConversation(r.view.id), { code: 'agent_entry_corrupt' });
  assert.throws(() => repo.readPage(r.view.id), { code: 'agent_entry_corrupt' });
});

test('same-content benchmark reports smaller active storage separately from retained backup and WAL', t => {
  const { repo, directory } = fixture(t), r = record();
  r.view.entries = Array.from({ length: 300 }, (_, i) => ({ ...tool('operation-' + i), sequence: i + 1 }));
  writeLegacyConversationDatabase(repo.filename, [r], true);
  const legacyBytes = fs.statSync(repo.filename).size;
  const migrationStart = performance.now(); repo.startReadModels(); const migrationMs = performance.now() - migrationStart;
  const readStart = performance.now(); const restored = repo.readConversation(r.view.id)!; const readMs = performance.now() - readStart;
  assert.deepEqual(restored.view.entries, r.view.entries);
  const activeBytes = fs.statSync(repo.filename).size;
  const backupBytes = backups(directory).reduce((n, name) => n + fs.statSync(path.join(directory, name)).size, 0);
  const walBytes = fs.statSync(repo.filename + '-wal', { throwIfNoEntry: false })?.size ?? 0;
  assert.ok(activeBytes < legacyBytes / 2, 'duplicate removal and compression reduce this synthetic active database');
  assert.equal(backupBytes, 0, 'verified migration deletes its recovery point');
  t.diagnostic(JSON.stringify({ fixture: '300 repetitive completed tool records; synthetic, not whole-machine savings', legacyBytes, activeBytes, backupBytes, walBytes, totalRetainedBytes: activeBytes + backupBytes + walBytes, migrationMs, fullReadMs: readMs }));
});

for (const failure of ['validation', 'deletion'] as const) {
  test(`post-commit ${failure} failure keeps backup without invalidating the new database`, t => {
    const { repo, directory } = fixture(t), r = record(); r.view.entries = [tool('legacy')];
    writeLegacyConversationDatabase(repo.filename, [r]);
    const undo = failure === 'validation'
      ? t.mock.method(ConversationEntryStore, 'hydrate', () => { throw new Error('validation failed'); })
      : t.mock.method(fs, 'unlinkSync', () => { throw new Error('deletion failed'); });
    repo.startReadModels();
    undo.mock.restore();
    assert.equal(backups(directory).length, 1);
    assert.deepEqual(repo.readConversation(r.view.id)!.view.entries, r.view.entries);
    const db = new DatabaseSync(repo.filename, { readOnly: true });
    try { assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 6); } finally { db.close(); }
  });
}
