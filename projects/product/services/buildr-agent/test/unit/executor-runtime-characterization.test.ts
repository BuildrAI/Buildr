import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { ConnectionApplication } from '../../src/application/connection-application.ts';
import { NativeContentResolver } from '../../src/application/native-content-resolver.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { createNativeExecutors, readNativeTool } from '../../src/executors/index.ts';
import { NativeProgramManager } from '../../src/executors/program-manager.ts';
import { nativeProgramPolicy } from '../../src/executors/program-policy.ts';
import { NativeContentReader, nativeContentHash, nativeContentPath } from '../../src/storage/native-content.ts';
import type { AgentCapabilities, AgentExecutor, AgentRuntime, ExecutorOpenOptions } from '../../src/contracts.ts';
import type { NativeToolContent } from '../../src/native-content-contracts.ts';

const builtinDescriptors = new Map(createNativeExecutors().map(executor => [executor.descriptor.id, executor.descriptor]));

const UUID_CTX = '11111111-2222-4333-8444-555555555555';
const UUID_OTHER = '99999999-8888-4777-8666-555555555555';
const DSH_CTX = `session-${UUID_CTX}`;

const baseCaps: AgentCapabilities = {
  text: true,
  images: false,
  approval: true,
  questions: true,
  stop: true,
  resume: true,
  permissionModes: ['default', 'full-access'],
  maxInputBytes: 64 * 1024,
};

