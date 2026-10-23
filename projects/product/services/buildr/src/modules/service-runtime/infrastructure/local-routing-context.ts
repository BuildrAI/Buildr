import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ManagedRunRecord, RunDiscoveryConnection, RunRouting, RoutingObservation } from '../domain/runs.ts';
import type { RuntimeRoutingDeclaration } from '../domain/runtime-definition.ts';
import { ServiceRuntimeError } from '../domain/errors.ts';
import { serviceRuntimeRoot } from '../persistence/runs-repository.ts';

export type LocalRoutingFile = {
  format: 'buildr.local-service-routing/v1'; laneId: string; workspaceId: string; taskId: string; hostId: string;
  runId: string; serviceCode: string; serviceId: string;
  targets: Array<{ serviceCode: string; serviceId: string; mode: 'local' | 'qa'; runId?: string }>;
  digest: string;
};
export type RoutingStartPlan = {
  laneId: string; workspaceId: string; hostId: string; taskId: string;
  members: Record<string, { runId: string; worktreeId: string; serviceId: string; existing: boolean }>;
};

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, ordered(entry)]));
  return value;
}
export function routingDigest(value: Omit<LocalRoutingFile, 'digest'>): string {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(ordered(value)), 'utf8').digest('hex')}`;
}
export function localRoutingHostId(): string {
  return `host-${crypto.createHash('sha256').update([os.platform(), os.hostname(), os.homedir()].join('\0')).digest('hex')}`;
}

/** 只能由当前受管运行和声明派生；调用接口不接收这些文件字段。 */
export async function writeLocalRoutingContext(root: string, record: ManagedRunRecord, declaration: RuntimeRoutingDeclaration,
  plan: RoutingStartPlan, connections: RunDiscoveryConnection[]): Promise<RunRouting> {
  if (!record.taskId || record.taskId !== plan.taskId || record.main) throw new ServiceRuntimeError('service_runtime_lane_scope_invalid', '发现路由只允许同任务的本机受管运行。');
  const unsigned: Omit<LocalRoutingFile, 'digest'> = {
    format: 'buildr.local-service-routing/v1', laneId: plan.laneId, workspaceId: plan.workspaceId, taskId: plan.taskId, hostId: plan.hostId,
    runId: record.id, serviceCode: record.serviceCode, serviceId: declaration.serviceId,
    targets: connections.map(connection => ({ serviceCode: connection.serviceCode, serviceId: connection.serviceId,
      mode: connection.mode === 'local' ? 'local' : 'qa', ...(connection.runId ? { runId: connection.runId } : {}) })),
  };
  const content: LocalRoutingFile = { ...unsigned, digest: routingDigest(unsigned) };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(record.id)) throw new ServiceRuntimeError('service_runtime_lane_run_invalid', '运行编号无效。');
  // 创建每一级目录前排除链接，不能沿替换后的父目录向外写入。
  const actualRoot = await fs.promises.realpath(root);
  let directory = actualRoot;
  for (const segment of ['.buildr', 'local', 'service-runtime', 'routing']) {
    directory = path.join(directory, segment);
    try { await fs.promises.mkdir(directory, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = await fs.promises.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ServiceRuntimeError('service_runtime_lane_path_changed', '本机路由文件目录身份已变化。');
  }
  if (directory !== path.join(serviceRuntimeRoot(actualRoot), 'routing') || await fs.promises.realpath(directory) !== directory) throw new ServiceRuntimeError('service_runtime_lane_path_changed', '本机路由文件目录身份已变化。');
  const file = path.join(directory, `${record.id}.json`);
  const handle = await fs.promises.open(file, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(content) + '\n', 'utf8'); }
  finally { await handle.close(); }
  const observed = JSON.parse(await fs.promises.readFile(file, 'utf8')) as LocalRoutingFile;
  const { digest, ...body } = observed;
  if (digest !== content.digest || routingDigest(body) !== digest) throw new ServiceRuntimeError('service_runtime_lane_context_changed', '本机路由文件写入后发生变化。');
  return { laneId: plan.laneId, workspaceId: plan.workspaceId, hostId: plan.hostId, serviceId: declaration.serviceId,
    contextDigest: content.digest, contextPath: file, observationPath: declaration.observationPath };
}

export async function readLocalRoutingObservation(record: ManagedRunRecord): Promise<RoutingObservation> {
  if (!record.routing || record.status !== 'running') return { status: 'unknown' };
  try {
    const base = new URL(record.url);
    if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || Number(base.port) !== record.actualPort) throw new Error('运行地址不再属于受管本地端口。');
    const endpoint = record.routing.observationPath;
    if (!endpoint.startsWith('/') || endpoint.startsWith('//') || /[\\?#\s]/.test(endpoint)) throw new Error('观察路径不安全。');
    base.pathname = endpoint; base.search = ''; base.hash = '';
    const response = await fetch(base, { signal: AbortSignal.timeout(1800), redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok || !response.body) throw new Error(`观察接口返回 ${response.status}。`);
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 262144) { await reader.cancel(); throw new Error('观察结果超出本机读取上限。'); }
      chunks.push(chunk.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body.runId !== record.id || body.digest !== record.routing.contextDigest || body.laneId !== record.routing.laneId) throw new Error('观察返回了其他运行身份或上下文版本。');
    const declared = new Set(record.connections.filter(connection => connection.kind === 'service-discovery').map(connection => connection.serviceId));
    const targets = body.observations && typeof body.observations === 'object' && !Array.isArray(body.observations)
      ? Object.fromEntries(Object.entries(body.observations).filter(([service]) => declared.has(service))) : {};
    return { status: 'observed', observedAt: new Date().toISOString(), targets };
  } catch (cause) { return { status: 'unavailable', error: (cause as Error).message }; }
}
