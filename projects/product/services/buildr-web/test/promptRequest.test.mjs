import assert from 'node:assert/strict';
import test from 'node:test';
import { createPromptRequest } from '../src/lib/promptRequest.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function feedback(events) {
  return {
    start: () => events.push('clear'),
    ready: value => events.push(['prompt', value]),
    failed: error => events.push(['error', error.message]),
    settled: () => events.push('settled'),
  };
}

test('新请求先撤下旧结果，失败只展示错误，不恢复旧指令', async () => {
  const requests = createPromptRequest(), events = [], view = feedback(events);
  await requests.run(() => '目标 A', view);
  assert.deepEqual(events, ['clear', ['prompt', '目标 A'], 'settled']);
  events.length = 0;
  await requests.run(() => { throw new Error('生成失败'); }, view);
  assert.deepEqual(events, ['clear', ['error', '生成失败'], 'settled']);
});

test('输入改变后，迟到的成功或失败均不能恢复指令或反馈', async () => {
  for (const fails of [false, true]) {
    const requests = createPromptRequest(), result = deferred(), events = [];
    const pending = requests.run(() => result.promise, feedback(events));
    requests.invalidate();
    if (fails) result.reject(new Error('旧输入失败'));
    else result.resolve('旧输入指令');
    await pending;
    assert.deepEqual(events, ['clear']);
  }
});

test('并发生成乱序完成时，只接受最近请求，即使输入没有再次改变', async () => {
  for (const olderFails of [false, true]) {
    const requests = createPromptRequest(), older = deferred(), latest = deferred(), events = [];
    const first = requests.run(() => older.promise, feedback(events));
    const second = requests.run(() => latest.promise, feedback(events));
    latest.resolve('最新指令');
    await second;
    if (olderFails) older.reject(new Error('旧请求失败'));
    else older.resolve('旧请求指令');
    await first;
    assert.deepEqual(events, ['clear', 'clear', ['prompt', '最新指令'], 'settled']);
  }
});

test('旧响应不能结束新请求的等待状态，最新请求失败不会回退到旧成功', async () => {
  const requests = createPromptRequest(), older = deferred(), latest = deferred(), events = [];
  const first = requests.run(() => older.promise, feedback(events));
  const second = requests.run(() => latest.promise, feedback(events));
  older.resolve('旧成功');
  await first;
  assert.deepEqual(events, ['clear', 'clear']);
  latest.reject(new Error('新请求失败'));
  await second;
  assert.deepEqual(events, ['clear', 'clear', ['error', '新请求失败'], 'settled']);
});

test('编辑、切换范围或卸载后的复制反馈失效；后续有效请求仍可完成', async () => {
  const requests = createPromptRequest(), events = [];
  await requests.run(() => 'A', feedback(events));
  const copiedA = requests.observe();
  assert.equal(copiedA(), true);
  requests.invalidate();
  assert.equal(copiedA(), false);
  await requests.run(() => 'B', feedback(events));
  assert.equal(copiedA(), false);
  const copiedB = requests.observe();
  assert.equal(copiedB(), true);
  await requests.run(() => 'B again', feedback(events));
  assert.equal(copiedB(), false);
  assert.deepEqual(events.slice(-3), ['clear', ['prompt', 'B again'], 'settled']);
});
