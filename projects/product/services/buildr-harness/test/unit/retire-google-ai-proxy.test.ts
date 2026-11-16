import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readRetiredGoogleAiProxySources } from '../../src/model-access/retire-google-ai-proxy.ts';

test('reads the former proxy mapping and validates loopback sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-retire-helper-'));
  try {
    await mkdir(join(root, 'CLIProxyAPI'), { recursive: true });
    await writeFile(join(root, 'CLIProxyAPI', 'buildr-quota.json'), JSON.stringify({
      baseUrl: 'http://127.0.0.1:53850/v1',
      accounts: { gemini: 'gemini', claude: 'claude', ignored: 'other', 'bad id': 'gemini' },
    }) + '\n');
    assert.deepEqual(readRetiredGoogleAiProxySources(join(root, 'agent-service')), {
      providerIds: ['google-ai-subscription'],
      accountIds: ['gemini', 'claude'],
      customBaseUrl: 'http://127.0.0.1:53850/v1',
      customProtocols: { gemini: 'chat-completions', claude: 'anthropic-messages' },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing, malformed or non-loopback mappings only retire the provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-retire-helper-'));
  try {
    const agentService = join(root, 'agent-service');
    assert.deepEqual(readRetiredGoogleAiProxySources(agentService), { providerIds: ['google-ai-subscription'] });
    await mkdir(join(root, 'CLIProxyAPI'), { recursive: true });
    await writeFile(join(root, 'CLIProxyAPI', 'buildr-quota.json'), '{not json');
    assert.deepEqual(readRetiredGoogleAiProxySources(agentService), { providerIds: ['google-ai-subscription'] });
    await writeFile(join(root, 'CLIProxyAPI', 'buildr-quota.json'), JSON.stringify({
      baseUrl: 'https://proxy.example.com/v1',
      accounts: { legacy: 'gemini' },
    }));
    assert.deepEqual(readRetiredGoogleAiProxySources(agentService), { providerIds: ['google-ai-subscription'] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
