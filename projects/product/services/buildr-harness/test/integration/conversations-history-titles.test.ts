import { body } from '../../src/process/transport.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import type { ConversationEntry, ExecutorObservation, ExecutorTitleInput } from '../../src/contracts.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { builtinDescriptors, fake, fixture, connected, waitUntil, send } from '../support/conversations-fixture.ts';

test('default history pages retain five rounds including dense tools and in-round answers, with exact earlier cursors', async t => {
  for (const mode of ['named', 'legacy', 'mixed']) await t.test(`${mode} round identities`, async () => {
    const f = fixture([]);
    try {
      const created = await f.service.conversations.create('workspace-one', {});
      const entries: ConversationEntry[] = [];
      for (let round = 1; round <= 12; round++) {
        const append = (kind: ConversationEntry['kind'], role: ConversationEntry['role'], text: string) => entries.push({ id: `entry-${entries.length + 1}`, sequence: entries.length + 1, createdAt: created.updatedAt, kind, role, text, ...(mode === 'legacy' || mode === 'mixed' && (kind !== 'message' || round % 2 === 0 && role === 'user') ? {} : {runId:`run-${round}`}) });
        append('message', 'user', `request ${round}`);
        append('notice', 'user', `answer to approval ${round}`);
        for (let tool = 0; tool < (round === 12 ? 120 : 2); tool++) append('tool', 'system', `tool ${round}/${tool}`);
        append('message', 'assistant', `reply ${round}`);
      }
      const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
      const stored = repository.readConversation(created.id)!;
      const revision = stored.view.revision;
      stored.view.entries = entries; stored.view.revision = randomUUID();
      repository.saveConversation(stored, revision);
      const recent = f.service.conversations.read('workspace-one', created.id);
      assert.ok(recent.entries.length > 100, 'a tool-heavy round must not displace the latest five rounds');
      const pages: ConversationEntry[] = []; let page = recent;
      for (const rounds of [[8, 9, 10, 11, 12], [3, 4, 5, 6, 7], [1, 2]]) {
        assert.deepEqual(page.entries.filter(entry => entry.kind === 'message' && entry.role === 'user').map(entry => entry.text), rounds.map(round => `request ${round}`));
        assert.equal(page.entries.filter(entry => entry.kind === 'notice').length, rounds.length);
        pages.unshift(...page.entries);
        if (page.nextEntryCursor === undefined) break;
        assert.equal(page.nextEntryCursor, page.entries[0]!.sequence);
        page = f.service.conversations.read('workspace-one', created.id, {before:page.nextEntryCursor});
      }
      assert.equal(page.nextEntryCursor, undefined);
      assert.deepEqual(pages, entries);
      assert.equal(new Set(pages.map(entry => entry.id)).size, entries.length);
      const explicit = f.service.conversations.read('workspace-one', created.id, {limit:100});
      assert.deepEqual(explicit.entries, entries.slice(-100), 'explicit entry-count callers retain their existing semantics');
      assert.equal(explicit.nextEntryCursor, explicit.entries[0]!.sequence);
      const subscription = f.service.conversations.subscribe('workspace-one', created.id);
      const iterator = subscription.events[Symbol.asyncIterator]();
      try {
        const snapshot = (await iterator.next()).value!;
        assert.deepEqual(snapshot.payload.conversation!.entries, recent.entries);
        assert.equal(snapshot.payload.conversation!.nextEntryCursor, recent.nextEntryCursor);
      } finally { subscription.close(); await iterator.return?.(); }
    } finally { await f.close(); }
  });
});

test('default history pages keep a dense round input when the round exceeds the legacy entry cap but not the byte budget', async () => {
  const f = fixture([]);
  try {
    const created = await f.service.conversations.create('workspace-one', {});
    const entries: ConversationEntry[] = [
      { id: 'dense-input', sequence: 1, kind: 'message', role: 'user', text: '这个要求必须和当前轮次一起返回', runId: 'dense-run', createdAt: created.updatedAt },
      ...Array.from({ length: 260 }, (_, index): ConversationEntry => ({
        id: `dense-tool-${index}`,
        sequence: index + 2,
        kind: 'tool',
        role: 'system',
        runId: 'dense-run',
        text: `工具 ${index} 的有限输出`,
        status: 'completed',
        createdAt: created.updatedAt,
      })),
      { id: 'dense-answer', sequence: 262, kind: 'message', role: 'assistant', text: '当前轮最终答复', runId: 'dense-run', status: 'completed', createdAt: created.updatedAt },
    ];
    const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
    const stored = repository.readConversation(created.id)!;
    const revision = stored.view.revision;
    stored.view.entries = entries; stored.view.revision = randomUUID();
    repository.saveConversation(stored, revision);

    const recent = f.service.conversations.read('workspace-one', created.id);
    assert.equal(recent.entries.length, entries.length);
    assert.deepEqual(recent.entries.map(entry => entry.id), entries.map(entry => entry.id));
    assert.equal(recent.nextEntryCursor, undefined);

    const explicit = f.service.conversations.read('workspace-one', created.id, { limit: 100 });
    assert.deepEqual(explicit.entries, entries.slice(-100), 'explicit entry-count callers retain their existing semantics');
    assert.equal(explicit.nextEntryCursor, explicit.entries[0]!.sequence);
  } finally {
    await f.close();
  }
});

