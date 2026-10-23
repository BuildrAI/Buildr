import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import type test from 'node:test';
import YAML from 'yaml';
import { createServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import type { ServiceWorktree } from '../../src/modules/service-runtime/domain/worktrees.ts';
import { probePortAvailable } from '../../src/modules/service-runtime/infrastructure/managed-process.ts';

export const runtimeServerScript = `
const port = Number((process.argv.find(value => value.startsWith('--port=')) || '--port=0').slice(7));
require('http').createServer((request, response) => response.end(JSON.stringify({target: process.env.VITE_PROXY_URL || null, cwd: process.cwd()}))).listen(port, '127.0.0.1', () => console.log('Started Fixture ' + port));
`;
export async function freeRuntimePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = (server.address() as net.AddressInfo).port; server.close(() => resolve(port)); });
  });
}
export function runtimeDefinition(port: number, options: { backend?: boolean; backends?: { serviceCode: string; environmentVariable: string; remoteUrl: string }[]; script?: string; readiness?: { kind: 'log'; pattern: string } | { kind: 'http'; path: string }; portOverride?: string | null; cwd?: string; command?: string[] } = {}): string {
  return YAML.stringify({ version: 1, source: 'agent', verifiedAt: '2026-10-22T08:00:00Z', local: {
    command: options.command ?? [process.execPath, '-e', options.script ?? runtimeServerScript, '--'], cwd: options.cwd ?? '.', preferredPort: port,
    portOverride: options.portOverride === undefined ? '--port' : options.portOverride,
    readiness: options.readiness ?? { kind: 'log', pattern: 'Started Fixture' }, timeoutSeconds: 10,
    ...(options.backends?.length ? { backends: options.backends } : options.backend ? { backend: { serviceCode: 'backend', environmentVariable: 'VITE_PROXY_URL', remoteUrl: 'https://test.example/api' } } : {}),
  } });
}
export async function runtimeFixture(t: test.TestContext, options: { frontendConnection?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-local-runtime-'));
  const worktrees: Record<string, ServiceWorktree[]> = {};
  for (const code of ['frontend', 'backend']) {
    worktrees[code] = ['main', 'task', 'other'].map(source => {
      const directory = path.join(root, `${code}-${source}`);
      fs.mkdirSync(directory, { recursive: true });
      return { id: `${code}-${source}`, path: directory, label: source === 'main' ? '主工作库' : source, main: source === 'main', branch: source === 'main' ? 'qa' : `codex/${source}`, head: 'aabbcc', dirty: source === 'task', taskId: source === 'main' ? null : source, taskTitle: source === 'main' ? null : `${source}任务` };
    });
  }
  const runtime = createServiceRuntimeApplication({ resolveService: (_root, code) => ['frontend', 'backend'].includes(code) ? { id: code, code } : null, listWorktrees: (_root, code) => worktrees[code] ?? [] });
  const ports = { frontend: await freeRuntimePort(), backend: await freeRuntimePort() };
  await runtime.writeDefinition(root, 'frontend', runtimeDefinition(ports.frontend, { backend: options.frontendConnection }));
  await runtime.writeDefinition(root, 'backend', runtimeDefinition(ports.backend));
  t.after(async () => {
    for (const record of await runtime.listRuns(root)) if (record.status === 'starting' || record.status === 'running') await runtime.stopRun(root, record.id);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, runtime, ports, worktrees };
}
export async function eventually(check: () => boolean | Promise<boolean>, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('等待验证条件超时');
}
export async function portReleased(port: number) { await eventually(() => probePortAvailable(port)); }