function makeRoot(t: TestContext): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'executor-runtime-char-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('characterization: replaceProgram upgrade verification (runtime verifyUpgrade vs Qoder CN separate account probe)', async t => {
  const dir = makeRoot(t);
  const root = path.join(dir, 'agent-service');
  const repo = new ConversationRepository(root);
  t.after(() => repo.stopReadModels());

  const binDir = path.join(dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const exeV1 = path.join(binDir, 'prog-v1');
  const exeV2 = path.join(binDir, 'prog-v2');
  fs.writeFileSync(exeV1, '#!/bin/sh\necho 1.0.0\n', { mode: 0o755 });
  fs.writeFileSync(exeV2, '#!/bin/sh\necho 1.0.1\n', { mode: 0o755 });

  const events: Array<{ id: string; exe?: string; configRoot: string; nativeAccountConfigRoot?: string; verified?: boolean; closed?: boolean }> = [];
  let failVerifyFor: string | undefined;
  let omitVerifyFor: string | undefined;

  const makeExec = (id: string, label: string): AgentExecutor => {
    const builtin = builtinDescriptors.get(id);
    return {
    descriptor: {
      id,
      label,
      capabilities: baseCaps,
      ...(builtin?.modelPolicy ? { modelPolicy: builtin.modelPolicy } : {}),
      ...(builtin?.runtimeTraits ? { runtimeTraits: builtin.runtimeTraits } : {}),
    },
    async open(options: ExecutorOpenOptions): Promise<AgentRuntime> {
      const entry = { id, exe: options.executable, configRoot: options.configRoot, nativeAccountConfigRoot: options.nativeAccountConfigRoot, verified: false, closed: false };
      events.push(entry);
      return {
        get closed() { return entry.closed; },
        capabilities: baseCaps,
        bindingIdentity: `bind-${id}`,
        bindingData: { format: 'test/v1', provider: id, executable: options.programSource ?? options.executable },
        ...(omitVerifyFor === id ? {} : {
          async verifyUpgrade() {
            if (failVerifyFor === id) throw new Error(`${id}_smoke_failed`);
            entry.verified = true;
          },
        }),
        async inspectAccount() { return { status: 'ready', label }; },
        async models() { return [{ id: `${id}-m`, label: 'M', isDefault: true }]; },
        async beginLogin() {},
        async cancelLogin() {},
        async createContext() { return { id: UUID_CTX }; },
        async resumeContext() {},
        async readHistory() { return []; },
        async observe() { return { status: 'idle', tools: [] }; },
        async send() { throw new Error('unused'); },
        async stop() { return { status: 'stopped', tools: [] }; },
        async reply() {},
        async close() { entry.closed = true; },
      };
    },
  };
  };

  const qoderCnAccountRoot = path.join(root, 'model-access', 'accounts', 'native-qoder-cn');
  const app = new ConnectionApplication({
    repository: repo,
    root,
    executors: [
      makeExec('codex', 'Codex'),
      makeExec('qoder', 'Qoder'),
      makeExec('qoder-cn', 'Qoder CN'),
      makeExec('claude-code', 'Claude Code'),
    ],
    environment: {},
    nativeAccountConfigRoots: { 'qoder-cn': qoderCnAccountRoot },
    generation: 'gen-1',
    now: () => '2026-11-13T00:00:00.000Z',
    changed: () => {},
  });
  t.after(() => app.close());

  for (const id of ['codex', 'qoder', 'qoder-cn', 'claude-code']) {
    const rev = app.get(id).revision;
    await app.connect(id, { expectedRevision: rev, executable: exeV1, programOnly: true });
  }
  await app.releaseAccountProbes();
  events.length = 0;

  // 1. Codex does NOT require verifyUpgrade even if omitted
  omitVerifyFor = 'codex';
  {
    const release = app.acquireProgramChange('codex')!;
    try {
      const updated = await app.replaceProgram('codex', app.get('codex'), exeV2);
      assert.equal(updated.executable, exeV2);
    } finally { release(); }
  }
  assert.equal(events.some(e => e.id === 'codex' && e.verified), false);

  // 2. Qoder & Claude Code run verifyUpgrade directly on candidate; omitting it rejects and preserves exeV1
  omitVerifyFor = 'claude-code';
  {
    const release = app.acquireProgramChange('claude-code')!;
    try {
      await assert.rejects(
        app.replaceProgram('claude-code', app.get('claude-code'), exeV2),
        (err: any) => err?.code === 'agent_program_update_verification_failed',
      );
    } finally { release(); }
    assert.equal(app.get('claude-code').executable, exeV1);
  }
  omitVerifyFor = undefined;
  {
    const release = app.acquireProgramChange('qoder')!;
    try {
      const updated = await app.replaceProgram('qoder', app.get('qoder'), exeV2);
      assert.equal(updated.executable, exeV2);
    } finally { release(); }
    const qoderCandidate = events.findLast(e => e.id === 'qoder' && e.exe === exeV2)!;
    assert.equal(qoderCandidate.verified, true);
    assert.equal(qoderCandidate.nativeAccountConfigRoot, undefined);
  }

  // 3. Qoder CN opens a separate accountProbe with nativeAccountConfigRoot = qoderCnAccountRoot, verifies & closes the probe, keeps candidate open
  events.length = 0;
  {
    const release = app.acquireProgramChange('qoder-cn')!;
    try {
      const updated = await app.replaceProgram('qoder-cn', app.get('qoder-cn'), exeV2);
      assert.equal(updated.executable, exeV2);
    } finally { release(); }
  }
  const cnOpens = events.filter(e => e.id === 'qoder-cn' && e.exe === exeV2);
  assert.equal(cnOpens.length, 2, 'Qoder CN opens connection candidate + separate account probe');
  assert.equal(cnOpens[0]!.nativeAccountConfigRoot, undefined);
  assert.equal(cnOpens[0]!.verified, false);
  assert.equal(cnOpens[0]!.closed, false);
  assert.equal(cnOpens[1]!.nativeAccountConfigRoot, qoderCnAccountRoot);
  assert.equal(cnOpens[1]!.verified, true);
  assert.equal(cnOpens[1]!.closed, true);

  // If Verify fails, old executable stays bound
  failVerifyFor = 'qoder';
  const exeV3 = path.join(binDir, 'prog-v3');
  fs.writeFileSync(exeV3, '#!/bin/sh\necho 1.0.2\n', { mode: 0o755 });
  {
    const release = app.acquireProgramChange('qoder')!;
    try {
      await assert.rejects(app.replaceProgram('qoder', app.get('qoder'), exeV3), /qoder_smoke_failed/);
    } finally { release(); }
    assert.equal(app.get('qoder').executable, exeV2);
  }
});