test('default compact pages keep the round prompt when the round exceeds the byte budget', async () => {
  const f = fixture([]);
  try {
    const created = await f.service.conversations.create('workspace-one', {});
    const entries: ConversationEntry[] = [
      { id: 'oversized-input', sequence: 1, kind: 'message', role: 'user', text: '这条输入必须和当前执行一起出现在固定头部', runId: 'oversized-run', status: 'accepted', createdAt: created.updatedAt },
      ...Array.from({ length: 720 }, (_, index): ConversationEntry => ({
        id: `oversized-tool-${index}`,
        sequence: index + 2,
        kind: 'tool',
        role: 'system',
        runId: 'oversized-run',
        text: `工具 ${index} 的有限输出 ` + 'x'.repeat(700),
        status: 'completed',
        createdAt: created.updatedAt,
      })),
    ];
    const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
    const stored = repository.readConversation(created.id)!;
    const revision = stored.view.revision;
    stored.view.entries = entries; stored.view.revision = randomUUID();
    repository.saveConversation(stored, revision);

    const recent = f.service.conversations.read('workspace-one', created.id, { compactTools: true });
    assert.equal(recent.entries[0]?.id, 'oversized-input', 'the first page must retain the prompt outside the byte-bounded tail');
    assert.equal(recent.nextEntryCursor, recent.entries[1]!.sequence, 'the cursor must point at the first tail entry so the omitted middle remains reachable');
    assert.equal(recent.entries.at(-1)?.sequence, entries.at(-1)!.sequence);

    const explicit = f.service.conversations.read('workspace-one', created.id, { limit: 100, compactTools: true });
    assert.deepEqual(explicit.entries, entries.slice(-100), 'explicit entry-count callers retain their existing semantics');
    assert.equal(explicit.nextEntryCursor, explicit.entries[0]!.sequence);

    const recovered = new Map(recent.entries.map(entry => [entry.id, entry]));
    let before: number | undefined = recent.nextEntryCursor;
    while (before !== undefined) {
      const page = f.service.conversations.read('workspace-one', created.id, { before, compactTools: true });
      for (const entry of page.entries) recovered.set(entry.id, entry);
      before = page.nextEntryCursor;
    }
    assert.equal(recovered.size, entries.length);
    assert.deepEqual([...recovered.values()].sort((left, right) => left.sequence - right.sequence), entries);
  } finally {
    await f.close();
  }
});

test('default round pages split oversized rounds by bytes without dropping durable entries', async () => {
  const f = fixture([]);
  try {
    const created = await f.service.conversations.create('workspace-one', {});
    const entries: ConversationEntry[] = Array.from({length:10}, (_, index) => ({id:`large-${index}`,sequence:index + 1,createdAt:created.updatedAt,kind:'tool',role:'system',runId:'large-round',text:'x'.repeat(700 * 1024)}));
    const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
    const stored = repository.readConversation(created.id)!;
    const revision = stored.view.revision;
    stored.view.entries = entries; stored.view.revision = randomUUID();
    repository.saveConversation(stored, revision);
    const recovered: ConversationEntry[] = [];
    let page = f.service.conversations.read('workspace-one', created.id);
    assert.ok(page.nextEntryCursor);
    for (;;) {
      assert.ok(page.entries.length > 0);
      assert.ok(Buffer.byteLength(JSON.stringify(page.entries)) <= 4 * 1024 * 1024);
      recovered.unshift(...page.entries);
      if (page.nextEntryCursor === undefined) break;
      const next = f.service.conversations.read('workspace-one', created.id, {before:page.nextEntryCursor});
      assert.ok(next.entries.at(-1)!.sequence < page.entries[0]!.sequence);
      page = next;
    }
    assert.deepEqual(recovered, entries);
    // Compare durable JSON bytes; deferred optional getters are not persisted fields.
    assert.deepEqual(JSON.parse(JSON.stringify(repository.readConversation(created.id)!.view.entries)), entries);
  } finally { await f.close(); }
});

