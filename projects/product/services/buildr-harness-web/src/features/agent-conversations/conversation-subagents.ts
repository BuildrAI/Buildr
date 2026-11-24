import type { ConversationEntry, ConversationRun } from './types.ts';

type Dispatch = NonNullable<ConversationEntry['subagent']>;
export type Subagent = { entry: ConversationEntry; dispatch: Dispatch; parent?: string; process: ConversationEntry[] };
export const subagentStatus: Record<Dispatch['status'], string> = {running:'执行中',completed:'已完成',failed:'失败',stopped:'已停止',unknown:'待确认'};
function key(entry: ConversationEntry, nativeId: string) {
  return JSON.stringify([entry.participantId, entry.runId, nativeId]);
}

export function conversationSubagents(entries: readonly ConversationEntry[], runs: readonly ConversationRun[] = []) {
  const byNative = new Map<string, Subagent>();
  const owned = new Set<string>();
  const runById = new Map(runs.map(run=>[run.id,run]));
  for (const entry of entries) {
    if (!entry.subagent || !entry.participantId || !entry.runId) continue;
    const run = runById.get(entry.runId);
    const stale = entry.subagent.status==='running' && (run?.resourcesReleased || run?.status==='unknown' || run?.status==='stopped');
    byNative.set(key(entry,entry.subagent.key),{entry,dispatch:stale?{...entry.subagent,status:'unknown'}:entry.subagent,process:[]});
  }
  // Bind parent, child and output in the same participant and original round.
  for (const entry of entries) {
    if (!entry.parentToolId) continue;
    const parent = byNative.get(key(entry,entry.parentToolId));
    if (!parent || parent.entry.id===entry.id) continue;
    if (entry.subagent) {
      const child = byNative.get(key(entry,entry.subagent.key));
      if (!child) continue;
      const seen = new Set([child.entry.id]);
      let ancestor: Subagent | undefined = parent;
      while (ancestor && !seen.has(ancestor.entry.id)) {
        seen.add(ancestor.entry.id);
        ancestor = ancestor.entry.parentToolId ? byNative.get(key(ancestor.entry,ancestor.entry.parentToolId)) : undefined;
      }
      if (ancestor) continue;
      child.parent = parent.entry.id;
    } else if (!entry.thinking && entry.kind!=='thinking' && entry.role!=='user') parent.process.push(entry);
    owned.add(entry.id);
  }
  return { agents:[...byNative.values()], owned };
}

export function subagentWaitingLabel(run: ConversationRun | undefined, agents: readonly Subagent[]) {
  if (run?.status !== 'running' || !run.waitingSubagents?.length) return;
  const labels = agents.filter(({entry,dispatch})=>entry.runId===run.id && entry.participantId===run.participantId && run.waitingSubagents!.includes(dispatch.key)).map(({dispatch})=>dispatch.label);
  return labels.length===1 && run.waitingSubagents.length===1 ? `执行中 · 等待${labels[0]}` : `执行中 · 等待 ${run.waitingSubagents.length} 个子智能体`;
}

type SubagentStreamItem = {type:'process';entries:ConversationEntry[]}|{type:'dispatch';agent:Subagent};
/** Reuse the normal process renderer without promoting child output into the main transcript. */
export function subagentStream(agent:Subagent, agents:readonly Subagent[]):SubagentStreamItem[] {
  const rows:(ConversationEntry|Subagent)[]=[...agent.process,...agents.filter(row=>row.parent===agent.entry.id)];
  rows.sort((a,b)=>('entry' in a?a.entry.sequence:a.sequence)-('entry' in b?b.entry.sequence:b.sequence));
  // The app may have projected the same reply twice: as child text and as a
  // terminal result. Hide only the exact trailing duplicate in this view.
  const last=rows.at(-1);
  if(agent.entry.text.trim()&&last&&!('entry' in last)&&last.role==='assistant'&&last.kind==='message'&&last.status==='completed'&&last.text.trim()===agent.entry.text.trim())rows.pop();
  const groups:SubagentStreamItem[]=[];
  for(const row of rows){
    if('entry' in row){groups.push({type:'dispatch',agent:row});continue;}
    const previous=groups.at(-1);
    if(previous?.type==='process')previous.entries.push(row);
    else groups.push({type:'process',entries:[row]});
  }
  return groups;
}
