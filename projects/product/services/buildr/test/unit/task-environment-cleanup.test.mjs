import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTaskCleanupDelivery } from '../../src/task/domain/task-environment.mjs';

const source = 'a'.repeat(40);
const target = 'b'.repeat(40);
test('清理输入按仓库固定源和目标版本，保留旧无输入调用', () => {
  const input = { expectedSources: { workspace: source }, deliveredRefs: { workspace: target } };
  assert.deepEqual(normalizeTaskCleanupDelivery(input, ['workspace']), { workspace: { sourceHead: source, targetHead: target } });
  assert.deepEqual(normalizeTaskCleanupDelivery({}, ['workspace']), {});
  assert.deepEqual(input.expectedSources, { workspace: source });
});
test('清理输入拒绝缺失配对、未知仓库、部分多仓、可移动引用及额外字段', () => {
  for (const [input, selectors] of [
    [{ expectedSources: { workspace: source } }, ['workspace']],
    [{ expectedSources: { foreign: source }, deliveredRefs: { foreign: target } }, ['workspace']],
    [{ expectedSources: { workspace: source }, deliveredRefs: { workspace: target } }, ['workspace', 'service:demo/api']],
    [{ expectedSources: { workspace: 'HEAD' }, deliveredRefs: { workspace: target } }, ['workspace']],
    [{ expectedSources: { workspace: source }, deliveredRefs: { workspace: 'dev' } }, ['workspace']],
    [{ expectedSources: [], deliveredRefs: {} }, ['workspace']],
    [{ force: true }, ['workspace']],
  ]) assert.throws(() => normalizeTaskCleanupDelivery(input, selectors), { code: 'task_environment_cleanup_delivery_invalid' });
});
