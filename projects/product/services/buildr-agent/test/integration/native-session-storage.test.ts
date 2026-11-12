import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { ConversationEntryStore } from '../../src/persistence/conversation-entry-store.ts';
import { inspectAgentStorage, collectAgentStorage } from '../../src/application/storage-maintenance.ts';
import { handoffSources } from '../../src/application/handoff-sources.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';
import type { ConversationEntry } from '../../src/contracts.ts';
import type { NativeToolContent } from '../../src/native-content-contracts.ts';
import type { AgentStoragePlan } from '../../src/application/storage-maintenance.ts';

const day = 24 * 60 * 60_000;
const binding = (character: string) => character.repeat(64);
const toolEntry = (id: string): ConversationEntry => ({ id, sequence: 0, kind: 'tool', role: 'system', text: '', createdAt: 'now', status: 'completed' });

function fixture(t: test.TestContext) {
  const dataRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-native-sessions-')));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const root = path.join(dataRoot, 'agent-service'); fs.mkdirSync(root);
  return { dataRoot, root };
}
function writeFile(name: string, contents = 'data') { fs.mkdirSync(path.dirname(name), { recursive: true }); fs.writeFileSync(name, contents); }
function age(target: string, timestamp = Date.now() - 3 * day) {
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const name = path.join(target, entry.name);
    if (entry.isDirectory()) age(name, timestamp); else if (!entry.isSymbolicLink()) fs.utimesSync(name, timestamp / 1000, timestamp / 1000);
  }
  fs.utimesSync(target, timestamp / 1000, timestamp / 1000);
}
function codexHome(root: string, id: string) {
  const config = path.join(root, 'connections', 'codex', 'model-bindings', id); fs.mkdirSync(config, { recursive: true });
  return { config, sessions: path.join(config, 'codex-home', 'sessions') };
}
function codexSession(config: string, id: string) {
  return path.join(config, 'codex-home', 'sessions', '2026', '11', '03', `rollout-2026-11-03T15-52-32-${id}.jsonl`);
}
function dshSession(config: string, id: string) {
  return path.join(config, 'dsh-home', 'sessions', '--workspace--', `session-${id}`);
}
function conversation(root: string, input: { provider: 'codex' | 'dsh'; contextId: string; modelAccountId?: string; attemptContext?: boolean; nativeHomeRoot?: string }) {
  const repo = new ConversationRepository(root), cwd = '/workspace', participantId = randomUUID();
  const record: StoredConversation = {
    view: { id: randomUUID(), workspaceId: 'ws', revision: 'r1', cwd, title: 'native', updatedAt: 'now', hidden: false, requests: [], participants: [], entries: [] },
    participants: [{ id: participantId, connectionId: input.provider, provider: input.provider, label: input.provider,
      bindingIdentity: 'binding', deliveredThrough: 0, modelAccountId: input.modelAccountId,
      ...(input.nativeHomeRoot ? { nativeHomeRoot: input.nativeHomeRoot } : {}),
      contextRef: { id: input.contextId, data: { native: opaqueReference(input.provider, input.contextId, cwd, 'binding') } } }],
    sources: {}, nativeTools: {}, attachments: {}, requests: {},
    attempts: [{ clientRequestId: randomUUID(), inputDigest: 'digest', runId: randomUUID(), participantId, through: 0, userEntryId: 'user', accepted: true,
      ...(input.attemptContext === false ? {} : { executionRef: { id: randomUUID(), data: { resourceContext: input.contextId } } }) }],
  };
  repo.saveConversation(record); return repo;
}
function nativePlan(plan: AgentStoragePlan): AgentStoragePlan { return { ...plan, items: plan.items.filter(item => item.kind === 'native-session') }; }
function inspect(dataRoot: string, nativeSessions = true) { return nativePlan(inspectAgentStorage({ dataRoot, scanHomes: false, nativeSessions })); }
function homePlan(plan: AgentStoragePlan): AgentStoragePlan { return { ...plan, items: plan.items.filter(item => item.kind === 'native-home') }; }
function inspectHomes(dataRoot: string) { return homePlan(inspectAgentStorage({ dataRoot, scanHomes: false, nativeSessions: true })); }

