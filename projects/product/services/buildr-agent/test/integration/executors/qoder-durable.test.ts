import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { readQoderPersistedExecution } from '../../../src/executors/qoder/durable-history.ts';
import { nativeBindingProvenance, opaqueReference } from '../../../src/executors/native-process.ts';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'qoder-durable-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configRoot = join(root, 'model-bindings', 'exact'), nativeAccountConfigRoot = join(root, 'account');
  const config = join(nativeAccountConfigRoot, 'qoder-config'), executable = join(root, 'qoder.mjs');
  await mkdir(configRoot, { recursive: true }); await mkdir(config, { recursive: true });
  await writeFile(executable, 'throw Error("must never execute")');
  const contextId = randomUUID(), executionId = randomUUID(), promptId = randomUUID(), requestId = randomUUID(), cwd = '/exact/workspace', gatewayIdentity = 'model-lease';
  const bindingIdentity = hash(['buildr-model-gateway/v1', hash(await nativeBindingProvenance('qoder', executable, config)), gatewayIdentity]);
  const input = { configRoot, nativeAccountConfigRoot, executable, gatewayIdentity, bindingIdentity, cwd,
    contextRef: { id: contextId, data: { native: opaqueReference('qoder', contextId, cwd, bindingIdentity) } },
    executionRef: { id: executionId, data: { resourceContext: contextId, resourceBinding: bindingIdentity, backgroundWork: false } } };
  const meta = { sessionId: contextId, cwd, isSidechain: false, version: '1.1.81', timestamp: '2026-11-02T01:00:00Z' };
  const rows: any[] = [
    { ...meta, type: 'user', uuid: executionId, origin: { kind: 'human' }, promptId, message: { role: 'user', content: [{ type: 'text', text: 'one request' }] } },
    { ...meta, type: 'assistant', uuid: 'call', parentUuid: executionId, message: { id: 'call-message', content: [{ type: 'tool_use', id: 'tool', name: 'bash', input: {} }] } },
    { ...meta, type: 'user', uuid: 'result', parentUuid: 'call', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool', content: 'real result' }] } },
    { ...meta, type: 'assistant', uuid: 'answer', parentUuid: 'result', requestTokenAnchor: { requestId }, message: { id: 'final', stop_reason: 'end_turn', usage: { request_id: requestId }, content: [{ type: 'text', text: '原生最终答复' }] } },
    { type: 'active-leaf', sessionId: contextId, leafUuid: 'answer' },
  ];
  const events: any[] = [
    { seq: 1, type: 'turn.started', turn_id: promptId, data: { is_subagent: false } },
    { seq: 2, type: 'turn.finished', turn_id: promptId, level: 'info', request_id: requestId, ts: '2026-11-02T01:00:01Z', data: { reason: 'end_turn', client_request_id: requestId } },
  ];
  const bucket = join(config, 'projects', 'bucket'), segments = join(config, 'logs', 'sessions', 'namespace', contextId, 'segments');
  await mkdir(bucket, { recursive: true }); await mkdir(segments, { recursive: true });
  const transcript = join(bucket, contextId + '.jsonl'), log = join(segments, 'native.jsonl');
  const write = async () => { await writeFile(transcript, rows.map(row => JSON.stringify(row) + '\n').join('')); await writeFile(log, events.map(row => JSON.stringify(row) + '\n').join('')); };
  await write(); return { input, root, config, transcript, log, rows, events, write };
}

test('Qoder durable completion restores exact receipts and native end time without executing a program', async t => {
  const f = await fixture(t), result = await readQoderPersistedExecution(f.input);
  assert.equal(result?.observation.status, 'idle'); assert.equal(result?.observation.executionRef?.id, f.input.executionRef.id);
  assert.equal(result?.endedAt, '2026-11-02T01:00:01.000Z');
  assert.deepEqual(result?.observation.tools, [{ id: 'tool', label: 'bash', status: 'completed' }]);
  assert.ok(result?.items.some(item => item.role === 'assistant' && item.text === '原生最终答复'));
  assert.ok(result?.items.some(item => item.kind === 'tool' && item.text === 'real result'));
  assert.equal(await readQoderPersistedExecution({ ...f.input, executionRef: { ...f.input.executionRef, id: randomUUID() } }), undefined);
});

