import assert from 'node:assert/strict';
import test from 'node:test';
import {
  antigravityModelLabel,
  antigravityModelVariant,
  antigravityReasoningEffort,
} from '../../src/domain/antigravity-model.ts';

test('antigravityModelVariant parses known, new, and future depth-suffixed variants generically', () => {
  assert.deepEqual(antigravityModelVariant('gemini-4-neon-low'), { family: 'gemini-4-neon', depth: 'low' });
  assert.deepEqual(antigravityModelVariant('gemini-4-neon-medium'), { family: 'gemini-4-neon', depth: 'medium' });
  assert.deepEqual(antigravityModelVariant('gemini-4-neon-high'), { family: 'gemini-4-neon', depth: 'high' });
  assert.deepEqual(antigravityModelVariant('gemini-4-neon-xhigh'), { family: 'gemini-4-neon', depth: 'xhigh' });
  assert.deepEqual(antigravityModelVariant('gemini-4-carbon-medium'), { family: 'gemini-4-carbon', depth: 'medium' });
  assert.deepEqual(antigravityModelVariant('gemini-3.8-flash-high'), { family: 'gemini-3.8-flash', depth: 'high' });
  assert.deepEqual(antigravityModelVariant('claude-opus-5-5-xhigh'), { family: 'claude-opus-5-5', depth: 'xhigh' });
  assert.deepEqual(antigravityModelVariant('gpt-oss-120b-medium'), { family: 'gpt-oss-120b', depth: 'medium' });
  assert.deepEqual(antigravityModelVariant('gemini-5-krypton-xhigh'), { family: 'gemini-5-krypton', depth: 'xhigh' });
});

test('antigravityModelVariant leaves non-variant models ungrouped', () => {
  for (const id of ['gemini-pro-orchestrator-neon', 'gemini-pro-orchestrator', 'gemini-2.5-flash', 'gemini-4-neon', '-low', '', 'gemini-4-neon-ultra']) {
    assert.equal(antigravityModelVariant(id), undefined, `expected ${id} not to match variant suffix`);
  }
});

test('antigravityModelLabel formats Neon, known families, GPT-OSS, and orchestrator labels', () => {
  assert.equal(antigravityModelLabel('gemini-4-neon-high'), 'Gemini 4 Neon');
  assert.equal(antigravityModelLabel('gemini-4-neon'), 'Gemini 4 Neon');
  assert.equal(antigravityModelLabel('gemini-4-carbon-low'), 'Gemini 4 Carbon');
  assert.equal(antigravityModelLabel('claude-opus-5-5-xhigh'), 'Claude Opus 5.5');
  assert.equal(antigravityModelLabel('gpt-oss-120b-medium'), 'GPT-OSS 120B');
  assert.equal(antigravityModelLabel('gemini-pro-orchestrator-neon', 'Orchestrator (Neon)'), 'Orchestrator (Neon)');
});

test('antigravityReasoningEffort maps depth IDs to display labels', () => {
  assert.deepEqual(antigravityReasoningEffort('low'), { id: 'low', label: 'Low' });
  assert.deepEqual(antigravityReasoningEffort('medium'), { id: 'medium', label: 'Medium' });
  assert.deepEqual(antigravityReasoningEffort('high'), { id: 'high', label: 'High' });
  assert.deepEqual(antigravityReasoningEffort('xhigh'), { id: 'xhigh', label: 'Extra' });
});
