import fs from 'node:fs';
import path from 'node:path';
import type { AgentExecutor, ConversationEntry } from '../contracts.ts';
import type { StoredConversation, StoredParticipant } from '../domain/agent-state.ts';
import type { NativeContentInventory, NativeToolContent } from '../native-content-contracts.ts';
import { defaultNativeExecutors, nativeContentSpec } from '../executors/index.ts';
import { nativeContentFiles, nativeToolReference } from '../executors/native-content.ts';
import { parseReference } from '../executors/native-process.ts';
import { modelLeaseIdentity } from '../model-access/model-preferences.ts';
import { nativeContentHash } from '../storage/native-content.ts';

export function configRoot(
  root: string,
  record: { view: Pick<StoredConversation['view'], 'id' | 'cwd'> },
  participant: StoredParticipant,
  executors: readonly AgentExecutor[] = defaultNativeExecutors(),
): string | undefined {
  if (participant.connectionId !== participant.provider) return;
  try { if (participant.contextRef && parseReference(String(participant.contextRef.data?.native ?? ''),participant.provider,record.view.cwd,participant.bindingIdentity).nativeSessionId !== participant.contextRef.id) return; }
  catch { return; }
  const base = path.join(root,'connections',participant.provider);
  // Persisted shared/lease home root wins; only legacy participants without it reverse-compute the lease dir.
  if (participant.nativeHomeRoot) return participant.nativeHomeRoot;
  const descriptor = executors.find(executor => executor.descriptor.id === participant.provider)?.descriptor;
  const nativePolicy = descriptor?.modelPolicy?.native;
  // Executors with model-account-scoped native configs keep transcripts under that account root.
  // Pre-upgrade participants still retain their legacy connection/lease config dir in bindingData.config.
  if (nativePolicy?.accountConfigScope === 'model-account' && nativePolicy.defaultSourceAccountId) {
    const accountRoot = path.join(root, 'model-access', 'accounts', nativePolicy.defaultSourceAccountId);
    const bindingConfig = typeof participant.bindingData?.config === 'string' ? participant.bindingData.config : undefined;
    if (bindingConfig) {
      const legacyDir = path.dirname(path.resolve(bindingConfig));
      const baseResolved = path.resolve(base);
      const baseReal = (() => { try { return fs.realpathSync(base); } catch { return undefined; } })();
      if (legacyDir === baseResolved || (baseReal !== undefined && legacyDir === baseReal)) return base;
      const bindingsPrefix = path.join(baseResolved, 'model-bindings') + path.sep;
      const realBindingsPrefix = baseReal !== undefined ? path.join(baseReal, 'model-bindings') + path.sep : undefined;
      if (!legacyDir.startsWith(bindingsPrefix) && (!realBindingsPrefix || !legacyDir.startsWith(realBindingsPrefix))) {
        return accountRoot;
      }
    } else {
      return accountRoot;
    }
  }
  if (!participant.modelAccountId || nativePolicy?.exclusive || nativePolicy?.binding === 'account-identity') return base;
  if (!participant.modelAccountIdentity || !participant.modelId || participant.modelConfiguration === undefined) return;
  const permissionScoped = Boolean(descriptor?.runtimeTraits?.configurationIncludesPermission?.length);
  let configuration = participant.modelLeaseConfiguration ?? participant.modelConfiguration;
  if (participant.modelLeaseConfiguration !== undefined) {
    const valid = participant.modelConfiguration === configuration || permissionScoped && ['default', 'full-access'].some(permission => nativeContentHash(JSON.stringify({ model: configuration, permission })) === participant.modelConfiguration);
    if (!valid) return;
  }
  // When participant configuration includes permission, the gateway lease uses
  // only the model configuration. A tier's numeric suffix is only a candidate:
  // the persisted digest must prove the complete original value.
  if (permissionScoped && /^[a-f0-9]{64}$/.test(configuration)) {
    const window = participant.serviceTier?.match(/:(\d+)$/)?.[1];
    const candidates = [null, ...(window ? [Number(window)] : [])].flatMap(size => ['default', 'full-access'].map(permission => ({ model: JSON.stringify([participant.serviceTier ?? '', size]), permission })));
    const match = candidates.filter(candidate => nativeContentHash(JSON.stringify(candidate)) === configuration);
    if (match.length !== 1) return;
    configuration = match[0]!.model;
  }
  const identity = modelLeaseIdentity(participant.modelAccountId,participant.modelAccountIdentity,participant.modelId,record.view.id,participant.connectionId,configuration);
  return path.join(base,'model-bindings',nativeContentHash(identity));
}

export function originalContext(record:StoredConversation,participant:StoredParticipant,runId?:string):{context?:string;reason?:string} {
  if(!runId)return {reason:'historical_context_unproven'};
  const attempts=record.attempts.filter(attempt=>attempt.runId===runId&&attempt.participantId===participant.id&&attempt.accepted);
  if(!attempts.length)return {reason:'accepted_attempt_missing'};
  const contexts=new Set<string>();
  for(const attempt of attempts) {
    const binding=attempt.executionRef?.data?.resourceBinding;
    if(binding!==undefined&&binding!==participant.bindingIdentity)return {reason:'binding_mismatch'};
    for(const context of [attempt.executionRef?.data?.resourceContext,attempt.participation?.context?.id])
      if(typeof context==='string'&&context)contexts.add(context);
  }
  if(contexts.size>1)return {reason:'context_evidence_conflict'};
  if(contexts.size===1)return {context:[...contexts][0]!};
  return {reason:'historical_context_unproven'};
}