test('Qoder exact native, model, account, directory and resource bindings cannot cross', async t => {
  const f = await fixture(t);
  await assert.rejects(readQoderPersistedExecution({ ...f.input, bindingIdentity: 'other' }));
  await assert.rejects(readQoderPersistedExecution({ ...f.input, cwd: '/other' }));
  assert.equal(await readQoderPersistedExecution({ ...f.input, gatewayIdentity: 'other' }), undefined);
  assert.equal(await readQoderPersistedExecution({ ...f.input, nativeAccountConfigRoot: f.input.configRoot }), undefined);
  assert.equal(await readQoderPersistedExecution({ ...f.input, executionRef: { ...f.input.executionRef, data: { ...f.input.executionRef.data, resourceBinding: 'other' } } }), undefined);
  f.rows[0].cwd = '/another'; await f.write(); assert.equal(await readQoderPersistedExecution(f.input), undefined);
});

test('a final answer is insufficient without exact structured turn and model completion receipts', async t => {
  const f = await fixture(t), original = structuredClone(f.events);
  for (const events of [[], [original[0]], [original[0], { ...original[1], turn_id: randomUUID() }],
    [original[0], { ...original[1], request_id: randomUUID() }], [original[0], { ...original[1], data: { ...original[1].data, reason: 'error' } }],
    [original[0], original[1], { ...original[1], seq: 3 }]]) {
    f.events.splice(0, f.events.length, ...events); await f.write();
    assert.equal(await readQoderPersistedExecution(f.input), undefined);
  }
  f.events.splice(0, f.events.length, ...original); f.rows[3].message.usage.request_id = randomUUID(); await f.write();
  assert.equal(await readQoderPersistedExecution(f.input), undefined);
});

test('unknown tool outcomes, native sidechains and detached tasks never become successful execution', async t => {
  const f = await fixture(t), rows = structuredClone(f.rows);
  const changes = [() => { f.rows[2].message.content = []; }, () => { f.rows[2].message.content[0].is_error = true; },
    () => { f.rows[1].message.content[0].input.run_in_background = true; }, () => { f.rows[2].toolUseResult = { taskId: 'native-task' }; },
    () => { f.rows[3].isSidechain = true; }, () => { f.rows[3].parentUuid = 'unobserved'; }, () => { f.rows[3].message.stop_reason = 'tool_use'; },
    () => { f.rows[3].version = '2.0.0'; }, () => { f.rows[3].timestamp = 'invalid'; }];
  for (const change of changes) { f.rows.splice(0, f.rows.length, ...structuredClone(rows)); change(); await f.write(); assert.equal(await readQoderPersistedExecution(f.input), undefined); }
});

test('a native confirmed tool failure preserves its failure while proving that the tool ended', async t => {
  const f = await fixture(t);
  f.rows[2].message.content[0].is_error = true; f.rows[2].toolUseResult = { errorType: 'command_exit' };
  f.rows[2].sourceToolAssistantUUID = 'call'; f.rows[2].promptId = f.rows[0].promptId;
  await f.write(); const result = await readQoderPersistedExecution(f.input);
  assert.equal(result?.observation.status, 'idle'); assert.equal(result?.items.find(item => item.id === 'tool')?.status, 'failed');
  assert.equal(result?.observation.tools[0]?.status, 'completed');
  f.rows[2].toolUseResult = { kind: 'completed', exitCode: 1, signal: null, interrupted: false }; await f.write();
  const commandFailure = await readQoderPersistedExecution(f.input);
  assert.equal(commandFailure?.observation.status, 'idle'); assert.equal(commandFailure?.items.find(item => item.id === 'tool')?.status, 'failed');
  f.rows[2].toolUseResult.interrupted = true; await f.write(); assert.equal(await readQoderPersistedExecution(f.input), undefined);
});

