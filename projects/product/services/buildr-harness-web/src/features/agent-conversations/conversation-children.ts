import { activityState } from './conversation-activity.ts';
import type { ConversationSummary, ConversationView } from './types.ts';

type ConversationListRow = {
  id: string;
  workspaceId: string;
  childOf?: Pick<NonNullable<ConversationView['childOf']>, 'workspaceId' | 'conversationId'>;
};

/** Arrange the visible rows of one workspace without changing the backing page order. */
export function nestVisibleConversations<T extends ConversationListRow>(rows: readonly T[]) {
  const ids = new Set(rows.map(row => row.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const row of rows) {
    const parent = row.childOf;
    if (!parent || parent.workspaceId !== row.workspaceId || parent.conversationId === row.id || !ids.has(parent.conversationId)) {
      roots.push(row);
      continue;
    }
    const siblings = children.get(parent.conversationId) ?? [];
    siblings.push(row);
    children.set(parent.conversationId, siblings);
  }
  const result: {row: T; depth: number; childCount: number}[] = [];
  const stack = roots.reverse().map(row => ({row, depth: 0}));
  const shown = new Set<string>();
  while (stack.length) {
    const item = stack.pop()!;
    const siblings = children.get(item.row.id) ?? [];
    result.push({...item, childCount: siblings.length});
    shown.add(item.row.id);
    for (let i = siblings.length - 1; i >= 0; i--) stack.push({row: siblings[i], depth: item.depth + 1});
  }
  // Malformed cyclic relationships must not hide rows or trap traversal.
  for (const row of rows) if (!shown.has(row.id)) result.push({row, depth: 0, childCount: 0});
  return result;
}

export type ConversationHistoryBranch = {count: number; expanded: boolean; forced: boolean};

export function foldConversationHistory<T extends ConversationListRow>(rows: readonly T[], expanded: ReadonlySet<string>, selectedId?: string, searching = false) {
  const nested = nestVisibleConversations(rows);
  const ancestors = new Set<string>();
  const selectedIndex = nested.findIndex(item => item.row.id === selectedId);
  let depth = nested[selectedIndex]?.depth ?? 0;
  for (let i = selectedIndex - 1; i >= 0 && depth > 0; i--) {
    const item = nested[i];
    if (item.depth < depth) {
      ancestors.add(item.row.id);
      depth = item.depth;
    }
  }
  let foldedDepth = Infinity;
  return nested.flatMap(({row, depth, childCount}) => {
    if (depth > foldedDepth) return [];
    const forced = searching || ancestors.has(row.id);
    const branch: ConversationHistoryBranch | undefined = childCount ? {count: childCount, expanded: forced || expanded.has(row.id), forced} : undefined;
    foldedDepth = branch && !branch.expanded ? depth : Infinity;
    return [{row, depth, branch}];
  });
}

export function conversationChildIndent(depth: number) {
  return depth ? {marginInlineStart: `min(25%, ${depth * 24}px)`} : undefined;
}

export function mergeChildConversations(previous:ConversationView[],incoming:ConversationView[]):ConversationView[] {
  const rows=new Map(previous.map(row=>[row.id,row]));
  for(const row of incoming)rows.set(row.id,row);
  return [...rows.values()].sort((a,b)=>(a.childOf?.createdAt??a.updatedAt).localeCompare(b.childOf?.createdAt??b.updatedAt)||a.id.localeCompare(b.id));
}
export function childConversationStatus(chat:ConversationSummary):string {
  const state=activityState(chat);
  if(state==='send-failed')return '发送失败';
  if(state==='send-waiting')return '等待发送';
  if(state==='waiting')return '待决策';
  if(state==='unknown')return '状态待确认';
  if(state==='running')return '执行中';
  if(state==='unseen')return '待查看';
  const status=chat.run?.status;
  if(status==='tools-active')return '后台作业运行中';
  if(status==='failed')return '执行失败';
  if(status==='stopped')return '已停止';
  return status==='completed'?'已答复':'尚未开始';
}
export function childCreationStorageKey(parent:Pick<ConversationView,'workspaceId'|'id'>,profile:string):string {
  return 'buildr.child-creation:'+profile+':'+parent.workspaceId+':'+parent.id;
}
export type ChildCreation={expectedRevision:string;clientRequestId:string};
export function readChildCreation(storage:Pick<Storage,'getItem'>|undefined,key:string):ChildCreation|undefined {
  try {
    const value=JSON.parse(storage?.getItem(key)??'null');
    if(typeof value?.expectedRevision==='string'&&value.expectedRevision&&typeof value?.clientRequestId==='string'&&value.clientRequestId)
      return {expectedRevision:value.expectedRevision,clientRequestId:value.clientRequestId};
  }catch{/* A current-page attempt still remains usable. */}
}
