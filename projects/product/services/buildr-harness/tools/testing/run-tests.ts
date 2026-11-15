import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

/** A standalone test entry that obeys the product scheduler's granted budget. */
export function runServiceTests(selectors:readonly string[],options:{cwd?:string;maximumWorkers?:number;env?:NodeJS.ProcessEnv}={}):number {
  const cwd=options.cwd??path.resolve(import.meta.dirname,'../..'),env=options.env??process.env;
  const files=[...new Set(selectors.flatMap(selector=>fs.globSync(selector,{cwd,exclude:['node_modules/**']})).map(file=>path.resolve(cwd,file)))].sort();
  if(!files.length||files.some(file=>path.relative(cwd,file).startsWith('..'+path.sep)))throw new Error('harness_test_selection_invalid');
  const raw=env.BUILDR_VERIFICATION_WORKER_BUDGET;
  if(raw!==undefined&&!/^[1-9]\d*$/.test(raw))throw new Error('harness_test_worker_budget_invalid');
  const workers=Math.min(files.length,options.maximumWorkers??Number.MAX_SAFE_INTEGER,Number(raw??1));
  if(!Number.isSafeInteger(workers))throw new Error('harness_test_worker_budget_invalid');
  const result=spawnSync(process.execPath,['--test',`--test-concurrency=${workers}`,...files],{cwd,env,stdio:'inherit'});
  if(result.error)throw result.error;
  return result.status??1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)process.exitCode=runServiceTests(process.argv.slice(2));
