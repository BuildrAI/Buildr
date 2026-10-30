import assert from 'node:assert/strict';
import test from 'node:test';
import { interactionPolicy, blocksExecution } from '../../src/domain/interaction-policy.ts';
import { apply, inject } from '../../src/executors/dsh/interaction-plugin.ts';
import { createCodexExecutor } from '../../src/executors/codex/index.ts';
import { createDshExecutor } from '../../src/executors/dsh/index.ts';
import { createQoderExecutor } from '../../src/executors/qoder/index.ts';

test('all built-in executors declare the same Buildr-owned interaction contract', () => {
  for (const create of [createCodexExecutor, createDshExecutor, createQoderExecutor]) {
    assert.equal(create().descriptor.capabilities.interaction?.policy, interactionPolicy.version);
  }
});

test('legacy questions block, explicit non-blocking questions do not, approvals cannot bypass', () => {
  assert.equal(blocksExecution({ kind: 'question' }), true);
  assert.equal(blocksExecution({ kind: 'question', blocking: false }), false);
  assert.equal(blocksExecution({ kind: 'approval', blocking: false }), true);
});

test('DSH registers the common instruction as an additional native section, not a complete replacement', () => {
  const sections: any[] = [];
  assert.deepEqual(inject, ['systemPrompt']);
  apply({ systemPrompt: { getSectionOrder: () => 10200, section: (section: any) => sections.push(section) } }, { instructions: interactionPolicy.instructions });
  assert.equal(sections.length, 1);
  assert.equal(sections[0].text, interactionPolicy.instructions);
  assert.equal(sections[0].interpolate, false);
  assert.notEqual(sections[0].complete, true);
});
