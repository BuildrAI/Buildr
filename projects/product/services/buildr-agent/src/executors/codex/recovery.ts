import { createReadStream } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { relative, isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';

/** thread/read can omit a tool whose side effect happened before its completion record was persisted. */
export async function codexUnsettledTools(path: unknown, config: string, contextId: string, executionId: string): Promise<{ id: string; label: string; status: 'unknown'; canStop: false }[]> {
  if (typeof path !== 'string') throw new Error('codex_recovery_history_unavailable');
  const root = await realpath(join(config, 'sessions')), file = await realpath(path), local = relative(root, file);
  if (!local || local.startsWith('..') || isAbsolute(local) || !file.endsWith('.jsonl')) throw new Error('codex_recovery_history_mismatch');
  let identity = false, seen = false, turn: string | undefined;
  const pending = new Map<string, string>();
  const input = createReadStream(file), lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const row = JSON.parse(line), value = row.payload;
      if (row.type === 'session_meta') { if (value?.id !== contextId) throw new Error('codex_recovery_history_mismatch'); identity = true; }
      if (row.type === 'turn_context' || row.type === 'event_msg' && value?.type === 'task_started') {
        turn = value?.turn_id; if (turn === executionId) seen = true;
      }
      if (row.type !== 'response_item') continue;
      if (turn === executionId && ['function_call', 'custom_tool_call'].includes(value?.type)) {
        if (typeof value.call_id !== 'string') throw new Error('codex_recovery_history_incomplete');
        pending.set(value.call_id, String(value.name ?? '原生工具'));
      }
      if (['function_call_output', 'custom_tool_call_output'].includes(value?.type) && pending.has(value.call_id)) {
        // A yielded command may still be running after the foreground call returned.
        if (!/Process running with session ID/.test(typeof value.output === 'string' ? value.output : JSON.stringify(value.output))) pending.delete(value.call_id);
      }
    }
  } finally { lines.close(); input.destroy(); }
  if (!identity || !seen) throw new Error('codex_recovery_history_incomplete');
  return [...pending].map(([id, label]) => ({ id, label, status: 'unknown', canStop: false }));
}
