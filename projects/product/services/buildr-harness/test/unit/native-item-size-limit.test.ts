import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createAgentService } from '../../src/application/agent-service.ts';
import type {
  AgentCapabilities,
  AgentExecutor,
  AgentRuntime,
  ExecutorItem,
} from '../../src/contracts.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import { defineNativeContent } from '../../src/native-content-contracts.ts';

const baseCapabilities: AgentCapabilities = {
  text: true,
  images: true,
  approval: true,
  questions: true,
  stop: true,
  resume: true,
  permissionModes: ['default', 'full-access'],
  maxInputBytes: 64 * 1024,
};

async function waitForRunEnd(
  service: ReturnType<typeof createAgentService>,
  workspaceId: string,
  conversationId: string,
  expectedRunId: string,
) {
  for (let i = 0; i < 100; i++) {
    const view = service.conversations.read(workspaceId, conversationId);
    if (view.run?.id === expectedRunId && ['completed', 'failed', 'stopped', 'unknown'].includes(view.run.status)) {
      return view;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return service.conversations.read(workspaceId, conversationId);
}

test('mergeItem skips 1 MiB text check for already archived nativeTool during readHistory reconciliation, while still enforcing limit on new or non-native items', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'native-item-limit-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const exe = path.join(root, 'fake-bin');
  fs.writeFileSync(exe, '#!/bin/sh\necho 1.0.0\n', { mode: 0o755 });

  let historyMode: 'normal' | 'oversized-archived-tool' | 'oversized-new-tool' | 'oversized-assistant-message' = 'normal';
  const contextId = '44444444-5555-4666-8777-888888888888';
  const binding = 'bind:limit-test';
  const hugeBody = 'A'.repeat(1_200 * 1024);

  const testExecutor: AgentExecutor = {
    descriptor: {
      id: 'limit-exec',
      label: 'limit-exec',
      capabilities: baseCapabilities,
      modelPolicy: { account: 'native' },
      runtimeTraits: { transientAccountProbe: true },
    },
    nativeContent: defineNativeContent({
      allowedPath: /^custom\/.+\.jsonl$/,
      readTool(_serviceRoot, ref) {
        return { ...ref.entry, text: hugeBody };
      },
    }),
    async open(): Promise<AgentRuntime> {
      let closed = false;
      let turnCounter = 0;
      const storedItems: ExecutorItem[] = [];
      return {
        get closed() { return closed; },
        capabilities: baseCapabilities,
        bindingIdentity: binding,
        async inspectAccount() { return { status: 'ready', label: 'limit-exec' }; },
        async models() { return [{ id: 'm1', label: 'M1', isDefault: true }]; },
        async beginLogin() {},
        async cancelLogin() {},
        async createContext(input) {
          return { id: contextId, data: { native: opaqueReference('limit-exec', contextId, input.cwd, binding) } };
        },
        async resumeContext() {},
        async readHistory() {
          if (historyMode === 'oversized-archived-tool') {
            return storedItems.map(item => (item.id === 'tool-1' ? { ...item, text: hugeBody } : { ...item }));
          }
          if (historyMode === 'oversized-new-tool') {
            return [
              ...storedItems.map(item => ({ ...item })),
              { id: 'tool-new-huge', nativeTool: true, kind: 'tool', role: 'assistant', name: 'read', text: hugeBody, status: 'completed' },
            ];
          }
          if (historyMode === 'oversized-assistant-message') {
            return storedItems.map(item => (item.id === 'ans-1' ? { ...item, text: hugeBody } : { ...item }));
          }
          return storedItems.map(item => ({ ...item }));
        },
        async send(input) {
          const execId = `exec-${++turnCounter}`;
          const execRef = { id: execId, data: { resourceBinding: binding, resourceContext: input.contextRef.id } };
          const userItemId = `user-${turnCounter}`;
          input.onEvent({ type: 'accepted', executionRef: execRef, inputItemId: userItemId });
          storedItems.push({ id: userItemId, clientRequestId: input.clientRequestId, kind: 'message', role: 'user', text: input.text, status: 'completed', executionId: execId });
          if (turnCounter === 1) {
            const toolItem: ExecutorItem = {
              id: 'tool-1',
              nativeTool: true,
              kind: 'tool',
              role: 'assistant',
              name: 'file-change',
              text: 'compact preview',
              status: 'completed',
              executionId: execId,
            };
            storedItems.push(toolItem);
            input.onEvent({ type: 'item', item: toolItem });
            const ansItem: ExecutorItem = {
              id: 'ans-1',
              kind: 'message',
              role: 'assistant',
              text: 'first reply',
              status: 'completed',
              executionId: execId,
            };
            storedItems.push(ansItem);
            input.onEvent({ type: 'item', item: ansItem });
          } else {
            const ansItem: ExecutorItem = {
              id: `ans-${turnCounter}`,
              kind: 'message',
              role: 'assistant',
              text: `reply-${turnCounter}`,
              status: 'completed',
              executionId: execId,
            };
            storedItems.push(ansItem);
            input.onEvent({ type: 'item', item: ansItem });
          }
          input.onEvent({ type: 'observation', observation: { status: 'idle', executionRef: execRef, tools: [], backgroundWork: false } });
          input.onEvent({ type: 'completed', status: 'completed' });
        },
        async observe() { return { status: 'idle', tools: [], backgroundWork: false }; },
        async canRelease() { return true; },
        async stop(input) { return { status: 'stopped', executionRef: input.executionRef, tools: [], backgroundWork: false }; },
        async reply() {},
        async close() { closed = true; },
      };
    },
  };

  const service = createAgentService({
    dataRoot: root,
    executors: [testExecutor],
    modelProviders: [],
    resolveWorkspace: async () => ({ rootPath: workspace }),
  });
  t.after(() => service.close());

  await service.connections.connect('limit-exec', {
    expectedRevision: service.connections.read('limit-exec').revision,
    executable: exe,
  });

  const chat = await service.conversations.create('ws', {});
  const run1 = service.conversations.send('ws', chat.id, {
    expectedRevision: chat.revision,
    clientRequestId: 'req-1',
    connectionId: 'limit-exec',
    text: 'round 1',
  });
  const afterRun1 = await waitForRunEnd(service, 'ws', chat.id, run1.run.id);
  assert.equal(afterRun1.run?.status, 'completed');

  // 1. Existing archived nativeTool returning >1 MiB in readHistory must NOT block next send.
  historyMode = 'oversized-archived-tool';
  const run2 = service.conversations.send('ws', chat.id, {
    expectedRevision: afterRun1.revision,
    clientRequestId: 'req-2',
    connectionId: 'limit-exec',
    text: 'round 2',
  });
  const afterRun2 = await waitForRunEnd(service, 'ws', chat.id, run2.run.id);
  assert.equal(afterRun2.run?.status, 'completed', `expected round 2 completed, got ${afterRun2.run?.status} (${afterRun2.run?.diagnostic})`);
  assert.ok(afterRun2.entries.some(e => e.role === 'assistant' && e.text === 'reply-2'));
  const keptTool = afterRun2.entries.find(e => e.kind === 'tool' && e.name === 'file-change');
  assert.equal(keptTool?.text, 'compact preview');

  // 2. New unarchived oversized tool item in readHistory MUST still be rejected with capacity diagnostic.
  historyMode = 'oversized-new-tool';
  const run3 = service.conversations.send('ws', chat.id, {
    expectedRevision: afterRun2.revision,
    clientRequestId: 'req-3',
    connectionId: 'limit-exec',
    text: 'round 3',
  });
  const afterRun3 = await waitForRunEnd(service, 'ws', chat.id, run3.run.id);
  assert.equal(afterRun3.run?.status, 'failed');
  assert.match(afterRun3.run?.diagnostic ?? '', /原生条目超出安全展示容量/);

  // 3. Non-native assistant message returning >1 MiB in readHistory MUST still be rejected.
  historyMode = 'oversized-assistant-message';
  const run4 = service.conversations.send('ws', chat.id, {
    expectedRevision: afterRun3.revision,
    clientRequestId: 'req-4',
    connectionId: 'limit-exec',
    text: 'round 4',
  });
  const afterRun4 = await waitForRunEnd(service, 'ws', chat.id, run4.run.id);
  assert.equal(afterRun4.run?.status, 'failed');
  assert.match(afterRun4.run?.diagnostic ?? '', /原生条目超出安全展示容量/);
});
