import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type test from 'node:test';
import { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';
import { CodexDesktopRepository } from '../../src/modules/codex-desktop/persistence/codex-desktop-repository.ts';

export const workspaceId = '10000000-0000-0000-0000-000000000001';
export const sessionA = '10000000-0000-0000-0000-000000000002', sessionB = '10000000-0000-0000-0000-000000000003';
export function codexFixture(t: test.TestContext) {
  const base = fs.mkdtempSync(path.join(process.env.BUILDR_SMOKE_ROOT || os.tmpdir(), 'buildr-codex-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'), home = path.join(base, 'codex'), appPath = path.join(base, 'ChatGPT.app'), dataRoot = path.join(base, 'profile');
  for (const directory of [root, home, appPath, dataRoot]) fs.mkdirSync(directory);
  const preserved = new Map(Object.entries({ 'config.toml': 'model="fixture"\n', 'memories/state.txt': 'original memory\n', 'plugins/native.json': '{"preserved":true}\n', 'sessions/original.json': '{"chat":"unchanged"}\n' }));
  for (const [file, content] of preserved) { const target = path.join(home, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  const tasks = new Map([['first-task', { taskId: 'first-task', title: '任务一' }], ['second-task', { taskId: 'second-task', title: '任务二' }]]);
  const registration = { kind: 'codex' as const, id: 'agent-' + crypto.randomUUID(), label: 'Codex', executable: process.execPath, version: 'test', codexHome: home };
  const active = new Set([registration.id]);
  const dependencies = { dataRoot,
    resolveWorkspace: (id: string) => { assert.equal(id, workspaceId); return { rootPath: root, workspace: { id, name: '测试' } }; },
    readTaskIdentity: (_root: string, id: string) => tasks.has(id) ? { ...tasks.get(id)!, revision: 'sha256-current-task' } : null,
    readRegistrationActive: (id: string) => active.has(id), readOrigin: () => 'http://127.0.0.1:12345',
  };
  const application = new CodexDesktopApplication(dependencies), repository = new CodexDesktopRepository(dataRoot);
  const connect = () => application.connect(registration, { appPath, appVersion: '1' });
  const link = (connectionId: string, taskId = 'first-task', nativeSessionId = sessionA) => application.linkSession(workspaceId, { connectionId, taskId, nativeSessionId });
  const nativeSnapshot = () => [...preserved.keys()].map(file => fs.readFileSync(path.join(home, file), 'utf8'));
  return { base, root, home, appPath, dataRoot, tasks, active, registration, application, repository, connect, link, nativeSnapshot, dependencies,
    sessionsFile: path.join(root, '.buildr/local/codex-desktop-sessions.json'), connectionsFile: path.join(dataRoot, 'codex-desktop/connections.json') };
}
export function seedLegacyRequests(f: ReturnType<typeof codexFixture>, connectionId: string) {
  const createdAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  f.repository.mutateWorkspace(f.root, workspaceId, state => {
    state.bindings.push({ id: crypto.randomUUID(), workspaceId, connectionId, taskId: 'first-task', status: 'pending', nativeSessionId: null, createdAt, expiresAt });
    state.handoffs.push({ id: crypto.randomUUID(), workspaceId, connectionId, taskId: 'first-task', nativeSessionId: sessionA, status: 'pending', createdAt, expiresAt, taskRevision: 'sha256-current-task', goal: '旧交接', message: '旧消息' });
  });
}
