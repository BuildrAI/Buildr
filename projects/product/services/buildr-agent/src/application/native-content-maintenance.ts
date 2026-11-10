import fs from 'node:fs';
import path from 'node:path';
import type { StoredConversation, StoredParticipant } from '../domain/agent-state.ts';
import type { NativeContentInventory, NativeAttachmentContent } from '../native-content-contracts.ts';
import { createNativeExecutors } from '../executors/index.ts';
import { nativeToolReference, nativeContentFiles, nativeCommandIndex, nativeCommandPrefix } from '../executors/native-content.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { ConversationEntryStore } from '../persistence/conversation-entry-store.ts';
import { NativeContentStore } from '../persistence/native-content-store.ts';
import { claim } from '../process/ownership.ts';
import { NativeContentReader, nativeContentHash } from '../storage/native-content.ts';
import { observeStorageUse, safeStoragePath, safeStorageResource, storageInUse } from '../storage/files.ts';

import { configRoot, originalContext } from './native-content-resolver.ts';

const executors = createNativeExecutors();
export interface NativeContentMaintenanceResult {
  inspected: number; tools: number; attachments: number; contentBytesSaved: number; attachmentBytesRemoved: number;
  deferred: number; databaseBytesReclaimed: number; diagnostic?: string;
  nextEntry: number; nextAttachment: string;
  reasons:Record<string,{items:number;storedBytes:number;logicalBytes:number}>;
  localResidualBytes:number;
  attachmentReferences:number;
  attachmentReasons:Record<string,{items:number;storedBytes:number}>;
  entryItems:Array<{conversationId:string;revision:string;provider:string;reason:string;storedBytes:number;logicalBytes:number}>;
}

