import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModelAccess } from '../../src/model-access/application.ts';
import { createQoderCnModelProvider } from '../../src/model-access/providers/qoder-cn.ts';

test('a managed Qoder CN account is migrated to its own credential domain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-migrate-'));
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(join(root, 'accounts.json'), JSON.stringify({ version: 1, preferences: {}, accounts: [{ id: 'native-qoder-cn', identity: 'sha256-old', provider: 'native-qoder-cn', connectionId: 'qoder-cn', label: 'Qoder CN', revision: 'old', enabled: true, status: 'failed', models: [{ id: 'dfmodel', label: 'DeepSeek-Flash', tools: true, images: false }] }] }) + '\n', { mode: 0o600 });
    const access = createModelAccess({ root, providers: [createQoderCnModelProvider()] });
    const account = access.accounts.list().accounts.find(item => item.provider === 'native-qoder-cn');
    assert.ok(account);
    assert.equal(account.connectionId, undefined, 'no longer owned by an agent connection');
    assert.equal(account.status, 'not-authenticated');
    assert.deepEqual(account.models, []);
    const persisted = JSON.parse(await readFile(join(root, 'accounts.json'), 'utf8'));
    assert.equal(persisted.accounts[0].connectionId, undefined);
    await access.close();
    // The correction is written, so a later start does not repeat it or resurrect the binding.
    const reopened = createModelAccess({ root, providers: [createQoderCnModelProvider()] });
    assert.equal(reopened.accounts.list().accounts.find(item => item.provider === 'native-qoder-cn')?.connectionId, undefined);
    await reopened.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a source that still declares a connection keeps its managed account', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-keep-'));
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(join(root, 'accounts.json'), JSON.stringify({ version: 1, preferences: {}, accounts: [{ id: 'native-qoder', identity: 'sha256-old', provider: 'native-qoder', connectionId: 'qoder', label: 'Qoder', revision: 'old', enabled: true, status: 'ready', models: [] }] }) + '\n', { mode: 0o600 });
    const { createQoderModelProvider } = await import('../../src/model-access/providers/qoder.ts');
    const access = createModelAccess({ root, providers: [createQoderModelProvider({ inspect: async () => ({ status: 'ready' as const }), identity: async () => 'qoder:a', request: async () => Response.json({}) })] });
    const account = access.accounts.list().accounts.find(item => item.provider === 'native-qoder');
    assert.equal(account?.connectionId, 'qoder');
    await access.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
