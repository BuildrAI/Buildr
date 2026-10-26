import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCodexExecutor } from '../../../src/executors/codex/index.ts';
import { createQoderExecutor } from '../../../src/executors/qoder/index.ts';
import { codexThreadPermissions, codexTurnPermissions } from '../../../src/executors/codex/permissions.ts';
import { applyDshPermissions } from '../../../src/executors/dsh/permissions.ts';
import type { AgentRuntime, ExecutorEvent, PermissionMode } from '../../../src/contracts.ts';

async function eventually(check: () => unknown) { for (let i = 0; i < 500; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 2)); } assert.fail('native fixture did not settle'); }

test('Codex thread and turn permissions explicitly reset full access to the fixed workspace default', () => {
  assert.deepEqual(codexThreadPermissions('full-access'), { sandbox: 'danger-full-access', approvalPolicy: 'never' });
  assert.deepEqual(codexThreadPermissions(undefined), { sandbox: 'workspace-write', approvalPolicy: 'on-request' });
  assert.deepEqual(codexTurnPermissions('full-access', '/work'), { approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' } });
  assert.deepEqual(codexTurnPermissions('default', '/work'), { approvalPolicy: 'on-request', sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['/work'], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false } });
  assert.throws(() => codexThreadPermissions('surprise' as PermissionMode), { code: 'agent_permission_invalid' });
});

test('DSH uses its native permission command and verifies the session selection; default comes from the live catalog', async () => {
  let defaultPreset = 'workspace-write'; let current = 'workspace-write'; const calls: string[] = []; const ok = (value: any) => ({ ok: true, value });
  const remote = { permissionPresets: { catalog: async () => ok({ defaultPreset, options: [{ value: 'workspace-write' }, { value: 'danger-full-access' }, { value: 'custom-default' }] }) }, commands: {
    list: async (id: string) => { assert.equal(id, 'exact-session'); return ok([{ name: 'permission', definitionId: '@deepseek-ai/dsh-permission-presets' }]); },
    execute: async (id: string, line: string, attachments: unknown[]) => { assert.equal(id, 'exact-session'); assert.deepEqual(attachments, []); calls.push(line); current = line.slice('/permission '.length); return ok({ result: { kind: 'success' } }); },
  } };
  const snapshot = async () => ({ projections: { values: { permissions: { currentValue: current } } } });
  await applyDshPermissions(remote, 'exact-session', 'full-access', snapshot); assert.equal(current, 'danger-full-access');
  await applyDshPermissions(remote, 'exact-session', 'default', snapshot); assert.equal(current, 'workspace-write');
  defaultPreset = 'custom-default'; await applyDshPermissions(remote, 'exact-session', undefined, snapshot); assert.equal(current, 'custom-default');
  assert.deepEqual(calls, ['/permission danger-full-access', '/permission workspace-write', '/permission custom-default']);
});

test('DSH unavailable preset, shadowed command or mismatched readback refuses before any work input', async t => {
  const ok = (value: any) => ({ ok: true, value });
  for (const failure of ['preset', 'command', 'readback']) await t.test(failure, async () => {
    let commandCalls = 0;
    const remote = { permissionPresets: { catalog: async () => ok({ defaultPreset: 'workspace-write', options: [{ value: 'workspace-write' }, ...(failure === 'preset' ? [] : [{ value: 'danger-full-access' }])] }) }, commands: {
      list: async () => ok([{ name: 'permission', definitionId: failure === 'command' ? 'untrusted-shadow' : '@deepseek-ai/dsh-permission-presets' }]),
      execute: async () => { commandCalls++; return ok({ result: { kind: 'success' } }); },
    } };
    await assert.rejects(applyDshPermissions(remote, 'exact-session', 'full-access', async () => ({ projections: { values: { permissions: { currentValue: 'workspace-write' } } } })), { code: failure === 'readback' ? 'agent_permission_unverified' : 'agent_permission_unavailable' });
    assert.equal(commandCalls, failure === 'readback' ? 1 : 0);
  });
});

test('Codex observation preserves full-access while business questions, tool stop and explicit default execution remain independent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-permission-codex-')); const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace); const log = path.join(root, 'native.jsonl'); const executable = path.join(root, 'codex.mjs');
  let source = await fs.readFile(new URL('./fixtures/codex-cli.mjs', import.meta.url), 'utf8');
  source = source.replace("r.on('line',l=>{const m=JSON.parse(l);", `r.on('line',l=>{const m=JSON.parse(l);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(m)+'\\n');`);
  await fs.writeFile(executable, source); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createCodexExecutor().open({ connectionId: 'codex', configRoot: path.join(root, 'profile'), executable, environment: { PATH: process.env.PATH ?? '' } });
    const contextRef = await runtime.createContext({ cwd: workspace, permissionMode: 'full-access' }); const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: 'ask a business question then run owned command', permissionMode: 'full-access', images: [], clientRequestId: 'full-request', onEvent: event => events.push(event) }); sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const request = events.find(event => event.type === 'request'); const accepted = events.find(event => event.type === 'accepted'); assert.equal(request?.type, 'request'); assert.equal(accepted?.type, 'accepted'); assert.equal(request.request.kind, 'question');
    await runtime.resumeContext({ contextRef, cwd: workspace });
    const observedResume = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).findLast(call => call.method === 'thread/resume').params;
    assert.equal(Object.hasOwn(observedResume, 'approvalPolicy'), false); assert.equal(Object.hasOwn(observedResume, 'sandbox'), false);
    await runtime.reply({ contextRef, executionRef: accepted.executionRef, requestId: request.request.id, answer: { color: '蓝' } });
    await eventually(() => events.some(event => event.type === 'observation' && event.observation.tools.some(tool => tool.canStop === true)));
    let observation = await runtime.stop({ contextRef, executionRef: accepted.executionRef, toolId: 'command-' + accepted.executionRef.id }); assert.equal(observation.status, 'running');
    let calls = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); assert.ok(!calls.some(call => call.method === 'turn/interrupt'));
    assert.equal(calls.find(call => call.method === 'thread/start').params.sandbox, 'danger-full-access'); assert.equal(calls.find(call => call.method === 'turn/start').params.sandboxPolicy.type, 'dangerFullAccess');
    await runtime.stop({ contextRef, executionRef: accepted.executionRef }); await sending;
    await runtime.resumeContext({ contextRef, cwd: workspace, permissionMode: 'default' });
    calls = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); const resumed = calls.findLast(call => call.method === 'thread/resume').params; assert.equal(resumed.sandbox, 'workspace-write'); assert.equal(resumed.approvalPolicy, 'on-request');
    const nextEvents: ExecutorEvent[] = []; const resetSending = runtime.send({ contextRef, cwd: workspace, text: 'continue with default permissions', permissionMode: 'default', images: [], clientRequestId: 'default-request', onEvent: event => nextEvents.push(event) }); resetSending.catch(() => {});
    await eventually(() => nextEvents.some(event => event.type === 'request'));
    const resetAccepted = nextEvents.find(event => event.type === 'accepted'); assert.equal(resetAccepted?.type, 'accepted');
    await runtime.stop({ contextRef, executionRef: resetAccepted.executionRef }); await resetSending;
    calls = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); const resetTurn = calls.findLast(call => call.method === 'turn/start').params;
    assert.equal(resetTurn.approvalPolicy, 'on-request'); assert.deepEqual(resetTurn.sandboxPolicy, { type: 'workspaceWrite', writableRoots: [workspace], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false });
  } finally { await runtime?.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('Qoder full-access uses native bypass mode, preserves business questions and creates the next default query without bypass flags', { timeout: 15_000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-permission-qoder-')); const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace); const log = path.join(root, 'args.jsonl'); const executable = path.join(root, 'qoder.mjs');
  let source = await fs.readFile(new URL('./fixtures/qoder-cli.mjs', import.meta.url), 'utf8');
  source = "import fs from 'node:fs';\n" + source.replace("const r=createInterface", `fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv)+'\\n');const r=createInterface`);
  await fs.writeFile(executable, source); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot: path.join(root, 'profile'), executable, environment: { PATH: process.env.PATH ?? '' } });
    const contextRef = await runtime.createContext({ cwd: workspace });
    for (const permissionMode of ['full-access', 'default'] as const) {
      const events: ExecutorEvent[] = []; const sending = runtime.send({ contextRef, cwd: workspace, text: 'business question', permissionMode, images: [], clientRequestId: '16b6514b-0d25-42cf-aef6-0f7ecd9bd719', onEvent: event => events.push(event) }); sending.catch(() => {});
      await eventually(() => events.some(event => event.type === 'request'));
      const request = events.find(event => event.type === 'request'); const accepted = events.find(event => event.type === 'accepted'); assert.equal(request?.type, 'request'); assert.equal(accepted?.type, 'accepted'); assert.equal(request.request.kind, 'question');
      await runtime.reply({ contextRef, executionRef: accepted.executionRef, requestId: request.request.id, answer: { '0': '蓝' } });
      await runtime.stop({ contextRef, executionRef: accepted.executionRef }); await sending;
      if (permissionMode === 'full-access') await runtime.generateTitle!({ contextRef, cwd: workspace, description: '{\"messages\":[]}', signal: new AbortController().signal });
    }
    const allCalls = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); const auxiliary = allCalls.find((args: string[]) => args.includes('--no-session-persistence')); assert.ok(auxiliary); assert.ok(!auxiliary.includes('--dangerously-skip-permissions')); const calls = allCalls.filter((args: string[]) => !args.includes('--no-session-persistence')); assert.equal(calls.length, 2);
    const option = (args: string[], name: string) => args[args.indexOf(name) + 1]; assert.equal(option(calls[0], '--permission-mode'), 'bypassPermissions'); assert.ok(calls[0].includes('--dangerously-skip-permissions')); assert.equal(option(calls[1], '--permission-mode'), 'default'); assert.ok(!calls[1].includes('--dangerously-skip-permissions'));
    assert.ok(calls.every((args: string[]) => option(args, '--session-id') === contextRef.id));
  } finally { await runtime?.close(); await fs.rm(root, { recursive: true, force: true }); }
});
