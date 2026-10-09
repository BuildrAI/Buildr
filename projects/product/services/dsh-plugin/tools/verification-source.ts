/** Read-only Git content identity, including dirty feedback without claiming it is a commit. */
import { execFileSync } from 'node:child_process';
import { lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from './buildr-peer.ts';
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
function git(root: string, args: string[], input?: string): string {
  return execFileSync('git', args, {cwd:root,input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
}
function content(records: Array<[string,string,string]>): string { return hash(Buffer.from(JSON.stringify(records.sort((a,b)=>a[0].localeCompare(b[0]))))); }
export function captureVerificationSource(root=defaultRoot) {
  const names=git(root,['ls-files','--cached','--others','--exclude-standard','-z','--','.']).split('\0').filter(Boolean);
  const index=new Map(git(root,['ls-files','--stage','-z']).split('\0').filter(Boolean).map(row=>{const tab=row.indexOf('\t');return[row.slice(tab+1),row.slice(0,6)];}));
  let honorMode=true; try { honorMode=git(root,['config','--get','core.fileMode']).trim()!=='false'; } catch { /* Git's default is to honor executable bits. */ }
  const records:Array<[string,string,string]>=[];
  for (const name of names) {
    if(/(?:^|\/)(?:\.npmrc|\.env(?:\.[^/]+)?)$/.test(name))throw new Error('Credential configuration is not a verification source input');
    let state:ReturnType<typeof lstatSync>; try { state=lstatSync(join(root,name)); } catch (error) { if((error as NodeJS.ErrnoException).code==='ENOENT')continue; throw error; }
    if(!state.isFile()&&!state.isSymbolicLink())throw new Error('Unsupported source input');
    const mode=state.isSymbolicLink()?'120000':honorMode?(state.mode&0o111?'100755':'100644'):(index.get(name)??'100644');
    const blob=state.isSymbolicLink()?git(root,['hash-object','--stdin'],readlinkSync(join(root,name))):git(root,['hash-object','--',name]);
    records.push([name,mode,blob.trim()]);
  }
  return {observedCommit:git(root,['rev-parse','HEAD']).trim(),dirty:git(root,['status','--porcelain','--','.']).trim()!=='',contentSha256:content(records)};
}
export function gitTreeSourceIdentity(tree:string,root=defaultRoot):string {
  if(!/^[a-f0-9]{40,64}$/.test(tree)||git(root,['cat-file','-t',tree]).trim()!=='tree')throw new Error('Candidate source tree is unavailable');
  const records:Array<[string,string,string]>=git(root,['ls-tree','--full-tree','-rz',tree]).split('\0').filter(Boolean).map(row=>{const tab=row.indexOf('\t'),[mode,type,blob]=row.slice(0,tab).split(' ');if(type!=='blob')throw new Error('Unsupported candidate source tree member');return[row.slice(tab+1),mode,blob];});
  return content(records);
}
