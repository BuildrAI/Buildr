import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../../src/executors/dsh/narration-reminder-plugin.ts';

type Handler = (...args: any[]) => any;

function harness(config?: { threshold?: number }) {
  const handlers = new Map<string, Handler>();
  apply({ on(name: string, handler: Handler) { handlers.set(name, handler); } }, config);
  return {
    emit(event: any, session: any = target) { handlers.get('session/event')!(session, event); },
    step(decision: any = { kind: 'continue', messages: [{ role: 'user', content: [] }] }) {
      return handlers.get('agent/pre-step')!({ agent: { session: target }, step: 2 }, async () => decision) as Promise<any>;
    },
    handlers,
  };
}

const target = { id: 'session-reminder' };
const silent = () => ({ type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'think' }] } } });
const narrated = () => ({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '我先核对现状' }] } } });
const reminders = (decision: any) => (decision.messages as any[]).filter(message => message.source?.kind === 'buildr:narration-reminder');

test('连续无可见说明达到阈值后提醒一次，出现说明后重置', async () => {
  const probe = harness({ threshold: 3 });
  probe.emit(silent()); probe.emit(silent()); probe.emit(silent());
  const first = await probe.step();
  assert.equal(reminders(first).length, 1);
  assert.match(reminders(first)[0].content[0].text, /可见说明/);
  const repeated = await probe.step();
  assert.equal(reminders(repeated).length, 0, '同一段连续无说明只提醒一次');
  probe.emit(narrated());
  probe.emit(silent()); probe.emit(silent()); probe.emit(silent());
  const reset = await probe.step();
  assert.equal(reminders(reset).length, 1, '出现可见说明后重新计数');
});

test('阈值前不提醒，也不改变原有的工具执行决定', async () => {
  const probe = harness({ threshold: 3 });
  probe.emit(silent()); probe.emit(silent());
  const decision = { kind: 'continue', messages: [{ role: 'user', content: [] }] };
  const result = await probe.step(decision);
  assert.equal(reminders(result).length, 0);
  assert.equal(result.kind, 'continue');
  assert.equal(result.messages.length, 1);
});

test('注入的提醒不算用户说明，同一段不重复提醒', async () => {
  const probe = harness({ threshold: 3 });
  probe.emit(silent()); probe.emit(silent()); probe.emit(silent());
  await probe.step();
  // 循环会把提醒按原样记录为 user/message；它不开启新的说明段。
  probe.emit({ type: 'user/message', data: { source: { kind: 'buildr:narration-reminder' } } });
  probe.emit(silent()); probe.emit(silent()); probe.emit(silent());
  const again = await probe.step();
  assert.equal(reminders(again).length, 0);
  // 真实用户发言才开启新的一段。
  probe.emit({ type: 'user/message', data: { source: { kind: 'user' } } });
  probe.emit(silent()); probe.emit(silent()); probe.emit(silent());
  const next = await probe.step();
  assert.equal(reminders(next).length, 1);
});

test('字符串正文与 text 片段同样算可见说明', async () => {
  const probe = harness({ threshold: 3 });
  probe.emit(silent()); probe.emit(silent()); probe.emit(silent());
  probe.emit({ type: 'assistant/message', data: { message: { content: '先说明再执行' } } });
  const decision = await probe.step();
  assert.equal(reminders(decision).length, 0);
});
