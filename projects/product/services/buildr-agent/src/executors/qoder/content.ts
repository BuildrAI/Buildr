import path from 'node:path';
import type { NativeContentContext, NativeContentInventory, NativeToolContent } from '../../native-content-contracts.ts';
import { nativeContentFiles, nativeContentImages, nativeContentRows } from '../native-content.ts';
import {nativeToolContext,nativeToolRows} from '../native-tool-source.ts';
import {visibleText} from '../native-process.ts';

export function readQoderTool(root:string,reference:NativeToolContent) {
  const input=nativeToolContext(root,reference,'qoder');if(!input)return;
  try{
    const primary=nativeContentFiles(input,path.join(input.configRoot,'qoder-config/projects'),file=>path.basename(file)===input.contextId+'.jsonl',3);
    if(primary.length!==1)return;
    let files=primary;
    const parent=reference.session?.parentToolId;
    if(parent){
      if(!qoderToolRecord(input,primary[0]!,parent)?.call)return;
      files=nativeContentFiles(input,path.join(path.dirname(primary[0]!),input.contextId,'subagents'),file=>file.endsWith('.jsonl'),2);
    }
    let selected:ReturnType<typeof qoderToolRecord>;
    for(const file of files){
      // Earlier v3 references carried the SDK execution ID in turnId. It is
      // not a native prompt filter; prove the unique call and source message.
      const tool=qoderToolRecord(input,file,reference.nativeId!,parent);
      if(!tool?.result)continue;
      if(selected)return;selected=tool;
    }
    if(!selected?.call||!selected.result)return;
    return {...reference.entry,input:JSON.stringify(selected.call.input??{}),text:selected.result.text};
  }catch{return;}
}

function qoderToolRecord(input:NativeContentContext,file:string,id:string,parent?:string) {
  let execution:string|undefined,call:any,result:{text:string}|undefined,callOwner:string|undefined,ambiguous=false;
  const assistants=new Set<string>();
  for(const row of nativeToolRows(input,'qoder',file)){
    if(row.sessionId!==undefined&&row.sessionId!==input.contextId)return;
    if(!['user','assistant'].includes(row.type))continue;
    if(row.sessionId!==input.contextId||row.cwd!==input.cwd||row.isSidechain!==Boolean(parent)||parent&&row.parent_tool_use_id!==parent)return;
    const parts=Array.isArray(row.message?.content)?row.message.content:[];
    if(row.type==='user'&&!parts.some((p:any)=>p.type==='tool_result')&&row.origin?.kind!=='task-notification'&&
      (row.promptId||row.humanInput||execution===undefined)&&
      (row.humanInput||visibleText(row.message?.content)!=='[Request interrupted by user]'))execution=row.promptId??row.uuid;
    for(const part of parts){
      if(part.type==='tool_use'&&part.id===id){
        if(call&&callOwner!==execution)ambiguous=true;
        call=part;callOwner=execution;if(typeof row.uuid==='string')assistants.add(row.uuid);
      }
      if(part.type==='tool_result'&&part.tool_use_id===id&&call){
        const turn=row.promptId??execution;
        // Deferred results can carry a later promptId. The native source UUID
        // still identifies the original assistant call, whose owner was checked above.
        if(row.sourceToolAssistantUUID){
          if(!assistants.has(row.sourceToolAssistantUUID))continue;
        }else if(turn!==callOwner)continue;
        const native=row.toolUseResult;
        const text=native&&[native.stdout,native.stderr].some(value=>typeof value==='string')
          ? [native.stdout,native.stderr].filter(value=>typeof value==='string'&&value).join('\n')
          : visibleText(part.content);
        result={text};
      }
    }
  }
  if(!call||ambiguous)return;
  return {call,result};
}

export function qoderContent(input: NativeContentContext): NativeContentInventory | undefined {
  if (!/^[a-f0-9-]{36}$/.test(input.contextId)) return;
  const files = nativeContentFiles(input, path.join(input.configRoot, 'qoder-config/projects'), file => path.basename(file) === input.contextId + '.jsonl', 3);
  if (files.length !== 1) return;
  const rows = nativeContentRows(input, 'qoder', files[0]!);
  const messages=rows.filter(row=>['user','assistant'].includes(row.value.type));
  if (!messages.length || rows.some(row=>row.value.sessionId!==undefined && row.value.sessionId!==input.contextId) ||
    messages.some(row=>row.value.cwd!==input.cwd || row.value.sessionId!==input.contextId || row.value.isSidechain!==false)) return;
  return { sourcePaths: files, records: rows.flatMap(row => {
    const content = row.value.message?.content;
    const toolIds = (Array.isArray(content) ? content : []).flatMap((part: any) => part.type === 'tool_use' && typeof part.id === 'string' ? [part.id]
      : part.type === 'tool_result' && typeof part.tool_use_id === 'string' ? [part.tool_use_id] : []);
    return toolIds.length ? [{ ...row, toolIds }] : [];
  }), images: rows.filter(row => row.value.type === 'user')
    .flatMap(row => nativeContentImages(row, ['message', 'content'], row.value.message?.content)) };
}
