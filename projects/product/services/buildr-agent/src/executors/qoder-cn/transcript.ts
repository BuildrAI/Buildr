import fs from 'node:fs';
import { basename, join } from 'node:path';
import type { AgentExecutor } from '../../contracts.ts';
import { nativeContentFiles } from '../native-content.ts';
import { parseReference } from '../native-process.ts';

const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
type ReceiptInput = Parameters<NonNullable<AgentExecutor['readSupplementReceipt']>>[0];

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(textOf).join('');
  if (content && typeof content === 'object') {
    const part = content as Record<string, unknown>;
    if (typeof part.text === 'string') return part.text;
    if (part.type === 'content') return textOf(part.content);
  }
  return '';
}

/** A native human prompt or the legacy bridge attachment can prove delivery. */
export function qoderCnPromptReceipt(row: any, contextId: string, cwd: string): {id:string;text:string;timestamp?:string} | undefined {
  if (row?.sessionId !== contextId || row.isSidechain !== false || row.cwd !== cwd || typeof row.uuid !== 'string' || !row.uuid) return;
  if (row.type === 'attachment') {
    const attachment = row.attachment;
    if (attachment?.commandMode !== 'prompt' || attachment?.origin?.kind !== 'bridge') return;
    return { id: row.uuid, text: textOf(attachment.prompt), ...(typeof row.timestamp === 'string' ? { timestamp: row.timestamp } : {}) };
  }
  if (row.type !== 'user') return;
  const content = row.message?.content;
  if (Array.isArray(content) && content.some((part: any) => part?.type === 'tool_result')) return;
  if (row.origin?.kind === 'task-notification') return;
  const human = row.origin?.kind === 'human' || row.humanInput === true || row.humanInput?.mode === 'prompt';
  if (!human) return;
  const text = typeof row.humanInput?.text === 'string' ? row.humanInput.text : textOf(content);
  return { id: row.uuid, text, ...(typeof row.timestamp === 'string' ? { timestamp: row.timestamp } : {}) };
}

/** Read one immutable native transcript snapshot; partial or changed writes prove nothing. */
export function readQoderCnTranscript(file: string): any[] | undefined {
  try {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_TRANSCRIPT_BYTES) return;
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const opened = fs.fstatSync(descriptor);
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== 1 || !opened.isFile()) return;
      bytes = Buffer.alloc(before.size);
      let length = 0;
      while (length < bytes.length) {
        const read = fs.readSync(descriptor, bytes, length, bytes.length - length, length);
        if (!read) break;
        length += read;
      }
      if (length !== before.size) return;
    } finally { fs.closeSync(descriptor); }
    const after = fs.lstatSync(file);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) return;
    if (bytes.length && bytes.at(-1) !== 10) return;
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch { return; }
}

/** Historical repair uses exact text plus a strict post-admission timestamp; ambiguity proves nothing. */
export async function readQoderCnSupplementReceipt(input: ReceiptInput): Promise<{inputItemId:string} | undefined> {
  if (!input.text.trim()) return;
  const native = parseReference(String(input.contextRef.data?.native ?? ''), 'qoder-cn', input.cwd, input.bindingIdentity);
  if (native.nativeSessionId !== input.contextRef.id ||
    input.executionRef.data?.resourceContext !== input.contextRef.id ||
    input.executionRef.data?.resourceBinding !== input.bindingIdentity) return;
  const admittedAt = Date.parse(input.createdAt);
  if (!Number.isFinite(admittedAt)) return;
  const account = input.nativeAccountConfigRoot ?? input.configRoot;
  const config = join(account, 'qoder-cn-config');
  const files = nativeContentFiles(
    { root: account, configRoot: account, contextId: input.contextRef.id, cwd: input.cwd },
    join(config, 'projects'),
    file => basename(file) === `${input.contextRef.id}.jsonl`,
    3,
  );
  if (files.length !== 1) return;
  const rows = readQoderCnTranscript(files[0]!);
  if (!rows) return;
  const matches: Array<{id:string;text:string;timestamp:string}> = [];
  for (const row of rows) {
    const receipt = qoderCnPromptReceipt(row, input.contextRef.id, input.cwd);
    if (!receipt?.timestamp || receipt.text !== input.text) continue;
    const at = Date.parse(receipt.timestamp);
    if (!Number.isFinite(at) || at < admittedAt) continue;
    matches.push({ ...receipt, timestamp: receipt.timestamp });
  }
  return matches.length === 1 ? { inputItemId: matches[0]!.id } : undefined;
}
