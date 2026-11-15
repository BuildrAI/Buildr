import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const result=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project','tsconfig.json'],{cwd:root,stdio:'inherit'});
if(result.error||result.status!==0)throw result.error??new Error('Harness CLI build failed');
