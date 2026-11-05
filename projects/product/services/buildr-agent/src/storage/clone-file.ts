import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

/** No fallback to a full copy: success means the filesystem accepted a clone.
 * libuv does not expose clonefile on macOS. JXA binds only this system function;
 * paths are arguments, never executable script, and no application is controlled. */
export function cloneFile(source:string,target:string):void {
  if(process.platform!=='darwin'){fs.copyFileSync(source,target,fs.constants.COPYFILE_FICLONE_FORCE|fs.constants.COPYFILE_EXCL);return;}
  const script='ObjC.import("Foundation"); ObjC.bindFunction("clonefile", ["int", ["char *", "char *", "int"]]); function run(argv) { return $.clonefile(argv[0], argv[1], 0); }';
  const result=spawnSync('/usr/bin/osascript',['-l','JavaScript','-e',script,source,target],{encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});
  if(result.error||result.status!==0||result.stdout.trim()!=='0')throw new Error('component_clone_unavailable');
}
