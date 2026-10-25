import test from 'node:test';

import assert from 'node:assert/strict';

import { codexBody } from '../../src/model-access/providers/codex.ts';

import { fields, integer, splitFrames } from '../../src/model-access/providers/devin-codec.ts';

import type { ProviderInferenceInput } from '../../src/model-access/contracts.ts';

const sourceContext = { accountId: 'account', agentId: 'dsh', conversationId: 'one', runId: 'run', requestId: 'request' };

const input = (body: Record<string, unknown>, modelId = 'test', signal = new AbortController().signal): ProviderInferenceInput => ({ body, modelId, signal, context: sourceContext });

test('Devin codec rejects corrupt protobuf, oversize and invalid compressed frames', () => {
  assert.throws(() => fields(Buffer.from([0x0a, 0x02, 0x61])), /truncated/); assert.throws(() => fields(Buffer.from([0x08, 0x80])), /invalid/);
  assert.deepEqual(fields(Buffer.from([0x08, 0x96, 0x01]))[0], { field: 1, wire: 0, integer: 150n });
  const oversize = Buffer.from([0, 1, 0, 0, 1]); assert.throws(() => splitFrames(oversize), /invalid/);
  assert.throws(() => splitFrames(Buffer.from([1, 0, 0, 0, 1, 0])), /header|buffer|data|gzip|file/i);
});

test('Codex negotiation preserves tools, content order and encrypted reasoning input', () => {
  const body = codexBody({ input: [{ type: 'reasoning', encrypted_content: 'opaque' }, { type: 'function_call_output', call_id: 'call', output: 'result' }], tools: [{ type: 'function', name: 'read', parameters: { type: 'object' } }], instructions: 'system', max_output_tokens: 4096 }, 'model');
  assert.deepEqual(body.input, [{ type: 'reasoning', encrypted_content: 'opaque' }, { type: 'function_call_output', call_id: 'call', output: 'result' }]); assert.equal(body.max_output_tokens, undefined); assert.ok(Array.isArray(body.tools));
});
