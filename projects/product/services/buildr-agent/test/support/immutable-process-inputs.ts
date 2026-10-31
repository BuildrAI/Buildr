import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AgentRuntimeUnit } from '../../src/index.ts';

const inputRootKey = 'BUILDR_AGENT_TEST_INPUT_ROOT';
function fileDigest(file: string): string {
  const digest=createHash('sha256'), buffer=Buffer.allocUnsafe(1024*1024), fd=fs.openSync(file,'r');
  try { let count: number; while ((count=fs.readSync(fd,buffer,0,buffer.length,null))>0) digest.update(buffer.subarray(0,count)); }
  finally { fs.closeSync(fd); }
  return digest.digest('hex');
}
function readInput(env: NodeJS.ProcessEnv) {
  const root=env[inputRootKey]; if (!root) return null;
  if (!path.isAbsolute(root) || fs.lstatSync(root).isSymbolicLink()) throw new Error('Unsafe immutable test input root');
  const node=path.join(root,'node'), info=fs.lstatSync(node);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'input.json'),'utf8'));
  if (!info.isFile() || info.isSymbolicLink() || (info.mode&0o222)!==0 || !/^[a-f0-9]{64}$/.test(manifest.digest)) throw new Error('Invalid immutable Node test input');
  return {root,node,digest:manifest.digest};
}

/** One owned read-only binary per complete run; no global installation or writable package is linked. */
export function withImmutableProcessInputs(run: (env: NodeJS.ProcessEnv) => number, env: NodeJS.ProcessEnv=process.env): number {
  if (process.platform==='win32' || readInput(env)) return run(env);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-test-inputs-')), node=path.join(root,'node');
  fs.chmodSync(root,0o700);
  let result=1, retained=false;
  try {
    fs.copyFileSync(process.execPath,node,fs.constants.COPYFILE_FICLONE); fs.chmodSync(node,0o500);
    fs.writeFileSync(path.join(root,'input.json'),JSON.stringify({digest:fileDigest(node)}),{mode:0o600});
    result=run({...env,[inputRootKey]:root});
  } finally {
    const info=fs.statSync(node,{throwIfNoEntry:false});
    if (!info || info.nlink===1) fs.rmSync(root,{recursive:true,force:true});
    else {
      process.stderr.write(`[agent-test-inputs] ${JSON.stringify({status:'retained',reason:'runtime-links-remain',root,links:info.nlink})}\n`);
      // Preserve the immutable input for any failed case whose retained runtime still owns it.
      retained=true;
    }
  }
  return retained?1:result;
}

/** Keep each unit's path and real materialization/validation, sharing only identical read-only executable bytes. */
export function shareFixtureNode(runtime: AgentRuntimeUnit, env: NodeJS.ProcessEnv=process.env): AgentRuntimeUnit {
  if (process.platform==='win32') return runtime;
  const input=readInput(env); if (!input) return runtime;
  const source=fs.statSync(input.node), current=fs.statSync(runtime.node);
  if (source.dev===current.dev && source.ino===current.ino) return runtime;
  if (fileDigest(input.node)!==input.digest) throw new Error('Immutable Node test input content changed');
  if (fileDigest(runtime.node)!==input.digest) return runtime; // Explicit alternate Node versions retain their private binary.
  const replacement=runtime.node+'.shared';
  try {
    try { fs.linkSync(input.node,replacement); }
    catch (error) {
      if (!['EXDEV','ENOTSUP','EPERM'].includes((error as NodeJS.ErrnoException).code??'')) throw error;
      // Cross-volume and unsupported platforms retain private copies.
      fs.copyFileSync(input.node,replacement,fs.constants.COPYFILE_FICLONE); fs.chmodSync(replacement,0o500);
    }
    fs.renameSync(replacement,runtime.node);
  } finally { fs.rmSync(replacement,{force:true}); }
  return runtime;
}
