import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import type { ManagedRunRecord } from '../domain/runs.ts';

export function serviceRuntimeRoot(targetRoot: string): string {
  return path.join(targetRoot, '.buildr', 'local', 'service-runtime');
}

export function runRecordPath(targetRoot: string, runId: string): string {
  return path.join(serviceRuntimeRoot(targetRoot), 'runs', `${runId}.json`);
}

export function runLogPath(targetRoot: string, runId: string): string {
  return path.join(serviceRuntimeRoot(targetRoot), 'logs', `${runId}.log`);
}

export function listRunRecords(targetRoot: string): ManagedRunRecord[] {
  const directory = path.join(serviceRuntimeRoot(targetRoot), 'runs');
  if (!fs.existsSync(directory)) return [];
  const records: ManagedRunRecord[] = [];
  for (const entry of fs.readdirSync(directory)) {
    if (!entry.endsWith('.json')) continue;
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(directory, entry), 'utf8')) as ManagedRunRecord);
    } catch {
      continue;
    }
  }
  return records.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function readRunRecord(targetRoot: string, runId: string): ManagedRunRecord | null {
  const file = runRecordPath(targetRoot, runId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ManagedRunRecord;
}

export async function writeRunRecord(targetRoot: string, record: ManagedRunRecord): Promise<void> {
  await fs.promises.mkdir(path.dirname(runRecordPath(targetRoot, record.id)), { recursive: true });
  await atomicWriteJson(runRecordPath(targetRoot, record.id), record);
}

export async function appendRunLog(targetRoot: string, runId: string, chunk: string): Promise<void> {
  const file = runLogPath(targetRoot, runId);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.appendFile(file, chunk, 'utf8');
}

export function readRunLogTail(targetRoot: string, runId: string, maxBytes: number): { log: string; truncated: boolean; size: number } {
  const file = runLogPath(targetRoot, runId);
  if (!fs.existsSync(file)) return { log: '', truncated: false, size: 0 };
  const size = fs.statSync(file).size;
  if (size <= maxBytes) return { log: fs.readFileSync(file, 'utf8'), truncated: false, size };
  const buffer = Buffer.alloc(maxBytes);
  const handle = fs.openSync(file, 'r');
  try {
    fs.readSync(handle, buffer, 0, maxBytes, size - maxBytes);
  } finally {
    fs.closeSync(handle);
  }
  // 字节偏移可能切断首行或多字节字符，丢弃第一段不完整内容。
  const lines = buffer.toString('utf8').split('\n');
  return { log: lines.slice(1).join('\n'), truncated: true, size };
}