test('characterization: transient account probes close after programOnly connect and check for codex, dsh, and observed qoder', async t => {
  const dir = makeRoot(t);
  const root = path.join(dir, 'agent-service');
  const repo = new ConversationRepository(root);
  t.after(() => repo.stopReadModels());

  const exe = path.join(dir, 'prog');
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const makeExec = (id: string): AgentExecutor => {
    const builtin = builtinDescriptors.get(id);
    return {
      descriptor: {
        id,
        label: id,
        capabilities: baseCaps,
        ...(builtin?.modelPolicy ? { modelPolicy: builtin.modelPolicy } : {}),
        ...(builtin?.runtimeTraits ? { runtimeTraits: builtin.runtimeTraits } : {}),
      },
      async open(): Promise<AgentRuntime> {
        let closed = false;
        return {
          get closed() { return closed; },
          capabilities: baseCaps,
          bindingIdentity: `b-${id}`,
          async inspectAccount() { return { status: 'ready', label: id }; },
          async models() { return [{ id: 'm1', label: 'M1', isDefault: true }]; },
          async beginLogin() {},
          async cancelLogin() {},
          async createContext() { return { id: UUID_CTX }; },
          async resumeContext() {},
          async readHistory() { return []; },
          async observe() { return { status: 'idle', tools: [] }; },
          async send() { throw new Error('unused'); },
          async stop() { return { status: 'stopped', tools: [] }; },
          async reply() {},
          async close() { closed = true; },
        };
      },
    };
  };

  const app = new ConnectionApplication({
    repository: repo,
    root,
    executors: ['codex', 'dsh', 'qoder', 'qoder-cn', 'claude-code'].map(makeExec),
    environment: {},
    observeAccount: id => id === 'qoder' ? Promise.resolve({ status: 'ready', models: [{ id: 'qm', label: 'QM', isDefault: true }], account: { label: 'Q', loginMethod: 'Qoder' } }) : undefined,
    generation: 'gen-1',
    now: () => '2026-11-13T00:00:00.000Z',
    changed: () => {},
  });
  t.after(() => app.close());

  for (const id of ['codex', 'dsh', 'qoder', 'qoder-cn', 'claude-code']) {
    await app.connect(id, { expectedRevision: app.get(id).revision, executable: exe, programOnly: true });
  }
  assert.equal(app.hasAccountRuntime('codex'), false);
  assert.equal(app.hasAccountRuntime('dsh'), false);
  assert.equal(app.hasAccountRuntime('qoder'), false);
  assert.equal(app.hasAccountRuntime('qoder-cn'), true);
  assert.equal(app.hasAccountRuntime('claude-code'), true);

  await app.check('codex');
  await app.check('dsh');
  assert.equal(app.hasAccountRuntime('codex'), false);
  assert.equal(app.hasAccountRuntime('dsh'), false);
});

