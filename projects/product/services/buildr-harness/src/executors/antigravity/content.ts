import fs from 'node:fs';
import path from 'node:path';
import type { AgentExecutor, ExecutorItem } from '../../contracts.ts';
import {
  defineNativeContent,
  type NativeContentContext,
  type NativeContentInventory,
  type NativeToolContent,
} from '../../native-content-contracts.ts';
import { nativeContentFiles, nativeContentImages, nativeContentRows } from '../native-content.ts';
import { nativeToolContext, nativeToolRows } from '../native-tool-source.ts';
import { parseReference } from '../native-process.ts';

const CONTEXT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
const PROVIDER = 'antigravity';
export const ANTIGRAVITY_CONTINUATION_MARKER = '[[buildr:background-continuation]]';

export function isValidAntigravityContextId(contextId: string): boolean {
  return CONTEXT_ID_PATTERN.test(contextId);
}

export function antigravitySessionRecordPath(configRoot: string, contextId: string): string {
  if (!isValidAntigravityContextId(contextId)) throw new Error('agent_context_invalid');
  return path.join(configRoot, 'antigravity-sessions', `${contextId}.jsonl`);
}

export function antigravityNativeTranscriptPath(configRoot: string, contextId: string): string {
  if (!isValidAntigravityContextId(contextId)) throw new Error('agent_context_invalid');
  return path.join(configRoot, 'home', '.gemini', 'antigravity', 'transcripts', `${contextId}.jsonl`);
}

function readAntigravityBackgroundTasks(
  configRoot: string,
  contextId: string,
  startedAt: number,
  options: { excludeSchedules?: boolean } = {},
) {
  if (!isValidAntigravityContextId(contextId)) {
    return {
      tasks: new Map<string, { command: string; createdAt: number }>(),
      exits: new Map<string, { task: string; command: string; code: number; result: string; taskCreatedAt: number }>(),
    };
  }
  const file = path.join(configRoot, 'home', '.gemini', 'antigravity-cli', 'brain', contextId,
    '.system_generated', 'logs', 'transcript_full.jsonl');
  const rows = (readImmutableJsonlFile(file) ?? []).filter(row => Date.parse(row?.created_at) >= startedAt);
  const tasks = new Map<string, { command: string; createdAt: number }>();
  for (const row of rows) {
    if (row.source !== 'MODEL' || row.type !== 'GENERIC' || typeof row.content !== 'string') continue;
    const task = /^Tool is running as a background task with task id: (.+)\r?$/m.exec(row.content)?.[1];
    const description = /^Task Description: ([\s\S]+?)\r?\nTask logs are available at:/m.exec(row.content)?.[1];
    if (!task?.startsWith(contextId + '/') || !/^task-\d+$/.test(task.slice(contextId.length + 1)) || !description) continue;
    if (options.excludeSchedules && /^(?:Timer|Cron): /u.test(description)) continue;
    tasks.set(task, { command: description, createdAt: Date.parse(row.created_at) });
  }
  // Every exit is kept, keyed by its exact native task id. Re-running the same
  // command produces several tasks with an identical description; the caller
  // attributes each exit to the tool that spawned it, so discarding non-unique
  // descriptions here would permanently freeze those turns.
  const exits = new Map<string, { task: string; command: string; code: number; result: string; taskCreatedAt: number }>();
  for (const row of rows) {
    if (row.source !== 'SYSTEM' || row.type !== 'SYSTEM_MESSAGE' || typeof row.content !== 'string') continue;
    const coded = /^\[Message\] timestamp=\S+ sender=(\S+) priority=\S+ content=Task id "([^"]+)" finished with result:\r?\nCommand exited with code (-?\d+)\./m.exec(row.content);
    if (coded && coded[1] === coded[2]) {
      const info = tasks.get(coded[1]!);
      if (info) exits.set(coded[1]!, { task: coded[1]!, command: info.command, code: Number(coded[3]), result: row.content.slice(coded.index + coded[0].lastIndexOf('Command exited')).split('\n</SYSTEM_MESSAGE>')[0]!.trim(), taskCreatedAt: info.createdAt });
      continue;
    }
    // A finished or canceled background task can omit the numeric exit code.
    const settled = /^\[Message\] timestamp=\S+ sender=(\S+) priority=\S+ content=Task id "([^"]+)" (finished|was canceled) with result:\r?\n([\s\S]*)$/m.exec(row.content);
    if (!settled || settled[1] !== settled[2]) continue;
    const info = tasks.get(settled[1]!);
    if (info) {
      exits.set(settled[1]!, {
        task: settled[1]!,
        command: info.command,
        code: settled[3] === 'was canceled' ? 130 : 0,
        result: (settled[4] ?? '').split('\n</SYSTEM_MESSAGE>')[0]!.trim(),
        taskCreatedAt: info.createdAt,
      });
    }
  }
  return { tasks, exits };
}

