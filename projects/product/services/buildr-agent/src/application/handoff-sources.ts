import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {ConversationEntry,HandoffRound,HandoffMaterial} from '../contracts.ts';
import type {NativeToolContent} from '../native-content-contracts.ts';
import {entryContentRevision} from '../domain/entry-revision.ts';
import {fail} from '../domain/agent-state.ts';
import {safeStoragePath} from '../storage/files.ts';

/** Strip tool bodies before organizing, hashing or serializing handoff material. */
export function handoffEntry(entry:ConversationEntry):ConversationEntry {
 if(entry.kind!=='tool')return entry;
 return {id:entry.id,sequence:entry.sequence,kind:entry.kind,role:entry.role,text:'',createdAt:entry.createdAt,
  provider:entry.provider,participantId:entry.participantId,runId:entry.runId,name:entry.name,status:entry.status,
  parentToolId:entry.parentToolId,presentedFiles:entry.presentedFiles,detail:{revision:entry.detail?.revision??entryContentRevision(entry)}};
}
export interface HandoffHistoryQuery {sourceId:string;roundId?:string;cursor?:number;limit?:number}
export interface HandoffHistoryPage {entries:ConversationEntry[];nextCursor?:number;truncatedIds:string[];unavailable:Array<{id:string;revision:string;reason:string}>}
type SourceEntry={id:string;sequence:number;revision:string;runId?:string;tool?:ConversationEntry;native?:NativeToolContent};
interface SourceIndex {version:2;conversationId:string;from:number;through:number;records:SourceEntry[];rounds:HandoffRound[];images:unknown[]}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function sourceDirectory(root:string,id:string,create=false):string {
 if(!/^[a-f0-9-]{36}$/.test(id))fail('agent_handoff_source_invalid','交接来源身份无效。');
 let directory=root;
 for(const segment of ['handoff-materials',id]){
  directory=path.join(directory,segment);if(create)fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())fail('agent_handoff_source_unsafe','交接来源目录不可安全读取。',409);
 }
 return directory;
}
export function handoffRoundReference(round:HandoffRound):HandoffRound {
 return {id:round.id,title:round.title,from:round.from,through:round.through,state:round.state,diagnostic:round.diagnostic,provider:round.provider,model:round.model,
  finalReplyId:round.finalReplyId,executionCount:round.executionCount??round.execution.length,artifactCount:round.artifactCount??round.artifacts.length,userInputs:[],assistantNotes:[],execution:[],artifacts:[]};
}
/** Immutable identities only; authoritative text stays in Buildr or the native session. */
export function handoffSources(root:string,id:string,entries:ConversationEntry[],rounds:HandoffRound[],images:Array<{id:string;available:boolean;path?:string;mimeType?:string}>=[],native?:(entry:ConversationEntry)=>NativeToolContent|undefined):{index:string;sourceId:string;rounds:HandoffRound[]}{
 const records:SourceEntry[]=entries.map(e=>({id:e.id,sequence:e.sequence,revision:e.detail?.revision??entryContentRevision(e),runId:e.runId,...(e.kind==='tool'?{tool:handoffEntry(e),native:native?.(e)}:{})}));
 const value:SourceIndex={version:2,conversationId:id,from:entries[0]?.sequence??0,through:entries.at(-1)?.sequence??0,records,rounds:rounds.map(handoffRoundReference),images};
 const identity=hash(JSON.stringify(value)),sourceId=`index-${identity}.json`,file=path.join(sourceDirectory(root,id,true),sourceId),body=JSON.stringify(value)+'\n';
 try{fs.writeFileSync(file,body,{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||fs.readFileSync(file,'utf8')!==body)fail('agent_handoff_source_changed','交接来源已变化。',409);}
 return {index:file,sourceId,rounds:rounds.map(round=>({...round,sourcePath:`${file}；history ${JSON.stringify({sourceId,roundId:round.id})}`}))};
}
function loadHandoffSource(root:string,id:string,sourceId:string):SourceIndex {
 if(!/^index-[a-f0-9]{64}\.json$/.test(sourceId))fail('agent_handoff_source_invalid','交接来源身份无效。',400);
 let index:SourceIndex;
 try{
  const file=path.join(sourceDirectory(root,id),sourceId),fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||stat.size>32*1024*1024)throw Error();const body=fs.readFileSync(fd,'utf8');index=JSON.parse(body);if(hash(JSON.stringify(index))!==sourceId.slice(6,-5)||index.version!==2||index.conversationId!==id||!Array.isArray(index.records)||!Array.isArray(index.rounds))throw Error();}finally{fs.closeSync(fd);}
 }catch{fail('agent_handoff_source_unavailable','交接来源缺失或已变化，不能据此重放工作。',409);}
 return index;
}
export function handoffSourceEntry(root:string,id:string,sourceId:string,entryId:string,revision:string) {
 const ref=loadHandoffSource(root,id,sourceId).records.find(entry=>entry.id===entryId&&entry.revision===revision);
 if(!ref)fail('agent_handoff_entry_missing','该来源中没有此条目及修订。',404);
 return ref;
}
const handoffIndex=/^index-[a-f0-9]{64}\.json$/u,handoffRound=/^round-[a-f0-9]{64}\.json$/u;
function readHandoffFile(file:string):string|undefined {
 try{
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||stat.size>32*1024*1024)return undefined;return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}
 }catch{return undefined;}
}
/** Only structured native identities count; body text that happens to mention a
 * path is not a durable reference. */
