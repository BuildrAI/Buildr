import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SourceContinuationPolicies } from '../../src/process/source-policies.ts';
import { executionScopeKey } from '../../src/execution-contracts.ts';
import { CONVERSATION_SCHEMA_VERSION } from '../../src/persistence/conversation-repository.ts';

test('per-source recovery policies persist versions, preserve unknown fields and do not depend on connection order', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-policies-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const order of [['alpha', 'beta'], ['beta', 'alpha']]) {
    const dataRoot = path.join(root, order.join('-')), policies = new SourceContinuationPolicies(dataRoot, 'buildr', () => true);
    assert.equal(policies.enabled('@default'), true);
    assert.equal(policies.enabled(executionScopeKey({sourceId: 'alpha', id: 'same'})), false);
    for (const sourceId of order) policies.configure(sourceId, {expectedRevision: 'absent', autoContinueInterrupted: sourceId === 'alpha'});
    const before = policies.read('alpha');
    assert.equal(before.autoContinueInterrupted, true);
    assert.equal(policies.read('beta').autoContinueInterrupted, false);
    const reconnected = new SourceContinuationPolicies(dataRoot, 'buildr', () => false);
    assert.deepEqual(reconnected.read('alpha'), before);
    assert.equal(reconnected.enabled(executionScopeKey({sourceId: 'alpha', id: 'same'})), true);
    assert.equal(reconnected.enabled(executionScopeKey({sourceId: 'beta', id: 'same'})), false);
    const db = new DatabaseSync(path.join(dataRoot, 'agent-service/conversations.sqlite'));
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, CONVERSATION_SCHEMA_VERSION);
    db.prepare("UPDATE source_continuation_policies SET body=json_set(body,'$.unknownFutureSetting','retained') WHERE source_id='alpha'").run();
    const updated = reconnected.configure('alpha', {expectedRevision: before.revision, autoContinueInterrupted: false});
    assert.notEqual(updated.revision, before.revision);
    assert.equal(JSON.parse(db.prepare("SELECT body FROM source_continuation_policies WHERE source_id='alpha'").get()!.body as string).unknownFutureSetting, 'retained');
    assert.throws(() => policies.configure('alpha', {expectedRevision: before.revision, autoContinueInterrupted: true}), {code: 'agent_source_policy_conflict'});
    assert.equal(policies.read('alpha').autoContinueInterrupted, false);
    assert.equal(policies.read('beta').autoContinueInterrupted, false);
    assert.deepEqual(policies.configure('alpha', {expectedRevision: updated.revision, autoContinueInterrupted: false}), updated);
    db.close();
  }
});
