import assert from 'node:assert/strict';
import test from 'node:test';
import { questionStatus, hasBlockingQuestions } from '../src/features/agent-conversations/conversation-interaction.ts';

test('question presence does not imply waiting or prove ongoing work', () => {
  const request = { kind: 'question', blocking: false };
  assert.equal(hasBlockingQuestions([request]), false);
  assert.equal(hasBlockingQuestions([{ kind: 'question' }]), true);
  assert.match(questionStatus(request, { status: 'running' }), /执行仍在进行/);
  assert.match(questionStatus(request, { status: 'unknown' }), /待确认/);
  assert.doesNotMatch(questionStatus(request, { status: 'waiting-question' }), /仍在进行/);
  assert.doesNotMatch(questionStatus(request), /仍在进行/);
  assert.equal(questionStatus({ kind: 'approval', blocking: false }, { status: 'running' }), '需要你的授权');
});