export function readAntigravityCommandExits(configRoot: string, contextId: string, startedAt: number) {
  return [...readAntigravityBackgroundTasks(configRoot, contextId, startedAt).exits.values()];
}

export function readAntigravityActiveBackgroundCommands(configRoot: string, contextId: string, startedAt: number) {
  const { tasks, exits } = readAntigravityBackgroundTasks(configRoot, contextId, startedAt, { excludeSchedules: true });
  const active: Array<{ task: string; command: string; taskCreatedAt: number; lastActivityAt: number; logSize: number; tail: string }> = [];
  for (const [task, info] of tasks) {
    if (exits.has(task)) continue;
    const taskName = task.slice(contextId.length + 1);
    const logFile = path.join(configRoot, 'home', '.gemini', 'antigravity-cli', 'brain', contextId,
      '.system_generated', 'tasks', `${taskName}.log`);
    let lastActivityAt = info.createdAt;
    let logSize = 0;
    let tail = '';
    try {
      const stat = fs.lstatSync(logFile);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1) {
        lastActivityAt = Math.max(info.createdAt, Math.floor(stat.mtimeMs));
        logSize = stat.size;
        if (stat.size > 0) {
          const bytesToRead = Math.min(1024, stat.size);
          const offset = stat.size - bytesToRead;
          const buffer = Buffer.alloc(bytesToRead);
          const fd = fs.openSync(logFile, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
          try {
            let total = 0;
            while (total < bytesToRead) {
              const read = fs.readSync(fd, buffer, total, bytesToRead - total, offset + total);
              if (!read) break;
              total += read;
            }
            if (total > 0) tail = new TextDecoder('utf-8').decode(buffer.subarray(0, total)).trim();
          } finally {
            fs.closeSync(fd);
          }
        }
      }
    } catch {
      // Missing or transient task log falls back to task creation timestamp.
    }
    active.push({ task, command: info.command, taskCreatedAt: info.createdAt, lastActivityAt, logSize, tail });
  }
  return active;
}

export function readAntigravityScheduleTriggers(configRoot: string, contextId: string, startedAt: number) {
  if (!isValidAntigravityContextId(contextId)) return [];
  const file = path.join(configRoot, 'home', '.gemini', 'antigravity-cli', 'brain', contextId,
    '.system_generated', 'logs', 'transcript_full.jsonl');
  const rows = (readImmutableJsonlFile(file) ?? []).filter(row => Date.parse(row?.created_at) >= startedAt);
  const tasks = new Map<string, { prompt: string; createdAt: number }>();
  for (const row of rows) {
    if (row.source !== 'MODEL' || row.type !== 'GENERIC' || typeof row.content !== 'string') continue;
    const task = /^Tool is running as a background task with task id: (.+)\r?$/m.exec(row.content)?.[1];
    const prompt = /^Task Description: (?:Timer|Cron): [\s\S]*?Prompt: ([\s\S]+?)\r?\nTask logs are available at:/m.exec(row.content)?.[1]?.trim();
    if (task?.startsWith(contextId + '/') && /^task-\d+$/.test(task.slice(contextId.length + 1)) && prompt) {
      tasks.set(task, { prompt, createdAt: Date.parse(row.created_at) });
    }
  }
  const triggers = new Map<string, { task: string; prompt: string; result: string; taskCreatedAt: number }>();
  for (const row of rows) {
    if (row.source !== 'SYSTEM' || row.type !== 'SYSTEM_MESSAGE' || typeof row.content !== 'string') continue;
    const match = /^\[Message\] timestamp=\S+ sender=(\S+) priority=\S+ content=([\s\S]*)$/m.exec(row.content);
    if (!match) continue;
    const sender = match[1]!;
    const info = tasks.get(sender);
    if (!info) continue;
    const result = (match[2] ?? '').split('\n</SYSTEM_MESSAGE>')[0]!.trim();
    triggers.set(sender, { task: sender, prompt: info.prompt, result, taskCreatedAt: info.createdAt });
  }
  return [...triggers.values()];
}

