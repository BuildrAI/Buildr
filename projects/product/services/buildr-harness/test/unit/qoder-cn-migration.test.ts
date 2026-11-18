import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModelAccess } from '../../src/model-access/application.ts';
import { createQoderAccountModelProvider, createQoderCnModelProvider } from '../../src/model-access/providers/qoder-cn.ts';

test('managed Qoder and Qoder CN accounts are migrated to their own credential domains', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-migrate-'));
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(join(root, 'accounts.json'), JSON.stringify({
      version: 1,
      preferences: {},
      accounts: [
        { id: 'native-qoder', identity: 'sha256-old-qoder', provider: 'native-qoder', connectionId: 'qoder', label: 'Qoder', revision: 'old-qoder', enabled: true, status: 'ready', models: [{ id: 'qmodel', label: 'Qoder Pro', tools: true, images: false }] },
        { id: 'native-qoder-cn', identity: 'sha256-old', provider: 'native-qoder-cn', connectionId: 'qoder-cn', label: 'Qoder CN', revision: 'old', enabled: true, status: 'failed', models: [{ id: 'dfmodel', label: 'DeepSeek-Flash', tools: true, images: false }] },
      ],
    }) + '\n', { mode: 0o600 });
    const access = createModelAccess({ root, providers: [createQoderAccountModelProvider(), createQoderCnModelProvider()] });
    for (const provider of ['native-qoder', 'native-qoder-cn'] as const) {
      const account = access.accounts.list().accounts.find(item => item.provider === provider);
      assert.ok(account, provider);
      assert.equal(account.connectionId, undefined, `${provider} no longer owned by an agent connection`);
      assert.equal(account.status, 'not-authenticated');
      assert.deepEqual(account.models, []);
    }
    const persisted = JSON.parse(await readFile(join(root, 'accounts.json'), 'utf8'));
    assert.equal(persisted.accounts[0].connectionId, undefined);
    assert.equal(persisted.accounts[1].connectionId, undefined);
    await access.close();
    // The correction is written, so a later start does not repeat it or resurrect the binding.
    const reopened = createModelAccess({ root, providers: [createQoderAccountModelProvider(), createQoderCnModelProvider()] });
    assert.equal(reopened.accounts.list().accounts.find(item => item.provider === 'native-qoder')?.connectionId, undefined);
    assert.equal(reopened.accounts.list().accounts.find(item => item.provider === 'native-qoder-cn')?.connectionId, undefined);
    await reopened.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a source that still declares a connection keeps its managed account', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-keep-'));
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(join(root, 'accounts.json'), JSON.stringify({ version: 1, preferences: {}, accounts: [{ id: 'native-codex', identity: 'sha256-old', provider: 'native-codex', connectionId: 'codex', label: 'Codex', revision: 'old', enabled: true, status: 'ready', models: [] }] }) + '\n', { mode: 0o600 });
    const access = createModelAccess({
      root,
      providers: [{
        id: 'native-codex',
        label: 'Codex',
        connectionId: 'codex',
        async open() {
          return {
            protocol: 'responses',
            identity: async () => 'codex:a',
            async inspect() { return { status: 'ready', models: [] }; },
            async beginLogin() {},
            async cancelLogin() {},
            async infer() { return Response.json({}); },
            async close() {},
          };
        },
      }],
    });
    const account = access.accounts.list().accounts.find(item => item.provider === 'native-codex');
    assert.equal(account?.connectionId, 'codex');
    await access.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
