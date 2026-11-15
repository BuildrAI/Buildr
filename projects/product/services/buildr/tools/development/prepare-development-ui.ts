import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withExclusiveFileLock} from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';

const root=path.resolve(import.meta.dirname,'../..'),source=path.resolve(root,'../buildr-harness-ui');
export function prepareDevelopmentHarnessUi(){
  const destination=path.resolve(root,'../buildr-web/node_modules/@buildr-ai/buildr-harness-ui');
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  return withExclusiveFileLock(path.join(root,'node_modules/.buildr-harness-ui-preparation.lock'),destination,()=>{
    const result=spawnSync(process.execPath,[path.join(source,'tools/build.ts')],{cwd:source,stdio:'inherit',timeout:180000});
    if(result.error||result.status!==0)throw result.error??new Error('harness_ui_build_failed');
    const stat=fs.lstatSync(destination,{throwIfNoEntry:false});
    if(stat?.isSymbolicLink()&&fs.realpathSync(destination)!==fs.realpathSync(source))throw new Error('harness_ui_package_identity_mismatch');
    if(stat&&!stat.isSymbolicLink()){
      const identity=JSON.parse(fs.readFileSync(path.join(destination,'package.json'),'utf8'));
      if(identity.name!=='@buildr-ai/buildr-harness-ui')throw new Error('harness_ui_package_identity_mismatch');
    }
    const stage=fs.mkdtempSync(path.join(path.dirname(destination),'.harness-ui-stage-')),previous=stage+'-previous';
    try{
      fs.copyFileSync(path.join(source,'package.json'),path.join(stage,'package.json'));
      fs.cpSync(path.join(source,'dist'),path.join(stage,'dist'),{recursive:true});
      if(stat)fs.renameSync(destination,previous);
      try{fs.renameSync(stage,destination);}catch(error){if(stat)fs.renameSync(previous,destination);throw error;}
      fs.rmSync(previous,{recursive:true,force:true});
      return destination;
    } finally {fs.rmSync(stage,{recursive:true,force:true});}
  },{timeoutMs:30000});
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)console.log(JSON.stringify({status:'passed',root:prepareDevelopmentHarnessUi()}));
