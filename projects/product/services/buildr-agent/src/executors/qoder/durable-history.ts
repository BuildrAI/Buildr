import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AgentExecutor } from '../../contracts.ts';
import { nativeBindingProvenance, parseReference, resolveProvenanceForIdentity, sameVolumeProvenance } from '../native-process.ts';
import { qoderHistoryItems, qoderInterruptedObservation } from './protocol.ts';

type Input = Parameters<NonNullable<AgentExecutor['readPersistedExecution']>>[0];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_BYTES = 32 * 1024 * 1024, MAX_ROWS = 30000;

async function directory(file: string): Promise<boolean> {
  const info = await lstat(file).catch(() => undefined);
  return Boolean(info?.isDirectory() && !info.isSymbolicLink());
}

/** A receipt is usable only while all files in the observation remain unchanged. */
async function snapshot(file: string) {
  const location = await lstat(file).catch(() => undefined);
  if (!location?.isFile() || location.isSymbolicLink() || location.nlink !== 1 || location.size > MAX_BYTES) return;
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (before.ino !== location.ino || before.dev !== location.dev || before.size > MAX_BYTES) return;
    // Bound memory even if a native writer appends after the initial stat.
    const buffer = Buffer.alloc(before.size + 1); let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== before.size) return;
    const text = buffer.subarray(0, length).toString('utf8');
    if (!text.endsWith('\n')) return;
    const lines = text.split('\n').filter(Boolean);
    if (lines.length > MAX_ROWS) return;
    const rows: any[] = lines.map(line => JSON.parse(line));
    const unchanged = async () => {
      const current = await lstat(file).catch(() => undefined);
      return Boolean(current?.isFile() && !current.isSymbolicLink() && current.nlink === 1 &&
        before.dev === current.dev && before.ino === current.ino && before.size === current.size &&
        before.mtimeMs === current.mtimeMs && before.ctimeMs === current.ctimeMs);
    };
    if (await unchanged()) return { rows, bytes: before.size, unchanged };
  } finally { await handle.close(); }
}

async function children(root: string, maximum: number): Promise<string[] | undefined> {
  if (!await directory(root)) return;
  const names = await readdir(root);
  return names.length <= maximum ? names.sort() : undefined;
}

/** Read only the active primary chain back to the exact accepted input. */
function primaryTurn(rows: any[], input: Input): any[] | undefined {
  const context = input.contextRef.id;
  const leaf = rows.findLast(row => row.type === 'active-leaf' && row.sessionId === context)?.leafUuid;
  const indexed = new Map<string, any>();
  for (const row of rows) {
    if (typeof row.uuid !== 'string') continue;
    if (indexed.has(row.uuid)) return;
    indexed.set(row.uuid, row);
  }
  const chain: any[] = [], seen = new Set<string>();
  let id = leaf;
  while (typeof id === 'string' && chain.length < MAX_ROWS) {
    const row = indexed.get(id);
    if (!row || seen.has(id) || row.sessionId !== context || row.isSidechain !== false || row.cwd !== input.cwd) return;
    seen.add(id); chain.push(row);
    if (id === input.executionRef.id) return row.type === 'user' && row.origin?.kind === 'human' && UUID.test(row.promptId ?? '') ? chain.reverse() : undefined;
    id = row.parentUuid;
  }
}

