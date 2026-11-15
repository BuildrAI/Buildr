import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareHarnessPackage} from './prepare-package.ts';
// This is an isolated local-verification artifact, never public publication approval.
const prepared=prepareHarnessPackage(),output=path.resolve(process.argv[2]??path.join(prepared.root,'build/local-artifacts'));
fs.mkdirSync(output,{recursive:true});const stage=fs.mkdtempSync(path.join(os.tmpdir(),'harness-local-pack-'));
try {
  const metadata=JSON.parse(fs.readFileSync(path.join(prepared.root,'package.json'),'utf8'));
  metadata.dependencies={'@buildr-ai/buildr-agent':JSON.parse(fs.readFileSync(path.join(prepared.core,'package.json'),'utf8')).version};metadata.bundleDependencies=['@buildr-ai/buildr-agent'];delete metadata.devDependencies;delete metadata.scripts;
  fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(metadata,null,2)+'\n');
  for(const file of ['bin','build','LICENSE','resources'])fs.cpSync(path.join(prepared.root,file),path.join(stage,file),{recursive:true,filter:source=>!source.includes(path.join('build','local-artifacts'))});
  fs.mkdirSync(path.join(stage,'node_modules/@buildr-ai'),{recursive:true});fs.cpSync(prepared.core,path.join(stage,'node_modules/@buildr-ai/buildr-agent'),{recursive:true});
  const result=spawnSync('npm',['pack','--ignore-scripts','--pack-destination',output,'--json'],{cwd:stage,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
  if(result.error||result.status!==0)throw result.error??new Error(result.stderr);
  const receipt=JSON.parse(result.stdout)[0];console.log(JSON.stringify({status:'packed-local-verification',publicationApproved:false,artifact:path.join(output,receipt.filename),sha512:receipt.integrity}));
}finally{fs.rmSync(stage,{recursive:true,force:true});}
