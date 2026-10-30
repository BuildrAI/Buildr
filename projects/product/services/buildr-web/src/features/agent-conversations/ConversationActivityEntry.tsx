import { useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Popover } from 'antd';
import { UnorderedListOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { ConversationActivityStatus } from './ConversationActivityStatus';
import { groupConversationWorkspaces, activityBadge, activityReminder, type ActivityCounts, type ActivityState } from './conversation-activity';
import { CopyButton } from '../../components/CopyButton';
import './conversation-activity.css';
export type ActivityItem={id:string;workspaceId:string;title:string;meta:string;state:ActivityState;userInputAt?:string};
export type ActivityPopupControl={open?:boolean;onOpenChange?(value:boolean):void};
type Props=ActivityPopupControl&{counts?:ActivityCounts;countsStale?:boolean;summary?:ReactNode;historyPlacement?:'header'|'footer';menuClassName?:string;emptyDescription?:string;items:ActivityItem[];total:number;error?:string;hasMore?:boolean;workspaces:Array<{id:string;name:string}>;selectedId?:string;active?:boolean;side?:'left'|'right';onOpen(item:ActivityItem):void;onHistory():void;onToggleHistory?():void;onMore?():void};
/** Shared by the product and offline prototype. It never reads or mutates conversations. */
export function ConversationActivityEntry(props:Props) {
  const [localOpen,setLocalOpen]=useState(false),dismissed=useRef(false),pointerFocus=useRef(false),entry=useRef<HTMLButtonElement>(null);
  const open=!props.active&&(props.open??localOpen);
  const setOpen=(value:boolean)=>{const next=value&&!props.active;setLocalOpen(next);props.onOpenChange?.(next);};
  const priority=(item:ActivityItem)=>item.state==='waiting'||item.state==='unseen'?0:1;
  const items=[...props.items].sort((a,b)=>priority(a)-priority(b)||(a.userInputAt&&b.userInputAt?b.userInputAt.localeCompare(a.userInputAt)||b.id.localeCompare(a.id):0));
  const renderRows=(items:ActivityItem[])=>{
    const groups=groupConversationWorkspaces(items);
    return [...groups].map(([key,rows])=>{const workspaceId=rows[0].workspaceId;return <section className="ac-activity-workspace" key={key} data-activity-workspace={workspaceId} aria-label={props.workspaces.find(row=>row.id===workspaceId)?.name||workspaceId}>
      <h3><span>{props.workspaces.find(row=>row.id===workspaceId)?.name||workspaceId}</span><small>{rows.length}</small></h3>
      {rows.map(item=><div key={item.workspaceId+':'+item.id} className={'ac-activity-row'+(props.selectedId===item.id?' is-selected':'')}>
        <button type="button" data-activity-id={item.id} className="ac-activity-row-main" onClick={()=>{dismiss();props.onOpen(item);}}><span className="ac-activity-title"><strong title={item.title}>{item.title}</strong><ConversationActivityStatus state={item.state}/></span><small><span className="ac-activity-id" title={item.id}>{item.id}</span><span className="ac-activity-meta" title={item.meta}>{item.meta}</span></small></button>
        <CopyButton type="text" className="ac-activity-row-copy" text={item.id} ariaLabel="复制对话 ID" failureMessage="复制失败，请手动选择对话 ID 复制。"/>
      </div>)}
    </section>;});
  };
  const dismiss=()=>{dismissed.current=true;setOpen(false);};
  const history=()=>{dismiss();props.onHistory();};
  const stale=props.countsStale??Boolean(props.error);
  const reminder=activityReminder(props.counts,stale);
  const badge=activityBadge(props.counts);
  return <Popover open={open} placement={props.side==='left'?'rightTop':'leftTop'} trigger={['hover']} mouseEnterDelay={0.15} mouseLeaveDelay={0.5} rootClassName="ac-activity-popover"
    onOpenChange={next=>{if(next&&dismissed.current)return;if(!next&&(document.activeElement===entry.current||document.activeElement?.closest('.ac-activity-menu')))return;setOpen(next);}}
    content={<section className={'ac-activity-menu '+(props.menuClassName??'')} aria-label="对话提醒"
      onBlur={event=>{const next=event.relatedTarget;if(next instanceof Element&&(next.closest('.ac-activity-menu')||next===entry.current))return;setOpen(false);}}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();entry.current?.focus();dismiss();}}}>
      <header><div className="ac-activity-heading"><strong>对话提醒</strong></div>
        {props.historyPlacement!=='footer'&&<Button type="text" className="ac-activity-history" aria-label="全部对话" onClick={history}>全部对话<ArrowRightOutlined aria-hidden="true"/></Button>}</header>
      {props.summary}
      {props.error&&<Alert type="warning" showIcon message={props.error}/>}
      {!props.counts&&<p className="ac-activity-counts-note">提醒数量尚未读取</p>}
      <div className="ac-activity-items"><section className="ac-reminder-section" aria-label="活动中">
        <h3>活动中<small>{props.counts?.active??'—'}</small></h3>
        {renderRows(items)}
        {!items.length&&<p className="ac-reminder-empty">{props.counts?.active===0?'暂无活动对话':props.emptyDescription||'正在读取对话…'}</p>}
      </section>
      {props.hasMore&&<Button type="text" className="ac-activity-more" onClick={props.onMore}>显示更多对话</Button>}</div>
      {props.historyPlacement==='footer'&&<footer className="ac-activity-history-footer"><Button type="text" aria-label="全部对话" onClick={history}>全部对话<ArrowRightOutlined aria-hidden="true"/></Button></footer>}
    </section>}>
    <Button ref={entry} type="text" className={'ac-conversation-icon ac-all-conversations'+(props.active?' is-active':'')+(stale?' is-stale':'')} aria-label={`所有对话，${reminder}`} aria-expanded={Boolean(props.active||open)} aria-pressed={Boolean(props.active)} aria-controls="agent-conversation-panel" title="对话列表" aria-haspopup="dialog"
      onFocus={()=>{if(pointerFocus.current)return;dismissed.current=false;setOpen(true);}} onBlur={event=>{pointerFocus.current=false;if(event.relatedTarget instanceof Element&&event.relatedTarget.closest('.ac-activity-menu'))return;setOpen(false);}}
      onPointerEnter={()=>{if(!pointerFocus.current)dismissed.current=false;}}
      // Pointer focus precedes click. Cancel both focus-open and the pending hover,
      // otherwise the popup is rendered for one frame before history opens.
      onPointerDown={()=>{pointerFocus.current=true;dismiss();}} onPointerCancel={()=>{pointerFocus.current=false;}}
      onKeyDown={event=>{if(event.key==='Escape'){dismiss();event.currentTarget.blur();}}}
      onClick={()=>{pointerFocus.current=false;dismiss();(props.onToggleHistory??props.onHistory)();}}>
      <UnorderedListOutlined aria-hidden="true"/>{badge&&<span className={'ac-activity-count'+(badge.kind==='attention'?' ac-attention-count':'')} data-count-kind={badge.kind} aria-label={`${badge.count} 个${badge.label}对话`}>{badge.count>99?'99+':badge.count}</span>}
    </Button>
  </Popover>;
}
