import path from 'node:path';
import fs from 'node:fs';
import type { AgentExecutor } from '../../contracts.ts';
import type { NativeContentContext, NativeContentInventory, NativeToolContent } from '../../native-content-contracts.ts';
import { nativeContentFiles, nativeContentImages, nativeContentRows } from '../native-content.ts';
import { nativeToolContext, nativeToolRows } from '../native-tool-source.ts';
import { parseReference, visibleText } from '../native-process.ts';
import { claudeInputId, claudeItems, ClaudeItemProjector } from './protocol.ts';
import { nativeContentPath, maxNativeSourceBytes } from '../../storage/native-content.ts';

const uuid=/^[a-f0-9-]{36}$/;
function primary(input:NativeContentContext):string|undefined {
  if(!uuid.test(input.contextId))return;
  const files=nativeContentFiles(input,path.join(input.configRoot,'claude-config','projects'),file=>path.basename(file)===input.contextId+'.jsonl',3);
  return files.length===1?files[0]:undefined;
}
function owns(input:NativeContentContext,row:any):boolean {
  return row.sessionId===input.contextId&&row.cwd===input.cwd;
}
/** A seek cursor observes only new durable native input receipts. It neither
 * creates a transcript nor treats a successful stdin write as admission. */
export class ClaudeReceiptCursor {
  private readonly input:NativeContentContext;
  private file?:string;
  private offset=0;
  private identity?:string;
  private tail=Buffer.alloc(0);
  constructor(input:NativeContentContext){
    this.input=input;
    this.file=primary(input);
    if(this.file){const info=fs.lstatSync(this.file);this.offset=info.size;this.identity=`${info.dev}:${info.ino}`;}
  }
  read(expected:ReadonlySet<string>):string[]{
    this.file??=primary(this.input);if(!this.file)return[];
    const relative=path.relative(this.input.root,this.file).split(path.sep).join('/');
    const file=nativeContentPath(this.input.root,'claude-code',relative);
    const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
    const receipts:string[]=[];
    try{
      const info=fs.fstatSync(fd),identity=`${info.dev}:${info.ino}`;
      if(!info.isFile()||info.nlink!==1||this.identity&&this.identity!==identity||info.size<this.offset)throw new Error('agent_claude_receipt_source_changed');
      this.identity=identity;
      const buffer=Buffer.alloc(64*1024),end=Math.min(info.size,this.offset+8*1024*1024);
      while(this.offset<end){
        const length=fs.readSync(fd,buffer,0,Math.min(buffer.length,end-this.offset),this.offset);if(!length)break;
        this.offset+=length;this.tail=Buffer.concat([this.tail,buffer.subarray(0,length)]);
        let newline:number;
        while((newline=this.tail.indexOf(10))>=0){
          const line=this.tail.subarray(0,newline);this.tail=Buffer.from(this.tail.subarray(newline+1));
          if(line.length>maxNativeSourceBytes)throw new Error('agent_claude_receipt_budget');
          if(!line.length)continue;
          const row=JSON.parse(line.toString('utf8'));
          if(owns(this.input,row)&&row.type==='user'&&row.isSidechain!==true&&expected.has(row.uuid))receipts.push(row.uuid);
        }
        if(this.tail.length>maxNativeSourceBytes)throw new Error('agent_claude_receipt_budget');
      }
      return receipts;
    }finally{fs.closeSync(fd);}
  }
}
export function claudeContent(input:NativeContentContext):NativeContentInventory|undefined {
  try{
    const file=primary(input);if(!file)return;
    const rows=nativeContentRows(input,'claude-code',file);
    const messages=rows.filter(row=>['user','assistant'].includes(row.value.type));
    if(!messages.length||messages.some(row=>!owns(input,row.value)||row.value.isSidechain===true))return;
    return {sourcePaths:[file],records:rows.flatMap(row=>{
      const parts=Array.isArray(row.value.message?.content)?row.value.message.content:[];
      const toolIds=parts.flatMap((part:any)=>part.type==='tool_use'?[part.id]:part.type==='tool_result'?[part.tool_use_id]:[]);
      return toolIds.length?[{...row,toolIds}]:[];
    }),images:rows.filter(row=>row.value.type==='user').flatMap(row=>nativeContentImages(row,['message','content'],row.value.message?.content))};
  }catch{return;}
}
/** Explicit detail requests traverse a fixed append-only snapshot, never a whole-file cache. */
export function readClaudeTool(root:string,reference:NativeToolContent){
  try{
    const input=nativeToolContext(root,reference,'claude-code');if(!input)return;
    const file=primary(input);if(!file)return;
    let files=[file];
    const parent=reference.session?.parentToolId;
    if(parent){
      let calls=0;const agentIds=new Set<string>();
      for(const row of nativeToolRows(input,'claude-code',file)){
        if(!owns(input,row)||row.isSidechain===true)continue;
        const parts=Array.isArray(row.message?.content)?row.message.content:[];
        calls+=parts.filter((part:any)=>part.type==='tool_use'&&part.id===parent).length;
        if(parts.some((part:any)=>part.type==='tool_result'&&part.tool_use_id===parent)){
          const id=row.toolUseResult?.agentId;
          if(typeof id==='string'&&/^[a-zA-Z0-9_-]+$/.test(id))agentIds.add(id);
        }
      }
      if(calls!==1)return;
      files=nativeContentFiles(input,path.join(path.dirname(file),input.contextId,'subagents'),name=>[...agentIds].some(id=>path.basename(name)===`agent-${id}.jsonl`),2);
    }
    let call:any,result:any,nativeResult:any,callRow:string|undefined,ambiguous=false;
    for(const source of files)for(const row of nativeToolRows(input,'claude-code',source)){
      if(!owns(input,row)||Boolean(row.isSidechain)!==Boolean(parent))continue;
      for(const part of Array.isArray(row.message?.content)?row.message.content:[]){
        if(part.type==='tool_use'&&part.id===reference.nativeId){
          if(callRow&&callRow!==row.uuid)ambiguous=true;
          call=part;callRow=row.uuid;
        }
        if(part.type==='tool_result'&&part.tool_use_id===reference.nativeId){
          if(row.sourceToolAssistantUUID&&row.sourceToolAssistantUUID!==callRow)continue;
          result=part;nativeResult=row.toolUseResult;
        }
      }
    }
    if(!call||!result||ambiguous)return;
    const text=nativeResult&&[nativeResult.stdout,nativeResult.stderr].some(value=>typeof value==='string')
      ?[nativeResult.stdout,nativeResult.stderr].filter(value=>typeof value==='string'&&value).join('\n'):visibleText(result.content);
    return {...reference.entry,input:JSON.stringify(call.input??{}),text};
  }catch{return;}
}
function context(input:{configRoot:string;contextRef:{id:string;data?:Record<string,unknown>};cwd:string;bindingIdentity:string}):NativeContentContext|undefined {
  try{
    if(parseReference(String(input.contextRef.data?.native??''),'claude-code',input.cwd,input.bindingIdentity).nativeSessionId!==input.contextRef.id)return;
    const root=path.resolve(input.configRoot,input.configRoot.includes(`${path.sep}model-bindings${path.sep}`)?'../../../..':'../..');
    return {root,configRoot:input.configRoot,contextId:input.contextRef.id,cwd:input.cwd};
  }catch{return;}
}
export const readClaudeSupplementReceipt:NonNullable<AgentExecutor['readSupplementReceipt']>=async input=>{
  try{
    const source=context(input),file=source&&primary(source);if(!source||!file)return;
    const id=claudeInputId(input.clientRequestId);
    for(const row of nativeToolRows(source,'claude-code',file)){
      if(owns(source,row)&&row.isSidechain!==true&&row.type==='user'&&row.uuid===id&&visibleText(row.message?.content)===input.text)return {inputItemId:id};
    }
  }catch{return;}
};
export const readClaudePersistedExecution:NonNullable<AgentExecutor['readPersistedExecution']>=async input=>{
  try{
    const source=context(input),file=source&&primary(source);if(!source||!file||!input.nativeInputs?.length)return;
    const ids=new Set(input.nativeInputs.map(value=>claudeInputId(value.clientRequestId)));
    const items=new Map<string,ReturnType<typeof claudeItems>[number]>();
    const projector=new ClaudeItemProjector();
    let found=false,finished=false,endedAt:string|undefined;
    const tools=new Map<string,{id:string;label:string;status:'running'|'completed'|'unknown'}>();
    const independent=new Set<string>();
    for(const row of nativeToolRows(source,'claude-code',file)){
      if(!owns(source,row)||row.isSidechain===true)continue;
      if(row.type==='user'&&ids.has(row.uuid)){found=true;finished=false;ids.delete(row.uuid);}
      if(!found)continue;
      if(row.type==='user'&&!ids.has(row.uuid)&&Array.isArray(row.message?.content)&&row.message.content.some((p:any)=>p.type==='text')&&items.size&&finished)break;
      for(const item of projector.items(row,input.executionRef.id)){
        items.set(item.id,{...items.get(item.id),...item});
        if(item.kind==='tool')tools.set(item.id,{id:item.id,label:item.name??tools.get(item.id)?.label??'工具',status:item.status==='running'?'running':'completed'});
      }
      for(const part of Array.isArray(row.message?.content)?row.message.content:[]){
        if(part.type==='tool_use'&&part.input?.run_in_background===true)independent.add(part.id);
        if(part.type==='tool_result'&&(row.toolUseResult?.isAsync||row.toolUseResult?.backgroundTaskId))independent.add(part.tool_use_id);
      }
      if(row.type==='assistant'&&['end_turn','stop_sequence'].includes(row.message?.stop_reason)){finished=true;endedAt=row.timestamp;}
    }
    if(!found)return;
    for(const id of independent){const tool=tools.get(id);if(tool)tool.status='unknown';}
    const ended=finished&&!ids.size&&!independent.size&&[...tools.values()].every(tool=>tool.status==='completed');
    return {items:[...items.values()],observation:{status:ended?'idle':'unknown',executionRef:input.executionRef,tools:[...tools.values()],...(ended?{backgroundWork:false}:{}),...(!ended?{diagnostic:'agent_claude_terminal_unproven'}:{})},...(ended&&endedAt?{endedAt}:{})};
  }catch{return;}
};
