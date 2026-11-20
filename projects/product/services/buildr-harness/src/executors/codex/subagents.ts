import type { ExecutorItem, SubagentDispatch } from '../../contracts.ts';
import { nativePreview } from '../native-process.ts';
import { codexItem } from './items.ts';
import { codexLatestTurn, codexThreadMetadata, codexTurnItems, type CodexRpc } from './pagination.ts';

type Child = { parent: string; root: string; executionId: string; marker: ExecutorItem };
function state(value: unknown): SubagentDispatch['status'] {
  switch (value) {
    case 'running': case 'pendingInit': return 'running';
    case 'completed': return 'completed';
    case 'errored': case 'failed': return 'failed';
    case 'interrupted': case 'shutdown': return 'stopped';
    default: return 'unknown';
  }
}

/** Only a native spawn receipt establishes ownership. Wait or status events
 * about other threads cannot attach them to the conversation. */
export class CodexSubagents {
  private readonly children = new Map<string, Child>();
  private readonly waits = new Map<string, string[]>();

  waiting(thread: string): string[] {
    return [...new Set([...this.waits.entries()].filter(([key])=>key.startsWith(`${thread}:`)).flatMap(([,ids])=>ids))];
  }
  endWait(thread: string) {
    for (const key of this.waits.keys()) if (key.startsWith(`${thread}:`)) this.waits.delete(key);
  }
  owner(id: string) { return this.children.get(id); }
  observe(thread: string, executionId: string, item: any, active: boolean): ExecutorItem[] {
    if (item?.type !== 'collabAgentToolCall' || item.senderThreadId !== thread || typeof item.id !== 'string' || !Array.isArray(item.receiverThreadIds)) return [];
    const parent = this.children.get(thread);
    const root = parent?.root ?? thread;
    const originalExecution = parent?.executionId ?? executionId;
    const ids = [...new Set(item.receiverThreadIds.filter((id: unknown): id is string => typeof id === 'string' && !!id && id !== thread && id !== root))].slice(0,64) as string[];
    if (item.tool === 'wait') {
      const key = `${thread}:${item.id}`;
      if (active && item.status === 'inProgress') this.waits.set(key,ids.flatMap(id=>{
        const child=this.children.get(id);
        return child?.parent===thread ? [child.marker.subagent!.key] : [];
      }));
      else this.waits.delete(key);
    }
    const markers: ExecutorItem[] = [];
    for (const id of ids) {
      let child = this.children.get(id);
      if (!child && item.tool === 'spawnAgent' && item.status !== 'failed' && this.children.size < 128) {
        const key = `codex-subagent:${id}`;
        const marker: ExecutorItem = {id:key, kind:'notice',role:'system',text:'',executionId:originalExecution,parentToolId:parent?.marker.subagent?.key,
          subagent:{key,label:'子智能体',prompt:typeof item.prompt==='string'?nativePreview(item.prompt):undefined,status:'unknown'}};
        child={parent:thread,root,executionId:originalExecution,marker};
        this.children.set(id,child);
      }
      if (!child || child.parent !== thread || child.root !== root) continue;
      const detail = Object.hasOwn(item.agentsStates ?? {},id) ? item.agentsStates[id] : undefined;
      const next = state(detail?.status);
      const prior = child.marker.subagent!;
      // A historical spawn that was still running is not current evidence.
      const status = next === 'unknown' || next === 'running' && !active ? prior.status : next;
      const terminal = ['completed','failed','stopped'].includes(next);
      const text = terminal && typeof detail?.message==='string' ? nativePreview(detail.message) : status==='running' ? '' : child.marker.text;
      child.marker = {...child.marker,text,subagent:{...prior,status,returned:status==='running'?undefined:prior.returned || item.tool==='wait' && item.status==='completed' && terminal || undefined}};
      markers.push(child.marker);
    }
    return markers;
  }
  project(id: string, item: any, status: string): ExecutorItem[] {
    const child = this.children.get(id);
    if (!child || item?.type === 'userMessage') return [];
    return codexItem(item,child.executionId,status).map(({nativeTool:_,participation:_participation,...value})=>({
      ...value, id:`codex-child:${id}:${value.id}`, parentToolId:child.marker.subagent!.key, text:nativePreview(value.text),
    }));
  }
  async read(rpc: CodexRpc, id: string, cwd: string): Promise<ExecutorItem[]> {
    const child = this.children.get(id);
    if (!child) return [];
    const thread = await codexThreadMetadata(rpc,id,cwd);
    const turn = await codexLatestTurn(rpc,id);
    if (!turn || typeof turn.id !== 'string') return [];
    const items=await codexTurnItems(rpc,id,turn.id,{maxPages:3});
    const label = typeof thread.agentNickname==='string' && thread.agentNickname.trim() ? thread.agentNickname.trim().slice(0,140) : child.marker.subagent!.label;
    child.marker={...child.marker,subagent:{...child.marker.subagent!,label}};
    // A read can race with a new live update. It enriches process and name,
    // never replaces a newer parent-side status or result with old history.
    return [child.marker,...items.flatMap(item=>this.project(id,item,turn.status))];
  }
}
