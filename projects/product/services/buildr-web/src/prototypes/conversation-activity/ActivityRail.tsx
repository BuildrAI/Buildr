import { ConversationActivityEntry, type ActivityPopupControl } from '../../features/agent-conversations/ConversationActivityEntry';
import { compareConversations, isActive, type DemoConversation } from './fixtures';

/** Prototype data and navigation only; the floating UI is the product component. */
export function ActivityRail({rows,selected,view,onOpen,onHistory,onToggleHistory,...popup}:{rows:DemoConversation[];selected:string|null;view:string;onOpen(row:DemoConversation):void;onHistory(workspace?:string):void;onToggleHistory?():void}&ActivityPopupControl) {
  const workspaces=[...new Set(rows.map(row=>row.workspace))].map(name=>({id:name,name}));
  const active=rows.filter(isActive).sort(compareConversations);
  return <ConversationActivityEntry {...popup} items={active.map(row=>({id:row.id,workspaceId:row.workspace,title:row.title,meta:`${row.agent} · ${row.model} · 刚刚`,state:row.status==='running'?'running':row.status==='waiting'?'waiting':row.unseen?'unseen':null}))} total={active.length} workspaces={workspaces} selectedId={view==='conversation'?selected??undefined:undefined} active={view==='history'} onOpen={item=>{const row=rows.find(row=>row.id===item.id);if(row)onOpen(row);}} onHistory={()=>onHistory('全部工作空间')} onToggleHistory={onToggleHistory}/>;
}