export function appendAntigravitySessionRow(
  configRoot: string,
  contextId: string,
  row: Record<string, unknown>,
): void {
  const file = antigravitySessionRecordPath(configRoot, contextId);
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dirInfo = fs.lstatSync(directory);
  if (dirInfo.isSymbolicLink() || !dirInfo.isDirectory()) throw new Error('agent_config_symlink_unsupported');
  if (fs.existsSync(file)) {
    const fileInfo = fs.lstatSync(file);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) throw new Error('agent_config_symlink_unsupported');
  }
  const line = `${JSON.stringify({ sessionId: contextId, timestamp: new Date().toISOString(), ...row })}\n`;
  const fd = fs.openSync(
    file,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    fs.writeSync(fd, line, undefined, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

export function readImmutableJsonlFile(file: string): any[] | undefined {
  try {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_TRANSCRIPT_BYTES) return undefined;
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const opened = fs.fstatSync(fd);
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== 1 || !opened.isFile()) {
        return undefined;
      }
      bytes = Buffer.alloc(before.size);
      let length = 0;
      while (length < bytes.length) {
        const read = fs.readSync(fd, bytes, length, bytes.length - length, length);
        if (!read) break;
        length += read;
      }
      if (length !== before.size) return undefined;
    } finally {
      fs.closeSync(fd);
    }
    const after = fs.lstatSync(file);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs
    ) {
      return undefined;
    }
    if (bytes.length && bytes.at(-1) !== 10) return undefined;
    return new TextDecoder('utf-8', { fatal: true })
      .decode(bytes)
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return undefined;
  }
}

export function readAppendOnlyJsonlDelta(file: string, offset: number): { rows: any[]; offset: number } | undefined {
  try {
    const before = fs.lstatSync(file);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || before.nlink !== 1
      || before.size > MAX_TRANSCRIPT_BYTES
      || offset < 0
      || offset > before.size
    ) {
      return undefined;
    }
    if (before.size === offset) return { rows: [], offset };
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const opened = fs.fstatSync(fd);
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== 1 || !opened.isFile()) {
        return undefined;
      }
      bytes = Buffer.alloc(before.size - offset);
      let length = 0;
      while (length < bytes.length) {
        const read = fs.readSync(fd, bytes, length, bytes.length - length, offset + length);
        if (!read) break;
        length += read;
      }
      if (length !== bytes.length) return undefined;
    } finally {
      fs.closeSync(fd);
    }
    const end = bytes.lastIndexOf(10);
    if (end < 0) return undefined;
    const rows = new TextDecoder('utf-8', { fatal: true })
      .decode(bytes.subarray(0, end))
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    return { rows, offset: offset + end + 1 };
  } catch {
    return undefined;
  }
}

export function reconcileAntigravityFinalText(
  lastText: string | undefined,
  nativeText: string,
  lastSuperseded: boolean,
): { action: 'noop' | 'overwrite' | 'append' } {
  if (lastText !== undefined) {
    if (nativeText === lastText) return { action: 'noop' };
    if (nativeText.startsWith(lastText) && nativeText.length > lastText.length) return { action: 'overwrite' };
    if (!lastSuperseded) return { action: 'noop' };
  }
  return { action: 'append' };
}

function locateSessionFiles(input: NativeContentContext): string[] {
  if (!isValidAntigravityContextId(input.contextId)) return [];
  const durable = nativeContentFiles(
    input,
    path.join(input.configRoot, 'antigravity-sessions'),
    file => path.basename(file) === `${input.contextId}.jsonl`,
    2,
  );
  if (durable.length === 1) return durable;
  const native = nativeContentFiles(
    input,
    path.join(input.configRoot, 'home', '.gemini', 'antigravity', 'transcripts'),
    file => path.basename(file) === `${input.contextId}.jsonl`,
    2,
  );
  return native.length === 1 ? native : [];
}

export function antigravityContent(input: NativeContentContext): NativeContentInventory | undefined {
  try {
    const files = locateSessionFiles(input);
    if (files.length !== 1) return undefined;
    const rows = nativeContentRows(input, PROVIDER, files[0]!);
    if (!rows.length) return undefined;
    if (rows.some(row => row.value.sessionId !== input.contextId || (row.value.cwd !== undefined && row.value.cwd !== input.cwd))) {
      return undefined;
    }
    return {
      sourcePaths: files,
      records: rows.flatMap(row => {
        const id = typeof row.value.toolCallId === 'string' ? row.value.toolCallId : undefined;
        return id && (row.value.type === 'tool_call' || row.value.type === 'tool_result')
          ? [{ ...row, toolIds: [id], ...(row.value.type === 'tool_call' ? { input: true } : {}) }]
          : [];
      }),
      images: rows
        .filter(row => row.value.type === 'user' && Array.isArray(row.value.content))
        .flatMap(row => nativeContentImages(row, ['content'], row.value.content)),
    };
  } catch {
    return undefined;
  }
}

