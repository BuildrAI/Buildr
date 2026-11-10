import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';
import type { NativeToolContent } from '../../src/native-content-contracts.ts';

function fixture(t: TestContext, nativeTool?: () => NativeToolContent | undefined) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-native-tool-recovery-'));
  const repo = new ConversationRepository(path.join(root, 'agent-service'), nativeTool);
  t.after(() => { repo.stopReadModels(); fs.rmSync(root, { recursive: true, force: true }); });
  return { repo };
}

function record(): StoredConversation {
  return { view: { id: 'chat', workspaceId: 'ws', revision: 'r1', cwd: '/workspace', title: '历史', updatedAt: '2026-11-02T00:00:00Z', hidden: false,
    entries: [], participants: [], requests: [] }, participants: [], sources: {}, requests: {}, attempts: [], attachments: {} };
}

function tool(id: string, text: string) {
  return { id, sequence: 1, kind: 'tool' as const, role: 'system' as const, status: 'completed' as const, name: 'bash', text, createdAt: 'now' };
}

function reference(): NativeToolContent {
  return { version: 3, provider: 'dsh', contextId: 'session-1', nativeId: 'call-1',
    entry: { id: 'tool', sequence: 1, kind: 'tool', role: 'system', status: 'completed', text: '', createdAt: 'now' },
    session: { config: 'connections/dsh/model-bindings/x', cwd: '/workspace' }, text: [] };
}

test('无法重新证明原生工具身份的条目不再阻断对话写入，已捕获正文按本地内容保留', t => {
  const { repo } = fixture(t);
  const stored = record();
  stored.view.entries = [tool('tool', '已捕获的本地输出\n')];
  stored.nativeTools = { tool: true };
  // 原生身份无法重新证明：停止运行后原生会话不再可就地绑定。
  assert.doesNotThrow(() => repo.saveConversation(stored));
  const read = repo.readConversation('chat')!;
  assert.equal(read.view.entries.length, 1);
  assert.equal(read.view.entries[0]!.text, '已捕获的本地输出\n');
  // 标记保留：原生身份之后可证明时仍可升级为引用，不伪造也不丢弃。
  assert.equal(read.nativeTools?.tool, true);
  // 后续保存同样可用；同一对话不因这一条永久不可写。
  stored.view.entries.push({ id: 'next', sequence: 2, kind: 'message', role: 'user', text: '继续', createdAt: 'now' });
  stored.view.revision = 'r2';
  assert.doesNotThrow(() => repo.saveConversation(stored, 'r1'));
  assert.equal(repo.readConversation('chat')!.view.entries.length, 2);
});

test('原生身份可证明时仍保存 v3 引用，不退化为本地正文', t => {
  const { repo } = fixture(t, reference);
  const stored = record();
  stored.view.entries = [tool('tool', '')];
  stored.nativeTools = { tool: true };
  repo.saveConversation(stored);
  const db = new DatabaseSync(repo.filename);
  try {
    assert.equal(db.prepare("SELECT codec FROM conversation_entry_contents WHERE codec='native-tool'").get()?.codec, 'native-tool');
  } finally { db.close(); }
});
