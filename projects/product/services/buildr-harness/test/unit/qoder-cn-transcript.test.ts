import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  qoderCnBackgroundLaunch,
  qoderCnFinishedTurns,
  qoderCnTaskNotification,
  qoderCnTaskStopReceipt,
} from '../../src/executors/qoder-cn/transcript.ts';
import { qoderBackgroundOutput } from '../../src/executors/qoder/background-output.ts';

test('qoderCnTaskNotification parses XML payload, unescapes entities and enforces session/cwd identity', () => {
  const row = {
    sessionId: 'ctx-1',
    cwd: '/repo',
    isSidechain: false,
    type: 'user',
    uuid: 'notif-1',
    promptId: 'p-1',
    timestamp: '2026-11-17T06:00:00.000Z',
    origin: { kind: 'task-notification' },
    message: {
      role: 'user',
      content: '<task-notification>\n<task-id>b96zlpj47</task-id>\n<tool-use-id>call_1</tool-use-id>\n<output-file>/tmp/out.output</output-file>\n<status>completed</status>\n<summary>Background &amp; &quot;ok&quot;</summary>\n<result>line &lt;1&gt;</result>\n</task-notification>',
    },
  };
  assert.deepEqual(qoderCnTaskNotification(row, 'ctx-1', '/repo'), {
    id: 'notif-1',
    taskId: 'b96zlpj47',
    toolUseId: 'call_1',
    status: 'completed',
    summary: 'Background & "ok"',
    outputFile: '/tmp/out.output',
    result: 'line <1>',
    promptId: 'p-1',
    timestamp: '2026-11-17T06:00:00.000Z',
  });
  assert.equal(qoderCnTaskNotification({ ...row, sessionId: 'other' }, 'ctx-1', '/repo'), undefined);
  assert.equal(qoderCnTaskNotification({ ...row, isSidechain: true }, 'ctx-1', '/repo'), undefined);
  assert.equal(qoderCnTaskNotification({ ...row, origin: { kind: 'human' } }, 'ctx-1', '/repo'), undefined);
});

test('qoderCnBackgroundLaunch and qoderCnTaskStopReceipt distinguish background launches and silent task stops', () => {
  assert.deepEqual(
    qoderCnBackgroundLaunch({ kind: 'backgrounded', taskId: 'b123', outputFile: '/tmp/b123.output' }),
    { taskId: 'b123', outputFile: '/tmp/b123.output' },
  );
  assert.deepEqual(qoderCnBackgroundLaunch({ backgroundTaskId: 'agent-1' }), { taskId: 'agent-1' });
  assert.equal(qoderCnBackgroundLaunch({ stdout: 'ok' }), undefined);

  assert.deepEqual(
    qoderCnTaskStopReceipt({ message: 'Successfully stopped task: a1', task_id: 'a1', task_type: 'local_agent' }),
    { taskId: 'a1', silent: true },
  );
  assert.deepEqual(
    qoderCnTaskStopReceipt({ message: 'Successfully stopped task: b2', task_id: 'b2', task_type: 'local_bash' }),
    { taskId: 'b2', silent: false },
  );
  assert.equal(qoderCnTaskStopReceipt({ message: 'Other', task_id: 'b2', task_type: 'local_agent' }), undefined);
});

test('qoderCnFinishedTurns maps byNotificationId for single and chained continuations without crossing human prompts', () => {
  const base = { sessionId: 'ctx-1', cwd: '/repo', isSidechain: false };
  const rows = [
    { ...base, type: 'user', uuid: 'u1', promptId: 'p1', origin: { kind: 'human' }, message: { content: 'start' } },
    { ...base, type: 'assistant', uuid: 'a1', parentUuid: 'u1', message: { content: [{ type: 'text', text: 'launching' }], stop_reason: 'end_turn' } },
    { ...base, type: 'user', uuid: 'n1', parentUuid: 'a1', origin: { kind: 'task-notification' }, message: { content: '<task-notification><task-id>t1</task-id></task-notification>' } },
    { ...base, type: 'assistant', uuid: 'a2', parentUuid: 'n1', message: { content: [{ type: 'tool_use', id: 'tool-c1', name: 'Bash' }], stop_reason: 'tool_use' } },
    { ...base, type: 'user', uuid: 'r2', parentUuid: 'a2', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-c1', content: 'ok' }] } },
    { ...base, type: 'assistant', uuid: 'a3', parentUuid: 'r2', timestamp: '2026-11-17T06:01:00.000Z', message: { content: [{ type: 'text', text: 'cont 1 done' }], stop_reason: 'end_turn' } },
    { ...base, type: 'user', uuid: 'n2', parentUuid: 'a3', origin: { kind: 'task-notification' }, message: { content: '<task-notification><task-id>t2</task-id></task-notification>' } },
    { ...base, type: 'user', uuid: 'u2', parentUuid: 'a3', origin: { kind: 'human' }, message: { content: 'later prompt' } },
    { ...base, type: 'assistant', uuid: 'a4', parentUuid: 'u2', message: { content: [{ type: 'text', text: 'later done' }], stop_reason: 'end_turn' } },
  ];
  const finished = qoderCnFinishedTurns(rows, 'ctx-1', '/repo');
  assert.equal(finished.byReceiptId.get('u1')?.text, 'launching');
  assert.equal(finished.byNotificationId.get('n1')?.text, 'cont 1 done');
  assert.equal(finished.byNotificationId.get('n1')?.index, 5);
  assert.equal(finished.byNotificationId.get('n2'), undefined, 'later human turn must not satisfy an unfinished notification');
});

test('qoderBackgroundOutput reads qoder-cn tempRoot task output and rejects mismatched products', async () => {
  const uid = process.getuid?.();
  if (uid === undefined) return;
  const root = mkdtempSync(join(tmpdir(), 'buildr-qoder-cn-bg-out-'));
  try {
    const contextId = 'session-123';
    const taskId = 'b96zlpj47';
    const dir = join(root, `qoder-cli-cn-${uid}`, 'project', contextId, 'tasks');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${taskId}.output`);
    writeFileSync(file, 'line 1\nline 2\n');
    assert.equal(await qoderBackgroundOutput(file, contextId, taskId, { product: 'qoder-cn', tempRoot: root }), 'line 1\nline 2\n');
    assert.equal(await qoderBackgroundOutput(file, contextId, taskId, { product: 'qoder', tempRoot: root }), undefined);
    assert.equal(await qoderBackgroundOutput(file, 'other-ctx', taskId, { product: 'qoder-cn', tempRoot: root }), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