test('native sessions require opt-in, complete references and explicit confirmation, and never touch accounts', async t => {
  const f = fixture(t), liveCodexId = randomUUID(), staleCodexId = randomUUID(), liveDshId = randomUUID(), staleDshId = randomUUID();
  const codex = codexHome(f.root, binding('a')), liveCodex = codexSession(codex.config, liveCodexId), staleCodex = codexSession(codex.config, staleCodexId);
  writeFile(liveCodex, '{"live":true}\n'); writeFile(staleCodex, '{"stale":true}\n'); age(codex.sessions);
  writeFile(path.join(codex.config, 'codex-home', 'auth.json'), 'credential');
  writeFile(path.join(codex.config, 'codex-home', 'config.toml'), 'model = "x"\n');
  conversation(f.root, { provider: 'codex', contextId: liveCodexId });
  const dshConfig = path.join(f.root, 'connections', 'dsh', 'model-bindings', binding('b')), liveDsh = dshSession(dshConfig, liveDshId), staleDsh = dshSession(dshConfig, staleDshId);
  writeFile(path.join(liveDsh, 'session.v4.jsonl'), '{}'); writeFile(path.join(liveDsh, 'meta.json'), '{}');
  writeFile(path.join(staleDsh, 'session.v4.jsonl'), '{}'); writeFile(path.join(staleDsh, 'meta.json'), '{}');
  age(path.join(f.root, 'connections', 'dsh', 'model-bindings', binding('b'), 'dsh-home', 'sessions'));
  conversation(f.root, { provider: 'dsh', contextId: liveDshId });

  assert.equal(inspectAgentStorage({ dataRoot: f.dataRoot, scanHomes: false }).items.some(item => item.kind === 'native-session'), false, 'automatic inventory never lists native sessions');
  const plan = inspect(f.dataRoot);
  assert.equal(plan.items.find(item => item.path === staleCodex)?.eligible, true);
  assert.equal(plan.items.find(item => item.path === staleDsh)?.eligible, true);
  assert.equal(plan.items.find(item => item.path === liveCodex)?.reason, 'native_session_referenced');
  assert.equal(plan.items.find(item => item.path === liveDsh)?.reason, 'native_session_referenced');

  const unconfirmed = collectAgentStorage(plan);
  assert.ok(unconfirmed.results.every(item => item.reason === 'native_session_confirmation_required'));
  assert.equal(fs.existsSync(staleCodex), true); assert.equal(fs.existsSync(staleDsh), true);

  const confirmed = collectAgentStorage(plan, 128, { confirmNativeSessions: true });
  assert.equal(confirmed.results.find(item => item.path === staleCodex)?.status, 'removed');
  assert.equal(confirmed.results.find(item => item.path === staleDsh)?.status, 'removed');
  assert.equal(fs.existsSync(staleCodex), false); assert.equal(fs.existsSync(staleDsh), false);
  assert.equal(fs.existsSync(liveCodex), true); assert.equal(fs.existsSync(liveDsh), true);
  assert.equal(fs.readFileSync(path.join(codex.config, 'codex-home', 'auth.json'), 'utf8'), 'credential');
  assert.equal(fs.readFileSync(path.join(codex.config, 'codex-home', 'config.toml'), 'utf8'), 'model = "x"\n');
  assert.equal(fs.readdirSync(path.dirname(codex.config)).some(name => name.startsWith('.reclaim-')), false);
});

