#!/usr/bin/env node
// Stable verification entrypoint; cases exercise the pinned upstream and Buildr boundaries.
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
const suites = {
 contract: ['openspec-domain','openspec-deterministic-sync','openspec-convergence-preflight','openspec-projected-validator'],
 recovery: ['openspec-convergence-transaction','openspec-convergence-recovery'],
};
const args=process.argv.slice(2);
if(args.includes('--list-suites')) console.log(JSON.stringify({...suites,all:[...suites.contract,...suites.recovery]}));
else {
 const selected=args.includes('--suite')?args[args.indexOf('--suite')+1]:'all';
 const cases=selected==='all'?[...suites.contract,...suites.recovery]:suites[selected as keyof typeof suites];
 if(!cases)throw new Error(`Unknown OpenSpec fixture suite: ${selected}`);
 const result=spawnSync(process.execPath,['--test',...cases.map(name=>path.resolve(import.meta.dirname,'../../integration',`${name}.test.ts`))],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
}