test('characterization: native tool detail reading across all 5 providers, path boundaries, session/tool mismatches, and legacy v1/v2 references', t => {
  const dir = makeRoot(t);
  const root = path.join(dir, 'agent-service');
  const cwd = '/workspace/project';
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  const writeTranscript = (relativeFile: string, lines: unknown[]) => {
    const full = path.join(root, relativeFile);
    fs.mkdirSync(path.dirname(full), { recursive: true, mode: 0o700 });
    fs.writeFileSync(full, lines.map(line => JSON.stringify(line)).join('\n') + '\n', { mode: 0o600 });
    return full;
  };

  // 1. Codex transcript
  writeTranscript(`connections/codex/codex-home/sessions/2026/11/${UUID_CTX}.jsonl`, [
    { type: 'session_meta', payload: { id: UUID_CTX, cwd } },
    { type: 'event_msg', payload: { type: 'item_completed', turn_id: 'turn-1', item: { id: 'call-codex', type: 'commandExecution', command: ['echo', 'hello'], aggregatedOutput: 'hello\n', status: 'completed', exitCode: 0 } } },
  ]);

  // 2. DSH transcript
  writeTranscript(`connections/dsh/dsh-home/sessions/${DSH_CTX}/session.v4.jsonl`, [
    { type: 'session', version: 4, id: DSH_CTX, cwd },
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'user/message', data: { id: 'u1', turn: 1, source: { kind: 'user', rpcId: 'turn-dsh' }, content: [{ type: 'text', text: 'hi' }] } },
    { seq: 2, type: 'tool/call', data: { turn: 1, callId: 'call-dsh', name: 'bash', arguments: '{"command":"ls"}' } },
    { seq: 3, type: 'tool/result', data: { turn: 1, message: { toolCallId: 'call-dsh', content: [{ type: 'text', text: 'file.txt' }] } } },
  ]);

  // 3. Qoder transcript
  writeTranscript(`connections/qoder/qoder-config/projects/proj/${UUID_CTX}.jsonl`, [
    { type: 'user', uuid: 'u-q', promptId: 'p-1', sessionId: UUID_CTX, cwd, isSidechain: false, message: { content: [{ type: 'text', text: 'run' }] } },
    { type: 'assistant', uuid: 'a-q', promptId: 'p-1', sessionId: UUID_CTX, cwd, isSidechain: false, message: { content: [{ type: 'tool_use', id: 'call-qoder', name: 'Bash', input: { command: 'pwd' } }] } },
    { type: 'user', uuid: 'tr-q', promptId: 'p-1', sessionId: UUID_CTX, cwd, isSidechain: false, sourceToolAssistantUUID: 'a-q', toolUseResult: { stdout: '/workspace/project' }, message: { content: [{ type: 'tool_result', tool_use_id: 'call-qoder', content: 'ok' }] } },
  ]);

  // 4. Qoder CN transcript (under model-access/accounts/native-qoder-cn)
  writeTranscript(`model-access/accounts/native-qoder-cn/qoder-cn-config/projects/proj/${UUID_CTX}.jsonl`, [
    { type: 'user', uuid: 'u-cn', promptId: 'p-cn', sessionId: UUID_CTX, cwd, isSidechain: false, message: { content: [{ type: 'text', text: 'run' }] } },
    { type: 'assistant', uuid: 'a-cn', promptId: 'p-cn', sessionId: UUID_CTX, cwd, isSidechain: false, message: { content: [{ type: 'tool_use', id: 'call-cn', name: 'Bash', input: { command: 'whoami' } }] } },
    { type: 'user', uuid: 'tr-cn', promptId: 'p-cn', sessionId: UUID_CTX, cwd, isSidechain: false, sourceToolAssistantUUID: 'a-cn', toolUseResult: { stdout: 'chenjun' }, message: { content: [{ type: 'tool_result', tool_use_id: 'call-cn', content: 'ok' }] } },
  ]);

  // 5. Claude Code transcript (also verify model-bindings/<64hex> path!)
  const bindingHash = 'a'.repeat(64);
  const claudeRel = `connections/claude-code/model-bindings/${bindingHash}/claude-config/projects/proj/${UUID_CTX}.jsonl`;
  const claudeFile = writeTranscript(claudeRel, [
    { type: 'user', uuid: 'u-cl', sessionId: UUID_CTX, cwd, isSidechain: false, message: { content: [{ type: 'text', text: 'run' }] } },
    { type: 'assistant', uuid: 'a-cl', sessionId: UUID_CTX, cwd, isSidechain: false, message: { content: [{ type: 'tool_use', id: 'call-claude', name: 'Bash', input: { command: 'uname' } }] } },
    { type: 'user', uuid: 'tr-cl', sessionId: UUID_CTX, cwd, isSidechain: false, sourceToolAssistantUUID: 'a-cl', toolUseResult: { stdout: 'Darwin' }, message: { content: [{ type: 'tool_result', tool_use_id: 'call-claude', content: 'Darwin' }] } },
  ]);

  const baseEntry = { id: 'e1', sequence: 1, kind: 'tool' as const, role: 'system' as const, name: 'command', status: 'completed' as const, text: '', createdAt: '2026-11-13T00:00:00Z' };
  const makeRef = (provider: string, contextId: string, nativeId: string, config: string, turnId?: string): NativeToolContent => ({
    version: 3,
    provider,
    contextId,
    nativeId,
    entry: { ...baseEntry, provider },
    session: { config, cwd, ...(turnId ? { turnId } : {}) },
    text: [],
  });

  const codexDetail = readNativeTool(root, makeRef('codex', UUID_CTX, 'call-codex', 'connections/codex', 'turn-1'));
  assert.ok(codexDetail);
  assert.match(codexDetail.text, /hello/);

  const dshDetail = readNativeTool(root, makeRef('dsh', DSH_CTX, 'call-dsh', 'connections/dsh', 'turn-dsh'));
  assert.ok(dshDetail);
  assert.equal(dshDetail.input, '{"command":"ls"}');
  assert.equal(dshDetail.text, 'file.txt');

  const qoderDetail = readNativeTool(root, makeRef('qoder', UUID_CTX, 'call-qoder', 'connections/qoder'));
  assert.ok(qoderDetail);
  assert.equal(qoderDetail.input, '{"command":"pwd"}');
  assert.equal(qoderDetail.text, '/workspace/project');

  const cnDetail = readNativeTool(root, makeRef('qoder-cn', UUID_CTX, 'call-cn', 'model-access/accounts/native-qoder-cn'));
  assert.ok(cnDetail);
  assert.equal(cnDetail.input, '{"command":"whoami"}');
  assert.equal(cnDetail.text, 'chenjun');

  const claudeDetail = readNativeTool(root, makeRef('claude-code', UUID_CTX, 'call-claude', `connections/claude-code/model-bindings/${bindingHash}`));
  assert.ok(claudeDetail);
  assert.equal(claudeDetail.input, '{"command":"uname"}');
  assert.equal(claudeDetail.text, 'Darwin');

  // Wrong session ID, wrong tool ID, wrong config root, unregistered provider -> undefined
  assert.equal(readNativeTool(root, makeRef('codex', UUID_OTHER, 'call-codex', 'connections/codex', 'turn-1')), undefined);
  assert.equal(readNativeTool(root, makeRef('codex', UUID_CTX, 'missing-tool', 'connections/codex', 'turn-1')), undefined);
  assert.equal(readNativeTool(root, makeRef('codex', UUID_CTX, 'call-codex', 'model-access/accounts/native-qoder-cn', 'turn-1')), undefined);
  assert.equal(readNativeTool(root, makeRef('unregistered-agent', UUID_CTX, 'call-codex', 'connections/unregistered-agent')), undefined);

  // Path traversal, backslashes, wrong provider namespace, and symlinks rejected by nativeContentPath
  assert.ok(nativeContentPath(root, 'claude-code', claudeRel).endsWith(`${UUID_CTX}.jsonl`));
  for (const bad of [
    ['codex', 'connections/codex/../qoder/qoder-config/projects/proj/' + UUID_CTX + '.jsonl'],
    ['codex', 'connections\\codex\\codex-home\\sessions\\' + UUID_CTX + '.jsonl'],
    ['codex', 'model-access/accounts/native-qoder-cn/qoder-cn-config/projects/proj/' + UUID_CTX + '.jsonl'],
    ['unregistered', 'connections/unregistered/sessions/' + UUID_CTX + '.jsonl'],
  ] as const) {
    assert.throws(() => nativeContentPath(root, bad[0], bad[1]), (err: any) => err?.code === 'agent_native_content_unavailable');
  }
  const symlinkPath = path.join(root, 'connections/codex/codex-home/sessions/2026/11/link.jsonl');
  fs.symlinkSync(claudeFile, symlinkPath);
  assert.throws(
    () => nativeContentPath(root, 'codex', 'connections/codex/codex-home/sessions/2026/11/link.jsonl'),
    (err: any) => err?.code === 'agent_native_content_unavailable',
  );
  fs.unlinkSync(symlinkPath);

  // Legacy v2 reference read via NativeContentReader
  const claudeBytes = fs.readFileSync(claudeFile);
  const line2Offset = claudeBytes.indexOf(10, claudeBytes.indexOf(10) + 1) + 1;
  const line2Bytes = claudeBytes.subarray(line2Offset);
  const v2Entry = { ...baseEntry, provider: 'claude-code', text: 'Darwin' };
  const v2Ref: NativeToolContent = {
    version: 2,
    provider: 'claude-code',
    contextId: UUID_CTX,
    entry: { ...v2Entry, text: '' },
    text: [{
      source: { path: claudeRel, offset: line2Offset, length: line2Bytes.length, sha256: nativeContentHash(line2Bytes), codec: 'json' },
      pointer: ['toolUseResult', 'stdout'],
    }],
  };
  const reader = new NativeContentReader(root, ref => readNativeTool(root, ref));
  const resolvedV2 = reader.tool(v2Ref, nativeContentHash(JSON.stringify(v2Entry)));
  assert.equal(resolvedV2.text, 'Darwin');

  // NativeContentResolver resolves v3 reference for registered provider (with turnId omitted for qoder-cn)
  const resolver = new NativeContentResolver(root);
  const resolvedRef = resolver.tool({
    view: { id: 'c1', workspaceId: 'ws', revision: 'r1', cwd, title: 't', updatedAt: 'now', hidden: false, entries: [], participants: [], requests: [] },
    participants: [{ id: 'p1', connectionId: 'qoder-cn', provider: 'qoder-cn', label: 'Qoder CN', bindingIdentity: 'binding-1', deliveredThrough: 0 }],
    sources: { 'p1:tool:call-cn': 'e1' },
    requests: {},
    attempts: [{ runId: 'run-1', participantId: 'p1', clientRequestId: 'req-1', inputDigest: 'd1', through: 1, userEntryId: 'u1', accepted: true, executionRef: { id: 'sdk-exec-1', data: { resourceContext: UUID_CTX } } }],
    attachments: {},
    nativeTools: { e1: true },
  }, { ...baseEntry, id: 'e1', runId: 'run-1', provider: 'qoder-cn' });
  assert.ok(resolvedRef);
  assert.equal(resolvedRef.session?.config, 'model-access/accounts/native-qoder-cn');
  assert.equal(resolvedRef.session?.turnId, undefined);
});

