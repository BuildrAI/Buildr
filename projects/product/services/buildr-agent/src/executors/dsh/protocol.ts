import { dshPresentedFiles } from '../../domain/presented-files.ts';
import type { ExecutorItem } from '../../contracts.ts';
import { visibleText, nativePreview } from '../native-process.ts';
// DSH also carries model-only context in user/message envelopes.
function isUserInput(event: any): boolean {
  return event?.type === 'user/message' && (!event.data?.source?.kind || event.data.source.kind === 'user');
}
/** Native crash repair supplies an error envelope, not a completed operation receipt. */
export function dshToolOutcomeUnknown(event:any):boolean {
  return event?.type==='tool/result'&&event.data?.error?.code==='TOOL_OUTCOME_UNKNOWN';
}

/** Native provenance, never assistant prose, connects autonomous follow-up turns. */
export class DshExecutionLineage {
  currentTurn?: number;
  readonly turns = new Map<number, string>();
  private children = new Map<string, string>();
  private pendingChildren = new Map<string, { owner: string; label: string }>();
  private jobs = new Map<string, { owner: string; label: string; callId?: string }>();
  private settledJobs = new Map<string, string>();
  private goals = new Map<string,string>();
  private uncertain = new Set<string>();
  private contextId?: string;
  constructor(contextId?: string) { this.contextId = contextId; }
  record(event: any): string | undefined {
    const data = event.data ?? {};
    if (event.type === 'turn/start') { this.currentTurn = data.turn; return; }
    const nativeTurn = data.turn ?? this.currentTurn;
    const source = data.source;
    if(event.type==='goal/change'&&typeof data.goal?.id==='string') {
      const owner=nativeTurn===undefined?undefined:this.turns.get(nativeTurn);
      if(owner&&['create','edit'].includes(data.operation))this.goals.set(data.goal.id,owner);
    }
    if (event.type === 'user/message' && nativeTurn !== undefined) {
      let owner: string | undefined;
      if (isUserInput(event) && typeof source?.rpcId === 'string') owner = source.rpcId;
      else if(source?.kind==='goal')owner=this.goals.get(source.goalId);
      else if (source?.kind === 'subagent-settled') {
        owner = this.children.get(source.senderSessionId);
        if (owner) this.pendingChildren.delete(source.senderSessionId);
      } else if (source?.kind === 'tool-jobs') {
        owner = this.settledJobs.get(source.jobId);
        if (owner) this.settledJobs.delete(source.jobId);
        // Older DSH notices omit the job identity. Preserve uncertainty rather
        // than borrowing a nearby job's owner or parsing assistant-visible prose.
        else if (!this.turns.has(nativeTurn)) for (const candidate of this.settledJobs.values()) this.uncertain.add(candidate);
      }
      if (owner && !this.turns.has(nativeTurn)) this.turns.set(nativeTurn, owner);
    }
    const owner = nativeTurn === undefined ? undefined : this.turns.get(nativeTurn);
    if (event.type === 'subagent/catalog' && owner && typeof data.childId === 'string') {
      this.children.set(data.childId, owner);
      this.pendingChildren.set(data.childId, { owner, label: String(data.label ?? 'DSH 辅助工作') });
    }
    if (event.type === 'job/registered' && owner && typeof data.jobId === 'string' && (!this.contextId || data.owner === this.contextId)) {
      this.jobs.set(data.jobId, { owner, label: 'DSH 后台工作', ...(typeof data.toolCall?.callId === 'string' ? { callId: data.toolCall.callId } : {}) });
    }
    if (event.type === 'job/settled' && this.jobs.has(data.jobId)) {
      this.settledJobs.set(data.jobId, this.jobs.get(data.jobId)!.owner);
      this.jobs.delete(data.jobId);
    }
    return owner;
  }
  background(owners: ReadonlySet<string>): Array<{ id: string; label: string; status: 'running' | 'unknown' }> {
    const running = [...[...this.pendingChildren].map(([id, value]) => ['dsh-child:' + id, value] as const),
      ...[...this.jobs].map(([id, value]) => ['dsh-job:' + id, value] as const)]
      .filter(([, value]) => owners.has(value.owner)).map(([id, value]) => ({ id, label: value.label, status: 'running' as const }));
    return [...running, ...[...this.uncertain].filter(owner => owners.has(owner)).map(owner => ({ id: 'dsh-continuation:' + owner, label: 'DSH 接续归属待确认', status: 'unknown' as const }))];
  }
  /** One native command can have both a tool receipt and an active job. */
  mergeTools(tools: Array<{ id: string; label: string; status: 'running' | 'completed' | 'unknown' }>, owners: ReadonlySet<string>): typeof tools {
    const result = new Map(tools.map(tool => [tool.id, { ...tool }]));
    for (const background of this.background(owners)) {
      const job = this.jobs.get(background.id.replace(/^dsh-job:/, ''));
      const linked = job?.callId ? result.get(job.callId) : undefined;
      if (linked) linked.status = 'running';
      else result.set(background.id, background);
    }
    return [...result.values()];
  }
  stopped(owners:ReadonlySet<string>):void {
    for(const [id,value]of this.pendingChildren)if(owners.has(value.owner))this.pendingChildren.delete(id);
    for(const [id,value]of this.jobs)if(owners.has(value.owner)){this.settledJobs.set(id,value.owner);this.jobs.delete(id);}
    for(const owner of owners)this.uncertain.delete(owner);
  }
  stopTargets(owners:ReadonlySet<string>):{childIds:string[];jobIds:string[]} {
    return {childIds:[...this.pendingChildren].filter(([,value])=>owners.has(value.owner)).map(([id])=>id),jobIds:[...this.jobs].filter(([,value])=>owners.has(value.owner)).map(([id])=>id)};
  }
  toolJobs(toolId:string,owners:ReadonlySet<string>):string[] {
    return [...this.jobs].filter(([id,job])=>owners.has(job.owner)&&(toolId==='dsh-job:'+id||job.callId===toolId)).map(([id])=>id);
  }
}
export function dshItem(event: any): ExecutorItem[] {
  const data = event?.data ?? {}; const id = `event:${event?.seq}`;
  if (event?.type === 'user/message' && !isUserInput(event)) return [];
  if (event?.type === 'assistant/message') {
    const content = data.message?.content;
    // 只投影可见助手文字：模型思考（reasoning）属于模型内部过程，不进入对话处理过程。
    const text = visibleText(content);
    return text ? [{ id: `assistant:${data.turn}:${data.step}`, kind: 'message', role: 'assistant', text, status: 'completed' }] : [];
  }
  if (event?.type === 'user/message') { const text = visibleText(data.content); return text || data.content?.some((part: any) => part.type === 'image') ? [{ id: data.id ?? id, kind: 'message', role: 'user', text, clientRequestId: data.source?.rpcId, executionId: data.source?.rpcId, status: 'completed' }] : []; }
  if (event?.type === 'tool/call') return [{ id: data.callId, kind: 'tool', role: 'system', presentedFiles:dshPresentedFiles(data.name,data.arguments), name: typeof data.name === 'string' && data.name ? data.name : undefined, input: nativePreview(String(data.arguments ?? '')), text: String(data.name ?? '工具') + '\n' + nativePreview(String(data.arguments ?? '')), status: 'running' }];
  if (event?.type === 'tool/result') return [{ id: data.message?.toolCallId ?? id, kind: 'tool', role: 'system', text: nativePreview(visibleText(data.message?.content)), status: dshToolOutcomeUnknown(event)?'unknown':data.message?.isError ? 'failed' : 'completed' }];
  return [];
}

