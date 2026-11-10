import fs from 'node:fs';
import path from 'node:path';
import { safeStoragePath } from './files.ts';

export interface HomeStorageObject {
  path:string; home:string; provider:string; logicalBytes:number; allocatedBytes:number;
  files:number; complete:boolean; classification:'tool-cache'|'nested-buildr'|'private-state'|'needs-owner-analysis';
  action:'evaluate-tool-policy'|'inspect-runtime-references'|'retain-private'|'investigate-owner';
}
/** Metadata only. A discovery row is never a collector candidate. Accounts and
 * tools are not inferred to be disposable from their name, size, or age. */
export interface HomeDiscoveryCursor { home:string; pending:Array<{directory:string;after:string}> }
export function discoverHomeStorage(root:string, options:{maximumNodes?:number;budgetMs?:number;now?:number;cursor?:HomeDiscoveryCursor}={}) {
  if(options.cursor&&(!Array.isArray(options.cursor.pending)||options.cursor.pending.length>64||typeof options.cursor.home!=='string'||options.cursor.pending.some(frame=>!frame||typeof frame.directory!=='string'||typeof frame.after!=='string')))options={...options,cursor:undefined};
  const connectionRoot=path.join(root,'connections'), homes:Array<{home:string;provider:string}>=[];
  const objects:HomeStorageObject[]=[];
  const installationLocks:string[]=[];
  if(!safeStoragePath(root,connectionRoot))return {complete:true,observedNodes:0,objects};
  for(const provider of fs.readdirSync(connectionRoot).sort()){
    if(!/^[a-z][a-z0-9-]*$/.test(provider))continue;
    const account=path.join(connectionRoot,provider),configs=[account],bindings=path.join(account,'model-bindings');
    if(safeStoragePath(root,bindings))for(const id of fs.readdirSync(bindings).sort())if(/^[a-f0-9]{64}$/.test(id))configs.push(path.join(bindings,id));
    for(const config of configs){const home=path.join(config,'home');if(safeStoragePath(root,home))homes.push({home,provider});}
  }
  // Rotate the starting HOME so a large earlier account cannot starve peers.
  const resumed=options.cursor&&homes.findIndex(item=>item.home===options.cursor!.home);
  const start=typeof resumed==='number'&&resumed>=0?resumed:homes.length?Math.floor((options.now??Date.now())/60_000)%homes.length:0;
  const ordered=[...homes.slice(start),...homes.slice(0,start)];
  let nodes=0,complete=true;let nextCursor:HomeDiscoveryCursor|undefined;
  const limit=options.maximumNodes??150_000,deadline=Date.now()+(options.budgetMs??1500);
  for(const {home,provider}of ordered){
    const groups=new Map<string,HomeStorageObject>();let finished=true;
    const saved=options.cursor?.home===home?options.cursor.pending:undefined;
    const listings=new Map<string,string[]>();
    const pending=saved?.length?saved.map(item=>({...item})):[{directory:'',after:''}];
    while(pending.length){
      if(nodes>=limit||Date.now()>deadline){finished=false;complete=false;break;}
      const frame=pending[pending.length-1]!,directory=path.join(home,frame.directory);
      if(frame.directory&&(path.relative(home,directory).startsWith('..')||!safeStoragePath(root,directory))){pending.pop();continue;}
      let names:string[];
      try{if(!listings.has(directory))listings.set(directory,fs.readdirSync(directory).sort().filter(name=>name>frame.after).reverse());names=listings.get(directory)!;}catch{pending.pop();complete=false;continue;}
      if(!names.length){pending.pop();continue;}
      // Advance one entry at a time so an arbitrarily large directory can resume.
      const name=names.pop()!;frame.after=name;const file=path.join(directory,name);nodes++;let stat:fs.Stats;
      try{stat=fs.lstatSync(file);}catch{complete=false;continue;}
      if(stat.isSymbolicLink())continue;
      const relative=path.relative(home,file).split(path.sep).join('/');
      const known=/^(Library\/Caches\/(?:Yarn|node-gyp|pip|com\.apple\.python)|\.npm\/_cacache|\.cache\/(?:node\/corepack|pip|uv)|Library\/Application Support\/(?:Buildr Dev|Buildr))(?:\/|$)/.exec(relative);
      const key=known?.[1]??relative.split('/')[0]!;
      const nested=/^Library\/Application Support\/Buildr/.test(key),cache=!!known&&!nested;
      const privateState=/^\.(?:ssh|aws|config|qoder|codex|dsh)(?:-|$)/.test(key);
      if(!groups.has(key))groups.set(key,{path:path.join(home,key),home,provider,logicalBytes:0,allocatedBytes:0,files:0,complete:true,
        classification:nested?'nested-buildr':cache?'tool-cache':privateState?'private-state':'needs-owner-analysis',
        action:nested?'inspect-runtime-references':cache?'evaluate-tool-policy':privateState?'retain-private':'investigate-owner'});
      const group=groups.get(key)!;
      if(!privateState&&stat.isFile()&&name==='.package-lock.json'&&path.basename(directory)==='node_modules'&&installationLocks.length<128)installationLocks.push(file);
      if(stat.isDirectory()&&pending.length<64)pending.push({directory:relative,after:''});
      else if(stat.isFile()){group.logicalBytes+=stat.size;group.allocatedBytes+=stat.blocks*512;group.files++;}
    }
    if(!finished)nextCursor={home,pending};
    if(!finished||saved?.length)for(const group of groups.values())group.complete=false;
    objects.push(...groups.values());
    if(!finished)break;
  }
  return {complete,cursor:nextCursor,installationLocks,observedNodes:nodes,totalHomes:homes.length,objects:objects.sort((a,b)=>b.logicalBytes-a.logicalBytes).slice(0,128)};
}