export function readAntigravityTool(root: string, reference: NativeToolContent) {
  try {
    const input = nativeToolContext(root, reference, PROVIDER, { contextIdPattern: CONTEXT_ID_PATTERN });
    if (!input) return undefined;
    const files = locateSessionFiles(input);
    if (files.length !== 1) return undefined;
    let callInput: string | undefined;
    let resultText: string | undefined;
    let sawCall = false;
    let sawResult = false;
    for (const row of nativeToolRows(input, PROVIDER, files[0]!)) {
      if (row.sessionId !== input.contextId || (row.cwd !== undefined && row.cwd !== input.cwd)) {
        return undefined;
      }
      if (row.toolCallId !== reference.nativeId) continue;
      if (row.type === 'tool_call') {
        sawCall = true;
        if (typeof row.fullInput === 'string') callInput = row.fullInput;
        else if (row.input !== undefined) callInput = typeof row.input === 'string' ? row.input : JSON.stringify(row.input);
      } else if (row.type === 'tool_result') {
        sawResult = true;
        if (typeof row.fullInput === 'string') callInput = row.fullInput;
        else if (callInput === undefined && row.input !== undefined) {
          callInput = typeof row.input === 'string' ? row.input : JSON.stringify(row.input);
        }
        if (typeof row.output === 'string') resultText = row.output;
      }
    }
    if ((!sawCall && !sawResult) || resultText === undefined) return undefined;
    return {
      ...reference.entry,
      ...(callInput !== undefined ? { input: callInput } : {}),
      text: resultText,
    };
  } catch {
    return undefined;
  }
}

function admittedTextMatches(nativeText: string, admittedText: string): boolean {
  if (nativeText === admittedText) return true;
  if (nativeText.endsWith(`\n\n${admittedText}`)) return true;
  const marker = '\n\n本次用户要求：\n';
  const at = nativeText.lastIndexOf(marker);
  if (at < 0) return false;
  const suffix = nativeText.slice(at + marker.length);
  return suffix === admittedText || suffix.startsWith(`${admittedText}\n\n`);
}