test('input acceptance writes a first-message fallback title and starts one model summary in parallel', async () => {
  const native = fake('local', { hold: true }); const open = native.executor.open; const titles: any[] = [];
  let release!: (title: string) => void; const pending = new Promise<string>(resolve => { release = resolve; });
  native.executor.open = async input => ({ ...await open(input), async generateTitle(input) { titles.push(input); return await pending; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', '请梳理供应商入驻业务');
    const fallback = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'running' && ['fallback', 'generating'].includes(value.titleState?.status ?? ''));
    assert.equal(fallback.title, '请梳理供应商入驻业务');
    await waitUntil(() => titles.length, value => value === 1);
    const generating = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.titleState?.status === 'generating');
    assert.equal(generating.run?.status, 'running');
    release('供应商入驻审核流程梳理');
    const named = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.title === '供应商入驻审核流程梳理' && value.run?.status === 'running');
    assert.equal(named.titleState?.status,'generated'); assert.equal(titles.length, 1);
    const description = JSON.parse(titles[0].description); assert.equal(description.messages[0].text, '请梳理供应商入驻业务'); assert.equal(description.messages.length, 1);
    for (const context of native.contexts.values()) context.unblock?.();
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(native.sends.length, 1); assert.equal(done.entries.filter(entry => entry.role === 'user').length, 1);
    send(f.service, view.id, 'local', '继续检查'); await waitUntil(()=>native.sends.length,n=>n===2); for (const context of native.contexts.values()) context.unblock?.();
    await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.entries.filter(entry=>entry.role==='user').length===2);
    assert.equal(titles.length, 1);
    await f.service.close(); const restored = createAgentService(f.options); try { await restored.conversations.observe('workspace-one', view.id); await new Promise(resolve=>setTimeout(resolve,10)); assert.equal(titles.length, 1); } finally { await restored.close(); }
  } finally { await f.close(); }
});

test('a mixed technical provider title within the 64-character limit is accepted', async () => {
  const native = fake(); const open = native.executor.open;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { return '排查 agent-conversations 接口报错'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', '排查标题生成');
    const named = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.title === '排查 agent-conversations 接口报错' && value.run?.status === 'completed');
    assert.equal(named.title, '排查 agent-conversations 接口报错'); assert.equal(named.titleState?.status, 'generated');
  } finally { await f.close(); }
});

test('a failed automatic title keeps the fallback title and is not retried on later messages', async () => {
  const native = fake(); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; throw new Error('agent_title_failed'); } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'start work');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.titleState?.status === 'failed');
    assert.equal(failed.title, 'start work'); assert.match(failed.titleState!.reason!, /agent_title_failed/); assert.equal(calls, 1);
    send(f.service, view.id, 'local', 'next'); await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.run.id !== failed.run!.id);
    assert.equal(calls, 1); assert.equal(f.service.conversations.read('workspace-one', view.id).title, 'start work');
  } finally { await f.close(); }
});

test('an explicit title failure keeps the fallback name and a later manual name still wins', async () => {
  const native = fake(); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; throw new Error('agent_native_request_failed'); } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'automatic title failure');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.titleState?.status === 'failed');
    assert.equal(failed.title, 'automatic title failure');
    await assert.rejects(f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: failed.revision }), { code: 'agent_title_failed' });
    const preserved = f.service.conversations.read('workspace-one', view.id);
    assert.equal(preserved.title, 'automatic title failure'); assert.equal(preserved.titleState?.status, 'failed');
    const renamed = await f.service.conversations.update('workspace-one', view.id, { expectedRevision: preserved.revision, title: '我的手动标题' });
    assert.equal(renamed.title, '我的手动标题');
    const before = calls; send(f.service, view.id, 'local', 'next work');
    await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.run.id !== failed.run!.id);
    assert.equal(calls, before); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '我的手动标题');
  } finally { await f.close(); }
});

test('a failed automatic title is not retried when another participant continues the conversation', async () => {
  const first = fake('first'), second = fake('second');
  const openFirst = first.executor.open, openSecond = second.executor.open; let firstCalls = 0, secondCalls = 0;
  first.executor.open = async input => ({ ...await openFirst(input), async generateTitle() { firstCalls++; throw new Error('agent_title_timeout'); } });
  second.executor.open = async input => ({ ...await openSecond(input), async generateTitle() { secondCalls++; return '第二个执行方生成的标题'; } });
  const f = fixture([first.executor, second.executor]);
  try {
    await connected(f.service, 'first'); await connected(f.service, 'second');
    const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'first', 'start with first');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.titleState?.status === 'failed');
    assert.equal(firstCalls, 1); assert.equal(failed.title, 'start with first');
    send(f.service, view.id, 'second', 'continue with second');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.participants.length === 2);
    assert.equal(secondCalls, 0); assert.equal(done.title, 'start with first');
    const named = await f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: done.revision });
    assert.equal(named.title, '第二个执行方生成的标题'); assert.equal(secondCalls, 1);
  } finally { await f.close(); }
});

test('a stale generating title from a stopped process reads as failed without a scan or retry', async () => {
  const native = fake(); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; return '不应再次生成'; } });
  const f = fixture([native.executor]); let restored: ReturnType<typeof createAgentService> | undefined;
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'historical title');
    await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.titleState?.status === 'generated');
    await f.service.close();
    const repo = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
    try {
      const record = repo.readConversation(view.id)!; const prior = record.view.revision;
      record.view.title = '历史兜底标题'; record.titleOrigin = 'fallback'; record.view.titleState = { status: 'generating' }; record.view.revision = randomUUID();
      repo.saveConversation(record, prior);
    } finally { repo.stopReadModels(); }
    restored = createAgentService(f.options);
    const recovered = restored.conversations.read('workspace-one', view.id);
    assert.equal(recovered.title, '历史兜底标题'); assert.equal(recovered.titleState?.status, 'failed'); assert.match(recovered.titleState?.reason ?? '', /重启/);
    assert.equal(restored.conversations.listAll(['workspace-one'], {}).conversations.find(item => item.id === view.id)?.titleState?.status, 'failed');
    await restored.conversations.recoverInterrupted(); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls, 1); assert.equal(restored.conversations.read('workspace-one', view.id).title, '历史兜底标题');
  } finally { await restored?.close(); await f.close(); }
});

