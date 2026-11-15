import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {agentRuntimePackageTree} from '../../tools/package-runtime.ts';
let packageRoot:string|undefined;
/** No Development package/test helper is needed to materialize the public payload. */
export function fixturePackage():string {
  if(process.env.BUILDR_AGENT_TEST_PACKAGE)return process.env.BUILDR_AGENT_TEST_PACKAGE;
  if(packageRoot)return packageRoot;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-test-package-'));
  try {agentRuntimePackageTree(path.resolve(import.meta.dirname,'../..')).materialize(root);}
  catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}
  packageRoot=root;
  process.once('exit',()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}
