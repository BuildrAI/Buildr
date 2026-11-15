import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activateAgentRuntime, connectHarnessProcess, executionScopeKey, restartAgentProcess } from '../../../../src/index.ts';
import type { AgentProcessConnection } from '../../../../src/index.ts';
import { ConversationRepository } from '../../../../src/persistence/conversation-repository.ts';
import { acquirePreparedProcessFixture } from '../../../support/prepared-process-fixture.ts';
import { cleanupProcessFixture, copyPackage, prepareAgentRuntime, until } from '../../../support/process-fixture.ts';

test('Harness alone cold-starts, shares directory authority, executes and restarts without a Development host', {timeout: 90000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-product-')), dataRoot = path.join(root, 'data'), profileId = 'standalone';
  const work = path.join(root, 'work'); fs.mkdirSync(work);
  const runtime = acquirePreparedProcessFixture(dataRoot);
  const clients: AgentProcessConnection[] = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.disconnect()));
    await cleanupProcessFixture({root, dataRoot, profileId});
  });
  const ready = await activateAgentRuntime({dataRoot, profileId, runtime});
  assert.equal(ready.currentDigest, runtime.digest); assert.equal(ready.accepting, true);
  const options = {dataRoot, profileId, runtime, sourceId: 'harness-local'};
  const pair = await Promise.all([connectHarnessProcess(options), connectHarnessProcess(options)]);
  clients.push(...pair);
  const [a, b] = pair as [AgentProcessConnection, AgentProcessConnection];
  assert.equal((await a.lifecycle.identity()).generation, ready.generation);
  assert.equal((await b.lifecycle.identity()).instanceId, ready.instanceId);
  const directory = await a.directories.register(work);
  assert.deepEqual(await b.directories.list(), [directory]);
  const scope = executionScopeKey(directory.ref), chat = await a.operations.conversations.create(scope, {});
  assert.equal(chat.cwd, fs.realpathSync(work));
  const connection = await a.operations.connections.read('first');
  await a.operations.connections.connect('first', {expectedRevision: connection.revision});
  const draft = {expectedRevision: chat.revision, connectionId: 'first', text: 'directory work'};
  const preview = await a.operations.conversations.prepareSend(scope, chat.id, draft);
  await a.operations.conversations.send(scope, chat.id, {...draft, previewToken: preview.token, clientRequestId: 'standalone-work'});
  const completed = await until(() => b.operations.conversations.read(scope, chat.id), view => view.run?.status === 'completed');
  assert.ok(completed.entries.some(entry => entry.role === 'assistant'));
  assert.equal(fs.existsSync(path.join(work, '.buildr')), false);
  // Disconnecting both entries does not terminate their shared backend.
  await Promise.all(pair.map(client => client.disconnect()));
  const reopened = await connectHarnessProcess(options); clients.push(reopened);
  assert.equal((await reopened.lifecycle.identity()).generation, ready.generation);
  assert.equal((await reopened.operations.conversations.read(scope, chat.id)).id, chat.id);
  await until(() => reopened.lifecycle.status(), status => !status.activity.busy);
  const restarted = await restartAgentProcess({...options, expectedGeneration: ready.generation});
  clients.push(restarted);
  assert.notEqual((await restarted.lifecycle.identity()).generation, ready.generation);
  assert.equal((await restarted.operations.conversations.read(scope, chat.id)).id, chat.id);
  assert.deepEqual(await restarted.directories.list(), [directory]);
});

test('ordinary product connection retains the current version; only explicit activation adopts a candidate', {timeout: 90000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-product-version-')), dataRoot = path.join(root, 'data'), profileId = 'versions';
  const runtime = acquirePreparedProcessFixture(dataRoot);
  const clients: AgentProcessConnection[] = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.disconnect()));
    await cleanupProcessFixture({root, dataRoot, profileId});
  });
  const first = await activateAgentRuntime({dataRoot, profileId, runtime});
  const packageRoot = path.join(root, 'candidate'); copyPackage(runtime.directory, packageRoot);
  // A real different payload, not a forged digest.
  fs.chmodSync(path.join(packageRoot, 'build/fixture-version.json'), 0o600);
  fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), '{"version":"next"}\n');
  const next = prepareAgentRuntime({dataRoot, packageRoot, entry: path.relative(runtime.directory, runtime.entry)});
  const ordinary = await connectHarnessProcess({dataRoot, profileId, runtime: next, sourceId: 'harness-local'}); clients.push(ordinary);
  const unchanged = await ordinary.lifecycle.status();
  assert.equal(unchanged.identity.generation, first.generation);
  assert.equal(unchanged.identity.runtime.digest, runtime.digest);
  assert.equal(unchanged.pendingRuntime, undefined);
  const adopted = await activateAgentRuntime({dataRoot, profileId, runtime: next});
  assert.equal(adopted.currentDigest, next.digest);
  assert.notEqual(adopted.generation, first.generation);
  assert.equal((await ordinary.lifecycle.identity()).generation, adopted.generation);
});

test('Harness first cold-start keeps bare historical scopes owned by buildr, not the startup caller', {timeout: 90000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-legacy-source-')), dataRoot = path.join(root, 'data'), profileId = 'legacy';
  const runtime = acquirePreparedProcessFixture(dataRoot);
  const repository = new ConversationRepository(path.join(dataRoot, 'agent-service'));
  for (const scope of ['@default', 'legacy-workspace']) {
    repository.saveConversation({
      view: {id: 'chat-' + scope, workspaceId: scope, revision: 'before-split', cwd: root, title: '既有对话',
        updatedAt: '2026-11-01T00:00:00Z', hidden: false, entries: [], participants: [], requests: []},
      participants: [], sources: {}, requests: {}, attempts: [], attachments: {},
    });
  }
  repository.stopReadModels();
  const clients: AgentProcessConnection[] = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.disconnect()));
    await cleanupProcessFixture({root, dataRoot, profileId});
  });
  const harness = await connectHarnessProcess({dataRoot, profileId, runtime, sourceId: 'harness-local'}); clients.push(harness);
  const generation = (await harness.lifecycle.identity()).generation;
  const development = await connectHarnessProcess({dataRoot, profileId, runtime, sourceId: 'buildr'}); clients.push(development);
  assert.equal((await development.lifecycle.identity()).generation, generation);
  for (const scope of ['@default', 'legacy-workspace']) {
    assert.equal((await development.operations.conversations.read(scope, 'chat-' + scope)).workspaceId, scope);
    await assert.rejects(harness.operations.conversations.read(scope, 'chat-' + scope), {code: 'agent_host_source_mismatch'});
  }
});
