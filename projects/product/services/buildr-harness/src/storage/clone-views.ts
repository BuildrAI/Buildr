import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ensureStorageDirectory, safeStoragePath } from './files.ts';

interface View { file:string; object:string; dev:number; ino:number; size:number; mtimeMs:number; ctimeMs:number }
/** Small ownership receipts, bucketed by path, protect shared bodies while a
 * writable clone still references the verified bytes. No source file bodies. */
export function recordCloneView(root:string,file:string,object:string):void{
  const stat=fs.lstatSync(file),id=createHash('sha256').update(file).digest('hex');
  const directory=path.join(root,'toolchains/clone-views');ensureStorageDirectory(root,directory);
  const record=path.join(directory,id.slice(0,2)+'.json');let entries:Record<string,View>={};
  if(fs.existsSync(record))entries=read(record);
  entries[id]={file,object:path.basename(path.dirname(object)),dev:stat.dev,ino:stat.ino,size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs};
  const stage=path.join(directory,'.view-'+randomUUID());
  try{fs.writeFileSync(stage,JSON.stringify(entries),{flag:'wx',mode:0o600});fs.renameSync(stage,record);}finally{fs.rmSync(stage,{force:true});}
}
function read(file:string):Record<string,View>{
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024||process.getuid&&stat.uid!==process.getuid())throw new Error('component_view_receipt_unsafe');
  const value:unknown=JSON.parse(fs.readFileSync(file,'utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('component_view_receipt_invalid');return value as Record<string,View>;
}
export function cloneViewReferences(root:string):{complete:boolean;objects:Set<string>}{
  const directory=path.join(root,'toolchains/clone-views'),objects=new Set<string>();
  if(!fs.existsSync(directory))return {complete:true,objects};
  if(!safeStoragePath(root,directory))return {complete:false,objects};
  try{
    for(const name of fs.readdirSync(directory)){
      if(!/^[a-f0-9]{2}\.json$/.test(name))continue;
      for(const [id,view]of Object.entries(read(path.join(directory,name)))){
        if(!/^[a-f0-9]{64}$/.test(id)||!view||typeof view.file!=='string'||typeof view.object!=='string'||!/^[a-f0-9]{64}-[0-7]{1,3}$/.test(view.object)||createHash('sha256').update(view.file).digest('hex')!==id)return {complete:false,objects};
        if(!safeStoragePath(root,path.dirname(view.file)))continue;
        const stat=fs.lstatSync(view.file,{throwIfNoEntry:false});
        if(stat?.isFile()&&!stat.isSymbolicLink()&&stat.dev===view.dev&&stat.ino===view.ino&&stat.size===view.size&&stat.mtimeMs===view.mtimeMs&&stat.ctimeMs===view.ctimeMs)objects.add(view.object);
      }
    }
    return {complete:true,objects};
  }catch{return {complete:false,objects};}
}

export function cloneViewCurrent(root:string,file:string):boolean{
  const id=createHash('sha256').update(file).digest('hex'),directory=path.join(root,'toolchains/clone-views');
  try{
    if(!safeStoragePath(root,directory)||!safeStoragePath(root,path.dirname(file)))return false;
    const view=read(path.join(directory,id.slice(0,2)+'.json'))[id],stat=fs.lstatSync(file);
    return !!view&&view.file===file&&stat.isFile()&&!stat.isSymbolicLink()&&stat.dev===view.dev&&stat.ino===view.ino&&stat.size===view.size&&stat.mtimeMs===view.mtimeMs&&stat.ctimeMs===view.ctimeMs;
  }catch{return false;}
}
