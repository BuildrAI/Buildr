import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { sharedCacheFileSafe } from './toolchain-locations.ts';
import { safeStoragePath } from './files.ts';
const owned=(stat:fs.Stats)=>stat.isFile()&&!stat.isSymbolicLink()&&(!process.getuid||stat.uid===process.getuid());
function archiveFiles(archive:Buffer):Map<string,Buffer>{
  const data=gunzipSync(archive,{maxOutputLength:256*1024*1024}),files=new Map<string,Buffer>();
  for(let offset=0;offset+512<=data.length;){
    const header=data.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
    const text=(a:number,b:number)=>header.subarray(a,b).toString().replace(/\0.*$/s,'');
    const name=text(0,100),prefix=text(345,500),type=text(156,157),sizeText=text(124,136).trim();
    if(!/^[0-7]+$/.test(sizeText))throw new Error('component_archive_unsupported');
    const size=parseInt(sizeText,8),entry=prefix?prefix+'/'+name:name;
    if(!Number.isSafeInteger(size)||offset+512+size>data.length||!entry.startsWith('package/')||entry.split('/').some(part=>part==='..')||entry.includes('\\'))throw new Error('component_archive_unsafe');
    if(type==='0'||type===''){
      const relative=entry.slice(8);if(!relative||files.has(relative)||relative.startsWith('/')||relative.split('/').some(part=>part==='.'||part===''))throw new Error('component_archive_unsafe');
      files.set(relative,data.subarray(offset+512,offset+512+size));
    }else if(type!=='5')throw new Error('component_archive_unsupported');
    offset+=512+Math.ceil(size/512)*512;
  }
  if(!files.has('package.json'))throw new Error('component_archive_manifest_missing');return files;
}

/** Shared package protocol proof. Never extract or execute an archive. */
export function verifiedPackageFiles(root:string,directory:string,archive:string,integrity:string):string[]{
  if(!safeStoragePath(root,directory)||!sharedCacheFileSafe(root,archive))throw new Error('component_install_path_unsafe');
  const stat=fs.lstatSync(archive),match=/(?:^|\s)sha512-([A-Za-z0-9+/]+={0,2})(?:\s|$)/.exec(integrity);
  if(!owned(stat)||stat.size>128*1024*1024||!match)throw new Error('component_archive_integrity_unsupported');
  const data=fs.readFileSync(archive),expected=Buffer.from(match[1]!,'base64');
  if(expected.length!==64||!createHash('sha512').update(data).digest().equals(expected))throw new Error('component_archive_integrity_changed');
  const entries=archiveFiles(data),json=entries.get('package.json')!;
  const original=JSON.parse(json.toString()) as {name?:string;version?:string};
  if(typeof original.name!=='string'||typeof original.version!=='string')throw new Error('component_install_identity_changed');
  const files:string[]=[];
  for(const [name,body]of entries){
    const file=path.join(directory,name);if(!safeStoragePath(root,path.dirname(file)))throw new Error('component_install_path_unsafe');
    const current=fs.lstatSync(file);if(!owned(current)||current.size!==body.length||!fs.readFileSync(file).equals(body))throw new Error('component_install_content_changed');files.push(file);
  }
  return files;
}
