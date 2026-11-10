import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ProcessBootstrap } from './ownership.ts';
import { readPrivate } from './ownership.ts';
import { startAgentExecutionServer } from './server.ts';

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const filename = process.argv[2];
  const bootstrap = filename && readPrivate<ProcessBootstrap>(filename);
  if (!bootstrap) throw new Error('agent_process_bootstrap_missing');
  await startAgentExecutionServer(bootstrap);
}