test('manual rename wins over a delayed automatic title and failed summaries do not consume another work turn', async () => {
  const native = fake(); const open = native.executor.open; let release!: (title: string) => void; let started = false; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { started = true; calls++; return await new Promise<string>(resolve => { release = resolve; }); } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'first work');
    await waitUntil(() => started, Boolean); const current = f.service.conversations.read('workspace-one', view.id); assert.equal(current.titleState?.status,'generating');
    await f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, title: '我的手动标题' }); release('延迟生成的标题');
    await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(f.service.conversations.read('workspace-one', view.id).titleState?.status,'manual'); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '我的手动标题'); assert.equal(native.sends.length, 1);
    send(f.service, view.id, 'local', 'second work'); await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed'); assert.equal(calls, 1);
  } finally { await f.close(); }
});

test('explicit title action summarizes a legacy/manual name with exact revision and preserves a concurrent rename', async () => {
  const native = fake(); const open = native.executor.open; let release!: (title: string) => void; let calls = 0; let delayed = false;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; return delayed ? await new Promise<string>(resolve => { release = resolve; }) : '供应商入驻异常处理梳理'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', { title: '旧版首句截取而来的一个很长很长的对话标题' }); send(f.service, view.id, 'local', 'inspect supplier');
    let current = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed'); assert.equal(calls, 0);
    await assert.rejects(f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: view.revision }), { code: 'agent_revision_conflict' });
    current = await f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: current.revision }); assert.equal(current.title, '供应商入驻异常处理梳理'); assert.equal(native.sends.length, 1);
    delayed = true; const pending = f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: current.revision });
    await waitUntil(() => Boolean(release), Boolean); current = f.service.conversations.read('workspace-one', view.id); await f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, title: '保留我的最新命名' }); release('不能覆盖的新名字');
    await assert.rejects(pending, { code: 'agent_revision_conflict' }); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '保留我的最新命名');
  } finally { await f.close(); }
});

test('an oversized automatic title keeps the fallback name and spends the single attempt', async () => {
  const native = fake(); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; return '这是一段超过六十四个字符的冗长描述标题而不是精短标题'.repeat(3); } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'first');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.titleState?.status === 'failed');
    assert.equal(failed.title, 'first'); assert.equal(calls, 1);
    await f.service.close(); const restored = createAgentService(f.options);
    try { send(restored, view.id, 'local', 'after restart'); await waitUntil(() => restored.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed'); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(calls, 1); assert.equal(native.sends.length, 2); assert.equal(restored.conversations.read('workspace-one', view.id).title, 'first'); }
    finally { await restored.close(); }
  } finally { await f.close(); }
});

test('legacy attempt markers are ignored and the first completed round still gets its one automatic attempt', async () => {
  const native = fake(); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; return '明确授权后生成的精短标题'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {});
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'));
    try { db.prepare("UPDATE conversations SET body=json_set(json_remove(body,'$.titleOrigin'),'$.titleAttempted',true,'$.earlyTitleAttempted',true,'$.titleAttemptsByParticipant',json('{}')) WHERE id=?").run(view.id); } finally { db.close(); }
    send(f.service, view.id, 'local', 'legacy neutral title');
    const named = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.title === '明确授权后生成的精短标题');
    assert.equal(named.titleState?.status, 'generated'); assert.equal(calls, 1);
  } finally { await f.close(); }
});

test('a native title during the first round updates the unified stream but cannot overwrite a manual name', async () => {
  const native = fake('local', { hold: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'first');
    await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'running');
    const subscription = f.service.conversations.subscribe('workspace-one', view.id); const iterator = subscription.events[Symbol.asyncIterator](); await iterator.next();
    native.sends[0]!.onEvent({ type: 'title', title: '原生延迟生成的业务标题' });
    const event = (await iterator.next()).value!; assert.equal(event.type, 'conversation'); assert.equal(event.payload.conversation.title, '原生延迟生成的业务标题'); subscription.close();
    for (const context of native.contexts.values()) context.unblock?.();
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(done.title, '原生延迟生成的业务标题'); assert.equal(done.titleState?.status, 'generated');
    await f.service.conversations.update('workspace-one', view.id, { expectedRevision: done.revision, title: '手动标题' });
    native.sends[0]!.onEvent({ type: 'title', title: '不能覆盖手动名的原生标题' }); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '手动标题');
  } finally { await f.close(); }
});

