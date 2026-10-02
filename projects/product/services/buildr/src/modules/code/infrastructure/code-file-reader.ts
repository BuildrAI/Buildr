import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { insideFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
export const CODE_LIMITS = Object.freeze({ entries: 1000, textBytes: 5 * 1024 * 1024, pageBytes: 512 * 1024, readMs: 15000, imageBytes: 8 * 1024 * 1024, matches: 100, matchLines: 200, searchOutputBytes: 8 * 1024 * 1024, searchMs: 15000 });
export type CodeSource = { repositoryId:string; taskId:string|null; commitHash:string|null; location:string; version:string; kind:'default'|'task'|'commit' };
export type DirectoryEntry = { name:string; path:string; kind:'directory'|'file'|'link'; ignored:boolean };
export function codeFailure(code:string,message:string,status=400): Error & {code:string;status:number} { return Object.assign(new Error(message),{code,status}); }
export function relativeCodePath(value:string, allowEmpty=false) {
  if ((!value && !allowEmpty) || value.includes('\\') || value.includes('\0') || value.includes('//') || path.posix.isAbsolute(value) || value.split('/').some(p=>p==='..'||p==='.'||p.toLowerCase()==='.git') || /^[A-Za-z]:/.test(value)) throw codeFailure('code_path_forbidden','文件路径必须位于所选代码库内。');
  return value.replace(/\/$/,'');
}
export function codeGit(root:string,args:string[],maxBuffer=CODE_LIMITS.imageBytes+1): Buffer {
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
  try { return execFileSync('git',['--literal-pathspecs','--no-optional-locks','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-C',root,...args],{env:{...env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1'},timeout:4000,maxBuffer,stdio:['ignore','pipe','ignore']}); }
  catch { throw codeFailure('code_git_unavailable','该代码库的指定 Git 内容当前不可读取。',404); }
}
export function gitCommonDirectory(root:string) { const value=codeGit(root,['rev-parse','--git-common-dir']).toString().trim(); return fs.realpathSync(path.resolve(root,value)); }
const metadataLocations=new WeakMap<CodeSource,string>();
export function localPath(source:CodeSource,relative:string) {
  const root=source.location;
  const candidate=path.join(root,relative);
  let real:string; try { real=fs.realpathSync(candidate); } catch { throw codeFailure('code_file_missing','所选目录或文件不存在，或当前不可读取。',404); }
  if (!insideFilesystemPath(root,real)) throw codeFailure('code_path_forbidden','符号链接指向所选代码库之外。',403);
  const actualRelative=path.relative(root,real);
  let metadata=metadataLocations.get(source);if(!metadata){metadata=gitCommonDirectory(root);metadataLocations.set(source,metadata);}
  if(actualRelative.split(path.sep).some(p=>p.toLowerCase()==='.git')||(metadata&&insideFilesystemPath(metadata,real)))throw codeFailure('code_path_forbidden','不能读取 Git 管理目录。',403);
  return real;
}
export const fallbackIgnored = new Set(['node_modules','dist','build','web-dist','.worktrees','.buildr']);
function ignoredPaths(root:string,paths:string[]) {
  const ignored=new Set<string>();
  try {
    const output=execFileSync('git',['-C',root,'check-ignore','--no-index','-z','--stdin'],{input:Buffer.from(paths.join('\0')+'\0'),timeout:1500,maxBuffer:2*1024*1024,stdio:['pipe','pipe','ignore']});
    for(const item of output.toString().split('\0'))if(item)ignored.add(item);
  } catch { /* No ignored matches is git status 1; common build directories remain bounded. */ }
  for(const value of paths)if(value.split('/').some(p=>fallbackIgnored.has(p)))ignored.add(value);
  return ignored;
}
export function readCodeDirectory(source:CodeSource,relative='',showIgnored=false) {
  relativeCodePath(relative,true);
  let entries:DirectoryEntry[]=[],enumerationTruncated=false;
  if (source.commitHash) {
    const tree=source.commitHash+(relative?':'+relative:'');
    const bytes=codeGit(source.location,['ls-tree','-z',tree],4*1024*1024);
    entries=bytes.toString().split('\0').filter(Boolean).map(line=>{
      const separator=line.indexOf('\t'),meta=line.slice(0,separator),name=line.slice(separator+1); const [mode,type]=meta.split(' ');
      return {name,path:relative?relative+'/'+name:name,kind:mode==='120000'||mode==='160000'?'link':type==='tree'?'directory':'file',ignored:false};
    });
  } else {
    const dir=localPath(source,relative); if(!fs.statSync(dir).isDirectory())throw codeFailure('code_directory_expected','所选路径不是目录。');
    const handle=fs.opendirSync(dir),names:fs.Dirent[]=[];
    try {let item:fs.Dirent|null;while((item=handle.readSync())){if(names.length>=CODE_LIMITS.entries*2){enumerationTruncated=true;break;}names.push(item);}}finally{handle.closeSync();}
    entries=names.map(item=>({name:item.name,path:relative?relative+'/'+item.name:item.name,kind:item.isSymbolicLink()?'link':item.isDirectory()?'directory':'file',ignored:false}));
    const ignored=ignoredPaths(source.location,entries.map(e=>e.path));for(const entry of entries)entry.ignored=ignored.has(entry.path);
  }
  entries=entries.filter(e=>e.name.toLowerCase()!=='.git'&&(showIgnored||!e.ignored));
  entries.sort((a,b)=>Number(a.kind!=='directory')-Number(b.kind!=='directory')||a.name.localeCompare(b.name));
  return {source,path:relative,entries:entries.slice(0,CODE_LIMITS.entries),truncated:enumerationTruncated||entries.length>CODE_LIMITS.entries,limit:CODE_LIMITS.entries,observedAt:new Date().toISOString()};
}
