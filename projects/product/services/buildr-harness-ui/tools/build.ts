import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const run=(script:string,args:string[]=[])=>{const result=spawnSync(process.execPath,[script,...args],{cwd:root,stdio:'inherit'});if(result.error||result.status!==0)throw result.error??new Error('Harness UI build failed');};
run(path.join(root,'../buildr-agent/tools/codegen/http-dto.ts'),[path.join(root,'build/generated/agent-service-http-dto.ts')]);
run(path.join(root,'node_modules/typescript/bin/tsc'),['--project','tsconfig.json']);
for(const file of fs.globSync('src/**/*.css',{cwd:root})){const output=path.join(root,'dist',file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(path.join(root,file),output);}