/** Native request UUIDs provide exact source identity across cold history reads. */
export function dshHistoryItems(events: any[]): ExecutorItem[] {
  const lineage = new DshExecutionLineage();
  for (const event of events) lineage.record(event);
  let currentTurn: number | undefined; const result: ExecutorItem[] = [];
  for (const event of events) {
    if (event.type === 'turn/start') currentTurn = event.data.turn;
    for (const item of dshItem(event)) result.push({ ...item, executionId: event.data?.source?.rpcId ?? lineage.turns.get(event.data?.turn ?? currentTurn!) });
  }
  const latest = new Map<string, ExecutorItem>();
  for (const item of result) latest.set(item.id, { ...latest.get(item.id), ...item });
  return [...latest.values()];
}

/** A cold read answers only for the turn containing this exact client request. */
export function dshExecutionObservation(events: any[], requestId: string, knownItems:readonly ExecutorItem[]=[]): import('../../contracts.ts').ExecutorObservation {
  const lineage = new DshExecutionLineage();
  for (const event of events) lineage.record(event);
  const owned = [...lineage.turns].filter(([, owner]) => owner === requestId).map(([turn]) => turn);
  const targetTurn = owned.at(-1);
  if (targetTurn === undefined) return { status: 'unknown', tools: [], diagnostic: 'dsh_exact_execution_not_found' };
  const received=new Set(knownItems.filter(item=>item.kind==='tool'&&item.executionId===requestId&&item.status==='completed').map(item=>item.id));
  const tools = new Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown' }>(); let end: string | undefined;
  for (const event of events) {
    if (!owned.includes(event.data?.turn)) continue;
    if (event.type === 'tool/call') tools.set(event.data.callId, { id: event.data.callId, label: String(event.data.name ?? '工具'), status: 'unknown' });
    if (event.type === 'tool/result' && tools.has(event.data.message?.toolCallId)) tools.get(event.data.message.toolCallId)!.status = dshToolOutcomeUnknown(event)&&!received.has(event.data.message.toolCallId)?'unknown':'completed';
    if (event.type === 'turn/end' && event.data.turn === targetTurn) end = event.data.reason?.kind;
  }
  const merged = lineage.mergeTools([...tools.values()], new Set([requestId]));
  tools.clear(); for (const tool of merged) tools.set(tool.id, tool);
  if ([...tools.values()].some(tool => tool.status === 'running')) return { status: 'tools-active', executionRef: { id: requestId }, tools: [...tools.values()] };
  if (end && !['completed','aborted','cancelled','interrupted'].includes(end)) return {status:'unknown',executionRef:{id:requestId},tools:[...tools.values()],diagnostic:'dsh_native_execution_failed'};
  return { status: [...tools.values()].some(tool => tool.status === 'unknown') ? 'unknown' : !end ? 'unknown' : ['aborted', 'cancelled', 'interrupted'].includes(end) ? 'stopped' : 'idle', executionRef: { id: requestId }, tools: [...tools.values()] };
}
