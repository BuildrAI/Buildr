import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnectionSkillsCli } from '../../src/modules/connection-skills/interfaces/cli/connection-skills-cli.ts';
import type { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
test('generic CLI rejects management input on run before consuming business stdin', async () => {
  const cli = createConnectionSkillsCli({} as ConnectionSkillsApplication)[0]!;
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'run', '--file', '-'] }), /未知或重复参数/);
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'definitions', 'remove'] }), /未知连接技能动作/);
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'definitions', 'inspect'] }), /明确 --asset/);
});
