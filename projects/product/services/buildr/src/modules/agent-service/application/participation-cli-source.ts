import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registeredProductInstallations } from '../../installation/module.ts';
import type { ParticipationSource } from '@buildr-ai/buildr-agent';

/** Only exact, currently authorized installation/development entry targets. Never resolves PATH or runs programs. */
export function observeParticipationCli(identity:unknown, locator:string|undefined):ParticipationSource|undefined {
  if(!locator||!path.isAbsolute(locator))return;
  const product=identity as {package?:string;channel?:string;sourceRoot?:string;installationIdentity?:string};
  if(product.package!=='@buildr-ai/buildr')return;
  let entries:string[]=[];
  if(product.channel==='development'&&typeof product.sourceRoot==='string')entries=[path.resolve(product.sourceRoot,'../../buildr')];
  else if(product.installationIdentity){
    const registered=registeredProductInstallations();
    entries=registered.installations.filter((item:any)=>item.status==='installed'&&item.entry?.origin?.ownershipIdentity===product.installationIdentity).map((item:any)=>item.entry.entryPath);
  }
  try {
    const target=fs.realpathSync(locator),info=fs.statSync(target);
    if(!info.isFile()||info.size>1024*1024)return;
    const authorized=entries.some(entry=>{try{const known=fs.realpathSync(entry),stat=fs.statSync(known);return known===target&&stat.dev===info.dev&&stat.ino===info.ino;}catch{return false;}});
    if(!authorized)return;
    const content=fs.readFileSync(target);const after=fs.statSync(target);
    if(after.ino!==info.ino||after.dev!==info.dev||after.mtimeMs!==info.mtimeMs||after.size!==info.size)return;
    return {identity:'buildr:cli:'+target,name:'Buildr CLI',kind:'cli',providedBy:'buildr',managedBy:'buildr',status:'confirmed',locator:target,offeredVersion:'sha256-'+createHash('sha256').update(content).digest('hex')};
  } catch { return; }
}
