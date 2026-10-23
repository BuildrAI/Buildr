import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWriteJson} from '../../../infrastructure/filesystem/atomic-files.ts';
import {acquireExclusiveFileLock, releaseExclusiveFileLock, withExclusiveFileLock} from '../../../infrastructure/filesystem/exclusive-file-lock.ts';

export type WorkspacePreparation = {
  id: string;
  revision: number;
  ownerPid?: number;
  rootPath: string;
  name: string;
  directoryIdentity: string;
  workspaceId: string | null;
  status: 'selected' | 'preparing' | 'ready' | 'failed';
  error: string | null;
  details?: string;
  customizations?: Array<{id:string;integrity:string}>;
  updatedAt: string;
};
const fail=(code:string,message:string)=>Object.assign(new Error(message),{code,status:409});

/** Rebuildable local operation observations, separate from workspace source identity. */
export function createWorkspacePreparationStore(directory: string) {
  function fileFor(id:string) {
    if(!/^[a-f0-9-]{36}$/.test(id))throw fail('workspace_preparation_invalid','工作空间准备身份无效。');
    return path.join(directory,`${id}.json`);
  }
  function read(id:string):WorkspacePreparation {
    const file=fileFor(id),stat=fs.lstatSync(file);
    if(stat.isSymbolicLink()||!stat.isFile()||stat.size>65536)throw fail('workspace_preparation_invalid','准备记录无法读取，已保留原文件。');
    const envelope=JSON.parse(fs.readFileSync(file,'utf8'));
    const value=envelope.record;
    if(envelope.schemaVersion!=='buildr.workspace-preparation/v1'||!value||value.id!==id||!path.isAbsolute(value.rootPath)||!Number.isSafeInteger(value.revision)||typeof value.directoryIdentity!=='string'||typeof value.name!=='string'||!['selected','preparing','ready','failed'].includes(value.status))throw fail('workspace_preparation_invalid','准备记录无效，已保留原文件。');
    return value;
  }
  function write(value:WorkspacePreparation,expected:number|null) {
    fs.mkdirSync(directory,{recursive:true});
    withExclusiveFileLock(`${fileFor(value.id)}.lock`,fileFor(value.id),()=>{
      const observed=fs.existsSync(fileFor(value.id))?read(value.id):null;
      if((observed?.revision??null)!==expected)throw fail('workspace_preparation_conflict','准备状态已变化，请重新读取。');
      value.revision=(expected??0)+1;
      value.updatedAt=new Date().toISOString();
      atomicWriteJson(fileFor(value.id),{schemaVersion:'buildr.workspace-preparation/v1',record:value},{mode:0o600});
    });
    return value;
  }
  function list() {
    if(!fs.existsSync(directory))return [];
    const records:WorkspacePreparation[]=[];
    for(const file of fs.readdirSync(directory)) {
      if(!/^[a-f0-9-]{36}\.json$/.test(file))continue;
      try{records.push(read(file.slice(0,-5)));}catch{/* An unrelated damaged observation does not block a new directory. */}
    }
    return records;
  }
  function acquire(root:string) {
    const file=path.join(directory,`${createHash('sha256').update(root).digest('hex')}.lease`);
    return acquireExclusiveFileLock(file,root,{timeoutMs:0});
  }
  return {read,write,list,acquire,release:releaseExclusiveFileLock};
}
