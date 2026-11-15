import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The executable and SDK are one installed unit. Never resolve a different
 * package through the host's module search path for a managed bundled CLI. */
export async function qoderSdkPair(executable:string,version:string,product:{id:string;sdkPackage:string}|{id:string}={id:'qoder'}):Promise<string|undefined> {
  // Only the international product ships an importable Agent SDK; Qoder CN drives ACP.
  if(product.id!=='qoder')return undefined;
  const file=await realpath(executable);
  const root=path.resolve(path.dirname(file),'../..');
  let metadata:any;
  try { metadata=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')); }
  catch { /* Legacy standalone programs use the embedded compatible adapter. */ }
  if(metadata?.name==='@qoder-ai/qoder-agent-sdk') {
    if(metadata.qoderCliVersion!==version)throw new Error('qoder_sdk_pair_mismatch');
    const entry=await realpath(path.join(root,'dist/index.js'));
    if(path.relative(root,entry).startsWith('..')||!(await stat(entry)).isFile())throw new Error('qoder_sdk_pair_mismatch');
    return pathToFileURL(entry).href;
  }
  const parts=version.split('.').map(Number);
  if(parts[0]!==1||parts[1]>1||parts[1]===1&&parts[2]>80)throw new Error('qoder_sdk_pair_required');
  return undefined;
}
