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

test('shared work instructions require visible pre-tool intent, grouped by purpose rather than every call', () => {
  const instructions = interactionPolicy.instructions;
  assert.match(instructions, /工具执行前[^。\n]*用户可见[^。\n]*做什么及其目的[^。\n]*再调用工具/);
  assert.match(instructions, /同一目的[^。\n]*连续工具调用[^。\n]*共用一次说明/);
  assert.match(instructions, /阶段或执行方向发生变化时[^。\n]*先更新说明再继续/);
  assert.match(instructions, /说明使用用户的语言[^。\n]*不以内部思考代替/);
  assert.match(instructions, /不机械复述工具名称[^。\n]*不把说明变成等待用户批准/);
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
  assert.equal(sections[0].order, 10201);
  assert.equal(sections[0].interpolate, false);
  assert.notEqual(sections[0].complete, true);
});
