import fs from 'node:fs';
import path from 'node:path';
import { safeStoragePath } from './files.ts';

/** Only package-manager caches inside the service-created isolated HOME or
 * explicitly supplied shared cache root. Never include node_modules, native
 * histories, arbitrary tmp directories or the complete HOME. */
export const regenerableToolCaches = [
  'tmp/node-compile-cache', 'cache/node-compile', 'home/.npm/_cacache', 'cache/npm/_cacache',
  'home/Library/Caches/node-gyp', 'home/.cache/node/corepack/v1',
  'home/Library/Caches/Yarn/v6', 'home/.cache/yarn/v6', 'cache/yarn/v6',
];

/** Legacy Yarn locations predate YARN_CACHE_FOLDER. Require the package
 * manager's own provenance and matching package identity before reclaiming. */
export function toolCacheReclaimable(root: string, relative: string): boolean {
  if (relative.endsWith('/node-gyp')) return nodeHeaderCache(root,relative);
  if (relative.endsWith('/corepack/v1')) return corepackCache(root,relative);
  if (!relative.endsWith('/yarn/v6') && !relative.endsWith('/Yarn/v6')) return true;
  try {
    const directory = path.join(root, relative);
    for (const name of fs.readdirSync(directory)) {
      if (name === '.tmp' && safeStoragePath(root, path.join(directory, name)) && fs.readdirSync(path.join(directory, name)).length === 0) continue;
      if (!name.startsWith('npm-')) return false;
      const modules = path.join(directory, name, 'node_modules');
      if (!safeStoragePath(root, modules)) return false;
      const packages = fs.readdirSync(modules).flatMap(entry => entry.startsWith('@')
        ? fs.readdirSync(path.join(modules, entry)).map(child => entry + '/' + child) : [entry]);
      if (packages.length !== 1) return false;
      const target = path.join(modules, packages[0]!);
      if (!safeStoragePath(root, target)) return false;
      const read = (file: string) => {
        const info = fs.lstatSync(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new Error('cache_identity_unknown');
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      };
      const metadata = read(path.join(target, '.yarn-metadata.json')), pkg = read(path.join(target, 'package.json'));
      if (metadata.registry !== 'npm' || metadata.manifest?.name !== packages[0] || pkg.name !== packages[0] ||
          metadata.manifest?.version !== pkg.version || !metadata.remote?.integrity) return false;
    }
    return true;
  } catch { return false; }
}

function cacheJson(file:string):any {
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw new Error('cache_identity_unknown');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function nodeHeaderCache(root:string,relative:string):boolean {
  try {
    const directory=path.join(root,relative);
    return fs.readdirSync(directory).every(version=>{
      const parts=/^(\d+)\.(\d+)\.(\d+)$/.exec(version),entry=path.join(directory,version);
      if(!parts||!safeStoragePath(root,entry))return false;
      const marker=path.join(entry,'installVersion'),header=path.join(entry,'include/node/node_version.h');
      if(!/^[0-9]+\s*$/.test(fs.readFileSync(marker,'utf8'))||!safeStoragePath(root,path.dirname(header)))return false;
      const stat=fs.lstatSync(header);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024)return false;
      const text=fs.readFileSync(header,'utf8');
      return ['MAJOR','MINOR','PATCH'].every((key,i)=>new RegExp('#define\\s+NODE_'+key+'_VERSION\\s+'+Number(parts[i+1])+'(?:\\s|$)').test(text));
    });
  }catch{return false;}
}
function corepackCache(root:string,relative:string):boolean {
  try {
    const directory=path.join(root,relative);
    for(const name of fs.readdirSync(directory)){
      if(!['yarn','pnpm','npm'].includes(name)||!safeStoragePath(root,path.join(directory,name)))return false;
      for(const version of fs.readdirSync(path.join(directory,name))){
        const entry=path.join(directory,name,version);if(!safeStoragePath(root,entry))return false;
        const info=cacheJson(path.join(entry,'.corepack')),pkg=cacheJson(path.join(entry,'package.json'));
        if(info.locator?.name!==name||info.locator?.reference?.split('+')[0]!==version||pkg.name!==name||pkg.version!==version||!/^sha(?:224|256|384|512)\.[a-f0-9]+$/.test(info.hash??''))return false;
      }
    }
    return true;
  }catch{return false;}
}