/** Runs only in the existing maintenance isolate. Never launches a native CLI or changes its files. */
export function maintainNativeContent(dataRoot: string, options: {dryRun?:boolean; maximumItems?:number; budgetMs?:number;after?:number;afterAttachment?:string;details?:boolean} = {}): NativeContentMaintenanceResult {
  const result: NativeContentMaintenanceResult = {inspected:0,tools:0,attachments:0,attachmentReferences:0,contentBytesSaved:0,attachmentBytesRemoved:0,deferred:0,databaseBytesReclaimed:0,nextEntry:options.after??0,nextAttachment:options.afterAttachment??'',reasons:{},attachmentReasons:{},localResidualBytes:0,entryItems:[]};
  const root=path.join(dataRoot,'agent-service'), repository=new ConversationRepository(root), reader=new NativeContentReader(root);
  const deadline=Date.now()+Math.max(100,Math.min(options.budgetMs??10000,60000)), limit=Math.max(1,Math.min(options.maximumItems??128,1024));
  let store:NativeContentStore|undefined, lock:ReturnType<typeof claim>|undefined;
  try {
    if (!safeStoragePath(dataRoot,root)) throw new Error('native_root_unsafe');
    if (!options.dryRun) lock=claim(dataRoot,'storage');
    store=new NativeContentStore(repository.filename,!options.dryRun);
    const dependencies=repository.storageDependencies();
    const blocked=new Set(dependencies.contexts), inventories=new Map<string,NativeContentInventory|undefined>();let inventoryReason='';
    const indexes=new Map<string,Map<string,string[]>>();
    // Old releases did not persist a context on every attempt. The stable tool
    // id can still locate its unique native record inside the exact account /
    // model configuration. This locates bytes, never reassigns execution state.
    const locate=(record:StoredConversation,participant:StoredParticipant,nativeId:string,executionId?:string,command?:string):{context?:string;reason?:string}=>{
      if(!record.attempts.some(attempt=>attempt.participantId===participant.id&&attempt.accepted))return {reason:'accepted_attempt_missing'};
      const config=configRoot(root,record,participant);if(!config)return {reason:'configuration_unproven'};
      const prefix=command?nativeCommandPrefix(command):'';
      const key=JSON.stringify([config,record.view.cwd,prefix]);let index=indexes.get(key);
      if(!index) {
        if(indexes.size>=8)return {reason:'context_budget'};
        const provider=participant.provider,suffix=provider==='codex'?'codex-home/sessions':provider==='qoder'?'qoder-config/projects':'dsh-home/sessions';
        const input={root,configRoot:config,cwd:record.view.cwd,contextId:''};
        const files=nativeContentFiles(input,path.join(config,suffix),file=>provider==='dsh'?/^session\.v4\.jsonl(?:\.zstd)?$/.test(path.basename(file)):file.endsWith('.jsonl'),6);
        if(files.length>128)return {reason:'native_lookup_scope_budget'};
        index=new Map();
        for(const file of files) {
          if(Date.now()>deadline)return {reason:'native_lookup_time_budget'};
          const context=provider==='dsh'?path.basename(path.dirname(file)):path.basename(file).match(/([a-f0-9-]{36})\.jsonl$/)?.[1];if(!context)continue;
          let content:NativeContentInventory|undefined;
          try{content=executors.find(executor=>executor.descriptor.id===provider)?.nativeContent?.({...input,contextId:context});}catch{continue;}
          if(!content)continue;
          for(const item of content.records)for(const id of [...item.toolIds,...(item.executionId?['execution:'+item.executionId]:[])]){const values=index.get(id)??[];if(!values.includes(context))values.push(context);index.set(id,values);}
          if(provider==='codex')for(const hash of nativeCommandIndex(content,prefix).keys()) {const id='input:'+hash,values=index.get(id)??[];if(!values.includes(context))values.push(context);index.set(id,values);}
        }
        indexes.set(key,index);
      }
      const values=index.get(nativeId)??(executionId?index.get('execution:'+executionId):undefined)??(command?index.get('input:'+nativeContentHash(command)):undefined)??[];
      return values.length===1?{context:values[0]}:{reason:values.length?'native_context_ambiguous':'native_tool_not_found'};
    };
    const inventory=(record:StoredConversation,participant:StoredParticipant,context=participant.contextRef?.id) => {
      inventoryReason='';const config=configRoot(root,record,participant);
      if(!context){inventoryReason='native_context_missing';return;}
      if(!config){inventoryReason='configuration_unproven';return;}
      const key=JSON.stringify([config,context,record.view.cwd]);
      if (!inventories.has(key) && inventories.size>=8) {inventoryReason='context_budget';return;}
      if (!inventories.has(key)) inventories.set(key,executors.find(executor=>executor.descriptor.id===participant.provider)?.nativeContent?.({root,configRoot:config,contextId:context,cwd:record.view.cwd}));
      const value=inventories.get(key);if(!value)inventoryReason='native_inventory_unavailable';return value;
    };
    const observed=options.dryRun?{entry:0,attachment:''}:store.cursor();
    const cursor={entry:options.after??observed.entry,attachment:options.afterAttachment??observed.attachment};
    const rows=store.entries(cursor.entry,limit); let entryCursor=cursor.entry, attachmentCursor=cursor.attachment;
    for (const row of rows) {
      if (Date.now()>deadline) break;
      const previousCursor=entryCursor;entryCursor=row.position; result.inspected++;
      let provider='unknown';
      const reason=(code:string)=>{
        const size=Buffer.byteLength(row.body),item=result.reasons[provider+':'+code]??={items:0,storedBytes:0,logicalBytes:0};item.items++;item.storedBytes+=size;item.logicalBytes+=row.body_bytes;
        if(options.details)result.entryItems.push({conversationId:row.conversation_id,revision:row.content_revision,provider,reason:code,storedBytes:size,logicalBytes:row.body_bytes});
      };
      try {
        const existing=ConversationEntryStore.reference(row);
        if(existing?.version === 3) continue;
        if(existing){provider=existing.provider;reason('already_native');continue;}
        const entry=ConversationEntryStore.decode(row), record=JSON.parse(row.header) as StoredConversation;
        provider=entry.provider??'none';
        if(entry.kind!=='tool'){reason('not_tool');continue;}
        if(!['completed','failed'].includes(entry.status??'')){reason('unsettled_tool');continue;}
        if(Buffer.byteLength(row.body)<=128){reason('insufficient_stored_bytes');continue;}
        let origin=record,sources=Object.entries(origin.sources).filter(([,id])=>id===entry.id);
        const ancestors=new Set<string>([record.view.id]);
        while(sources.length!==1&&origin.view.childOf&&ancestors.size<8) {
          const parent=origin.view.childOf;
          if(parent.workspaceId!==record.view.workspaceId||entry.sequence>parent.throughSequence||ancestors.has(parent.conversationId))break;
          ancestors.add(parent.conversationId);
          const header=store.db.prepare('SELECT body FROM conversations WHERE id=? AND workspace_id=?').get(parent.conversationId,parent.workspaceId);
          if(!header)break;
          const previous=JSON.parse(header.body as string) as StoredConversation;if(previous.view.cwd!==record.view.cwd)break;
          origin=previous;sources=Object.entries(origin.sources).filter(([,id])=>id===entry.id);
        }
        if (sources.length!==1){reason('source_identity_unavailable');continue;}
        const source=sources[0]![0], split=source.indexOf(':tool:'); if (split<0){reason('source_identity_unavailable');continue;}
        const participant=origin.participants.find(value=>value.id===source.slice(0,split));
        if(!participant||entry.provider!==participant.provider){reason('participant_unavailable');continue;}
        const executionId=origin.attempts.find(attempt=>attempt.runId===entry.runId&&attempt.participantId===participant.id&&attempt.accepted)?.executionRef?.id;
        const original=originalContext(origin,participant,entry.runId);
        const location=original.context||original.reason!=='historical_context_unproven'?original:locate(origin,participant,source.slice(split+6),executionId,entry.input);
        if(!location.context){
          if(location.reason==='context_budget'||location.reason==='native_lookup_time_budget'){entryCursor=previousCursor;result.inspected--;break;}
          reason(location.reason!);continue;
        }
        const context=location.context,native=inventory(origin,participant,context);
        if(!native){if(inventoryReason==='context_budget'){entryCursor=previousCursor;result.inspected--;break;}reason(inventoryReason);continue;}
        let matchReason='native_content_unavailable';
        const reference=nativeToolReference(root,participant.provider,context,source.slice(split+6),entry,native,value=>{matchReason=value;},executionId);
        if(!reference){reason(matchReason);continue;}
        const compact=JSON.stringify(ConversationEntryStore.compact(entry,row.content_revision,true));
        const previousCompact=store.db.prepare('SELECT sum(length(CAST(compact AS BLOB))) AS n FROM conversation_read_entries WHERE conversation_id=? AND content_revision=?').get(row.conversation_id,row.content_revision)!.n as number|null;
        const positions=Number(store.db.prepare('SELECT count(*) AS n FROM conversation_read_entries WHERE conversation_id=? AND content_revision=?').get(row.conversation_id,row.content_revision)!.n);
        const encoded=ConversationEntryStore.encodeReference(reference);
        const savings=Buffer.byteLength(row.body)-Buffer.byteLength(encoded.body)-(Buffer.byteLength(compact)*positions-(previousCompact??0));
        if (savings<=128){reason('insufficient_net_saving');continue;}
        const verify=()=>{ return !!reader.tool(reference,row.content_revision); };
        if (options.dryRun || store.replaceTool(row,reference,verify)) {
          result.tools++;result.contentBytesSaved+=savings;
          const residual=[...reference.input??[],...reference.text].reduce((sum,part)=>sum+('literal'in part&&part.residual?Buffer.byteLength(part.literal):0),0);
          result.localResidualBytes+=residual;reason(residual?'convertible_partial':'convertible_full');
        }else {result.deferred++;reason('concurrent_change');}
      } catch { result.deferred++;reason('content_read_or_validation_failed'); }
    }
    if (rows.length<limit && entryCursor===(rows.at(-1)?.position??entryCursor)) entryCursor=0;
    inventories.clear();
    const attachments=store.attachments(cursor.attachment,8);
    attachmentRows: for (const row of attachments) {
      if (Date.now()>deadline) break;
      attachmentCursor=row.id;
      let header=row.body;
      const record=JSON.parse(header) as StoredConversation;
      // Only already-delivered, referenced image bytes have a native candidate. Video originals stay local.
      const ids=new Set((store.db.prepare("SELECT c.body,c.codec,c.body_bytes,c.content_revision FROM conversation_read_entries e JOIN conversation_entry_contents c USING(conversation_id,content_revision) WHERE e.conversation_id=? AND e.scope='main' AND e.visible=1").all(row.id) as any[]).flatMap(content=>ConversationEntryStore.decode(content).attachments??[]));
      for (const id of [...ids]) for (const frame of record.attachments[id]?.video?.frames??[]) ids.add(frame.id);
      const resume=cursor.attachment.startsWith(row.id+'#')?cursor.attachment.slice(row.id.length+1).split('.').map(Number):[0,0];
      const items=Object.entries(record.attachments);
      for (let itemIndex=resume[0]??0;itemIndex<items.length;itemIndex++) {
        const [id,meta]=items[itemIndex]!;
        if(Date.now()>deadline){attachmentCursor=row.id+'#'+itemIndex;break attachmentRows;}
        const filename=path.join(root,'attachments',record.view.id,id),local=fs.lstatSync(filename,{throwIfNoEntry:false});
        const note=(code:string)=>{const value=result.attachmentReasons[code]??={items:0,storedBytes:0};value.items++;value.storedBytes+=(local?.blocks??0)*512;};
        const protectedPath=!dependencies.complete||record.view.requests.length>0||record.participants.some(participant=>participant.contextRef&&blocked.has(participant.provider+':'+participant.contextRef.id));
        if(!ids.has(id)){if(local)note('unsent_or_unreferenced');continue;}
        if(meta.video||!meta.mimeType.startsWith('image/')||!/^[a-f0-9-]{36}$/.test(id)){if(local)note('unique_or_unsupported_media');continue;}
        if (meta.nativeContent && !protectedPath) {
          const cached=path.join(root,'attachment-cache',record.view.id,id);
          if (safeStorageResource(root,cached)) try {
            const before=fs.lstatSync(cached);
            if (Date.now()-before.mtimeMs>15*60_000 && reader.attachment(meta.nativeContent).length===meta.size && !storageInUse(cached,observeStorageUse())) {
              const fresh=repository.storageDependencies(), after=fs.lstatSync(cached);
              const current=store.db.prepare('SELECT body FROM conversations WHERE id=?').get(record.view.id);
              if (fresh.complete && !fresh.contexts.includes(meta.nativeContent.provider+':'+meta.nativeContent.contextId) && current?.body===header && before.ino===after.ino && before.dev===after.dev && before.mtimeMs===after.mtimeMs && before.ctimeMs===after.ctimeMs && !options.dryRun) fs.unlinkSync(cached);
            }
          } catch { result.deferred++; }
        }
        if (!safeStorageResource(root,filename)) {if(local)note('local_source_unsafe');continue;}
        try {
          const before=fs.lstatSync(filename); if (before.size!==meta.size) {note('local_size_changed');continue;}
          const bytes=fs.readFileSync(filename), sha256=nativeContentHash(bytes); let reference=meta.nativeContent;
          const targets=record.participants.flatMap(participant=>{
            const contexts=new Set<string>(participant.contextRef?[participant.contextRef.id]:[]);
            for(const attempt of record.attempts.filter(value=>value.participantId===participant.id&&value.accepted)){
              const original=originalContext(record,participant,attempt.runId);if(original.context)contexts.add(original.context);
            }
            return [...contexts].map(context=>({participant,context}));
          });
          let images=0,available=0;inventories.clear();
          if (!reference) for (let targetIndex=itemIndex===resume[0]?(resume[1]??0):0;targetIndex<targets.length;targetIndex++) {
            if(Date.now()>deadline){attachmentCursor=row.id+'#'+itemIndex+'.'+targetIndex;break attachmentRows;}
            const {participant,context}=targets[targetIndex]!,native=inventory(record,participant,context);
            if (!native) {if(inventoryReason==='context_budget'){attachmentCursor=row.id+'#'+itemIndex+'.'+targetIndex;break attachmentRows;}continue;}
            available++;images+=native.images.length;
            for (const image of native.images) {
              const candidate:NativeAttachmentContent={version:1,provider:participant.provider,contextId:context,value:image.value,sha256,size:bytes.length};
              try { if (reader.attachment(candidate).equals(bytes)) { reference=candidate; break; } } catch { /* Other images are not evidence. */ }
            }
            if (reference) break;
          }
          if (!reference || !reader.attachment(reference).equals(bytes)) {note(images?'native_bytes_differ':available?'native_image_absent':'native_inventory_unavailable');continue;}
          const verify=()=>reader.attachment(reference!).equals(bytes);
          const held=storageInUse(filename,observeStorageUse()),warm=!!meta.nativeContent&&Date.now()-before.mtimeMs<15*60_000;
          if (options.dryRun) {if(!meta.nativeContent)result.attachmentReferences++;if(!protectedPath&&!held&&!warm){result.attachments++;result.attachmentBytesRemoved+=before.blocks*512;}note(protectedPath?'native_materialization_active':held?'local_source_in_use':warm?'native_materialization_warm':'convertible');continue;}
          if(!meta.nativeContent){
            const sameFile=()=>{const now=fs.lstatSync(filename);return before.ino===now.ino&&before.dev===now.dev&&before.size===now.size&&before.mtimeMs===now.mtimeMs&&before.ctimeMs===now.ctimeMs&&verify();};
            if (!store.referenceAttachment(header,id,reference,sameFile)) { result.deferred++; continue; }
            result.attachmentReferences++;record.attachments[id]!.nativeContent=reference;header=JSON.stringify(record);
          }
          if(protectedPath||held||warm){note(protectedPath?'native_materialization_active':held?'local_source_in_use':'native_materialization_warm');continue;}
          const after=fs.lstatSync(filename);
          const fresh=repository.storageDependencies();
          if (fresh.complete&&!fresh.contexts.includes(reference.provider+':'+reference.contextId)&&before.dev===after.dev && before.ino===after.ino && before.size===after.size && before.mtimeMs===after.mtimeMs && before.ctimeMs===after.ctimeMs && verify() && !storageInUse(filename,observeStorageUse())) {
            fs.unlinkSync(filename); result.attachments++; result.attachmentBytesRemoved+=before.blocks*512;note('converted');
          }
        } catch { result.deferred++;note('content_read_or_validation_failed'); }
      }
    }
    if (attachments.length<8 && attachmentCursor===(attachments.at(-1)?.id??attachmentCursor)) attachmentCursor='';
    result.nextEntry=entryCursor;result.nextAttachment=attachmentCursor;
    if (!options.dryRun) { store.advance(entryCursor,attachmentCursor); result.databaseBytesReclaimed=store.reclaim(); }
  } catch { result.diagnostic='native_content_maintenance_deferred'; }
  finally { store?.close(); lock?.release(); }
  return result;
}
