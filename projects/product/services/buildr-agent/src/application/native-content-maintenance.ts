import fs from 'node:fs';
import path from 'node:path';
import type { StoredConversation, StoredParticipant } from '../domain/agent-state.ts';
import type { NativeContentInventory, NativeAttachmentContent } from '../native-content-contracts.ts';
import { createNativeExecutors } from '../executors/index.ts';
import { nativeToolReference } from '../executors/native-content.ts';
import { parseReference } from '../executors/native-process.ts';
import { modelLeaseIdentity } from '../model-access/model-preferences.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { ConversationEntryStore } from '../persistence/conversation-entry-store.ts';
import { NativeContentStore } from '../persistence/native-content-store.ts';
import { claim } from '../process/ownership.ts';
import { NativeContentReader, nativeContentHash } from '../storage/native-content.ts';
import { observeStorageUse, safeStoragePath, safeStorageResource, storageInUse } from '../storage/files.ts';

const executors = createNativeExecutors();
function configRoot(root: string, record: StoredConversation, participant: StoredParticipant): string | undefined {
  if (participant.connectionId !== participant.provider || !participant.contextRef) return;
  try { if (parseReference(String(participant.contextRef.data?.native ?? ''),participant.provider,record.view.cwd,participant.bindingIdentity).nativeSessionId !== participant.contextRef.id) return; }
  catch { return; }
  const base = path.join(root,'connections',participant.provider);
  if (!participant.modelAccountId || participant.provider==='qoder') return base;
  if (!participant.modelAccountIdentity || !participant.modelId || participant.modelConfiguration === undefined) return;
  const identity = modelLeaseIdentity(participant.modelAccountId,participant.modelAccountIdentity,participant.modelId,record.view.id,participant.connectionId,participant.modelConfiguration);
  return path.join(base,'model-bindings',nativeContentHash(identity));
}

export interface NativeContentMaintenanceResult {
  inspected: number; tools: number; attachments: number; contentBytesSaved: number; attachmentBytesRemoved: number;
  deferred: number; databaseBytesReclaimed: number; diagnostic?: string;
}

