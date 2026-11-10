import { executionLog,diagnosticCode } from '../storage/execution-log.ts';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ProcessBootstrap } from './ownership.ts';
import { readPrivate } from './ownership.ts';
import { startAgentExecutionServer } from './server.ts';

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const filename = process.argv[2];
  const bootstrap = filename && readPrivate<ProcessBootstrap>(filename);
  if (!bootstrap) throw new Error('agent_process_bootstrap_missing');
  const diagnostics=executionLog(path.join(bootstrap.dataRoot,'agent-service'),'entry-'+process.pid);
  try{await startAgentExecutionServer(bootstrap);}catch(error){diagnostics({event:'service-start-failed',runtimeDigest:bootstrap.runtime.digest,code:diagnosticCode(error)});throw error;}
}
