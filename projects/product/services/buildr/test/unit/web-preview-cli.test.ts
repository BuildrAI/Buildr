import assert from 'node:assert/strict';
import test from 'node:test';

import { createWebCliContributions } from '../../src/web/interfaces/cli/web.ts';

test('preview CLI 帮助声明沿用与清理边界', () => {
  const contributions = createWebCliContributions();
  const start = contributions.find((entry) => entry.key === 'web preview start');
  const stop = contributions.find((entry) => entry.key === 'web preview stop');
  assert.ok(start && stop);
  const startHelp = start.help.join('\n');
  for (const token of ['--reuse <profile>[:facet,...]', '--refresh-reuse', 'model-catalog', 'agent-runtime', '来源只读', '会话、附件、交接材料']) assert.match(startHelp, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const stopHelp = stop.help.join('\n');
  for (const token of ['--purge', '默认只停止实例并保留数据', 'owner 不匹配', '越界符号链接']) assert.match(stopHelp, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(start.match({ domain: 'web', action: 'preview', runtimeId: 'start' }), true);
  assert.equal(stop.match({ domain: 'web', action: 'preview', runtimeId: 'stop' }), true);
});