test('explicit title input retains the original topic and recent exchange with a bounded text-only budget', async () => {
  const native = fake(); const open = native.executor.open; let description = '';
  native.executor.open = async input => ({ ...await open(input), async generateTitle(input) { description = input.description; return '本地服务运行架构重构'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', { title: '保留旧标题直到明确生成' });
    send(f.service, view.id, 'local', '重构本地服务运行架构' + '资料'.repeat(1500)); await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    send(f.service, view.id, 'local', '继续'); const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    await f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: done.revision });
    const messages = JSON.parse(description).messages; assert.equal(messages.length, 4); assert.equal(messages[0].role, 'user'); assert.match(messages[0].text, /^重构本地服务运行架构/); assert.equal(messages[2].text, '继续'); assert.ok(Buffer.byteLength(description) < 8 * 1024); assert.ok(messages.every((entry: any) => ['user', 'assistant'].includes(entry.role) && Buffer.byteLength(entry.text) <= 1024));
  } finally { await f.close(); }
});

test('unavailable title generation keeps the fallback name and a stale generating state reads as failed after restart', async () => {
  const native=fake(),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const view=await f.service.conversations.create('workspace-one',{});send(f.service,view.id,'local','work');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',view.id),value=>value.run?.status==='completed'&&value.titleState?.status==='unavailable');
    assert.equal(done.title,'work');assert.match(done.titleState!.reason!,/独立标题生成能力/);assert.equal(native.sends.length,1);
    await f.service.close();
    const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    try{const record=repo.readConversation(view.id)!;const prior=record.view.revision;record.view.titleState={status:'generating'};record.view.revision=randomUUID();repo.saveConversation(record,prior);}finally{repo.stopReadModels();}
    const restored=createAgentService(f.options);
    try{const recovered=restored.conversations.read('workspace-one',view.id);assert.equal(recovered.titleState?.status,'failed');assert.match(recovered.titleState?.reason??'',/重启/);assert.equal(recovered.title,'work');assert.equal(native.sends.length,1);}finally{await restored.close();}
  }finally{await f.close();}
});

test('an automatic title failure keeps the fallback name, records a safe reason and never replays work',async()=>{
  const native=fake(),open=native.executor.open;let calls=0;
  native.executor.open=async input=>({...await open(input),async generateTitle(){calls++;throw new Error('Bearer private-secret arbitrary vendor error');}});
  const f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});send(f.service,created.id,'local','独立标题失败不影响工作');
    const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed'&&v.titleState?.status==='failed');
    assert.equal(failed.title,'独立标题失败不影响工作');assert.equal(calls,1);assert.match(failed.titleState!.reason!,/agent_title_failed/);
    assert.doesNotMatch(failed.titleState!.reason!,/private-secret|Bearer|vendor/);assert.equal(native.sends.length,1);
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    const body=(db.prepare('select body from conversations where id=?').get(created.id) as {body:string}).body;db.close();
    assert.doesNotMatch(body,/private-secret|Bearer|vendor/);
    const stored=JSON.parse(body);assert.equal(stored.titleDiagnostics,undefined);assert.equal(stored.earlyTitleAttempted,undefined);assert.equal(stored.titleAttemptsByParticipant,undefined);
    await f.service.close();const restored=createAgentService(f.options);
    try{const cold=restored.conversations.read('workspace-one',created.id);assert.equal(cold.title,'独立标题失败不影响工作');assert.equal(cold.titleState?.status,'failed');assert.equal(calls,1);assert.equal(native.sends.length,1);}finally{await restored.close();}
  }finally{await f.close();}
});

test('manual title refresh failure leaves a persisted safe reason and preserves the existing title',async()=>{
  const native=fake(),open=native.executor.open;
  native.executor.open=async input=>({...await open(input),async generateTitle(){throw new Error('Bearer private-secret arbitrary vendor error');}});
  const f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{title:'用户的名字'});send(f.service,chat.id,'local','工作');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    await assert.rejects(f.service.conversations.generateTitle('workspace-one',chat.id,{expectedRevision:done.revision}));
    const current=f.service.conversations.read('workspace-one',chat.id);assert.equal(current.title,'用户的名字');assert.equal(current.titleState?.status,'failed');
    assert.match(current.titleState!.reason!,/agent_title_failed/);assert.doesNotMatch(current.titleState!.reason!,/private-secret|Bearer|vendor/);assert.equal(native.sends.length,1);
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    const body=(db.prepare('select body from conversations where id=?').get(chat.id) as {body:string}).body;db.close();
    assert.doesNotMatch(body,/private-secret|Bearer|vendor/);assert.equal(JSON.parse(body).titleDiagnostics,undefined);
  }finally{await f.close();}
});

