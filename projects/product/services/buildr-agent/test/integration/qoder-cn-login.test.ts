import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv } from 'node:crypto';
import { createQoderCnModelProvider } from '../../src/model-access/providers/qoder-cn.ts';

/** Emulates the official CLI: prints the device URL, then writes native credentials. */
const fixture = `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs');
const { createCipheriv } = require('node:crypto');
if (process.argv.includes('--version')) { process.stdout.write('1.1.86\\n'); process.exit(0); }
if (process.argv.includes('login')) {
  const config = process.env.QODERCN_CONFIG_DIR;
  process.stdout.write('Open https://qoder.cn/device/selectAccounts?challenge=fixture to sign in\\n');
  const machine = 'machine-id-fixture-1';
  mkdirSync(config + '/.auth', { recursive: true });
  writeFileSync(config + '/.auth/machine_id', machine);
  const key = Buffer.from(machine.slice(0, 16));
  const cipher = createCipheriv('aes-128-cbc', key, key);
  const payload = Buffer.concat([cipher.update(JSON.stringify({ uid: 'account-a', security_oauth_token: 'token' }), 'utf8'), cipher.final()]).toString('base64');
  writeFileSync(config + '/.auth/user', payload);
  process.exit(0);
}
process.exit(2);
`;

test('Qoder CN account logs in without a prepared agent and then reads its own identity', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-login-'));
  try {
    const bin = join(root, 'bin'); await mkdir(bin, { recursive: true });
    const executable = join(bin, 'qodercn');
    await writeFile(executable, fixture); await chmod(executable, 0o755);
    const runtime = await createQoderCnModelProvider().open({ accountId: 'native-qoder-cn', configRoot: join(root, 'account'), environment: { PATH: bin + ':' + (process.env.PATH ?? '') } });
    try {
      assert.equal((await runtime.inspect()).status, 'not-authenticated');
      const states: string[] = [];
      let url: string | undefined;
      await runtime.beginLogin(value => { states.push(value.state); if (value.url) url = value.url; });
      assert.deepEqual(states, ['initializing', 'waiting-browser', 'completed']);
      assert.match(url ?? '', /^https:\/\/qoder\.cn\/device\/selectAccounts/);
      assert.equal(await runtime.identity?.(), 'qoder-cn:account-a');
    } finally { await runtime.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Qoder CN reports a missing CLI instead of pretending to wait for a browser', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-missing-'));
  try {
    const runtime = await createQoderCnModelProvider().open({ accountId: 'native-qoder-cn', configRoot: join(root, 'account'), environment: { PATH: join(root, 'empty') } });
    try {
      const states: string[] = []; let diagnostic: string | undefined;
      await runtime.beginLogin(value => { states.push(value.state); if (value.diagnostic) diagnostic = value.diagnostic; });
      assert.deepEqual(states, ['initializing', 'failed']);
      assert.match(diagnostic ?? '', /未找到 Qoder CN 命令行程序/);
    } finally { await runtime.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('account prepares its own managed login program with no PATH CLI or agent connection', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-managed-'));
  try {
    const executable = join(root, 'official.cjs'); await writeFile(executable, fixture);
    const calls: string[] = [];
    const runtime = await createQoderCnModelProvider({
      async discover(input) { calls.push(input.provider); return { candidates: [], installation: { label: 'Qoder CN', version: '1.1.86', url: 'https://qoder.cn', canInstall: true } }; },
      async install(input) { calls.push(input.version!); input.progress('download'); return executable; },
    }).open({ accountId: 'native-qoder-cn', configRoot: join(root, 'account'), environment: { PATH: join(root, 'empty') } });
    try {
      const states: string[] = []; await runtime.beginLogin(value => states.push(value.state));
      assert.deepEqual(calls, ['qoder-cn', '1.1.86']);
      assert.equal(states.at(-1), 'completed'); assert.ok(states.includes('waiting-browser'));
      assert.equal(await runtime.identity?.(), 'qoder-cn:account-a');
    } finally { await runtime.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('cancelling preparation cannot start login after discovery returns', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-cancel-'));
  let release!: () => void, entered!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; }); let installs = 0;
  const runtime = await createQoderCnModelProvider({
    async discover() { entered(); await gate; return { candidates: [], installation: { label: 'Qoder CN', version: '1.1.86', url: 'https://qoder.cn', canInstall: true } }; },
    async install() { installs++; throw new Error('must not install'); },
  }).open({ accountId: 'native-qoder-cn', configRoot: root, environment: {} });
  try {
    const states: string[] = []; const login = runtime.beginLogin(value => states.push(value.state));
    await waiting; await runtime.cancelLogin(); release(); await login;
    assert.equal(installs, 0); assert.deepEqual(states, ['initializing']);
  } finally { release(); await runtime.close(); await rm(root, { recursive: true, force: true }); }
});

test('unavailable managed login reports a terminal reason without enabling an agent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-unavailable-'));
  const runtime = await createQoderCnModelProvider({
    async discover() { return { candidates: [], installation: { label: 'Qoder CN', version: '2.0.0', url: 'https://qoder.cn', canInstall: false, diagnostic: '官方新版本不兼容' } }; },
    async install() { throw new Error('must not install'); },
  }).open({ accountId: 'native-qoder-cn', configRoot: root, environment: {} });
  try {
    const observations: Array<{state:string;diagnostic?:string}> = [];
    await runtime.beginLogin(value => observations.push(value));
    assert.deepEqual(observations.at(-1), { state: 'failed', diagnostic: '官方新版本不兼容' });
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
});