test('unreadable headers, corrupt handoff indexes, unresolved bindings and contextless attempts retain affected sessions', async t => {
  const corrupt = fixture(t); {
    const home = codexHome(corrupt.root, binding('c')), stale = codexSession(home.config, randomUUID());
    writeFile(stale); age(home.sessions);
    const directory = path.join(corrupt.root, 'handoff-materials', randomUUID()); fs.mkdirSync(directory, { recursive: true });
    writeFile(path.join(directory, `index-${'0'.repeat(64)}.json`), '{}');
    const plan = inspect(corrupt.dataRoot);
    assert.equal(plan.items.find(item => item.path === stale)?.reason, 'native_session_reference_observation_failed');
    assert.ok(plan.diagnostics.includes('native_session_handoff_unreadable'));
    assert.equal(collectAgentStorage(plan, 128, { confirmNativeSessions: true }).results.every(item => item.status === 'retained'), true);
    assert.equal(fs.existsSync(stale), true);
  }
  const unresolved = fixture(t); {
    const home = codexHome(unresolved.root, binding('d')), stale = codexSession(home.config, randomUUID());
    writeFile(stale); age(home.sessions);
    conversation(unresolved.root, { provider: 'codex', contextId: randomUUID(), modelAccountId: 'account-without-binding' });
    assert.equal(inspect(unresolved.dataRoot).items.find(item => item.path === stale)?.reason, 'native_session_binding_unresolved');
  }
  const account = fixture(t); {
    const home = codexHome(account.root, binding('7')), stale = codexSession(home.config, randomUUID());
    writeFile(stale); age(home.sessions);
    const repo = conversation(account.root, { provider: 'codex', contextId: randomUUID() });
    const reference: NativeToolContent = { version: 3, provider: 'codex', contextId: randomUUID(), entry: toolEntry('account-tool'), session: { config: 'connections/codex', cwd: '/workspace' }, text: [] };
    const encoded = ConversationEntryStore.encodeReference(reference), db = new DatabaseSync(repo.filename);
    try { db.prepare('INSERT INTO conversation_entry_contents(conversation_id,content_revision,codec,body_bytes,body) VALUES(?,?,?,?,?)')
      .run('account', randomUUID(), encoded.codec, Buffer.from(encoded.body as Uint8Array).length, encoded.body); } finally { db.close(); }
    assert.equal(inspect(account.dataRoot).items.find(item => item.path === stale)?.eligible, true, 'account-root configs still carry an exact context identity');
  }
  const unknown = fixture(t); {
    const home = codexHome(unknown.root, binding('e')), stale = codexSession(home.config, randomUUID());
    writeFile(stale); age(home.sessions);
    conversation(unknown.root, { provider: 'codex', contextId: randomUUID(), attemptContext: false });
    assert.equal(inspect(unknown.dataRoot).items.find(item => item.path === stale)?.reason, 'native_session_context_unknown');
  }
  const headers = fixture(t); {
    const home = codexHome(headers.root, binding('f')), stale = codexSession(home.config, randomUUID());
    writeFile(stale); age(home.sessions);
    const db = new DatabaseSync(path.join(headers.root, 'conversations.sqlite'));
    try { db.exec('CREATE TABLE conversations(id TEXT); PRAGMA user_version=1;'); } finally { db.close(); }
    const plan = inspect(headers.dataRoot);
    assert.equal(plan.items.find(item => item.path === stale)?.reason, 'native_session_reference_observation_failed');
    assert.ok(plan.diagnostics.includes('native_session_headers_unreadable'));
  }
});

test('legacy v1 handoff rounds are verified individually and protect structured native identities', async t => {
  const f = fixture(t), home = codexHome(f.root, binding('6')), stale = codexSession(home.config, randomUUID());
  const heldId = randomUUID(), held = codexSession(home.config, heldId);
  writeFile(stale); writeFile(held); age(home.sessions);
  const conversationId = randomUUID(), directory = path.join(f.root, 'handoff-materials', conversationId); fs.mkdirSync(directory, { recursive: true });
  const legacyRound = (records: unknown[]) => {
    const data = { round: { id: randomUUID(), title: '第 1 轮', from: 1, through: records.length }, records };
    const identity = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const file = path.join(directory, `round-${identity}.json`);
    writeFile(file, JSON.stringify(data, null, 2) + '\n');
    return file;
  };
  const roundPath = legacyRound([{ id: 'legacy-tool', sequence: 1, kind: 'tool', role: 'system', text: 'output',
    provider: 'codex', contextId: heldId, session: { config: `connections/codex/model-bindings/${binding('6')}` } }]);
  writeFile(path.join(directory, `index-${'a'.repeat(64)}.json`), JSON.stringify({ conversationId, images: [], from: 1, through: 1,
    rounds: [{ id: 'round', title: '第 1 轮', from: 1, through: 1, path: roundPath }] }, null, 2) + '\n');
  const plan = inspect(f.dataRoot);
  assert.equal(plan.items.find(item => item.path === stale)?.eligible, true, 'verified legacy rounds without native identities do not block reclamation');
  assert.equal(plan.items.find(item => item.path === held)?.reason, 'native_session_referenced');
  const tampered = JSON.parse(fs.readFileSync(roundPath, 'utf8')) as { records: Array<{ text: string }> }; tampered.records[0]!.text = 'changed';
  fs.writeFileSync(roundPath, JSON.stringify(tampered, null, 2) + '\n');
  const corrupted = inspect(f.dataRoot);
  assert.equal(corrupted.items.find(item => item.path === stale)?.reason, 'native_session_reference_observation_failed');
  assert.ok(corrupted.diagnostics.includes('native_session_handoff_unreadable'));
});

