import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {collectThirdParty} from './collect-third-party.ts';
const root=path.resolve(import.meta.dirname,'..');
export function prepareHarnessPackage(){
 for(const [cwd,args] of [[path.resolve(root,'../buildr-harness-web'),['tools/build.ts']],[root,['tools/build.ts']]] as const){const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit',timeout:240000});if(result.error||result.status!==0)throw result.error??new Error('harness_preparation_failed');}
 collectThirdParty();return {root,core:root};
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)console.log(JSON.stringify({status:'prepared',...prepareHarnessPackage()}));
