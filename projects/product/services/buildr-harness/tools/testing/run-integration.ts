import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { agentIntegrationChecks } from './verification-checks.ts';
import { withImmutableProcessInputs } from '../../test/support/immutable-process-inputs.ts';
import {runServiceTests} from './run-tests.ts';
import {buildAgentService} from '../build.ts';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args[0] === '--group') {
  const selected = args[1] === 'all' ? agentIntegrationChecks : agentIntegrationChecks.filter(check => check.id === args[1]);
  if (args.length !== 2 || !selected.length) throw new Error('Choose a registered Agent integration check, or all.');
  if(!process.env.BUILDR_AGENT_TEST_PREBUILT)buildAgentService(root);
  const { withPreparedProcessFixture } = selected.some(check => ['agent-integration-startup', 'agent-integration-harness-product'].includes(check.id))
    ? await import('../../test/support/prepared-process-fixture.ts') : { withPreparedProcessFixture: null };
  // This is a safety ceiling, not a second concurrency setting. The outer grant remains authoritative.
  process.exitCode = withImmutableProcessInputs(env => {
    const run = (environment: NodeJS.ProcessEnv) => runServiceTests(selected.flatMap(check => check.testFiles), { cwd: root, maximumWorkers: 2, env: environment });
    return withPreparedProcessFixture ? withPreparedProcessFixture(run, env) : run(env);
  });
} else {
  const selection=args.filter(value=>value.startsWith('agent-integration-'));
  const selected=selection.length?agentIntegrationChecks.filter(check=>selection.includes(check.id)):agentIntegrationChecks;
  if(!selected.length)throw new Error('No matching Harness integration group');
  if(args.some(arg=>['--list','--plan','--json','--help','-h'].includes(arg)))console.log(JSON.stringify(selected.map(({id,testFiles,command})=>({id,testFiles,command})),null,2));
  else {
    buildAgentService(root);
    for(const check of selected){
      const result=spawnSync(process.execPath,[import.meta.filename,'--group',check.id],{cwd:root,env:{...process.env,BUILDR_AGENT_TEST_PREBUILT:'1'},stdio:'inherit'});
      if(result.error)throw result.error;
      if(result.status!==0){process.exitCode=result.status??1;break;}
    }
  }
}