test('durable legacy rows and handoff indexes protect their exact native sessions', async t => {
  const f = fixture(t), home = codexHome(f.root, binding('1')), stale = codexSession(home.config, randomUUID());
  const handedId = randomUUID(), handed = codexSession(home.config, handedId), legacy = codexSession(home.config, randomUUID());
  for (const file of [stale, handed, legacy]) writeFile(file, '{"session":true}\n');
  age(home.sessions);
  const repo = conversation(f.root, { provider: 'codex', contextId: randomUUID() });
  // The handoff index stores the durable native identity, not the tool body.
  const handedReference: NativeToolContent = { version: 3, provider: 'codex', contextId: handedId, entry: toolEntry('handoff-tool'), session: { config: `connections/codex/model-bindings/${binding('1')}`, cwd: '/workspace' }, text: [] };
  handoffSources(f.root, randomUUID(), [toolEntry('handoff-tool')], [], [], () => handedReference);
  const legacyReference: NativeToolContent = { version: 2, provider: 'codex', contextId: randomUUID(), entry: toolEntry('legacy-tool'),
    text: [{ source: { path: path.relative(f.root, legacy).split(path.sep).join('/'), offset: 0, length: 4, sha256: '0'.repeat(64), codec: 'json' }, pointer: [] }] };
  const encoded = ConversationEntryStore.encodeReference(legacyReference);
  const db = new DatabaseSync(repo.filename);
  try { db.prepare('INSERT INTO conversation_entry_contents(conversation_id,content_revision,codec,body_bytes,body) VALUES(?,?,?,?,?)')
    .run('legacy', randomUUID(), encoded.codec, Buffer.from(encoded.body as Uint8Array).length, encoded.body); } finally { db.close(); }

  const plan = inspect(f.dataRoot);
  assert.equal(plan.items.find(item => item.path === stale)?.eligible, true);
  assert.equal(plan.items.find(item => item.path === handed)?.reason, 'native_session_referenced');
  assert.equal(plan.items.find(item => item.path === legacy)?.reason, 'native_session_referenced', 'source path protects the session whose bytes are referenced');
  const result = collectAgentStorage(plan, 128, { confirmNativeSessions: true });
  assert.equal(result.results.find(item => item.path === stale)?.status, 'removed');
  assert.equal(fs.existsSync(handed), true); assert.equal(fs.existsSync(legacy), true);
});

test('occupancy and identity drift after planning retain the exact session', async t => {
  const drifted = fixture(t); {
    const home = codexHome(drifted.root, binding('2')), stale = codexSession(home.config, randomUUID());
    writeFile(stale, '{"v":1}\n'); age(home.sessions);
    const plan = inspect(drifted.dataRoot);
    assert.equal(plan.items.find(item => item.path === stale)?.eligible, true);
    fs.appendFileSync(stale, '{"v":2}\n');
    const result = collectAgentStorage(plan, 128, { confirmNativeSessions: true });
    assert.equal(result.results.find(item => item.path === stale)?.reason, 'storage_changed');
    assert.equal(fs.existsSync(stale), true);
  }
  if (process.platform !== 'darwin') return;
  const active = fixture(t); {
    const config = path.join(active.root, 'connections', 'dsh', 'model-bindings', binding('3')), session = dshSession(config, randomUUID());
    writeFile(path.join(session, 'session.v4.jsonl'), '{}'); age(session);
    const plan = inspect(active.dataRoot);
    assert.equal(plan.items.find(item => item.path === session)?.eligible, true);
    const child = spawn('sleep', ['30'], { cwd: session, stdio: 'ignore' });
    t.after(() => child.kill());
    let reason: string | undefined;
    for (let attempt = 0; attempt < 30 && reason !== 'storage_in_use'; attempt++) {
      await delay(100); reason = inspect(active.dataRoot).items.find(item => item.path === session)?.reason;
    }
    assert.equal(reason, 'storage_in_use');
    const result = collectAgentStorage(plan, 128, { confirmNativeSessions: true });
    assert.equal(result.results.find(item => item.path === session)?.status, 'retained');
    assert.equal(fs.existsSync(session), true);
  }
});

