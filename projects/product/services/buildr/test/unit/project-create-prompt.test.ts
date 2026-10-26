import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntime } from '../helpers/runtime-harness.ts';

test('project creation prompt preserves scope, remote and authorization boundaries', () => {
  const runtime = createRuntime();
  const prompt: any = runtime.generateProjectCreatePrompt({ code: 'next', name: 'Next', description: 'Next project', sourceType: 'git', gitUrl: 'https://example.com/next.git', remote: 'upstream', integrationBranch: 'dev' });
  assert.match(prompt.prompt, /集成分支：dev/);
  assert.match(prompt.prompt, /不得盲目 checkout、stash 或 relink/);
  assert.match(prompt.prompt, /trigger: project-registered/);
  assert.match(prompt.prompt, /已有授权内普通维护直接完成/);
  assert.match(prompt.prompt, /授权缺失或业务取舍反馈用户决定/);
  assert.equal(prompt.copiedMeansCreated, false);
});
