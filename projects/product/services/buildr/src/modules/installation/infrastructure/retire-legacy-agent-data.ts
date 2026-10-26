import fs from 'node:fs';
import path from 'node:path';

/** Fixed Buildr-owned files only. Never follows a link or enters a vendor's configuration. */
export function retireLegacyAgentData(dataRoot:string,workspaceRoots:string[]) {
  const removed:string[]=[],diagnostics:Array<{path:string;message:string}>=[];
  const remove=(root:string,relative:string)=>{
    const file=path.join(root,relative);
    try {
      const parts=path.resolve(file).split(path.sep).filter(Boolean);let current=path.parse(file).root;
      for(const part of parts.slice(0,-1)){current=path.join(current,part);const stat=fs.lstatSync(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('旧接入数据路径不是普通目录。');}
      if(fs.existsSync(file+'.lock'))throw new Error('旧接入数据仍有写入锁，未删除。');
      const before=fs.lstatSync(file);
      if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1)throw new Error('旧接入数据不是独占普通文件。');
      const observed=fs.lstatSync(file);
      if(observed.ino!==before.ino||observed.dev!==before.dev||observed.mtimeMs!==before.mtimeMs||observed.size!==before.size)throw new Error('旧接入数据已变化，未删除。');
      fs.unlinkSync(file);removed.push(file);
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')diagnostics.push({path:file,message:error instanceof Error?error.message:'旧接入数据未删除。'});}
  };
  for(const relative of ['agent-registrations.json','codex-desktop/connections.json','dsh-desktop/connections.json'])remove(dataRoot,relative);
  for(const root of new Set(workspaceRoots))for(const relative of ['.buildr/local/codex-desktop-sessions.json','.buildr/local/dsh-desktop-sessions.json'])remove(root,relative);
  return{removed,diagnostics};
}
