import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureStorageDirectory, safeStoragePath } from './files.ts';

export const toolCaches=['npm','yarn','corepack','node-gyp','pip','uv','python','node-compile'] as const;
export type ToolCache=typeof toolCaches[number];
const ownedDirectory=(directory:string)=>{try{const stat=fs.lstatSync(directory);return stat.isDirectory()&&!stat.isSymbolicLink()&&(!process.getuid||stat.uid===process.getuid());}catch{return false;}};
function existing(value:string|undefined):string|undefined{
  try{if(!value||!path.isAbsolute(value))return;const actual=fs.realpathSync(value);return ownedDirectory(actual)?actual:undefined;}catch{return;}
}
/** Create only a verified host-owned path; never follow a cache link or
 * turn an isolated Agent HOME into another tool environment. No package IO. */
export function prepareHostToolDirectory(home:string|undefined,relative:string,root:string):string|undefined {
  const base=existing(home);
  if(!base || base===root || base.startsWith(root+path.sep) || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'))return;
  const target=path.join(base,relative);
  try {ensureStorageDirectory(base,target);return target;}catch{return;}
}
/** Read only literal public cache paths. Never source shell code, inherit an
 * npmrc/yarnrc, or copy authentication settings into an Agent environment. */
function configured(home:string|undefined,name:string,field:string):string|undefined{
  if(!home)return;
  try{
    const file=path.join(home,name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)return;
    let selected:string|undefined;
    for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
      const match=new RegExp('^\\s*'+field+'\\s*(?:=|\\s)\\s*(?:"([^"\\n]+)"|\'([^\'\\n]+)\'|([^#;\\n]+))\\s*$').exec(line);
      const value=match?.slice(1).find(Boolean)?.trim().replaceAll('${HOME}',home);
      if(value&&!value.includes('${'))selected=existing(value);
    }
    return selected;
  }catch{return;}
}
/** Fixed-name links are declarations of selected cache roots, not unclassified
 * filesystem links. Only the selected namespaces are writable by migration. */
export function registerToolCache(root:string,name:ToolCache,target:string|undefined):void{
  const directory=path.join(root,'toolchains/cache-targets');ensureStorageDirectory(root,directory);
  const file=path.join(directory,name),before=fs.lstatSync(file,{throwIfNoEntry:false});
  if(before&&(!before.isSymbolicLink()||process.getuid&&before.uid!==process.getuid()))throw new Error('toolchain_cache_declaration_changed');
  if(!target){if(before)fs.unlinkSync(file);return;}
  if(before&&fs.readlinkSync(file)===target)return;
  const stage=path.join(directory,'.target-'+randomUUID());
  try{
    fs.symlinkSync(target,stage,'dir');const current=fs.lstatSync(file,{throwIfNoEntry:false});
    if(before?(current?.ino!==before.ino||current?.ctimeMs!==before.ctimeMs):!!current)throw new Error('toolchain_cache_declaration_changed');
    fs.renameSync(stage,file);
  }finally{fs.rmSync(stage,{force:true});}
}
export function selectedToolCache(root:string,name:ToolCache):string|undefined{
  const directory=path.join(root,'toolchains/cache-targets');if(!safeStoragePath(root,directory))return;
  try{const file=path.join(directory,name),stat=fs.lstatSync(file);if(!stat.isSymbolicLink()||process.getuid&&stat.uid!==process.getuid())return;const target=fs.readlinkSync(file);return path.isAbsolute(target)&&ownedDirectory(target)?target:undefined;}catch{return;}
}
export function selectHostToolCaches(root:string,input:Readonly<Record<string,string>>):Partial<Record<ToolCache,string>>{
  const privateHome=input.HOME||input.USERPROFILE;
  const home=input.BUILDR_TOOLCHAIN_HOST_HOME||input.BUILDR_HOST_HOME||privateHome;
  const supplied=input.BUILDR_TOOLCHAIN_HOST_HOME?{}:input;
  const cache=home&&(process.platform==='darwin'?path.join(home,'Library/Caches'):input.XDG_CACHE_HOME||path.join(home,'.cache'));
  const candidates:Record<ToolCache,string|undefined>={
    npm:supplied.npm_config_cache||supplied.NPM_CONFIG_CACHE||configured(home,'.npmrc','cache')||(home&&path.join(home,'.npm')),
    yarn:supplied.YARN_CACHE_FOLDER||configured(home,'.yarnrc','cache-folder')||(cache&&path.join(cache,'Yarn')),
    corepack:supplied.COREPACK_HOME||(home&&path.join(home,'.cache/node/corepack')),
    'node-gyp':supplied.npm_config_devdir||(cache&&path.join(cache,'node-gyp')),
    pip:supplied.PIP_CACHE_DIR||(cache&&path.join(cache,'pip')),
    uv:supplied.UV_CACHE_DIR||(cache&&path.join(cache,'uv')),
    python:supplied.PYTHONPYCACHEPREFIX||(cache&&path.join(cache,'python')),
    'node-compile':supplied.NODE_COMPILE_CACHE||(cache&&path.join(cache,'node-compile')),
  };
  const result:Partial<Record<ToolCache,string>>={};
  const external=(value:string|undefined)=>{
    if(!value||!path.isAbsolute(value)||value===root||value.startsWith(root+path.sep))return;
    const relative=home&&path.relative(home,value);
    const actual=relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)?prepareHostToolDirectory(home,relative,root):existing(value);
    return actual&&actual!==root&&!actual.startsWith(root+path.sep)?actual:undefined;
  };
  const defaults:Partial<Record<ToolCache,string|undefined>>={npm:configured(home,'.npmrc','cache')||(home&&path.join(home,'.npm')),yarn:configured(home,'.yarnrc','cache-folder')||(cache&&path.join(cache,'Yarn')),corepack:home&&path.join(home,'.cache/node/corepack'),'node-gyp':cache&&path.join(cache,'node-gyp'),pip:cache&&path.join(cache,'pip'),uv:cache&&path.join(cache,'uv'),python:cache&&path.join(cache,'python'),'node-compile':cache&&path.join(cache,'node-compile')};
  for(const name of toolCaches){
    // An inherited legacy private cache must not become the system default.
    const value=external(candidates[name])||external(selectedToolCache(root,name))||external(defaults[name]);
    try{registerToolCache(root,name,value);if(value)result[name]=value;}catch{const prior=selectedToolCache(root,name);if(prior)result[name]=prior;}
  }
  return result;
}
/** Publication may use a selected external cache, but never grants collection
 * authority over that host-owned directory or its neighboring account files. */
export function sharedCacheBoundary(root:string,target:string):string|undefined{
  if(target.startsWith(root+path.sep))return root;
  for(const name of toolCaches){
    const selected=selectedToolCache(root,name);if(!selected)continue;
    const namespace=name==='npm'?path.join(selected,'_cacache'):name==='yarn'?path.join(selected,'v6'):name==='corepack'?path.join(selected,'v1'):selected;
    if(target===namespace||target.startsWith(namespace+path.sep))return path.dirname(namespace);
  }
}
export function ensureSharedCacheDirectory(root:string,target:string):void{
  const boundary=sharedCacheBoundary(root,target);if(!boundary||!ownedDirectory(boundary))throw new Error('shared_cache_destination_unsafe');
  ensureStorageDirectory(boundary,target);
}
export function sharedCacheFileSafe(root:string,file:string):boolean{
  const boundary=sharedCacheBoundary(root,file);return !!boundary&&safeStoragePath(boundary,path.dirname(file));
}