export const readAntigravityPersistedExecution: NonNullable<AgentExecutor['readPersistedExecution']> = async input => {
  try {
    const nativeInputs = Array.isArray(input.nativeInputs) ? input.nativeInputs : [];
    if (!nativeInputs.length) return undefined;
    const native = parseReference(String(input.contextRef.data?.native ?? ''), PROVIDER, input.cwd, input.bindingIdentity);
    if (
      native.nativeSessionId !== input.contextRef.id
      || input.executionRef.data?.resourceContext !== input.contextRef.id
      || input.executionRef.data?.resourceBinding !== input.bindingIdentity
    ) {
      return undefined;
    }

    const nativeRows = readImmutableJsonlFile(antigravityNativeTranscriptPath(input.configRoot, input.contextRef.id)) ?? [];
    const durableRows = readImmutableJsonlFile(antigravitySessionRecordPath(input.configRoot, input.contextRef.id)) ?? [];
    const rows = nativeRows.length ? nativeRows : durableRows;
    if (!rows.length) return undefined;

    const prompts: Array<{ id: string; text: string; timestamp: string; clientRequestId?: string; index: number }> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (row?.sessionId !== input.contextRef.id || (row.cwd !== undefined && row.cwd !== input.cwd)) continue;
      if (row.type !== 'user' || typeof row.text !== 'string' || typeof row.timestamp !== 'string') continue;
      if (row.text.includes(ANTIGRAVITY_CONTINUATION_MARKER)) continue;
      if (!Number.isFinite(Date.parse(row.timestamp))) continue;
      prompts.push({
        id: typeof row.id === 'string' && row.id ? row.id : `user:${index}`,
        text: row.text,
        timestamp: row.timestamp,
        ...(typeof row.clientRequestId === 'string' ? { clientRequestId: row.clientRequestId } : {}),
        index,
      });
    }
    if (!prompts.length) return undefined;

    const matched: Array<{ admission: typeof nativeInputs[number]; prompt: typeof prompts[number] }> = [];
    const used = new Set<string>();
    for (const admission of nativeInputs) {
      const admittedAt = Date.parse(admission.createdAt);
      if (!Number.isFinite(admittedAt) || !admission.text.trim()) return undefined;
      const candidates = prompts.filter(
        p =>
          !used.has(p.id)
          && (p.clientRequestId === admission.clientRequestId || admittedTextMatches(p.text, admission.text))
          && Date.parse(p.timestamp) + 1000 >= admittedAt,
      );
      if (candidates.length !== 1) return undefined;
      used.add(candidates[0]!.id);
      matched.push({ admission, prompt: candidates[0]! });
    }
    if (!matched.length) return undefined;

    const firstIndex = matched[0]!.prompt.index;
    if (prompts.some(p => p.index >= firstIndex && !used.has(p.id))) return undefined;

    const completions = rows
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row, index }) =>
          index > firstIndex
          && row?.sessionId === input.contextRef.id
          && (row.cwd === undefined || row.cwd === input.cwd)
          && row.type === 'turn_complete',
      );
    const final = completions.at(-1);
    if (!final || final.row.stopReason !== 'end_turn' || final.row.backgroundActive === true) {
      return undefined;
    }

    const scoped = rows.slice(firstIndex, final.index + 1);
    const tools = new Map<string, { id: string; label: string; status: 'running' | 'completed' }>();
    for (const row of scoped) {
      if (row?.sessionId !== input.contextRef.id) continue;
      if (row.type === 'tool_call' && typeof row.toolCallId === 'string') {
        tools.set(row.toolCallId, {
          id: row.toolCallId,
          label: typeof row.name === 'string' && row.name ? row.name : typeof row.title === 'string' && row.title ? row.title : '工具',
          status: row.status === 'completed' || row.status === 'failed' ? 'completed' : 'running',
        });
      } else if (row.type === 'tool_result' && typeof row.toolCallId === 'string') {
        const prior = tools.get(row.toolCallId);
        tools.set(row.toolCallId, {
          id: row.toolCallId,
          label: typeof row.name === 'string' && row.name ? row.name : prior?.label ?? '工具',
          status: row.status === 'running' ? 'running' : 'completed',
        });
      }
    }
    if ([...tools.values()].some(t => t.status !== 'completed')) return undefined;

    const items: ExecutorItem[] = matched.map(({ admission, prompt }) => ({
      id: prompt.id,
      clientRequestId: admission.clientRequestId,
      kind: 'message',
      role: 'user',
      text: admission.text,
      executionId: input.executionRef.id,
      status: 'completed',
    }));
    if (typeof final.row.finalText === 'string' && final.row.finalText) {
      items.push({
        id: `message:${input.executionRef.id}:persisted-final`,
        kind: 'message',
        role: 'assistant',
        text: final.row.finalText,
        executionId: input.executionRef.id,
        status: 'completed',
      });
    }
    return {
      items,
      observation: {
        status: 'idle',
        executionRef: input.executionRef,
        tools: [...tools.values()].map(t => ({ id: t.id, label: t.label, status: 'completed' as const })),
        backgroundWork: false,
      },
      ...(typeof final.row.timestamp === 'string' && Number.isFinite(Date.parse(final.row.timestamp))
        ? { endedAt: final.row.timestamp }
        : {}),
    };
  } catch {
    return undefined;
  }
};

export const antigravityNativeContent = defineNativeContent({
  allowedPath: /^(?:antigravity-sessions\/.+\.jsonl|home\/\.gemini\/antigravity\/transcripts\/.+\.jsonl)$/,
  contextIdPattern: CONTEXT_ID_PATTERN,
  omitExecutionTurnId: true,
  sessionRoots: [
    {
      relative: 'antigravity-sessions',
      depth: 2,
      matchSessionFile: (file, contextId) => path.basename(file) === `${contextId}.jsonl`,
      matchAnySessionFile: file => file.endsWith('.jsonl'),
      extractContextId: file => path.basename(file).match(/^([a-zA-Z0-9_-]{8,128})\.jsonl$/)?.[1],
    },
    {
      relative: 'home/.gemini/antigravity/transcripts',
      depth: 2,
      matchSessionFile: (file, contextId) => path.basename(file) === `${contextId}.jsonl`,
      matchAnySessionFile: file => file.endsWith('.jsonl'),
      extractContextId: file => path.basename(file).match(/^([a-zA-Z0-9_-]{8,128})\.jsonl$/)?.[1],
    },
  ],
  inventory: antigravityContent,
  readTool: readAntigravityTool,
});