test('the accepted round shows a first-message fallback title and starts the single model summary in parallel',async()=>{
  let accept!:()=>void;const admitted=new Promise<void>(resolve=>{accept=resolve;});let calls=0;
  const native=fake('local',{hold:true,beforeAccepted:admitted}),open=native.executor.open;
  native.executor.open=async input=>({...await open(input),generateTitle:async()=>{calls++;return '对话面板分隔线优化';}});
  const f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','优化对话面板分隔线');await waitUntil(()=>native.sends.length,n=>n===1);
    const initial=f.service.conversations.read('workspace-one',chat.id);
    assert.equal(initial.title,'新对话');assert.equal(initial.titleState?.status,'pending');assert.equal(calls,0,'nothing requests a model title before acceptance');
    accept();
    const accepted=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.title==='对话面板分隔线优化');
    assert.equal(accepted.titleState?.status,'generated');assert.equal(accepted.run?.status,'running');assert.equal(calls,1,'the title request starts before the first round completes');
    native.contexts.get(native.sends[0].contextRef.id)!.unblock!();
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    assert.equal(done.title,'对话面板分隔线优化');assert.equal(calls,1);assert.equal(native.sends.length,1);
    send(f.service,chat.id,'local','后续消息');await waitUntil(()=>native.sends.length,n=>n===2);
    native.contexts.get(native.sends[1].contextRef.id)!.unblock!();
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed'&&v.entries.filter(entry=>entry.role==='assistant'&&entry.kind==='message').length===2);
    assert.equal(calls,1,'later completed rounds never request another automatic title');
  }finally{accept();for(const c of native.contexts.values())c.unblock?.();await f.close();}
});

for(const manual of [false,true])test('a late automatic title cannot overwrite a newer round or a manual name; manual='+manual,async()=>{
  let release!:(value:string)=>void;const pending=new Promise<string>(resolve=>{release=resolve;});let bCalls=0;
  const a=fake('first'),b=fake('second',{hold:true}),openA=a.executor.open,openB=b.executor.open;
  a.executor.open=async input=>({...await openA(input),async generateTitle(){return await pending;}});
  b.executor.open=async input=>({...await openB(input),async generateTitle(){bCalls++;return '第二个执行方的标题';}});
  const f=fixture([a.executor,b.executor]);
  try{
    await connected(f.service,'first');await connected(f.service,'second');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'first','原执行方');await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed'&&v.titleState?.status==='generating');
    send(f.service,chat.id,'second','新执行方继续工作');await waitUntil(()=>b.sends.length,n=>n===1);assert.equal(bCalls,0,'a later round never starts another automatic title');
    if(manual){const current=f.service.conversations.read('workspace-one',chat.id);await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:current.revision,title:'用户手动名称'});}
    release('旧执行方迟到的标题');
    const settled=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.titleState?.status===(manual?'manual':'fallback'));
    assert.equal(settled.title,manual?'用户手动名称':'原执行方');assert.equal(bCalls,0);assert.equal(a.sends.length,1);assert.equal(b.sends.length,1);
  }finally{release?.('结束');for(const c of b.contexts.values())c.unblock?.();await f.close();}
});

test('native compaction phase persists, rejects foreign snapshots and clears on uncertainty and stop',async()=>{
 const native=fake('local',{hold:true}),f=fixture([native.executor]);
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='running');
  const input=native.sends[0]!,phase={id:'compact',startedAt:'2026-11-10T10:00:00.000Z'};
  const observe=(contextCompaction:ExecutorObservation['contextCompaction'],status:ExecutorObservation['status']='running',id='execution-1')=>input.onEvent({type:'observation',observation:{status,tools:[],executionRef:{id},contextCompaction}});
  observe(phase,'running','foreign');assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,undefined);
  observe(phase);assert.deepEqual(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,phase);
  observe({...phase,startedAt:'2026-11-10T11:00:00.000Z'});assert.deepEqual(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,phase);
  observe(undefined);assert.deepEqual(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,phase);
  const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));try{assert.deepEqual(repo.readConversation(chat.id)!.view.run!.contextCompaction,phase);}finally{repo.stopReadModels();}
  observe(null);assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,undefined);
  observe(phase);observe(undefined,'unknown');assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,undefined);
  observe(phase);const current=f.service.conversations.read('workspace-one',chat.id),run=current.run!;
  await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:current.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
  observe(phase);assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,undefined);
 }finally{await f.close();}
});

for(const status of ['completed','failed','stopped'] as const)test('compaction is removed by native terminal '+status+' and late observation cannot restore it',async()=>{
 const native=fake('local',{hold:true}),f=fixture([native.executor]);
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='running');
  const input=native.sends[0]!,observation:ExecutorObservation={status:'running',tools:[],executionRef:{id:'execution-1'},contextCompaction:{id:'compact',startedAt:'2026-11-10T10:00:00.000Z'}};
  input.onEvent({type:'observation',observation});assert.ok(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction);
  input.onEvent({type:'completed',status});
  assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,undefined);
  input.onEvent({type:'observation',observation:{...observation,status:status==='stopped'?'stopped':'idle',contextCompaction:null}});
  input.onEvent({type:'observation',observation});
  assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.contextCompaction,undefined);
 }finally{await f.close();}
});