test('parallel sibling receipts use the exact primary owner and skill expansion is not a new user command', async t => {
  const f = await fixture(t);
  f.rows[2].sourceToolAssistantUUID = 'call'; f.rows[2].promptId = f.rows[0].promptId;
  const meta = { ...f.rows[0], uuid: 'skill-expansion', parentUuid: 'call', isMeta: true, origin: undefined, promptId: undefined, message: { content: 'skill body is context, not a fresh instruction' } };
  f.rows.splice(3, 0, meta); f.rows[4].parentUuid = meta.uuid;
  await f.write(); assert.equal((await readQoderPersistedExecution(f.input))?.observation.status, 'idle');
  f.rows[2].sourceToolAssistantUUID = 'other-call'; await f.write(); assert.equal(await readQoderPersistedExecution(f.input), undefined);
});

test('durable Qoder reads reject truncated, ambiguous, symlinked and oversized evidence', async t => {
  const f = await fixture(t);
  await appendFile(f.log, '{'); assert.equal(await readQoderPersistedExecution(f.input), undefined);
  await f.write(); await writeFile(f.log, '{}'); assert.equal(await readQoderPersistedExecution(f.input), undefined);
  await f.write(); const other = join(f.config, 'projects', 'other'); await mkdir(other);
  const duplicate = join(other, f.input.contextRef.id + '.jsonl'); await writeFile(duplicate, '{}\n');
  assert.equal(await readQoderPersistedExecution(f.input), undefined); await rm(duplicate);
  const saved = f.transcript + '.saved'; await writeFile(saved, f.rows.map(row => JSON.stringify(row) + '\n').join('')); await rm(f.transcript); await symlink(saved, f.transcript);
  assert.equal(await readQoderPersistedExecution(f.input), undefined); await rm(f.transcript); await f.write();
  await writeFile(f.log, ' '.repeat(32 * 1024 * 1024 + 1)); assert.equal(await readQoderPersistedExecution(f.input), undefined);
});

test('diagnostic reclamation preserves exact end evidence while recovery is unresolved and never rewrites native history', async t => {
  const f = await fixture(t);
  const { rename, utimes, readFile } = await import('node:fs/promises');
  const { createQoderExecutor } = await import('../../../src/executors/qoder/index.ts');
  const { diagnosticCandidates } = await import('../../../src/storage/diagnostics.ts');
  const { removeStorageCandidate } = await import('../../../src/storage/files.ts');
  const log = join(f.config, 'logs/sessions/namespace', f.input.contextRef.id, 'segments/2026-11-03T00-00-00-000+08-00-recovery-p2000000000.jsonl');
  await rename(f.log, log); await utimes(log, 1, 1);
  const original = await readFile(f.transcript), use = { complete: true, paths: [] };
  const held = diagnosticCandidates(f.root, createQoderExecutor(), f.input.nativeAccountConfigRoot, use,
    { complete: true, contexts: ['qoder:' + f.input.contextRef.id] }, Date.now());
  assert.equal(held.find(item => item.path === log)?.reason, 'diagnostic_recovery_evidence');
  assert.equal(removeStorageCandidate(f.root, held.find(item => item.path === log)!, () => use), false);
  assert.equal((await readQoderPersistedExecution(f.input))?.endedAt, '2026-11-02T01:00:01.000Z');
  const released = diagnosticCandidates(f.root, createQoderExecutor(), f.input.nativeAccountConfigRoot, use, { complete: true, contexts: [] }, Date.now());
  assert.equal(removeStorageCandidate(f.root, released.find(item => item.path === log)!, () => use), true);
  assert.deepEqual(await readFile(f.transcript), original);
});
