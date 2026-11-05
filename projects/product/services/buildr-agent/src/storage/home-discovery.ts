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
export function discoverHomeStorage(root:string, options:{maximumNodes?:number;budgetMs?:number;now?:number}={}) {
  const connectionRoot=path.join(root,'connections'), homes:Array<{home:string;provider:string}>=[];
  const objects:HomeStorageObject[]=[];
  if(!safeStoragePath(root,connectionRoot))return {complete:true,observedNodes:0,objects};
  for(const provider of fs.readdirSync(connectionRoot).sort()){
    if(!/^[a-z][a-z0-9-]*$/.test(provider))continue;
    const account=path.join(connectionRoot,provider),configs=[account],bindings=path.join(account,'model-bindings');
    if(safeStoragePath(root,bindings))for(const id of fs.readdirSync(bindings).sort())if(/^[a-f0-9]{64}$/.test(id))configs.push(path.join(bindings,id));
    for(const config of configs){const home=path.join(config,'home');if(safeStoragePath(root,home))homes.push({home,provider});}
  }
  // Rotate the starting HOME so a large earlier account cannot starve peers.
  const start=homes.length?Math.floor((options.now??Date.now())/60_000)%homes.length:0;
  const ordered=[...homes.slice(start),...homes.slice(0,start)];
  let nodes=0,complete=true;
  const limit=options.maximumNodes??150_000,deadline=Date.now()+(options.budgetMs??1500);
  for(const {home,provider}of ordered){
    const groups=new Map<string,HomeStorageObject>(),queue=[home];let cursor=0,finished=true;
    while(cursor<queue.length){
      if(nodes>=limit||Date.now()>deadline){finished=false;complete=false;break;}
      const directory=queue[cursor++]!;let names:string[];
      try{names=fs.readdirSync(directory).sort();}catch{finished=false;complete=false;continue;}
      for(const name of names){
        if(nodes>=limit||Date.now()>deadline){finished=false;complete=false;break;}
        const file=path.join(directory,name);nodes++;let stat:fs.Stats;
        try{stat=fs.lstatSync(file);}catch{finished=false;complete=false;continue;}
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
        if(stat.isDirectory())queue.push(file);
        else if(stat.isFile()){group.logicalBytes+=stat.size;group.allocatedBytes+=stat.blocks*512;group.files++;}
      }
    }
    if(!finished)for(const group of groups.values())group.complete=false;
    objects.push(...groups.values());
    if(!finished)break;
  }
  return {complete,observedNodes:nodes,totalHomes:homes.length,objects:objects.sort((a,b)=>b.logicalBytes-a.logicalBytes).slice(0,128)};
}
