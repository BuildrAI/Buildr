import { useState } from 'react';
import { ExecutionStats, type ExecutionFilter, type StatsStatus } from './ExecutionStats';
import { ConversationActivityEntry, type ActivityPopupControl } from '../../features/agent-conversations/ConversationActivityEntry';
import { compareConversations, isActive, matchesExecutionFilter, type DemoConversation } from './fixtures';

/** Prototype data and navigation only; the floating UI is the product component. */
export function ActivityRail({rows,selected,view,onOpen,onHistory,onToggleHistory,initialFilter=null,statsStatus='ready',onFilterState,...popup}:{rows:DemoConversation[];selected:string|null;view:string;onOpen(row:DemoConversation):void;onHistory(workspace?:string):void;onToggleHistory?():void;initialFilter?:ExecutionFilter;statsStatus?:StatsStatus;onFilterState?(value:ExecutionFilter):void}&ActivityPopupControl) {
  const [filter,setFilter]=useState<ExecutionFilter>(initialFilter);
  const chooseFilter=(value:ExecutionFilter)=>{setFilter(value);onFilterState?.(value);};
  const workspaces=[...new Set(rows.map(row=>row.workspace))].map(name=>({id:name,name}));
  const active=rows.filter(isActive).sort(compareConversations);
  const visible=active.filter(row=>matchesExecutionFilter(row,statsStatus==='ready'?filter:null));
  return <ConversationActivityEntry {...popup} menuClassName="ca-stats-activity" historyPlacement="header" summary={<ExecutionStats rows={rows} filter={filter} onFilter={chooseFilter} compact status={statsStatus}/>} emptyDescription={filter?'没有匹配的执行中对话':'暂无活动中的对话'} items={visible.map(row=>({id:row.id,workspaceId:row.workspace,title:row.title,meta:`${row.agent} · ${row.model} · 刚刚`,state:row.status==='running'?'running':row.status==='waiting'?'waiting':row.status==='unknown'?'unknown':row.unseen?'unseen':null}))} total={active.length} workspaces={workspaces} selectedId={view==='conversation'?selected??undefined:undefined} active={view==='history'} onOpen={item=>{const row=rows.find(row=>row.id===item.id);if(row)onOpen(row);}} onHistory={()=>onHistory('全部工作空间')} onToggleHistory={onToggleHistory}/>;
}
