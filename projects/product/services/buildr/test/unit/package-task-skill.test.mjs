import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTaskRecordSkillCommands } from '../../src/agent-assets/application/package-maintenance/static-validation.ts';

const content = `说明文字不构成命令契约。
buildr task create <id>
buildr task inspect <id>
buildr task update <id> --expected-record <recordDigest>
buildr task activate <id> --expected-record <recordDigest>
buildr task complete <id> --expected-record <recordDigest>
buildr task abandon <id> --expected-record <recordDigest>
`;

test('任务包契约接受不改变命令的文案和占位符变化', () => {
  assert.deepEqual(validateTaskRecordSkillCommands(content), []);
  const rewritten = content.replaceAll('<id>', '<task-id>').replaceAll('buildr task ', 'buildr  task  ').replaceAll('任务记录', '任务业务记录');
  assert.deepEqual(validateTaskRecordSkillCommands(rewritten), []);
});

test('任务包契约仍拒绝缺失公开操作或版本核对参数', () => {
  for (const action of ['create', 'inspect', 'update', 'activate', 'complete', 'abandon']) {
    const missing = content.replaceAll(`buildr task ${action}`, `buildr task removed-${action}`);
    assert.ok(validateTaskRecordSkillCommands(missing).some((problem) => problem.includes(`buildr task ${action}`)));
  }
  assert.ok(validateTaskRecordSkillCommands(content.replaceAll('--expected-record', '--removed-record')).some((problem) => problem.includes('--expected-record')));
});
