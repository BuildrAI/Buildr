import test from 'node:test';
import assert from 'node:assert/strict';
import { qoderCnTerminalReconciliation } from '../../src/executors/qoder-cn/transcript.ts';

test('identical terminal text needs no reconciliation',()=>{
  assert.deepEqual(qoderCnTerminalReconciliation('收尾完成。','收尾完成。',false),{action:'noop'});
});

test('truncated streaming prefix is overwritten by the authoritative native text',()=>{
  const partial='对，核心思路就是学 Qoder';
  const full=partial+'——但有一点刻意不照搬。';
  assert.deepEqual(qoderCnTerminalReconciliation(partial,full,false),{action:'overwrite'});
});

test('a wholly lost terminal message is appended after an intermediate message',()=>{
  // Last projected message is a progress note superseded by a tool/thinking; the
  // native end_turn text is a distinct final answer that never arrived via ACP.
  assert.deepEqual(qoderCnTerminalReconciliation('做最后现场核对。','收尾完成。结果如下。',true),{action:'append'});
});

test('no projected message at all appends the native terminal text',()=>{
  assert.deepEqual(qoderCnTerminalReconciliation(undefined,'收尾完成。',false),{action:'append'});
});

test('a longer or divergent accumulated terminal answer is not clobbered or duplicated',()=>{
  // Accumulated text already exceeds the native snapshot: keep it, do not append.
  assert.deepEqual(qoderCnTerminalReconciliation('完整答复还有后续。','完整答复',false),{action:'noop'});
  // Divergent but still the open terminal segment: do not borrow another message.
  assert.deepEqual(qoderCnTerminalReconciliation('不同的答复。','另一段文本。',false),{action:'noop'});
});
