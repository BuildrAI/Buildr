import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESET_PRODUCERS } from '../../tools/capture-preset-adapter.ts';
import { canonicalizePresetChangePlan, canonicalizePresetChangeReceipt, PresetAdapterInputError } from '../../tools/preset-adapter-input.ts';
import type { PresetChangePlan, PresetChangeReceipt } from '../../tools/capture-preset-adapter.ts';

function plan(): PresetChangePlan {
  return { presetId: 'standard', ownerEntryId: 'include:preset-standard', optionsId: 'preset-standard',
    module: '@deepseek-ai/dsh-agent-preset', baseURL: 'file:///official/composition/', fullRawConfigDigest: 'a'.repeat(64),
    allowedGraphRoot: '/task-owned/graph', changes: PRESET_PRODUCERS.map((beforeName, index) => ({ path: [index],
      beforeName, beforeRowDigest: 'b'.repeat(64), afterURL: `file:///task-owned/graph/producer-${index}.js`, afterFileSha256: 'c'.repeat(64) })) };
}
function receipt(): PresetChangeReceipt {
  const input = plan();
  return { schemaVersion: 'buildr.capture-preset-receipt/v1', status: 'applied', presetId: input.presetId,
    ownerEntryId: input.ownerEntryId, optionsId: input.optionsId, module: input.module, baseURL: input.baseURL,
    beforeConfigDigest: input.fullRawConfigDigest, candidateConfigDigest: 'd'.repeat(64), graphVerification: 'verified', changes: input.changes };
}
function refused(run: () => unknown, code: PresetAdapterInputError['code']): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof PresetAdapterInputError); assert.equal(error.code, code);
    assert.equal(error.message, `Preset adapter input: ${code}`);
    assert.equal(error.message.includes('PRIVATE_BODY'), false); return true;
  });
}