test('custom titleTimeoutMs aborts hanging automatic title with agent_title_timeout rather than agent_title_cancelled', async () => {
  const native = fake('local');
  const open = native.executor.open;
  const abortReasons: unknown[] = [];
  native.executor.open = async options => ({
    ...await open(options),
    async generateTitle(input) {
      return await new Promise<string | undefined>((_resolve, reject) => {
        const onAbort = () => {
          abortReasons.push(input.signal.reason);
          reject(new Error('agent_title_cancelled'));
        };
        if (input.signal.aborted) onAbort();
        else input.signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  });
  const f = fixture([native.executor], { titleTimeoutMs: 40 });
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', '挂起超时测试');
    const failed = await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => value.run?.status === 'completed' && value.titleState?.status === 'failed',
    );
    assert.match(failed.titleState!.reason!, /agent_title_timeout/);
    assert.doesNotMatch(failed.titleState!.reason!, /agent_title_cancelled/);
    await waitUntil(() => abortReasons.length, count => count === 1);
    assert.ok(abortReasons[0] instanceof Error);
    assert.equal((abortReasons[0] as Error).message, 'agent_title_timeout');
  } finally {
    await f.close();
  }
});

test('streaming transient title failure retries once after first round completes with visible answer and never retries on later turns', async () => {
  const native = fake('local', { hold: true });
  const open = native.executor.open;
  const seen: ExecutorTitleInput[] = [];
  native.executor.open = async options => ({
    ...await open(options),
    async models() {
      return [{
        id: 'reasoner',
        label: 'Reasoner',
        isDefault: true,
        reasoningEfforts: [{ id: 'minimal', label: 'Minimal' }, { id: 'high', label: 'High' }],
        defaultReasoningEffort: 'high',
      }];
    },
    async generateTitle(input) {
      seen.push(input);
      if (seen.length === 1) throw new Error('agent_title_timeout');
      return '首轮完成补试成功标题';
    },
  });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', '请检查标题补偿逻辑');
    const streaming = await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => seen.length === 1 && value.run?.status === 'running' && value.titleState?.status === 'fallback',
    );
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(f.service.conversations.read('workspace-one', chat.id).titleState?.status, 'fallback');
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.reasoningEffort, 'minimal');
    const firstMessages = JSON.parse(seen[0]!.description).messages as Array<{ role: string; text: string }>;
    assert.equal(firstMessages.length, 1);
    assert.equal(firstMessages[0]!.role, 'user');
    assert.equal(streaming.title, '请检查标题补偿逻辑');

    for (const context of native.contexts.values()) context.unblock?.();
    const named = await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => value.run?.status === 'completed' && value.titleState?.status === 'generated',
    );
    assert.equal(named.title, '首轮完成补试成功标题');
    assert.equal(seen.length, 2);
    assert.equal(seen[1]!.reasoningEffort, 'minimal');
    const retryMessages = JSON.parse(seen[1]!.description).messages as Array<{ role: string; text: string }>;
    assert.deepEqual(retryMessages.map(item => item.role), ['user', 'assistant']);

    send(f.service, chat.id, 'local', '第二轮继续对话');
    await waitUntil(() => native.sends.length, count => count === 2);
    for (const context of native.contexts.values()) context.unblock?.();
    await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => value.run?.status === 'completed' && value.entries.filter(entry => entry.role === 'user').length === 2,
    );
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(seen.length, 2);
  } finally {
    for (const context of native.contexts.values()) {
      context.observation = { status: 'stopped', tools: [] };
      context.unblock?.();
    }
    await f.close();
  }
});

test('streaming transient title failure plus failed compensation retry settles as failed with two total attempts', async () => {
  const native = fake('local', { hold: true });
  const open = native.executor.open;
  let calls = 0;
  native.executor.open = async options => ({
    ...await open(options),
    async generateTitle() {
      calls++;
      throw new Error('agent_title_timeout');
    },
  });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', '排查补偿双失败边界');
    await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => calls === 1 && value.run?.status === 'running' && value.titleState?.status === 'fallback',
    );
    for (const context of native.contexts.values()) context.unblock?.();
    const failed = await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => value.run?.status === 'completed' && value.titleState?.status === 'failed',
    );
    assert.equal(calls, 2);
    assert.equal(failed.title, '排查补偿双失败边界');
    assert.match(failed.titleState!.reason!, /agent_title_timeout/);

    send(f.service, chat.id, 'local', '后续轮次不再补试');
    await waitUntil(() => native.sends.length, count => count === 2);
    for (const context of native.contexts.values()) context.unblock?.();
    await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => value.run?.status === 'completed' && value.entries.filter(entry => entry.role === 'user').length === 2,
    );
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(calls, 2);
  } finally {
    for (const context of native.contexts.values()) {
      context.observation = { status: 'stopped', tools: [] };
      context.unblock?.();
    }
    await f.close();
  }
});

