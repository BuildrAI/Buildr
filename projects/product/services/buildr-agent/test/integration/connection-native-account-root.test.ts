import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConnectionApplication } from '../../src/application/connection-application.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { AgentExecutor } from '../../src/contracts.ts';
import type { StoredConnection } from '../../src/domain/agent-state.ts';

test('durable reads resolve native account content outside the connection config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-native-root-'));
  const connectionRoot = path.join(root, 'connections', 'qoder-cn');
  const nativeRoot = path.join(root, 'model-access', 'accounts', 'native-qoder-cn');
  const capabilities = { text: true, images: false, approval: false, questions: false, stop: true, resume: true, maxInputBytes: 65536 };
  let persisted: Parameters<NonNullable<AgentExecutor['readPersistedExecution']>>[0] | undefined;
  let supplement: Parameters<NonNullable<AgentExecutor['readSupplementReceipt']>>[0] | undefined;
  const executor: AgentExecutor = {
    descriptor: { id: 'qoder-cn', label: 'Qoder CN', capabilities },
    async open() { throw new Error('durable reads must not open a native runtime'); },
    async readPersistedExecution(input) { persisted = input; },
    async readSupplementReceipt(input) { supplement = input; },
  };
  const repository = new ConversationRepository(root);
  const record: StoredConnection = {
    view: {
      id: 'qoder-cn', provider: 'qoder-cn', label: 'Qoder CN', revision: 'one', status: 'ready',
      enabled: true, executable: path.join(root, 'qoder-cn'), configPath: connectionRoot,
      models: [], capabilities,
    },
    bindingIdentity: 'native-binding',
  };
  repository.saveConnection(record);
  const app = new ConnectionApplication({
    root, repository, executors: [executor], environment: {}, generation: 'fixture',
    now: () => new Date().toISOString(), changed() {},
    nativeAccountConfigRoots: { 'qoder-cn': nativeRoot },
  });
  try {
    const contextRef = { id: 'context' }, executionRef = { id: 'execution' };
    await app.readPersistedExecution('qoder-cn', { bindingIdentity: 'native-binding', contextRef, executionRef, cwd: root });
    await app.readSupplementReceipt('qoder-cn', {
      bindingIdentity: 'native-binding', contextRef, executionRef, cwd: root,
      clientRequestId: 'request', text: 'supplement', createdAt: new Date().toISOString(),
    });
    assert.equal(persisted?.configRoot, connectionRoot);
    assert.equal(persisted?.nativeAccountConfigRoot, nativeRoot);
    assert.equal(supplement?.configRoot, connectionRoot);
    assert.equal(supplement?.nativeAccountConfigRoot, nativeRoot);
  } finally {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
