import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {ConversationEntry,HandoffRound} from '../contracts.ts';
import {fail} from '../domain/agent-state.ts';

/** Derived local reading projection. Original conversation storage remains authoritative. */
export function handoffSources(root:string,id:string,entries:ConversationEntry[],rounds:HandoffRound[],images:Array<{id:string;available:boolean;path?:string;mimeType?:string}>=[]):{index:string;rounds:HandoffRound[]}{
 if(!/^[a-f0-9-]{36}$/.test(id))fail('agent_handoff_source_invalid','交接来源身份无效。');
 const digest=createHash('sha256').update(JSON.stringify({entries,images,rounds})).digest('hex');
 const parts=[root,'handoff-materials',id];let directory=parts[0]!;
 for(const segment of parts.slice(1)){
  directory=path.join(directory,segment);fs.mkdirSync(directory,{recursive:true,mode:0o700});const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())fail('agent_handoff_source_unsafe','交接来源目录不可安全读取。',409);
 }
 const write=(name:string,value:unknown)=>{const file=path.join(directory,name),body=JSON.stringify(value,null,2)+'\n';
  try{fs.writeFileSync(file,body,{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||fs.readFileSync(file,'utf8')!==body)fail('agent_handoff_source_changed','本地交接资料已变化，请重新核对。',409);}
  return file;
 };
 const enriched=rounds.map(round=>{const data={round,records:entries.filter(e=>e.runId===round.id||!e.runId&&e.sequence>=round.from&&e.sequence<=round.through)};const identity=createHash('sha256').update(JSON.stringify(data)).digest('hex');return {...round,sourcePath:write(`round-${identity}.json`,data)};});
 return {index:write(`index-${digest}.json`,{conversationId:id,images,from:entries[0]?.sequence??0,through:entries.at(-1)?.sequence??0,rounds:enriched.map(r=>({id:r.id,title:r.title,from:r.from,through:r.through,path:r.sourcePath}))}),rounds:enriched};
}