test('whole dead lease homes are reclaimed only after a complete no-reference proof and explicit confirmation', async t => {
  const f = fixture(t);
  const live = codexHome(f.root, binding('a')), dead = codexHome(f.root, binding('b'));
  const liveSession = codexSession(live.config, randomUUID()), deadSession = codexSession(dead.config, randomUUID());
  writeFile(liveSession, '{"live":true}\n'); writeFile(deadSession, '{"dead":true}\n');
  writeFile(path.join(live.config, 'codex-home', 'auth.json'), 'credential');
  writeFile(path.join(dead.config, 'codex-home', 'config.toml'), 'model = "x"\n');
  age(live.config); age(dead.config);
  // A persisted home root pins the live lease home; the dead one has no reference.
  conversation(f.root, { provider: 'codex', contextId: randomUUID(), nativeHomeRoot: live.config });
  // The shared account root holds sessions too but is never a whole-home candidate.
  const sharedSession = path.join(f.root, 'connections', 'codex', 'codex-home', 'sessions', '2026', '11', '03', `rollout-2026-11-03T15-52-32-${randomUUID()}.jsonl`);
  writeFile(sharedSession, '{"shared":true}\n'); age(path.join(f.root, 'connections', 'codex', 'codex-home'));

  assert.equal(inspectAgentStorage({ dataRoot: f.dataRoot, scanHomes: false }).items.some(item => item.kind === 'native-home'), false, 'automatic inventory never lists whole homes');
  const plan = inspectHomes(f.dataRoot);
  assert.equal(plan.items.some(item => item.path === path.join(f.root, 'connections', 'codex')), false, 'the shared account root is never a home candidate');
  assert.equal(plan.items.find(item => item.path === live.config)?.reason, 'native_home_referenced');
  assert.equal(plan.items.find(item => item.path === dead.config)?.eligible, true);
  assert.equal(plan.items.find(item => item.path === dead.config)?.reason, 'unused_native_home');

  const unconfirmed = collectAgentStorage(plan);
  assert.ok(unconfirmed.results.every(item => item.reason === 'native_home_confirmation_required'));
  assert.equal(fs.existsSync(dead.config), true);

  const confirmed = collectAgentStorage(plan, 128, { confirmNativeSessions: true });
  assert.equal(confirmed.results.find(item => item.path === dead.config)?.status, 'removed');
  assert.equal(confirmed.results.find(item => item.path === dead.config)?.reason, 'unused_native_home');
  assert.equal(fs.existsSync(dead.config), false, 'the whole dead lease home directory is removed');
  assert.equal(fs.existsSync(live.config), true);
  assert.equal(fs.existsSync(liveSession), true);
  assert.equal(fs.readFileSync(path.join(live.config, 'codex-home', 'auth.json'), 'utf8'), 'credential');
  assert.equal(fs.existsSync(sharedSession), true, 'shared-home sessions are not touched by home-level reclamation');
  assert.equal(fs.readdirSync(path.dirname(dead.config)).some(name => name.startsWith('.reclaim-')), false);
});

