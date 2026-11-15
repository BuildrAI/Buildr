import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {agentRuntimePackageTree} from '../../buildr-agent/tools/package-runtime.ts';
import {collectThirdParty} from './collect-third-party.ts';
const root=path.resolve(import.meta.dirname,'..'),core=path.resolve(root,'../buildr-agent');
const run=(file:string,args:string[],cwd:string,timeout=240000)=>{const result=spawnSync(file,args,{cwd,stdio:'inherit',timeout,env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH}});if(result.error||result.status!==0)throw result.error??new Error('Harness preparation failed');};
export function prepareHarnessPackage(){
  run('npm',['run','build'],path.resolve(root,'../buildr-harness-web'));
  run(process.execPath,['tools/build.ts'],core);
  const destination=path.join(root,'node_modules/@buildr-ai/buildr-agent');fs.mkdirSync(path.dirname(destination),{recursive:true});
  const stat=fs.lstatSync(destination,{throwIfNoEntry:false});
  if(stat?.isSymbolicLink()&&fs.realpathSync(destination)!==fs.realpathSync(core))throw new Error('harness_core_package_identity_mismatch');
  if(stat&&!stat.isSymbolicLink()&&JSON.parse(fs.readFileSync(path.join(destination,'package.json'),'utf8')).name!=='@buildr-ai/buildr-agent')throw new Error('harness_core_package_identity_mismatch');
  const tree=agentRuntimePackageTree(core);
  if(!tree.matches(destination)){
    const stage=fs.mkdtempSync(path.join(path.dirname(destination),'.harness-core-')),previous=stage+'-previous';
    try{tree.materialize(stage);if(stat)fs.renameSync(destination,previous);try{fs.renameSync(stage,destination);}catch(error){if(stat)fs.renameSync(previous,destination);throw error;}fs.rmSync(previous,{recursive:true,force:true});}finally{fs.rmSync(stage,{recursive:true,force:true});}
  }
  run(process.execPath,['tools/build.ts'],root);
  collectThirdParty();
  return {root,core:destination};
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)console.log(JSON.stringify({status:'prepared',...prepareHarnessPackage()}));