function storedNativeReferences(value:unknown):NativeToolContent[] {
 const references:NativeToolContent[]=[];
 const seen=new Set<unknown>();
 const walk=(node:unknown):void=>{
  if(!node||typeof node!=='object'||seen.has(node))return;
  seen.add(node);
  if(Array.isArray(node)){for(const item of node)walk(item);return;}
  const record=node as Partial<NativeToolContent>&{session?:{config?:unknown}};
  const provider=record.provider;
  if((provider==='codex'||provider==='dsh')&&(typeof record.contextId==='string'||typeof record.session?.config==='string'))
   references.push(record as NativeToolContent);
  for(const child of Object.values(record))walk(child);
 };
 walk(value);return references;
}
/** Every immutable index is durable evidence for native sessions. An
 * unreadable or unsafe index proves nothing and retains the affected scope.
 * Legacy v1 indexes hashed their pre-projection input, so their file identity
 * cannot be recomputed; they are accepted only through independently verified
 * round files. */
export function handoffNativeReferences(root:string):{complete:boolean;references:NativeToolContent[]} {
 const references:NativeToolContent[]=[];
 try{
  const base=path.join(root,'handoff-materials');
  if(!fs.existsSync(base))return {complete:true,references};
  if(!safeStoragePath(root,base))return {complete:false,references};
  for(const conversation of fs.readdirSync(base).sort()){
   const directory=path.join(base,conversation);
   if(!safeStoragePath(root,directory))return {complete:false,references};
   const names=fs.readdirSync(directory).sort(),rounds=new Set<string>();
   for(const name of names){
    if(!handoffRound.test(name))continue;
    const body=readHandoffFile(path.join(directory,name));
    if(body===undefined)return {complete:false,references};
    let value:unknown;
    try{value=JSON.parse(body);}catch{return {complete:false,references};}
    if(hash(JSON.stringify(value))!==name.slice(6,-5))return {complete:false,references};
    rounds.add(name);references.push(...storedNativeReferences(value));
   }
   for(const name of names){
    if(!handoffIndex.test(name))continue;
    const file=path.join(directory,name),body=readHandoffFile(file);
    if(body===undefined)return {complete:false,references};
    let index:{version?:unknown;conversationId?:unknown;records?:unknown;rounds?:unknown};
    try{index=JSON.parse(body);}catch{return {complete:false,references};}
    if(hash(JSON.stringify(index))===name.slice(6,-5)&&index.version===2&&index.conversationId===conversation&&Array.isArray(index.records)&&Array.isArray(index.rounds)){
     for(const record of index.records as SourceEntry[])if(record.native)references.push(record.native);
     continue;
    }
    if(!('version' in index)&&index.conversationId===conversation&&Array.isArray(index.rounds)
     &&(index.rounds as Array<{path?:unknown}>).every(round=>typeof round?.path==='string'&&handoffRound.test(path.basename(round.path))&&rounds.has(path.basename(round.path))))continue;
    return {complete:false,references};
   }
  }
  return {complete:true,references};
 }catch{return {complete:false,references};}
}
export function readHandoffSource(root:string,id:string,query:HandoffHistoryQuery,read:(entry:SourceEntry)=>ConversationEntry|undefined):HandoffHistoryPage {
 const {sourceId,roundId,cursor=0,limit=30}=query??{};
 if(typeof sourceId!=='string'||!/^index-[a-f0-9]{64}\.json$/.test(sourceId)||roundId!==undefined&&(typeof roundId!=='string'||!roundId)||!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('agent_handoff_source_invalid','来源、轮次或续读位置无效。',400);
 const index=loadHandoffSource(root,id,sourceId);
 const round=roundId===undefined?undefined:index.rounds.find(r=>r.id===roundId);if(roundId!==undefined&&!round)fail('agent_handoff_round_missing','来源中没有此轮记录。',404);
 const records=index.records.filter(e=>!round||e.runId===round.id||!e.runId&&e.sequence>=round.from&&e.sequence<=round.through);
 if(cursor>records.length)fail('agent_handoff_source_invalid','来源续读位置超出范围。',400);
 const page:HandoffHistoryPage={entries:[],truncatedIds:[],unavailable:[]};let position=cursor,bytes=0;
 const append=(entry:ConversationEntry)=>{const size=Buffer.byteLength(JSON.stringify(entry));if(size>1024*1024)fail('agent_handoff_source_budget','该条元数据超过读取预算，请按准确条目读取。',413);if(bytes+size>1024*1024)return false;bytes+=size;page.entries.push(entry);return true;};
 for(const ref of records.slice(cursor,cursor+limit)){
  position++;
  if(ref.tool){if(!append(ref.tool)){position--;break;}continue;}
  try{
   const entry=read(ref);if(!entry)throw Error('条目或原修订不可用');
   if(entry.kind==='handoff'||entry.kind==='thinking'||entry.thinking)throw Error('来源不是可见消息');
   const truncated=entry.text.length>8192,candidate={...entry,text:truncated?entry.text.slice(0,8192):entry.text,detail:{revision:ref.revision}};
   if(!append(candidate)){position--;break;}if(truncated)page.truncatedIds.push(entry.id);
  }catch{page.unavailable.push({id:ref.id,revision:ref.revision,reason:'条目或原修订不可用；未返回当前内容代替。'});}
 }
 if(position<records.length)page.nextCursor=position;
 return page;
}
/** Public receipts are navigation, not a second copy of the sent prompt. */
export function handoffReceipt(material:HandoffMaterial):HandoffMaterial {
 if(!material.sourceId)return material;
 return {...material,sourceOnly:true,bodyDigest:hash(material.body),rounds:material.rounds.map(handoffRoundReference),body:`按轮次读取交接来源 ${material.sourceId}；覆盖记录至 #${material.sourceThrough}。`};
}