test('characterization: existing npm NativeProgramManager discover, release failures, and managed reuse', async t => {
  const dir = makeRoot(t);
  const root = path.join(dir, 'agent-service');
  const codexPolicy = nativeProgramPolicy('codex');

  // Create a valid pre-populated managed npm package directory for codex 0.165.0
  const pkgDir = path.join(root, 'programs', 'codex', `package-0.165.0-${process.platform}-${process.arch}`);
  const entryPath = path.join(pkgDir, codexPolicy.entry);
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.mkdirSync(path.join(pkgDir, 'node_modules/@openai/codex'), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'node_modules/@openai/codex/package.json'), JSON.stringify({ name: '@openai/codex', version: '0.165.0' }));
  fs.writeFileSync(entryPath, `#!/usr/bin/env node\nconsole.log('codex-cli 0.165.0');\n`, { mode: 0o755 });

  let mode: 'ok' | 'incompatible' | 'fail' = 'ok';
  const manager = new NativeProgramManager(root, { PATH: process.env.PATH ?? '' }, async () => {
    if (mode === 'fail') throw new Error('network_down');
    if (mode === 'incompatible') return { latestVersion: '9.0.0', source: 'https://registry.npmjs.org/@openai%2Fcodex/latest' };
    return { latestVersion: '0.165.0', source: 'https://registry.npmjs.org/@openai%2Fcodex/latest' };
  });

  // 1. install() reuses valid existing managed directory and records prepared.json
  const installed = await manager.install({ provider: 'codex', version: '0.165.0', signal: AbortSignal.timeout(5_000), progress: () => {} });
  assert.equal(fs.realpathSync(installed), fs.realpathSync(entryPath));
  const prepared = JSON.parse(fs.readFileSync(path.join(root, 'programs', 'codex', 'prepared.json'), 'utf8'));
  assert.equal(prepared.version, '0.165.0');

  // 2. discover() finds compatible managed candidate and enables installation when unbound
  const catalogOk = await manager.discover({ provider: 'codex', signal: AbortSignal.timeout(5_000) });
  assert.equal(catalogOk.installation.version, '0.165.0');
  assert.equal(catalogOk.installation.canInstall, true);
  assert.equal(catalogOk.candidates[0]?.compatible, true);
  assert.equal(catalogOk.candidates[0]?.version, '0.165.0');

  // 3. discover() blocks installation on incompatible major version without downgrading, while keeping prepared candidate discoverable
  mode = 'incompatible';
  const catalogIncompat = await manager.discover({ provider: 'codex', signal: AbortSignal.timeout(5_000) });
  assert.equal(catalogIncompat.installation.canInstall, false);
  assert.match(catalogIncompat.installation.diagnostic ?? '', /不在兼容范围/);
  assert.equal(catalogIncompat.candidates[0]?.version, '0.165.0');

  // 4. discover() blocks installation on upstream release read failure without falling back to installing old version
  mode = 'fail';
  const catalogFail = await manager.discover({ provider: 'codex', signal: AbortSignal.timeout(5_000) });
  assert.equal(catalogFail.installation.canInstall, false);
  assert.match(catalogFail.installation.diagnostic ?? '', /无法读取官方最新版本/);
  assert.equal(catalogFail.candidates[0]?.version, '0.165.0');

  // 5. Unmanaged explicit path rejected for new connection
  const outsideExe = path.join(dir, 'outside-codex');
  fs.writeFileSync(outsideExe, '#!/bin/sh\necho 0.165.0\n', { mode: 0o755 });
  await assert.rejects(
    manager.discover({ provider: 'codex', executable: outsideExe, signal: AbortSignal.timeout(5_000) }),
    (err: any) => err?.code === 'agent_program_not_managed',
  );
});
