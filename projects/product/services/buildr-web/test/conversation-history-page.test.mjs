import assert from 'node:assert/strict';
import test from 'node:test';
import { readConversationHistoryPrefix } from '../src/features/agent-conversations/conversation-history-page.ts';

const fixture = (total) => {
  const calls = [], rows = Array.from({length: total}, (_, i) => ({id: String(i), workspaceId: 'w1'}));
  return {calls, read: async ({limit, cursor}) => {
    const offset = Number(cursor || 0); calls.push({limit, cursor});
    return {total, conversations: rows.slice(offset, offset + limit), nextCursor: offset + limit < total ? String(offset + limit) : undefined};
  }};
};
test('只读取 5/15/25 条目标，不自动耗尽剩余数据', async () => {
  const {read, calls} = fixture(1000);
  for (const count of [5, 15, 25]) assert.equal((await readConversationHistoryPrefix(read, count, new AbortController().signal)).conversations.length, count);
  assert.deepEqual(calls.map(call => call.limit), [5, 15, 25]);
});
test('尾批与单次上限后续读均有界', async () => {
  const tail = fixture(8); assert.equal((await readConversationHistoryPrefix(tail.read, 15, new AbortController().signal)).conversations.length, 8);
  const large = fixture(500), result = await readConversationHistoryPrefix(large.read, 115, new AbortController().signal);
  assert.equal(result.conversations.length, 115); assert.deepEqual(large.calls, [{limit: 100, cursor: undefined}, {limit: 15, cursor: '100'}]);
});
test('取消、分页失效与无进展结果不返回混合的半成品', async () => {
  const controller = new AbortController();
  await assert.rejects(readConversationHistoryPrefix(async () => {controller.abort(); return {conversations: [{id: 'late'}]};}, 5, controller.signal), {name: 'AbortError'});
  const data = fixture(200);
  await assert.rejects(readConversationHistoryPrefix(async options => {if (options.cursor) throw new Error('stale'); return data.read(options);}, 115, new AbortController().signal), /stale/);
  await assert.rejects(readConversationHistoryPrefix(async () => ({conversations: [], nextCursor: 'stuck'}), 5, new AbortController().signal), /未前进/);
  await assert.rejects(readConversationHistoryPrefix(data.read, 0, new AbortController().signal), /无效/);
});