/** Runs only in the existing maintenance isolate. Never launches a native CLI or changes its files. */
export function maintainNativeContent(dataRoot: string, options: {dryRun?:boolean; maximumItems?:number; budgetMs?:number} = {}): NativeContentMaintenanceResult {
  const result: NativeContentMaintenanceResult = {inspected:0,tools:0,attachments:0,contentBytesSaved:0,attachmentBytesRemoved:0,deferred:0,databaseBytesReclaimed:0};
  const root=path.join(dataRoot,'agent-service'), repository=new ConversationRepository(root), reader=new NativeContentReader(root);
  const deadline=Date.now()+Math.max(100,Math.min(options.budgetMs??10000,60000)), limit=Math.max(1,Math.min(options.maximumItems??128,1024));
  let store:NativeContentStore|undefined, lock:ReturnType<typeof claim>|undefined;
  try {
    if (!safeStoragePath(dataRoot,root)) throw new Error('native_root_unsafe');
    if (!options.dryRun) lock=claim(dataRoot,'storage');
    store=new NativeContentStore(repository.filename,!options.dryRun);
    const dependencies=repository.storageDependencies();
    if (!dependencies.complete) throw new Error('native_dependencies_unknown');
    const blocked=new Set(dependencies.contexts), inventories=new Map<string,NativeContentInventory|undefined>();
    const inventory=(record:StoredConversation,participant:StoredParticipant) => {
      const context=participant.contextRef?.id, config=configRoot(root,record,participant);
      if (!context || !config || blocked.has(participant.provider+':'+context)) return;
      const key=JSON.stringify([config,context,record.view.cwd]);
      if (!inventories.has(key) && inventories.size>=8) return;
      if (!inventories.has(key)) inventories.set(key,executors.find(executor=>executor.descriptor.id===participant.provider)?.nativeContent?.({root,configRoot:config,contextId:context,cwd:record.view.cwd}));
      return inventories.get(key);
    };
    const cursor=options.dryRun?{entry:0,attachment:''}:store.cursor();
    const rows=store.entries(cursor.entry,limit); let entryCursor=cursor.entry, attachmentCursor=cursor.attachment;
    for (const row of rows) {
      if (Date.now()>deadline) break;
      entryCursor=row.position; result.inspected++;
      try {
        const entry=ConversationEntryStore.decode(row), record=JSON.parse(row.header) as StoredConversation;
        if (entry.kind!=='tool' || !['completed','failed'].includes(entry.status??'') || !entry.runId || entry.parentToolId) continue;
        const sources=Object.entries(record.sources).filter(([,id])=>id===entry.id);
        if (sources.length!==1) continue;
        const source=sources[0]![0], split=source.indexOf(':tool:'); if (split<0) continue;
        const participant=record.participants.find(value=>value.id===source.slice(0,split));
        const attempt=record.attempts.find(value=>value.runId===entry.runId && value.participantId===participant?.id);
        if (!participant || entry.provider!==participant.provider || !attempt?.accepted || attempt.executionRef?.data?.resourceContext!==participant.contextRef?.id || attempt.executionRef?.data?.resourceBinding!==participant.bindingIdentity) continue;
        const native=inventory(record,participant); if (!native) continue;
        const reference=nativeToolReference(root,participant.provider,participant.contextRef!.id,source.slice(split+6),entry,native);
        if (!reference) continue;
        const compact=JSON.stringify(ConversationEntryStore.compact(entry,row.content_revision,true));
        const previousCompact=store.db.prepare('SELECT sum(length(CAST(compact AS BLOB))) AS n FROM conversation_read_entries WHERE conversation_id=? AND content_revision=?').get(row.conversation_id,row.content_revision)!.n as number|null;
        const positions=Number(store.db.prepare('SELECT count(*) AS n FROM conversation_read_entries WHERE conversation_id=? AND content_revision=?').get(row.conversation_id,row.content_revision)!.n);
        const savings=Buffer.byteLength(row.body)-Buffer.byteLength(JSON.stringify(reference))-(Buffer.byteLength(compact)*positions-(previousCompact??0));
        if (savings<1024) continue;
        const verify=()=>{ const fresh=repository.storageDependencies(); return fresh.complete && !fresh.contexts.includes(participant.provider+':'+participant.contextRef!.id) && !!reader.tool(reference,row.content_revision); };
        if (options.dryRun || store.replaceTool(row,reference,verify)) { result.tools++; result.contentBytesSaved+=savings; }
        else result.deferred++;
      } catch { result.deferred++; }
    }
    if (rows.length<limit && entryCursor===(rows.at(-1)?.position??entryCursor)) entryCursor=0;
    const attachments=store.attachments(cursor.attachment,8);
    for (const row of attachments) {
      if (Date.now()>deadline) break;
      attachmentCursor=row.id;
      let header=row.body;
      const record=JSON.parse(header) as StoredConversation;
      if (record.view.requests.length || record.participants.some(participant=>participant.contextRef && blocked.has(participant.provider+':'+participant.contextRef.id))) continue;
      // Only already-delivered, referenced image bytes have a native candidate. Video originals stay local.
      const ids=new Set((store.db.prepare("SELECT c.body,c.codec,c.body_bytes,c.content_revision FROM conversation_read_entries e JOIN conversation_entry_contents c USING(conversation_id,content_revision) WHERE e.conversation_id=? AND e.scope='main' AND e.visible=1").all(row.id) as any[]).flatMap(content=>ConversationEntryStore.decode(content).attachments??[]));
      for (const id of [...ids]) for (const frame of record.attachments[id]?.video?.frames??[]) ids.add(frame.id);
      for (const [id,meta] of Object.entries(record.attachments)) {
        if (Date.now()>deadline || !ids.has(id) || meta.video || !meta.mimeType.startsWith('image/') || !/^[a-f0-9-]{36}$/.test(id)) continue;
        if (meta.nativeContent) {
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
        const filename=path.join(root,'attachments',record.view.id,id);
        if (!safeStorageResource(root,filename)) continue;
        try {
          const before=fs.lstatSync(filename); if (before.size!==meta.size) continue;
          const bytes=fs.readFileSync(filename), sha256=nativeContentHash(bytes); let reference=meta.nativeContent;
          if (!reference) for (const participant of record.participants) {
            const native=inventory(record,participant); if (!native) continue;
            for (const image of native.images) {
              const candidate:NativeAttachmentContent={version:1,provider:participant.provider,contextId:participant.contextRef!.id,value:image.value,sha256,size:bytes.length};
              try { if (reader.attachment(candidate).equals(bytes)) { reference=candidate; break; } } catch { /* Other images are not evidence. */ }
            }
            if (reference) break;
          }
          if (!reference || !reader.attachment(reference).equals(bytes)) continue;
          const use=observeStorageUse(); if (storageInUse(filename,use)) continue;
          const verify=()=>{ const fresh=repository.storageDependencies(); return fresh.complete && !fresh.contexts.includes(reference!.provider+':'+reference!.contextId) && reader.attachment(reference!).equals(bytes); };
          if (options.dryRun) { result.attachments++; result.attachmentBytesRemoved+=before.blocks*512; continue; }
          if (!store.referenceAttachment(header,id,reference,verify)) { result.deferred++; continue; }
          record.attachments[id]!.nativeContent=reference; header=JSON.stringify(record);
          const after=fs.lstatSync(filename);
          if (before.dev===after.dev && before.ino===after.ino && before.size===after.size && before.mtimeMs===after.mtimeMs && before.ctimeMs===after.ctimeMs && verify() && !storageInUse(filename,observeStorageUse())) {
            fs.unlinkSync(filename); result.attachments++; result.attachmentBytesRemoved+=before.blocks*512;
          }
        } catch { result.deferred++; }
      }
    }
    if (attachments.length<8 && attachmentCursor===(attachments.at(-1)?.id??attachmentCursor)) attachmentCursor='';
    if (!options.dryRun) { store.advance(entryCursor,attachmentCursor); result.databaseBytesReclaimed=store.reclaim(); }
  } catch { result.diagnostic='native_content_maintenance_deferred'; }
  finally { store?.close(); lock?.release(); }
  return result;
}