/** Front-door discovery is bounded. Larger or not-yet-durable native histories
 * use the independent maintenance worker, never a second permanent body store. */
export class NativeContentResolver {
  private readonly executors: readonly AgentExecutor[];
  private readonly cache=new Map<string,{signature:string;inventory:NativeContentInventory;bytes:number}>();
  private readonly root:string;
  private readonly parent?: (id:string)=>StoredConversation|undefined;
  constructor(root:string,parent?:(id:string)=>StoredConversation|undefined,executors:readonly AgentExecutor[]=defaultNativeExecutors()){this.root=root;this.parent=parent;this.executors=executors;}
  tool(record:StoredConversation,entry:ConversationEntry):NativeToolContent|undefined {
    if(entry.kind!=='tool')return;
    if(!record.nativeTools?.[entry.id]&&!['completed','failed'].includes(entry.status??''))return;
    try {
      let origin=record,sources=Object.entries(origin.sources).filter(([,id])=>id===entry.id);
      const seen=new Set([record.view.id]);
      while(sources.length!==1&&(origin.view.childOf||origin.view.forkedFrom)&&seen.size<8){
        const link=origin.view.childOf ?? origin.view.forkedFrom!;
        if(link.workspaceId!==record.view.workspaceId||entry.sequence>link.throughSequence||seen.has(link.conversationId))return;
        seen.add(link.conversationId);const next=this.parent?.(link.conversationId);if(!next||next.view.cwd!==record.view.cwd)return;
        origin=next;sources=Object.entries(origin.sources).filter(([,id])=>id===entry.id);
      }
      if(sources.length!==1)return;
      const source=sources[0]![0],split=source.indexOf(':tool:');if(split<0)return;
      const participant=origin.participants.find(value=>value.id===source.slice(0,split));if(!participant||participant.provider!==entry.provider)return;
      const spec=nativeContentSpec(participant.provider,this.executors);
      if(!spec)return;
      const original=originalContext(origin,participant,entry.runId);
      const run=origin.view.run;
      const context=original.context??(original.reason==='historical_context_unproven'&&run&&run.id===entry.runId&&run.participantId===participant.id?participant.contextRef?.id:undefined);
      const config=configRoot(this.root,origin,participant,this.executors);if(!context||!config)return;
      if(record.nativeTools?.[entry.id]) {
        const skeleton = {...entry, text: ''};
        delete skeleton.input;
        delete skeleton.detail;
        delete skeleton.nativeDetail;
        const turnId = spec.omitExecutionTurnId ? undefined : origin.attempts.find(value => value.runId === entry.runId && value.participantId === participant.id && value.accepted)?.executionRef?.id;
        const parentSource = entry.parentToolId ? Object.entries(origin.sources).filter(([key,id])=>id===entry.parentToolId&&key.startsWith(participant.id+':tool:')) : [];
        const owned=record.nativeTools?.[entry.id];
        const parentToolId=typeof owned==='object'?owned.parentToolId:parentSource.length===1?parentSource[0]![0].slice(split+6):undefined;
        if(entry.parentToolId&&!parentToolId)return;
        return {version: 3, provider: participant.provider, contextId: context, nativeId: source.slice(split + 6), entry: skeleton,
          session: {config: path.relative(this.root, config).split(path.sep).join('/'), cwd: origin.view.cwd, turnId,...(parentToolId?{parentToolId}:{})}, text: []};
      }
      if(!spec.sessionRoots?.length||!spec.inventory)return;
      const input={root:this.root,configRoot:config,contextId:context,cwd:origin.view.cwd};
      const files=spec.sessionRoots.flatMap(sessionRoot=>
        nativeContentFiles(input,path.join(config,sessionRoot.relative),file=>sessionRoot.matchSessionFile(file,context),sessionRoot.depth),
      );
      if(files.length!==1)return;
      const states=files.map(file=>{const s=fs.lstatSync(file);return [file,s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs];});
      const bytes=states.reduce((n,value)=>n+Number(value[3]),0);if(bytes>8*1024*1024)return;
      const key=JSON.stringify([config,context,origin.view.cwd]),signature=JSON.stringify(states);let cached=this.cache.get(key);
      if(cached?.signature!==signature){
        const inventory=spec.inventory(input);if(!inventory)return;
        this.cache.delete(key);
        while(this.cache.size>=4||[...this.cache.values()].reduce((n,value)=>n+value.bytes,0)+bytes>16*1024*1024){const first=this.cache.keys().next().value;if(first===undefined)break;this.cache.delete(first);}
        cached={signature,inventory,bytes};this.cache.set(key,cached);
      }
      const executionId=origin.attempts.find(value=>value.runId===entry.runId&&value.participantId===participant.id&&value.accepted)?.executionRef?.id;
      return nativeToolReference(this.root,participant.provider,context,source.slice(split+6),entry,cached!.inventory,undefined,executionId);
    }catch{return;}
  }
}
