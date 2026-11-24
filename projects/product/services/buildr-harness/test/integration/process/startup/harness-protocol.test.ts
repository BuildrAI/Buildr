import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectHarnessProcess, HARNESS_EXECUTION_CONTRACTS, executionScopeKey, restartAgentProcess } from '../../../../src/index.ts';
import type { AgentProcessConnection, AgentHostCapabilities, ConversationView } from '../../../../src/index.ts';
import { readProcessRecord } from '../../../../src/process/ownership.ts';
import { request } from '../../../../src/process/transport.ts';
import { acquirePreparedProcessFixture } from '../../../support/prepared-process-fixture.ts';
import { cleanupProcessFixture, until } from '../../../support/process-fixture.ts';

test('authenticated v2 callers share sources and exact offline controls, while v1 and ordinary hosts stay narrow', {timeout: 90000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-multi-source-')), dataRoot = path.join(root, 'data'), profileId = 'v2';
  const a = path.join(root, 'a'), b = path.join(root, 'b'); fs.mkdirSync(a); fs.mkdirSync(b);
  const runtime = acquirePreparedProcessFixture(dataRoot), clients: AgentProcessConnection[] = [];
  const options = {dataRoot, profileId, runtime};
  t.after(async () => {
    await Promise.all(clients.map(client => client.disconnect()));
    await cleanupProcessFixture({root, dataRoot, profileId});
  });
  const host = (rootPath: string): AgentHostCapabilities => ({
    resolveExecutionScope: async ({ref}) => ({ref, rootPath, revision: rootPath}),
    listExecutionScopes: async ({sourceId}) => ({refs: [{sourceId, id: 'same'}], labels: {same: sourceId==='alpha'?'甲工作空间':'乙工作空间'}, rootPaths: {same: rootPath}, revision: rootPath}),
    // Work-object verification is genuinely absent, not a dummy task system.
  });
  const alpha = await connectHarnessProcess({...options, sourceId: 'alpha', caller: {kind: 'host', sourceId: 'alpha'}, host: host(a), autoContinueInterrupted: true});
  const beta = await connectHarnessProcess({...options, sourceId: 'beta', caller: {kind: 'host', sourceId: 'beta'}, host: host(b), autoContinueInterrupted: false});
  const user = await connectHarnessProcess({...options, sourceId: 'harness-local', caller: {kind: 'first-party-user', product: 'buildr-harness'}});
  const legacy = await connectHarnessProcess({...options, sourceId: 'alpha'});
  clients.push(alpha, beta, user, legacy);
  const alphaPolicy = await alpha.sourcePolicy.read('alpha');
  assert.equal(alphaPolicy.autoContinueInterrupted, true);
  assert.equal((await user.sourcePolicy.read('beta')).autoContinueInterrupted, false);
  const reconnected = await connectHarnessProcess({...options, sourceId: 'alpha', caller: {kind: 'host', sourceId: 'alpha'}, host: host(a), autoContinueInterrupted: false});
  clients.push(reconnected);
  assert.deepEqual(await reconnected.sourcePolicy.read('alpha'), alphaPolicy, 'reconnection cannot overwrite the existing policy');
  await reconnected.disconnect();
  await assert.rejects(beta.sourcePolicy.configure('alpha', {expectedRevision: alphaPolicy.revision, autoContinueInterrupted: false}), {code: 'agent_caller_scope_denied'});
  const updatedPolicy = await alpha.sourcePolicy.configure('alpha', {expectedRevision: alphaPolicy.revision, autoContinueInterrupted: false});
  await assert.rejects(alpha.sourcePolicy.configure('alpha', {expectedRevision: alphaPolicy.revision, autoContinueInterrupted: true}), {code: 'agent_source_policy_conflict'});
  const sa = executionScopeKey({sourceId: 'alpha', id: 'same'}), sb = executionScopeKey({sourceId: 'beta', id: 'same'});
  const ca = await alpha.operations.conversations.create(sa, {title: 'alpha'}), cb = await beta.operations.conversations.create(sb, {title: 'beta'});
  const listed = await user.operations.conversations.listAll([sa, sb], {limit: 20, draftConversationIds: [ca.id, cb.id]});
  assert.equal(listed.conversations.length, 0, 'empty work remains absent from the historical list');
  assert.equal((await user.operations.conversations.read(sa, ca.id)).cwd, fs.realpathSync(a));
  assert.equal((await user.operations.conversations.read(sb, cb.id)).cwd, fs.realpathSync(b));
  await assert.rejects(alpha.operations.conversations.read(sb, cb.id), {code: 'agent_caller_scope_denied'});
  await assert.rejects(legacy.operations.conversations.read(sb, cb.id), {code: 'agent_host_source_mismatch'});
  const catalog = await user.scopeCatalog();
  assert.equal(catalog.scopes.find(item=>item.key===sa)?.name,'甲工作空间');
  assert.equal(catalog.scopes.find(item=>item.key===sb)?.name,'乙工作空间');
  assert.equal(catalog.scopes.find(item=>item.key===sa)?.rootPath,a);
  assert.equal(catalog.scopes.find(item=>item.key===sb)?.rootPath,b);
  assert.deepEqual(new Set(catalog.scopes.map(item => item.ref.sourceId)), new Set(['alpha', 'beta']));
  const connection = await user.operations.connections.read('first');
  await user.operations.connections.connect('first', {expectedRevision: connection.revision});
  const send = async (scope: string, chat: ConversationView, text: string) => {
    const draft = {expectedRevision: chat.revision, connectionId: 'first', text};
    const preview = await user.operations.conversations.prepareSend(scope, chat.id, draft);
    await user.operations.conversations.send(scope, chat.id, {...draft, previewToken: preview.token, clientRequestId: randomUUID()});
    return until(() => user.operations.conversations.read(scope, chat.id), value => !!value.run?.accepted);
  };
  let held = await send(sa, ca, 'hold'), question = await send(sb, cb, 'question');
  question = await until(() => user.operations.conversations.read(sb, cb.id), value => value.run?.status === 'waiting-question');
  const subscription = await user.operations.conversations.subscribe(sa, ca.id);
  try { const snapshot = await subscription.events[Symbol.asyncIterator]().next(); assert.equal(snapshot.value!.workspaceId, sa); }
  finally { subscription.close(); }
  const working = await user.operations.conversations.listAll([sa, sb], {limit: 20});
  assert.deepEqual(new Set(working.conversations.map(item => item.id)), new Set([ca.id, cb.id]));
  assert.equal((await alpha.operations.conversations.pendingSummary()).conversations.some(item => item.workspaceId === sb), false);
  assert.equal((await legacy.operations.conversations.pendingSummary()).conversations.some(item => item.workspaceId === sb), false);
  assert.equal((await user.operations.conversations.pendingSummary()).conversations.some(item => item.workspaceId === sb), true);
  await Promise.all([alpha.disconnect(), beta.disconnect()]);
  assert.equal((await user.scopeCatalog()).scopes.find(item => item.key === sa)?.authority, 'offline');
  const run = held.run!;
  held = await user.operations.conversations.read(sa, ca.id);
  await user.operations.conversations.stop(sa, ca.id, {expectedRevision: held.revision, runId: run.id, participantId: run.participantId, generation: run.generation});
  await until(() => user.operations.conversations.read(sa, ca.id), value => value.run?.status === 'stopped');
  question = await user.operations.conversations.read(sb, cb.id);
  const waiting = question.run!, pending = question.requests[0]!;
  await user.operations.conversations.reply(sb, cb.id, pending.id, {expectedRevision: question.revision, runId: waiting.id,
    participantId: waiting.participantId, generation: waiting.generation, answer: {scope: 'ok'}});
  await until(() => user.operations.conversations.read(sb, cb.id), value => value.run?.status === 'completed');
  await assert.rejects(user.operations.conversations.create(sa, {title: 'not admitted'}), {code: 'agent_host_unavailable'});

  // Locally registered Buildr workspaces remain builtin and usable when Development is offline.
  const localWsDir = path.join(root, 'local-buildr-workspace');
  fs.mkdirSync(path.join(localWsDir, '.buildr'), { recursive: true });
  const localWsId = '77777777-7777-4777-8777-777777777777';
  fs.writeFileSync(path.join(localWsDir, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${localWsId}\nname: 本地独立工作空间\n`);
  fs.writeFileSync(path.join(localWsDir, 'hello.txt'), 'offline ok\n');
  fs.writeFileSync(path.join(dataRoot, 'workspace-registry.json'), JSON.stringify({
    schemaVersion: 'buildr.local-workspace-registry/v1',
    roots: [localWsDir],
    lastOpenedRoot: localWsDir,
  }));

  const localCatalog = await user.scopeCatalog();
  const localScope = localCatalog.scopes.find(item => item.key === localWsId);
  assert.equal(localScope?.authority, 'builtin');
  assert.equal(localScope?.name, '本地独立工作空间');
  assert.equal(localScope?.rootPath, fs.realpathSync(localWsDir));
  assert.equal(localCatalog.scopes.find(item => item.key === '@default')?.authority, 'builtin');

  const localChat = await user.operations.conversations.create(localWsId, {title: 'offline buildr workspace'});
  assert.equal(localChat.cwd, fs.realpathSync(localWsDir));
  const wbScope = await user.directories.workbench('scope', { workspaceId: localWsId }) as { rootPath: string; revision: string; ref: { id: string } };
  assert.equal(wbScope.rootPath, fs.realpathSync(localWsDir));
  const wbDir = await user.directories.workbench('directory', { workspaceId: localWsId, scopeRevision: wbScope.revision }) as { entries: Array<{ path: string }> };
  assert.ok(wbDir.entries.some(item => item.path === 'hello.txt'));
  const reusedReg = await user.directories.register(localWsDir);
  assert.deepEqual(reusedReg.ref, { sourceId: 'buildr', id: localWsId });
  assert.equal((await user.directories.list()).length, 0);

  const record = readProcessRecord(dataRoot)!;
  const session = await request(record.origin, record.token, '/caller/negotiate', {clientRequestId: 'raw-host', contracts: HARNESS_EXECUTION_CONTRACTS, caller: {kind: 'host', sourceId: 'alpha'}});
  await assert.rejects(request(record.origin, session.token, '/v2/operations', {contract: HARNESS_EXECUTION_CONTRACTS.operations,
    operation: 'conversations.read', sourceId: 'beta', args: [sb, cb.id], targetScope: {sourceId: 'beta', id: 'same'}}), {code: 'agent_caller_identity_assertion'});
  await assert.rejects(request(record.origin, session.token, '/v2/shutdown', {expectedGeneration: record.identity.generation, mode: 'stop-owned'}), {code: 'agent_caller_operation_denied'});
  await assert.rejects(request(record.origin, session.token, '/v2/events', {scope: sb, id: cb.id, targetScope: {sourceId: 'beta', id: 'same'}}), {code: 'agent_caller_scope_denied'});
  await assert.rejects(request(record.origin, session.token, '/v2/host/attach', {peer: {sourceId: 'buildr'}}), {code: 'agent_caller_scope_denied'});
  await assert.rejects(request(record.origin, 'forged', '/v2/operations', {}), {code: 'agent_caller_unauthorized'});
  await request(record.origin, session.token, '/v2/caller-close', {});
  await until(() => user.lifecycle.status(), status => !status.activity.busy);
  const restarted = await restartAgentProcess({...options, sourceId: 'harness-local', caller: {kind: 'first-party-user', product: 'buildr-harness'}, expectedGeneration: record.identity.generation});
  clients.push(restarted);
  assert.deepEqual(await restarted.sourcePolicy.read('alpha'), updatedPolicy);
  assert.equal((await restarted.sourcePolicy.read('beta')).autoContinueInterrupted, false);
});
