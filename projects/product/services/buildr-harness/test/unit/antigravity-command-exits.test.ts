import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { readAntigravityCommandExits } from '../../src/executors/antigravity/content.ts';

const contextId = 'c952a89c-9e87-45e4-a66f-d4fd5fab4cf8';

function writeTranscript(t: TestContext, rows: Array<Record<string, unknown>>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agy-command-exits-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'home', '.gemini', 'antigravity-cli', 'brain', contextId, '.system_generated', 'logs', 'transcript_full.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  return root;
}

function taskRow(task: string, command: string) {
  return {
    created_at: '2026-11-15T04:06:48.000Z',
    source: 'MODEL',
    type: 'GENERIC',
    content: `Tool is running as a background task with task id: ${task}\nTask Description: ${command}\nTask logs are available at: file:///fixture/task.log`,
  };
}

test('truncated background finish without an exit code completes the command', t => {
  const task = `${contextId}/task-128`;
  const command = 'cd worktree && ./tools/development/run-development-npm run check';
  const root = writeTranscript(t, [
    taskRow(task, command),
    {
      created_at: '2026-11-15T04:07:53.000Z',
      source: 'SYSTEM',
      type: 'SYSTEM_MESSAGE',
      content: `[Message] timestamp=2026-11-15T04:07:53Z sender=${task} priority=MESSAGE_PRIORITY_HIGH content=Task id "${task}" finished with result:\nThe tool's output was truncated due to being too long.`,
    },
  ]);
  assert.deepEqual(readAntigravityCommandExits(root, contextId, Date.parse('2026-11-15T04:00:00.000Z')), [
    { task, command, code: 0, result: "The tool's output was truncated due to being too long.", taskCreatedAt: Date.parse('2026-11-15T04:06:48.000Z') },
  ]);
});

test('an explicit native exit code is still reported', t => {
  const task = `${contextId}/task-42`;
  const root = writeTranscript(t, [
    taskRow(task, 'npm test'),
    {
      created_at: '2026-11-15T04:07:53.000Z',
      source: 'SYSTEM',
      type: 'SYSTEM_MESSAGE',
      content: `[Message] timestamp=2026-11-15T04:07:53Z sender=${task} priority=HIGH content=Task id "${task}" finished with result:\nCommand exited with code 7.\nCommand output: fixture failure`,
    },
  ]);
  const exits = readAntigravityCommandExits(root, contextId, Date.parse('2026-11-15T04:00:00.000Z'));
  assert.equal(exits.length, 1);
  assert.equal(exits[0]!.command, 'npm test');
  assert.equal(exits[0]!.code, 7);
  assert.match(exits[0]!.result, /^Command exited with code 7\./);
});

test('re-running the same command keeps both exits, attributed by task id and creation time', t => {
  const command = 'cd worktree && ./tools/development/run-development-node test/verification/cli.ts e2e --check harness-frame-browser';
  const first = `${contextId}/task-476`;
  const second = `${contextId}/task-506`;
  const firstCreated = '2026-11-15T04:52:05.000Z';
  const secondCreated = '2026-11-15T04:55:42.000Z';
  const taskRowAt = (task: string, created: string) => ({
    created_at: created, source: 'MODEL', type: 'GENERIC',
    content: `Tool is running as a background task with task id: ${task}\nTask Description: ${command}\nTask logs are available at: file:///fixture/task.log`,
  });
  const exitRow = (task: string, created: string, code: number) => ({
    created_at: created, source: 'SYSTEM', type: 'SYSTEM_MESSAGE',
    content: `[Message] timestamp=${created} sender=${task} priority=HIGH content=Task id "${task}" finished with result:\nCommand exited with code ${code}.\nCommand output: fixture`,
  });
  // The second run finishes first in the transcript; both exits must survive.
  const root = writeTranscript(t, [
    taskRowAt(first, firstCreated),
    taskRowAt(second, secondCreated),
    exitRow(second, '2026-11-15T04:56:40.000Z', 0),
    exitRow(first, '2026-11-15T04:53:32.000Z', 0),
  ]);
  const exits = readAntigravityCommandExits(root, contextId, Date.parse('2026-11-15T04:00:00.000Z'));
  assert.equal(exits.length, 2);
  const byTask = new Map(exits.map(exit => [exit.task, exit]));
  assert.equal(byTask.get(first)!.taskCreatedAt, Date.parse(firstCreated));
  assert.equal(byTask.get(second)!.taskCreatedAt, Date.parse(secondCreated));
  assert.equal(byTask.get(first)!.command, command);
  assert.equal(byTask.get(second)!.command, command);
});
