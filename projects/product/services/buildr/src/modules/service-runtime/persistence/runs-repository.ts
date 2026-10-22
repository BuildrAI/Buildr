import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import type { ManagedRunRecord } from '../domain/runs.ts';

function normalize(record: ManagedRunRecord): ManagedRunRecord {
  return {
    ...record,
    main: typeof record.main === 'boolean' ? record.main : null,
    dirty: typeof record.dirty === 'boolean' ? record.dirty : null,
    taskId: record.taskId ?? null,
    taskTitle: record.taskTitle ?? null,
    origin: record.origin === 'human' || record.origin === 'agent' ? record.origin : 'unknown',
    url: record.url || `http://127.0.0.1:${record.actualPort}`,
    connection: record.connection ?? null,
    launch: record.launch ?? null,
    processIdentity: record.processIdentity ?? null,
  };
}

function safeRunId(runId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) throw new Error('运行编号无效。');
  return runId;
}

function validRecord(value: unknown, expectedId: string): value is ManagedRunRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<ManagedRunRecord>;
  return record.id === expectedId && typeof record.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(record.id)
    && typeof record.serviceCode === 'string' && typeof record.startedAt === 'string' && Number.isFinite(Date.parse(record.startedAt))
    && typeof record.worktreePath === 'string' && ['starting', 'running', 'stopped', 'failed'].includes(record.status ?? '')
    && Number.isInteger(record.actualPort) && record.actualPort! >= 1 && record.actualPort! <= 65535;
}

export function serviceRuntimeRoot(targetRoot: string): string {
  return path.join(targetRoot, '.buildr', 'local', 'service-runtime');
}

export function runRecordPath(targetRoot: string, runId: string): string {
  return path.join(serviceRuntimeRoot(targetRoot), 'runs', `${safeRunId(runId)}.json`);
}

export function runLogPath(targetRoot: string, runId: string): string {
  return path.join(serviceRuntimeRoot(targetRoot), 'logs', `${safeRunId(runId)}.log`);
}

export function listRunRecords(targetRoot: string): ManagedRunRecord[] {
  const directory = path.join(serviceRuntimeRoot(targetRoot), 'runs');
  if (!fs.existsSync(directory)) return [];
  const records: ManagedRunRecord[] = [];
  for (const entry of fs.readdirSync(directory)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const record: unknown = JSON.parse(fs.readFileSync(path.join(directory, entry), 'utf8'));
      if (validRecord(record, entry.slice(0, -5))) records.push(normalize(record));
    } catch {
      continue;
    }
  }
  return records.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function readRunRecord(targetRoot: string, runId: string): ManagedRunRecord | null {
  const file = runRecordPath(targetRoot, runId);
  if (!fs.existsSync(file)) return null;
  try {
    const record: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validRecord(record, runId) ? normalize(record) : null;
  } catch { return null; }
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