test('plan canonicalization preserves required identities and optional graph root without retaining input references', () => {
  const input = plan(), output = canonicalizePresetChangePlan(input);
  assert.deepEqual(output, input); assert.notEqual(output, input);
  assert.notEqual(output.changes[0], input.changes[0]); assert.notEqual(output.changes[0]!.path, input.changes[0]!.path);
  input.changes[0]!.path.push(7); input.changes[0]!.afterFileSha256 = 'f'.repeat(64);
  assert.deepEqual(output.changes[0]!.path, [0]); assert.equal(output.changes[0]!.afterFileSha256, 'c'.repeat(64));
  delete input.allowedGraphRoot;
  assert.equal(Object.hasOwn(canonicalizePresetChangePlan(input), 'allowedGraphRoot'), false);
  const withLiteralID = plan(); withLiteralID.presetId = '自定义<{preset}>';
  assert.equal(canonicalizePresetChangePlan(withLiteralID).presetId, withLiteralID.presetId);
});
test('receipt canonicalization preserves optional observed and rollback hashes and every current status', () => {
  for (const status of ['applied', 'rolled-back', 'compensated', 'refused'] as const) {
    const input = { ...receipt(), status, finalConfigDigest: 'a'.repeat(64), rollbackBeforeConfigDigest: 'b'.repeat(64),
      rollbackWrittenConfigDigest: 'c'.repeat(64), compensationWrittenConfigDigest: 'd'.repeat(64) };
    const result = canonicalizePresetChangeReceipt(input);
    assert.deepEqual(result, input); assert.notEqual(result.changes, input.changes);
  }
  const result = canonicalizePresetChangeReceipt(receipt());
  assert.equal(Object.hasOwn(result, 'finalConfigDigest'), false);
  assert.equal(Object.hasOwn(result, 'compensationWrittenConfigDigest'), false);
  assert.equal(canonicalizePresetChangeReceipt({ ...receipt(), graphVerification: 'runner-owned' }).graphVerification, 'runner-owned');
});
test('raw configuration, bodies, credentials, and any excess keys are refused at every DTO level', () => {
  for (const key of ['raw', 'body', 'credentials', 'config', 'source', 'extra']) {
    const input = plan() as unknown as Record<string, unknown>; input[key] = 'PRIVATE_BODY';
    refused(() => canonicalizePresetChangePlan(input), 'invalid-plan-metadata');
    const result = receipt() as unknown as Record<string, unknown>; result[key] = 'PRIVATE_BODY';
    refused(() => canonicalizePresetChangeReceipt(result), 'invalid-receipt-metadata');
    const nested = plan(); Object.assign(nested.changes[0]!, { [key]: { text: 'PRIVATE_BODY' } });
    refused(() => canonicalizePresetChangePlan(nested), 'invalid-plan-metadata');
    const nestedReceipt = receipt(); Object.assign(nestedReceipt.changes[0]!, { [key]: 'PRIVATE_BODY' });
    refused(() => canonicalizePresetChangeReceipt(nestedReceipt), 'invalid-receipt-metadata');
  }
  const decoratedPath = plan(); Object.assign(decoratedPath.changes[0]!.path, { body: 'PRIVATE_BODY' });
  refused(() => canonicalizePresetChangePlan(decoratedPath), 'invalid-plan-metadata');
  const decoratedChanges = receipt(); Object.assign(decoratedChanges.changes, { body: 'PRIVATE_BODY' });
  refused(() => canonicalizePresetChangeReceipt(decoratedChanges), 'invalid-receipt-metadata');
});
test('missing fields, wrong exact types, unknown enums and malformed identities are not coerced', () => {
  for (const key of ['presetId', 'ownerEntryId', 'optionsId', 'module', 'baseURL', 'fullRawConfigDigest', 'changes']) {
    const missing = plan() as unknown as Record<string, unknown>; delete missing[key];
    refused(() => canonicalizePresetChangePlan(missing), 'invalid-plan-metadata');
  }
  for (const value of [undefined, null, [], 12, true, { raw: 'PRIVATE_BODY' }]) {
    refused(() => canonicalizePresetChangePlan(value), 'invalid-plan-metadata');
    refused(() => canonicalizePresetChangeReceipt(value), 'invalid-receipt-metadata');
  }
  for (const input of [{ ...plan(), presetId: 12 }, { ...plan(), presetId: '' }, { ...plan(), module: 'other-owner' },
    { ...plan(), ownerEntryId: 'control\ncharacter' }, { ...plan(), fullRawConfigDigest: 'A'.repeat(64) },
    { ...plan(), allowedGraphRoot: './relative' }, { ...plan(), allowedGraphRoot: undefined },
    { ...plan(), baseURL: 'https://example.invalid/' }]) refused(() => canonicalizePresetChangePlan(input), 'invalid-plan-metadata');
  for (const input of [{ ...receipt(), schemaVersion: 'other/v1' }, { ...receipt(), status: 'complete' },
    { ...receipt(), graphVerification: true }, { ...receipt(), finalConfigDigest: undefined },
    { ...receipt(), rollbackWrittenConfigDigest: 'not-a-digest' }]) refused(() => canonicalizePresetChangeReceipt(input), 'invalid-receipt-metadata');
});
test('five exact producer addresses reject omissions, duplicates, invalid numbers, holes and unsafe file URLs', () => {
  const cases: Array<(input: PresetChangePlan) => void> = [
    input => { input.changes.pop(); },
    input => { input.changes[0]!.beforeName = 'other'; },
    input => { input.changes[1]!.beforeName = input.changes[0]!.beforeName; },
    input => { input.changes[1]!.path = input.changes[0]!.path; },
    input => { input.changes[1]!.afterURL = input.changes[0]!.afterURL; },
    input => { input.changes[0]!.path = []; },
    input => { input.changes[0]!.path = [-1]; },
    input => { input.changes[0]!.path = [-0]; },
    input => { input.changes[0]!.path = [1.5]; },
    input => { input.changes[0]!.path = [Number.MAX_SAFE_INTEGER + 1]; },
    input => { input.changes[0]!.path = Array(1); },
    input => { delete input.changes[0]; },
  ];
  for (const mutate of cases) { const input = plan(); mutate(input); refused(() => canonicalizePresetChangePlan(input), 'invalid-plan-metadata'); }
  for (const url of ['https://example.invalid/method.js', 'file://remote/entry.js', 'file:///task/entry.js#fragment',
    'file:///task/entry.js?query', 'file:///task/../entry.js', 'file:///task/%00.js', 'file:///task/%2Fentry.js']) {
    const input = plan(); input.changes[0]!.afterURL = url;
    refused(() => canonicalizePresetChangePlan(input), 'invalid-plan-metadata');
  }
});
test('the complete canonical DTO is bounded to 64 KiB without truncating addresses', () => {
  const input = plan(); for (const [index, change] of input.changes.entries()) change.path = [index, ...Array<number>(8000).fill(0)];
  assert.ok(Buffer.byteLength(JSON.stringify(input), 'utf8') > 64 * 1024);
  const before = structuredClone(input);
  refused(() => canonicalizePresetChangePlan(input), 'metadata-limit'); assert.deepEqual(input, before);
  const result = receipt(); result.changes = input.changes;
  refused(() => canonicalizePresetChangeReceipt(result), 'metadata-limit');
  const longID = plan(); longID.presetId = '字'.repeat(200);
  refused(() => canonicalizePresetChangePlan(longID), 'invalid-plan-metadata');
});
test('accessors, symbols, custom prototypes and throwing reflection do not expose input values', () => {
  const accessor = plan(); let called = false;
  Object.defineProperty(accessor, 'presetId', { get: () => { called = true; throw new Error('PRIVATE_BODY'); } });
  refused(() => canonicalizePresetChangePlan(accessor), 'invalid-plan-metadata'); assert.equal(called, false);
  const symbol = plan(); Object.assign(symbol, { [Symbol('private')]: 'PRIVATE_BODY' });
  refused(() => canonicalizePresetChangePlan(symbol), 'invalid-plan-metadata');
  const custom = Object.assign(Object.create({ inherited: 'PRIVATE_BODY' }), plan());
  refused(() => canonicalizePresetChangePlan(custom), 'invalid-plan-metadata');
  const proxy = new Proxy(plan(), { ownKeys: () => { throw new Error('PRIVATE_BODY'); } });
  refused(() => canonicalizePresetChangePlan(proxy), 'invalid-plan-metadata');
  const receiptProxy = new Proxy(receipt(), { getPrototypeOf: () => { throw new Error('PRIVATE_BODY'); } });
  refused(() => canonicalizePresetChangeReceipt(receiptProxy), 'invalid-receipt-metadata');
});
