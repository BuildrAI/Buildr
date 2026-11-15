import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { connectHarnessProcess, prepareAgentRuntime } from '../../../../src/index.ts';
import type { AgentProcessConnection, AgentHostCapabilities } from '../../../../src/index.ts';
import { canRunParallel } from '../../../../src/process/runtime-unit.ts';
import { readProcessInstances } from '../../../../src/process/ownership.ts';
import { acquirePreparedProcessFixture } from '../../../support/prepared-process-fixture.ts';
import { cleanupProcessFixture, until } from '../../../support/process-fixture.ts';

/** The input must be an independently built, unmodified v1 package, not a
 * feature flag applied to the current service. Preparation records its source
 * revision separately; no user data or real vendor accounts are used. */
test('real old/new clients and old/new servers retain v1 discovery and never invent v2 on an old owner', {timeout: 180000}, async t => {
  const oldPackage = process.env.BUILDR_AGENT_V1_PACKAGE;
  assert.ok(oldPackage && path.isAbsolute(oldPackage), 'Provide BUILDR_AGENT_V1_PACKAGE from the independently built v1 source/package.');
  const oldClientFile = path.join(oldPackage, 'build/process/client.js');
  const digest = () => createHash('sha256').update(fs.readFileSync(oldClientFile)).digest('hex');
  const original = digest();
  const old = await import(pathToFileURL(path.join(oldPackage, 'build/index.js')).href);
  assert.equal(old.HARNESS_EXECUTION_CONTRACTS, undefined, 'the reference package predates v2');
  assert.equal(old.AGENT_EXECUTION_CONTRACTS.operations, 'buildr.agent-operations/v1');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-v1-v2-')), profileId = 'compatibility';
  const cases = ['new-service', 'old-service'].map(name => {
    const directory = path.join(root, name), dataRoot = path.join(directory, 'profile'), work = path.join(directory, 'work');
    fs.mkdirSync(work, {recursive: true});
    return {directory, dataRoot, work, clients: [] as AgentProcessConnection[]};
  });
  t.after(async () => {
    for (const value of cases) {
      await Promise.all(value.clients.map(client => client.disconnect()));
      await cleanupProcessFixture({root: value.directory, dataRoot: value.dataRoot, profileId});
    }
    fs.rmdirSync(root);
  });
  const authority = (work: string): AgentHostCapabilities => ({
    resolveExecutionScope: async ({ref}) => ({ref, rootPath: fs.realpathSync(work), revision: 'directory'}),
    verifyWorkObject: async ({ref}) => ({ref, revision: 'object'}),
    listExecutionScopes: async () => ({refs: [{sourceId: 'buildr', id: '@default'}], revision: 'scopes'}),
  });
  const current = cases[0]!, previous = cases[1]!;
  const newRuntime = acquirePreparedProcessFixture(current.dataRoot);
  const oldToNew: AgentProcessConnection = await old.connectAgentProcess({
    dataRoot: current.dataRoot, profileId, runtime: newRuntime, sourceId: 'buildr', legacySourceId: 'buildr', host: authority(current.work),
  });
  current.clients.push(oldToNew);
  const newToNew = await connectHarnessProcess({dataRoot: current.dataRoot, profileId, runtime: newRuntime,
    sourceId: 'harness-local', caller: {kind: 'first-party-user', product: 'buildr-harness'}});
  current.clients.push(newToNew);
  assert.equal((await oldToNew.lifecycle.identity()).contracts.operations, 'buildr.agent-operations/v1');
  assert.equal((await oldToNew.lifecycle.identity()).generation, (await newToNew.lifecycle.identity()).generation);
  const chat = await oldToNew.operations.conversations.create('@default', {title: 'v1 into v2'});
  assert.equal((await newToNew.operations.conversations.read('@default', chat.id)).title, chat.title);
  const connection = await oldToNew.operations.connections.read('first');
  await oldToNew.operations.connections.connect('first', {expectedRevision: connection.revision});
  const draft = {expectedRevision: chat.revision, connectionId: 'first', text: 'hold'};
  const preview = await oldToNew.operations.conversations.prepareSend('@default', chat.id, draft);
  await oldToNew.operations.conversations.send('@default', chat.id, {...draft, previewToken: preview.token, clientRequestId: randomUUID()});
  let held = await until(() => newToNew.operations.conversations.read('@default', chat.id), value => !!value.run?.accepted);
  const run = held.run!;
  await oldToNew.operations.conversations.stop('@default', chat.id, {expectedRevision: held.revision, runId: run.id, participantId: run.participantId, generation: run.generation});
  await until(() => newToNew.operations.conversations.read('@default', chat.id), value => value.run?.status === 'stopped');
  assert.ok((await newToNew.scopeCatalog()).scopes.some(value => value.key === '@default'));

  const baseline = path.join(previous.directory, 'baseline-package');
  fs.cpSync(oldPackage, baseline, {recursive: true, mode: fs.constants.COPYFILE_FICLONE});
  fs.copyFileSync(path.join(import.meta.dirname, '../../fixtures/agent-process-entry.mjs'), path.join(baseline, 'build/process-fixture.mjs'));
  fs.writeFileSync(path.join(baseline, 'build/fixture-version.json'), '{"version":"real-v1"}\n');
  const oldRuntime = prepareAgentRuntime({dataRoot: previous.dataRoot, packageRoot: baseline, entry: 'build/process-fixture.mjs'});
  const oldToOld: AgentProcessConnection = await old.connectAgentProcess({dataRoot: previous.dataRoot, profileId, runtime: oldRuntime,
    sourceId: 'buildr', legacySourceId: 'buildr', host: authority(previous.work)});
  previous.clients.push(oldToOld);
  const existing = await oldToOld.operations.conversations.create('@default', {title: 'real old owner'});
  const candidate = acquirePreparedProcessFixture(previous.dataRoot);
  const newToOld = await connectHarnessProcess({dataRoot: previous.dataRoot, profileId, runtime: candidate,
    sourceId: 'buildr', caller: {kind: 'first-party-user', product: 'buildr-development'}});
  previous.clients.push(newToOld);
  assert.equal((await newToOld.operations.conversations.read('@default', existing.id)).title, existing.title);
  assert.equal((await newToOld.lifecycle.identity()).runtime.digest, oldRuntime.digest);
  await assert.rejects(newToOld.scopeCatalog(), {code: 'agent_capability_unavailable'});
  await assert.rejects(newToOld.directories.register(previous.work), {code: 'agent_capability_unavailable'});
  assert.equal((await newToOld.lifecycle.status()).pendingRuntime, undefined);
  assert.equal(readProcessInstances(previous.dataRoot).filter(value => !value.stopped).length, 1, 'feature negotiation never starts another owner');
  assert.equal(canRunParallel(oldRuntime, candidate), false, 'v1 retained writers cannot participate in the source-policy storage generation');
  const oldConnection = await oldToOld.operations.connections.read('first');
  await oldToOld.operations.connections.connect('first', {expectedRevision: oldConnection.revision});
  const oldDraft = {expectedRevision: existing.revision, connectionId: 'first', text: 'hold'};
  const oldPreview = await oldToOld.operations.conversations.prepareSend('@default', existing.id, oldDraft);
  await oldToOld.operations.conversations.send('@default', existing.id, {...oldDraft, previewToken: oldPreview.token, clientRequestId: randomUUID()});
  const oldHeld = await until(() => oldToOld.operations.conversations.read('@default', existing.id), value => !!value.run?.accepted);
  await assert.rejects(connectHarnessProcess({dataRoot: previous.dataRoot, profileId, runtime: candidate, sourceId: 'buildr', requireRuntime: true, activationTimeoutMs: 100}), {code: 'agent_process_activation_pending'});
  assert.equal(readProcessInstances(previous.dataRoot).filter(value => !value.stopped).length, 1, 'incompatible activation must wait for the real old owner to release');
  const originalRun = oldHeld.run!;
  const latestHeld = await oldToOld.operations.conversations.read('@default', existing.id);
  await oldToOld.operations.conversations.stop('@default', existing.id, {expectedRevision: latestHeld.revision, runId: originalRun.id, participantId: originalRun.participantId, generation: originalRun.generation});
  await until(() => newToOld.lifecycle.status(), value => value.identity.runtime.digest === candidate.digest && value.accepting, 30000);
  assert.equal((await newToOld.operations.conversations.read('@default', existing.id)).id, existing.id);
  await newToOld.sourcePolicy.configure('buildr', {expectedRevision: 'absent', autoContinueInterrupted: false});
  const {ConversationRepository: OldRepository} = await import(pathToFileURL(path.join(oldPackage, 'build/persistence/conversation-repository.js')).href);
  const oldRepository = new OldRepository(path.join(previous.dataRoot, 'agent-service'));
  assert.throws(() => oldRepository.readConversation(existing.id), {code: 'agent_storage_newer'}, 'old local storage cannot reinterpret the new protected data generation');
  oldRepository.stopReadModels();
  assert.equal(digest(), original, 'the actual reference client is unchanged by the test');
});