test('stopped first round flushes deferred streaming title failure without compensation retry', async () => {
  const native = fake('local', { hold: true });
  const open = native.executor.open;
  let calls = 0;
  native.executor.open = async options => ({
    ...await open(options),
    async generateTitle() {
      calls++;
      throw new Error('agent_title_timeout');
    },
  });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', '停止后不补试标题');
    const running = await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => calls === 1 && value.run?.status === 'running' && value.titleState?.status === 'fallback',
    );
    await f.service.conversations.stopAll('workspace-one', chat.id, {
      expectedRevision: running.revision,
      clientRequestId: randomUUID(),
    });
    for (const context of native.contexts.values()) {
      context.observation = { status: 'stopped', tools: [] };
      context.unblock?.();
    }
    const stopped = await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => value.run?.status === 'stopped' && value.titleState?.status === 'failed',
    );
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(calls, 1);
    assert.match(stopped.titleState!.reason!, /agent_title_timeout/);
  } finally {
    for (const context of native.contexts.values()) {
      context.observation = { status: 'stopped', tools: [] };
      context.unblock?.();
    }
    await f.close();
  }
});

test('non-retryable failure during streaming does not trigger compensation retry after completion', async () => {
  const native = fake('local', { hold: true });
  const open = native.executor.open;
  let calls = 0;
  native.executor.open = async options => ({
    ...await open(options),
    async generateTitle() {
      calls++;
      return '超长标题'.repeat(25);
    },
  });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', '非瞬态错误不补试');
    const streamingFailed = await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => calls === 1 && value.run?.status === 'running' && value.titleState?.status === 'failed',
    );
    assert.match(streamingFailed.titleState!.reason!, /agent_title_invalid/);
    for (const context of native.contexts.values()) context.unblock?.();
    const completed = await waitUntil(
      () => f.service.conversations.read('workspace-one', chat.id),
      value => value.run?.status === 'completed',
    );
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(calls, 1);
    assert.equal(completed.titleState?.status, 'failed');
  } finally {
    for (const context of native.contexts.values()) {
      context.observation = { status: 'stopped', tools: [] };
      context.unblock?.();
    }
    await f.close();
  }
});

test('in-flight smart title generation is not aborted by native title events and antigravity ignores English-only native titles', async () => {
  const local = fake('local', { hold: true });
  const openLocal = local.executor.open;
  let releaseTitle!: (value: string) => void;
  let titleAborted = false;
  const pendingTitle = new Promise<string>(resolve => { releaseTitle = resolve; });
  local.executor.open = async input => ({
    ...await openLocal(input),
    async generateTitle(titleInput) {
      titleInput.signal.addEventListener('abort', () => { titleAborted = true; }, { once: true });
      return await pendingTitle;
    },
  });
  assert.equal(builtinDescriptors.get('antigravity')?.runtimeTraits?.requireHanNativeTitle, true);
  const agy = fake('han-native-title', { hold: true });
  agy.executor.descriptor.runtimeTraits = { ...agy.executor.descriptor.runtimeTraits, requireHanNativeTitle: true };
  const f = fixture([local.executor, agy.executor]);
  try {
    await connected(f.service, 'local');
    const c1 = await f.service.conversations.create('workspace-one', {});
    send(f.service, c1.id, 'local', '优化对话流继续逻辑');
    await waitUntil(() => f.service.conversations.read('workspace-one', c1.id), value => value.run?.status === 'running' && value.titleState?.status === 'generating');
    local.sends[0]!.onEvent({ type: 'title', title: 'Native English Override Attempt' });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(titleAborted, false, 'native title event must not abort an active smart title request');
    assert.equal(f.service.conversations.read('workspace-one', c1.id).titleState?.status, 'generating');
    releaseTitle('对话流接续体验优化');
    const named = await waitUntil(() => f.service.conversations.read('workspace-one', c1.id), value => value.titleState?.status === 'generated');
    assert.equal(named.title, '对话流接续体验优化');
    for (const context of local.contexts.values()) context.unblock?.();
    await waitUntil(() => f.service.conversations.read('workspace-one', c1.id), value => value.run?.status === 'completed');

    await connected(f.service, 'han-native-title');
    const c2 = await f.service.conversations.create('workspace-one', {});
    send(f.service, c2.id, 'han-native-title', '排查 Antigravity 中文标题');
    await waitUntil(() => f.service.conversations.read('workspace-one', c2.id), value => value.run?.status === 'running');
    agy.sends[0]!.onEvent({ type: 'title', title: 'Buildr Conversation Bug Troubleshooting' });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.service.conversations.read('workspace-one', c2.id).title, '排查 Antigravity 中文标题');
    agy.sends[0]!.onEvent({ type: 'title', title: 'Antigravity 中文会话标题' });
    const chineseNative = await waitUntil(() => f.service.conversations.read('workspace-one', c2.id), value => value.title === 'Antigravity 中文会话标题');
    assert.equal(chineseNative.titleState?.status, 'generated');
    for (const context of agy.contexts.values()) context.unblock?.();
    await waitUntil(() => f.service.conversations.read('workspace-one', c2.id), value => value.run?.status === 'completed');
  } finally {
    for (const context of local.contexts.values()) context.unblock?.();
    for (const context of agy.contexts.values()) context.unblock?.();
    await f.close();
  }
});
