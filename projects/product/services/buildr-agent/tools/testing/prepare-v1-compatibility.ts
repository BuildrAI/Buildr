import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {agentRuntimePackageTree} from '../package-runtime.ts';

// Last observed pre-split implementation. Resolve/retain a full immutable commit,
// not a feature switch on the implementation under test.
const sourceCommit=process.argv[2]??'974612e171af0a551cccaa6e8880735944bac717';
if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('Supply an exact old source commit');
const repository=spawnSync('git',['rev-parse','--show-toplevel'],{cwd:import.meta.dirname,encoding:'utf8',timeout:10000});
if(repository.status!==0)throw new Error('Reference preparation needs the verified source repository');
const cwd=repository.stdout.trim();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-v1-reference-'));
const run=(command:string,args:string[],directory:string,timeout=60000)=>{
  const result=spawnSync(command,args,{cwd:directory,encoding:'utf8',timeout,env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH},maxBuffer:8*1024*1024});
  if(result.error||result.status!==0)throw new Error(`${command} failed: ${result.error?.message??result.stderr??result.status}`);
};
try {
  const archive=path.join(root,'source.tar');
  run('git',['archive','--format=tar','--output='+archive,sourceCommit,'projects/product/services/buildr-agent'],cwd);
  run('tar',['-xf',archive,'-C',root],cwd);
  fs.unlinkSync(archive);
  const sourceRoot=path.join(root,'projects/product/services/buildr-agent');
  run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],sourceRoot,180000);
  run(process.execPath,['tools/build.ts'],sourceRoot);
  const packageRoot=path.join(root,'package');fs.mkdirSync(packageRoot);
  agentRuntimePackageTree(sourceRoot).materialize(packageRoot);
  const client=fs.readFileSync(path.join(packageRoot,'build/process/client.js'));
  if(fs.readFileSync(path.join(packageRoot,'build/execution-contracts.js'),'utf8').includes('buildr.agent-operations/v2'))throw new Error('Reference is not a pre-v2 implementation');
  const provenance={root,sourceCommit,sourceRoot,packageRoot,clientSha256:createHash('sha256').update(client).digest('hex')};
  fs.writeFileSync(path.join(root,'provenance.json'),JSON.stringify(provenance)+'\n');
  console.log(JSON.stringify(provenance));
} catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}
