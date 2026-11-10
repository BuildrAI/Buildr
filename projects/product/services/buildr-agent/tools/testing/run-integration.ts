import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { agentIntegrationChecks } from './verification-checks.ts';
import { withImmutableProcessInputs } from '../../test/support/immutable-process-inputs.ts';
import { runServiceTests } from '../../../buildr/tools/testing/run-service-tests.ts';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args[0] === '--group') {
  const selected = args[1] === 'all' ? agentIntegrationChecks : agentIntegrationChecks.filter(check => check.id === args[1]);
  if (args.length !== 2 || !selected.length) throw new Error('Choose a registered Agent integration check, or all.');
  // This is a safety ceiling, not a second concurrency setting. The outer grant remains authoritative.
  process.exitCode = withImmutableProcessInputs(env => runServiceTests(selected.flatMap(check => check.testFiles), { cwd: root, maximumWorkers: 2, env }));
} else {
  // The complete public entry follows the catalogue, so adding a group cannot silently omit it.
  const cli = path.resolve(root, '../buildr/test/verification/cli.ts');
  const checks = args.includes('--check') ? [] : agentIntegrationChecks.flatMap(check => ['--check', check.id]);
  const execute = (env: NodeJS.ProcessEnv) => {
    const result = spawnSync(process.execPath, [cli, 'integration', ...checks, ...args], { cwd: root, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    return result.status ?? 1;
  };
  process.exitCode = args.some(arg => ['--plan','--json','--list','--help','-h'].includes(arg)) ? execute(process.env) : withImmutableProcessInputs(execute);
}
