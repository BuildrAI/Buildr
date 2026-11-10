import path from 'node:path';
import type { NativeContentContext, NativeContentInventory, NativeToolContent } from '../../native-content-contracts.ts';
import { nativeContentFiles, nativeContentImages, nativeContentRows } from '../native-content.ts';
import { NativeContentReader } from '../../storage/native-content.ts';
import {nativeToolContext,nativeToolRows} from '../native-tool-source.ts';
import {DshExecutionLineage,dshItem} from './protocol.ts';

export function readDshTool(root:string,reference:NativeToolContent) {
  const input=nativeToolContext(root,reference,'dsh');if(!input)return;
  try{
    const files=nativeContentFiles(input,path.join(input.configRoot,'dsh-home/sessions'),file=>path.basename(path.dirname(file))===input.contextId&&/^session\.v4\.jsonl(?:\.zstd)?$/.test(path.basename(file)),4);
    if(files.length!==1)return;
    const lineage=new DshExecutionLineage(input.contextId);
    let header=false,sequence=0,call:ReturnType<typeof dshItem>[number]|undefined,result:typeof call,owner:string|undefined,ambiguous=false;
    for(const row of nativeToolRows(input,'dsh',files[0]!)){
      if(!header){
        if(row.type!=='session'||row.version!==4||row.id!==input.contextId||row.cwd!==input.cwd)return;
        header=true;continue;
      }
      if(row.seq!==sequence++)return;
      lineage.record(row);
      const turn=lineage.turns.get(row.data?.turn??lineage.currentTurn!);
      if(reference.session?.turnId&&turn!==reference.session.turnId)continue;
      const id=row.type==='tool/call'?row.data?.callId:row.type==='tool/result'?row.data?.message?.toolCallId:undefined;
      if(id!==reference.nativeId)continue;
      if(call&&owner!==turn)ambiguous=true;
      owner=turn;
      if(row.type==='tool/call')call=dshItem(row,true)[0];
      else result=dshItem(row,true)[0];
    }
    if(!header||!call||!result||ambiguous)return;
    return {...reference.entry,input:call.input,text:result.text};
  }catch{return;}
}

export function dshContent(input: NativeContentContext): NativeContentInventory | undefined {
  if (!/^session-[a-f0-9-]{36}$/.test(input.contextId)) return;
  const files = nativeContentFiles(input, path.join(input.configRoot, 'dsh-home/sessions'), file => path.basename(path.dirname(file)) === input.contextId && /^session\.v4\.jsonl(?:\.zstd)?$/.test(path.basename(file)), 4);
  if (files.length !== 1) return;
  const rows = nativeContentRows(input, 'dsh', files[0]!), header = rows[0]?.value;
  if (header?.type !== 'session' || header.version !== 4 || header.id !== input.contextId || header.cwd !== input.cwd ||
    rows.slice(1).some((row, index) => row.value.seq !== index)) return;
  const images=rows.filter(row=>row.value.type==='user/message').flatMap(row=>nativeContentImages(row,['data','content'],row.value.data?.content));
  // DSH stores normalized, immutable images separately. The accepted native
  // event must name the content digest; a handle alone is never sufficient.
  for(const row of rows.filter(row=>row.value.type==='user/message'))for(const part of row.value.data?.content??[]) {
    const ref=part.type==='image'?part.attachment:undefined,hash=ref?.attachmentId?.match(/^sha256:([a-f0-9]{64})$/)?.[1];
    if(!hash||!Number.isSafeInteger(ref.bytes)||ref.bytes<1||ref.bytes>32*1024*1024)continue;
    const relative=path.relative(input.root,path.join(input.configRoot,'dsh-home/attachments/v1/objects',hash.slice(0,2),hash)).split(path.sep).join('/');
    try {
      const value={source:{path:relative,offset:0,length:ref.bytes,sha256:hash,codec:'bytes' as const},pointer:[]};
      new NativeContentReader(input.root).attachment({version:1,provider:'dsh',contextId:input.contextId,value,size:ref.bytes,sha256:hash});
      images.push({value,mimeType:ref.mediaType});
    }catch{/* Missing or changed native media remains local. */}
  }
  return { sourcePaths: files, records: rows.flatMap(row => {
    const id = row.value.type === 'tool/call' ? row.value.data?.callId : row.value.type === 'tool/result' ? row.value.data?.message?.toolCallId : undefined;
    return typeof id === 'string' ? [{ ...row, toolIds: [id] }] : [];
  }), images };
}
