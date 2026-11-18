import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import type { AgentExecutor } from '../../contracts.ts';
import { nativeBindingProvenance, parseReference, resolveProvenanceForIdentity, sameVolumeProvenance } from '../native-process.ts';
import { dshExecutionObservation, dshHistoryItems } from './protocol.ts';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Input = Parameters<NonNullable<AgentExecutor['readPersistedExecution']>>[0];
const MAX_BYTES = 32 * 1024 * 1024, MAX_DECODED = 128 * 1024 * 1024;

async function plain(file: string, directory: boolean): Promise<boolean> {
  const info = await lstat(file).catch(() => undefined);
  return Boolean(info && !info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile() && info.nlink === 1));
}

/** DSH v4 is append-only, including concatenated zstd frames. Never repair, migrate, or lock its log. */
export const readDshPersistedExecution: NonNullable<AgentExecutor['readPersistedExecution']> = async (input: Input) => {
  const native = parseReference(String(input.contextRef.data?.native ?? ''), 'dsh', input.cwd, input.bindingIdentity);
  if (native.nativeSessionId !== input.contextRef.id || !/^session-[a-f0-9-]{36}$/.test(input.contextRef.id)) return;
  if (input.executionRef.data && (input.executionRef.data.resourceContext !== input.contextRef.id || input.executionRef.data.resourceBinding !== input.bindingIdentity)) return;
  const provenance = await nativeBindingProvenance('dsh', input.executable, path.join(input.configRoot,'dsh-home'), input.programSource);
  if (input.bindingData !== undefined && (
    (input.gatewayIdentity ? input.bindingData.gatewayIdentity !== input.gatewayIdentity : Boolean(input.bindingData.gatewayIdentity))
    || Boolean(input.bindingData.nativeSourceIdentity)
    || !sameVolumeProvenance(provenance, input.bindingData)
  )) return;
  const wrap = (nativeIdentity: string) => input.gatewayIdentity ? digest(['buildr-model-gateway/v1', nativeIdentity, input.gatewayIdentity]) : nativeIdentity;
  const candidateDevs = typeof input.bindingData?.dev === 'number' ? [input.bindingData.dev, ...(input.volumeDevs ?? [])] : input.volumeDevs;
  if (!resolveProvenanceForIdentity(provenance, input.bindingIdentity, candidateDevs, wrap)) return;
  const home = path.join(input.configRoot, 'dsh-home'), sessions = path.join(home, 'sessions');
  if (!await plain(input.configRoot, true) || !await plain(home, true) || !await plain(sessions, true)) return;
  const buckets = await readdir(sessions);
  if (buckets.length > 1000) return;
  const candidates: string[] = [];
  for (const bucket of buckets) {
    const parent = path.join(sessions, bucket), directory = path.join(parent, input.contextRef.id);
    if (await plain(parent, true) && await plain(directory, true)) {
      for (const name of ['session.v4.jsonl', 'session.v4.jsonl.zstd']) {
        const file = path.join(directory, name);
        if (await plain(file, false)) candidates.push(file);
      }
    }
  }
  if (candidates.length !== 1) return;
  const file = candidates[0]!, handle = await open(file, 'r');
  const rows: any[] = [];
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > MAX_BYTES) return;
    const bytes = await handle.readFile();
    let decoded = 0;
    const lines = (buffer: Buffer) => {
      decoded += buffer.length;
      if (decoded > MAX_DECODED) throw new Error('dsh_durable_history_limit');
      const text = buffer.toString('utf8');
      if (!text.endsWith('\n')) throw new Error('dsh_durable_history_partial');
      for (const line of text.split('\n')) if (line) {
        if (rows.length >= 20001) throw new Error('dsh_durable_history_limit');
        rows.push(JSON.parse(line));
      }
    };
    if (file.endsWith('.zstd')) {
      let offset = 0;
      while (offset < bytes.length) {
        // Node exposes the consumed frame size with info:true; older @types/node
        // releases still declare only the buffer-returning overload for zstd.
        const frame = zstdDecompressSync(bytes.subarray(offset), { info: true, maxOutputLength: MAX_DECODED - decoded }) as unknown as {buffer:Buffer;engine:{bytesWritten:number}};
        if (!frame.engine.bytesWritten) return;
        offset += frame.engine.bytesWritten; lines(frame.buffer);
      }
    } else lines(bytes);
    const after = await handle.stat(), current = await lstat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== current.ino || before.dev !== current.dev || current.isSymbolicLink()) return;
  } finally { await handle.close(); }
  const header = rows.shift();
  if (header?.type !== 'session' || header.version !== 4 || header.id !== input.contextRef.id || header.cwd !== input.cwd) return;
  if (rows.some((event, index) => event.seq !== index || typeof event.type !== 'string' || !Number.isFinite(event.time) || !event.data || typeof event.data !== 'object')) return;
  const observation = dshExecutionObservation(rows, input.executionRef.id);
  if (!['idle', 'stopped'].includes(observation.status) || observation.tools.some(tool => tool.status !== 'completed')) return;
  return { observation: { ...observation, executionRef: input.executionRef }, items: dshHistoryItems(rows).filter(item => item.executionId === input.executionRef.id) };
};