/** No SDK import, native process, model request, control acquisition, or log repair. */
export const readQoderPersistedExecution: NonNullable<AgentExecutor['readPersistedExecution']> = async (input: Input) => {
  if (!UUID.test(input.contextRef.id) || !UUID.test(input.executionRef.id)) return;
  const native = parseReference(String(input.contextRef.data?.native ?? ''), 'qoder', input.cwd, input.bindingIdentity);
  if (native.nativeSessionId !== input.contextRef.id || input.executionRef.data?.resourceContext !== input.contextRef.id ||
      input.executionRef.data.resourceBinding !== input.bindingIdentity || input.executionRef.data.backgroundWork !== false) return;
  const account = input.nativeAccountConfigRoot ?? input.configRoot, config = path.join(account, 'qoder-config');
  if (!await directory(input.configRoot) || !await directory(account) || !await directory(config)) return;
  const provenance = await nativeBindingProvenance('qoder', input.executable, config, input.programSource);
  if (input.bindingData !== undefined && (
    (input.gatewayIdentity ? input.bindingData.gatewayIdentity !== input.gatewayIdentity : Boolean(input.bindingData.gatewayIdentity))
    || Boolean(input.bindingData.nativeSourceIdentity)
    || !sameVolumeProvenance(provenance, input.bindingData)
  )) return;
  const wrap = (nativeIdentity: string) => input.gatewayIdentity ? digest(['buildr-model-gateway/v1', nativeIdentity, input.gatewayIdentity]) : nativeIdentity;
  const candidateDevs = typeof input.bindingData?.dev === 'number' ? [input.bindingData.dev, ...(input.volumeDevs ?? [])] : input.volumeDevs;
  if (!resolveProvenanceForIdentity(provenance, input.bindingIdentity, candidateDevs, wrap)) return;

  const projects = path.join(config, 'projects'), buckets = await children(projects, 1000);
  if (!buckets) return;
  const transcripts: string[] = [];
  for (const bucket of buckets) {
    const parent = path.join(projects, bucket), file = path.join(parent, input.contextRef.id + '.jsonl');
    if (await directory(parent) && await lstat(file).then(info => info.isFile() && !info.isSymbolicLink(), () => false)) transcripts.push(file);
  }
  if (transcripts.length !== 1) return;
  const history = await snapshot(transcripts[0]!);
  if (!history) return;
  const chain = primaryTurn(history.rows, input);
  if (!chain || chain.some(row => !/^1\.1\.\d+$/.test(row.version ?? ''))) return;
  // Parallel tool results are sibling records, not necessarily ancestors of the
  // active leaf. Include only receipts tied to an exact primary tool owner.
  const owners = new Map(chain.filter(row => row.type === 'assistant').map(row => [row.uuid,
    new Set((Array.isArray(row.message?.content) ? row.message.content : []).filter((part: any) => part.type === 'tool_use').map((part: any) => part.id))]));
  const primaryIds = new Set(chain.map(row => row.uuid));
  const projection = history.rows.filter(row => primaryIds.has(row.uuid) || row.type === 'user' && row.promptId === chain[0].promptId &&
    owners.has(row.sourceToolAssistantUUID) && Array.isArray(row.message?.content) && row.message.content.length &&
    row.message.content.every((part: any) => part.type === 'tool_result' && owners.get(row.sourceToolAssistantUUID)!.has(part.tool_use_id)));
  if (projection.some(row => row.sessionId !== input.contextRef.id || row.isSidechain !== false || row.cwd !== input.cwd || !/^1\.1\.\d+$/.test(row.version ?? ''))) return;
  const messages = projection.filter(row => !row.isMeta && (row.type === 'user' || row.type === 'assistant')).map(row => ({ ...row, session_id: row.sessionId }));
  const items = qoderHistoryItems(messages, input.contextRef.id, new Set(), projection);
  if (items.filter(item => item.role === 'user').length !== 1 || !items.some(item => item.id === input.executionRef.id && item.role === 'user')) return;
  const observation = qoderInterruptedObservation(messages, projection, input.contextRef.id, input.executionRef.id);
  if (observation.executionRef?.id !== input.executionRef.id || observation.tools.some(tool => tool.status !== 'completed')) return;
  // A foreground result cannot prove that a detached native task has finished.
  if (projection.some(row => row.subtype === 'task_started' || row.toolUseResult?.interrupted === true || row.toolUseResult?.backgroundTaskId || row.toolUseResult?.taskId ||
      row.tool_use_result?.backgroundTaskId || row.tool_use_result?.taskId ||
      (Array.isArray(row.message?.content) ? row.message.content : []).some((part: any) => part.type === 'tool_use' && part.input?.run_in_background === true))) return;
  const last = messages.at(-1), request = last?.requestTokenAnchor?.requestId ?? last?.message?.usage?.request_id;
  if (last?.type !== 'assistant' || last.message?.stop_reason !== 'end_turn' || !UUID.test(request ?? '') ||
      !Number.isFinite(Date.parse(last.timestamp)) || !Number.isFinite(Date.parse(chain[0].timestamp)) || Date.parse(last.timestamp) < Date.parse(chain[0].timestamp) ||
      last.requestTokenAnchor?.requestId && last.message?.usage?.request_id && last.requestTokenAnchor.requestId !== last.message.usage.request_id) return;

  const logs = path.join(config, 'logs'), sessions = path.join(logs, 'sessions');
  if (!await directory(logs)) return;
  const namespaces = await children(sessions, 1000);
  if (!namespaces) return;
  const snapshots = [history], completed: any[] = [];
  let bytes = history.bytes;
  for (const namespace of namespaces) {
    const parent = path.join(sessions, namespace), session = path.join(parent, input.contextRef.id), segments = path.join(session, 'segments');
    if (!await directory(parent) || !await directory(session)) continue;
    const names = await children(segments, 100);
    if (!names) return;
    for (const name of names) {
      if (!/^[a-zA-Z0-9+_.-]+\.jsonl$/.test(name)) continue;
      const log = await snapshot(path.join(segments, name));
      if (!log || (bytes += log.bytes) > MAX_BYTES * 2) return;
      snapshots.push(log);
      if (log.rows.some((row, index) => !Number.isSafeInteger(row.seq) || index > 0 && row.seq <= log.rows[index - 1].seq)) return;
      const starts = log.rows.filter(row => row.type === 'turn.started' && row.turn_id === chain[0].promptId && row.data?.is_subagent === false);
      const ends = log.rows.filter(row => row.type === 'turn.finished' && row.turn_id === chain[0].promptId);
      if (!starts.length && !ends.length) continue;
      if (starts.length !== 1 || ends.length !== 1 || starts[0].seq >= ends[0].seq) return;
      const end = ends[0];
      if (end.level !== 'info' || end.data?.reason !== 'end_turn' || end.request_id !== request || end.data.client_request_id !== request ||
          !Number.isFinite(Date.parse(end.ts)) || Date.parse(end.ts) < Date.parse(last.timestamp)) return;
      completed.push(end);
    }
    if (JSON.stringify(names) !== JSON.stringify(await children(segments, 100))) return;
  }
  if (completed.length !== 1 || JSON.stringify(namespaces) !== JSON.stringify(await children(sessions, 1000)) ||
      !(await Promise.all(snapshots.map(file => file.unchanged()))).every(Boolean)) return;
  if (!await directory(account) || !await directory(config) || digest(await nativeBindingProvenance('qoder', input.executable, config, input.programSource)) !== digest(provenance)) return;
  return { items: items.filter(item => item.executionId === input.executionRef.id), endedAt: new Date(completed[0].ts).toISOString(),
    observation: { status: 'idle', executionRef: input.executionRef, tools: observation.tools, requests: [], backgroundWork: false } };
};