test('a referenced session inside a home retains the whole directory even when no reference names the home path', async t => {
  const f = fixture(t), home = codexHome(f.root, binding('c')), heldId = randomUUID();
  const held = codexSession(home.config, heldId), stale = codexSession(home.config, randomUUID());
  writeFile(held, '{"held":true}\n'); writeFile(stale, '{"stale":true}\n'); age(home.config);
  const repo = conversation(f.root, { provider: 'codex', contextId: randomUUID() });
  // The durable row records only the account root plus an exact context identity;
  // the home path itself is not referenced, but the session inside it is.
  const reference: NativeToolContent = { version: 3, provider: 'codex', contextId: heldId, entry: toolEntry('held-tool'), session: { config: 'connections/codex', cwd: '/workspace' }, text: [] };
  const encoded = ConversationEntryStore.encodeReference(reference), db = new DatabaseSync(repo.filename);
  try { db.prepare('INSERT INTO conversation_entry_contents(conversation_id,content_revision,codec,body_bytes,body) VALUES(?,?,?,?,?)')
    .run('held', randomUUID(), encoded.codec, Buffer.from(encoded.body as Uint8Array).length, encoded.body); } finally { db.close(); }
  const plan = inspectHomes(f.dataRoot);
  assert.equal(plan.items.find(item => item.path === home.config)?.reason, 'native_home_session_referenced');
  assert.equal(plan.items.find(item => item.path === home.config)?.eligible, false);
  const result = collectAgentStorage(plan, 128, { confirmNativeSessions: true });
  assert.equal(result.results.some(item => item.path === home.config && item.status === 'removed'), false);
  assert.equal(fs.existsSync(home.config), true);
  assert.equal(fs.existsSync(held), true); assert.equal(fs.existsSync(stale), true);
});

test('provider-wide uncertainty and a fresh home retain whole homes', async t => {
  const unresolved = fixture(t); {
    const home = codexHome(unresolved.root, binding('d')), session = codexSession(home.config, randomUUID());
    writeFile(session); age(home.config);
    conversation(unresolved.root, { provider: 'codex', contextId: randomUUID(), modelAccountId: 'account-without-binding' });
    assert.equal(inspectHomes(unresolved.dataRoot).items.find(item => item.path === home.config)?.reason, 'native_home_binding_unresolved');
  }
  const unknown = fixture(t); {
    const home = codexHome(unknown.root, binding('e')), session = codexSession(home.config, randomUUID());
    writeFile(session); age(home.config);
    conversation(unknown.root, { provider: 'codex', contextId: randomUUID(), attemptContext: false });
    assert.equal(inspectHomes(unknown.dataRoot).items.find(item => item.path === home.config)?.reason, 'native_home_context_unknown');
  }
  const recent = fixture(t); {
    const home = codexHome(recent.root, binding('f')), session = codexSession(home.config, randomUUID());
    writeFile(session); // not aged
    assert.equal(inspectHomes(recent.dataRoot).items.find(item => item.path === home.config)?.reason, 'storage_recent');
  }
  const corrupt = fixture(t); {
    const home = codexHome(corrupt.root, binding('1')), session = codexSession(home.config, randomUUID());
    writeFile(session); age(home.config);
    const directory = path.join(corrupt.root, 'handoff-materials', randomUUID()); fs.mkdirSync(directory, { recursive: true });
    writeFile(path.join(directory, `index-${'0'.repeat(64)}.json`), '{}');
    const plan = inspectHomes(corrupt.dataRoot);
    assert.equal(plan.items.find(item => item.path === home.config)?.reason, 'native_home_reference_observation_failed');
    assert.equal(collectAgentStorage(plan, 128, { confirmNativeSessions: true }).results.every(item => item.status === 'retained'), true);
    assert.equal(fs.existsSync(home.config), true);
  }
});

test('identity drift after planning retains the whole home', async t => {
  const f = fixture(t), home = codexHome(f.root, binding('2')), session = codexSession(home.config, randomUUID());
  writeFile(session, '{"v":1}\n'); age(home.config);
  const plan = inspectHomes(f.dataRoot);
  assert.equal(plan.items.find(item => item.path === home.config)?.eligible, true);
  fs.appendFileSync(session, '{"v":2}\n');
  const result = collectAgentStorage(plan, 128, { confirmNativeSessions: true });
  assert.equal(result.results.find(item => item.path === home.config)?.reason, 'storage_changed');
  assert.equal(fs.existsSync(home.config), true);
});
