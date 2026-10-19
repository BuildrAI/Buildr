import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createConnectionSkillsCli } from '../../src/modules/connection-skills/interfaces/cli/connection-skills-cli.ts';
import type { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
test('generic CLI rejects management input on run before consuming business stdin', async () => {
  const cli = createConnectionSkillsCli({} as ConnectionSkillsApplication)[0]!;
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'run', '--file', '-'] }), /未知或重复参数/);
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'definitions', 'remove'] }), /未知连接技能动作/);
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'definitions', 'inspect'] }), /明确 --asset/);
});

test('run 显式时限准确传给应用，省略保留默认行为，分隔符后参数归专业程序', async t => {
  t.mock.method(fs, 'readSync', () => 0);
  const calls: Record<string, unknown>[] = [];
  const application = { run: async (_root: string, options: Record<string, unknown>) => { calls.push(options); return { status: 'exited' }; } } as unknown as ConnectionSkillsApplication;
  const cli = createConnectionSkillsCli(application)[0]!;
  for (const value of ['10', '300000']) {
    await cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'run', '--connection', 'fixture', '--expected-revision', 'observed', '--timeout-ms', value, '--', 'wait', '--timeout-ms', '123'] });
    assert.equal(calls.at(-1)!.timeoutMs, Number(value));
    assert.deepEqual(calls.at(-1)!.args, ['wait', '--timeout-ms', '123']);
  }
  await cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'run', '--connection', 'fixture', '--expected-revision', 'observed', '--', 'wait'] });
  assert.equal(Object.hasOwn(calls.at(-1)!, 'timeoutMs'), false);
});

test('非法时限在读取输入和调用应用前拒绝，其他动作不接受运行时限', async t => {
  t.mock.method(fs, 'readSync', () => { assert.fail('非法参数不得读取业务输入'); });
  const cli = createConnectionSkillsCli({ run: async () => assert.fail('非法参数不得执行程序') } as unknown as ConnectionSkillsApplication)[0]!;
  for (const value of ['0', '9', '300001', '-1', 'NaN', 'Infinity', '1.5', '1e3', ' 1000', '999999999999999999999']) {
    await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'run', '--expected-revision', 'observed', '--timeout-ms', value] }), /整数毫秒/);
  }
  for (const action of ['test', 'help', 'get', 'discover']) {
    await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'connection-skill', action, '--timeout-ms', '1000'] }), /未知或重复参数/);
  }
});
