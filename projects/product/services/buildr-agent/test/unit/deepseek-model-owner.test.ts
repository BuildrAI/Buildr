import test from 'node:test';

import assert from 'node:assert/strict';

import { createDeepSeekAccountOwner } from '../../src/executors/dsh/model-source-owner.ts';

test('DeepSeek source refuses non-model destinations before opening a native profile', async () => {
  const owner = createDeepSeekAccountOwner({ configRoot: '/not-opened-in-test', executable: '/not-opened-in-test', environment: {} });
  await assert.rejects(owner.request('https://attacker.example/models'), /target_invalid/);
  await assert.rejects(owner.request('https://api.deepseek.com/models?redirect=1'), /target_invalid/);
  await assert.rejects(owner.request('https://api.deepseek.com/auth-api/v0/users/current'), /target_invalid/);
});
