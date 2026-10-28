import { useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Empty, Popover } from 'antd';
import { UnorderedListOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { ConversationActivityStatus } from './ConversationActivityStatus';
import { activityReminder, type ActivityCounts, type ActivityState } from './conversation-activity';
import { CopyButton } from '../../components/CopyButton';
import './conversation-activity.css';
export type ActivityItem={id:string;workspaceId:string;title:string;meta:string;state:ActivityState};
export type ActivityPopupControl={open?:boolean;onOpenChange?(value:boolean):void};
type Props=ActivityPopupControl&{counts?:ActivityCounts;countsStale?:boolean;summary?:ReactNode;historyPlacement?:'header'|'footer';menuClassName?:string;emptyDescription?:string;items:ActivityItem[];total:number;error?:string;hasMore?:boolean;workspaces:Array<{id:string;name:string}>;selectedId?:string;active?:boolean;side?:'left'|'right';onOpen(item:ActivityItem):void;onHistory():void;onToggleHistory?():void;onMore?():void};
/** Shared by the product and offline prototype. It never reads or mutates conversations. */
export function ConversationActivityEntry(props:Props) {
  const [localOpen,setLocalOpen]=useState(false),dismissed=useRef(false),pointerFocus=useRef(false),entry=useRef<HTMLButtonElement>(null);
  const open=!props.active&&(props.open??localOpen);
  const setOpen=(value:boolean)=>{const next=value&&!props.active;setLocalOpen(next);props.onOpenChange?.(next);};
  const groups=new Map<string,ActivityItem[]>();
  for(const item of props.items){const rows=groups.get(item.workspaceId);if(rows)rows.push(item);else groups.set(item.workspaceId,[item]);}
  const dismiss=()=>{dismissed.current=true;setOpen(false);};
  const history=()=>{dismiss();props.onHistory();};
  const stale=props.countsStale??Boolean(props.error);
  const reminder=activityReminder(props.counts,stale);
  return <Popover open={open} placement={props.side==='left'?'rightTop':'leftTop'} trigger={['hover']} mouseEnterDelay={0.15} mouseLeaveDelay={0.5} rootClassName="ac-activity-popover"
    onOpenChange={next=>{if(next&&dismissed.current)return;if(!next&&(document.activeElement===entry.current||document.activeElement?.closest('.ac-activity-menu')))return;setOpen(next);}}
    content={<section className={'ac-activity-menu '+(props.menuClassName??'')} aria-label="活动中的对话"
      onBlur={event=>{const next=event.relatedTarget;if(next instanceof Element&&(next.closest('.ac-activity-menu')||next===entry.current))return;setOpen(false);}}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();entry.current?.focus();dismiss();}}}>
      <header><div className="ac-activity-heading"><strong>活动对话</strong><small>{props.counts?.active??(props.total||'—')}</small></div>
        {props.historyPlacement!=='footer'&&<Button type="text" className="ac-activity-history" aria-label="全部对话" onClick={history}>全部对话<ArrowRightOutlined aria-hidden="true"/></Button>}</header>
      {props.summary}
      {props.error&&<Alert type="warning" showIcon message={props.error}/>}
      <div className="ac-activity-items">{[...groups].map(([workspaceId,items])=><section className="ac-activity-workspace" key={workspaceId} data-activity-workspace={workspaceId} aria-label={props.workspaces.find(row=>row.id===workspaceId)?.name||workspaceId}>
        <h3><span title={props.workspaces.find(row=>row.id===workspaceId)?.name||workspaceId}>{props.workspaces.find(row=>row.id===workspaceId)?.name||workspaceId}</span><small>{items.length}</small></h3>
        {items.map(item=><div key={item.workspaceId+':'+item.id} className={'ac-activity-row'+(props.selectedId===item.id?' is-selected':'')}>
        <button type="button" data-activity-id={item.id} className="ac-activity-row-main" onClick={()=>{dismiss();props.onOpen(item);}}>
        <span className="ac-activity-title"><strong title={item.title}>{item.title}</strong><ConversationActivityStatus state={item.state}/></span><small><span className="ac-activity-id" title={item.id}>ID {item.id}</span><span className="ac-activity-meta" title={item.meta}>{item.meta}</span></small>
        </button>
        <CopyButton type="text" className="ac-activity-row-copy" text={item.id} ariaLabel="复制对话 ID" failureMessage="复制失败，请手动选择对话 ID 复制。"/>
        </div>)}</section>)}
      {!props.items.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.emptyDescription??'暂无活动中的对话'}/>}
      {props.hasMore&&<Button type="text" className="ac-activity-more" onClick={props.onMore}>显示更多活动对话</Button>}</div>
      {props.historyPlacement==='footer'&&<footer className="ac-activity-history-footer"><Button type="text" aria-label="全部对话" onClick={history}>全部对话<ArrowRightOutlined aria-hidden="true"/></Button></footer>}
    </section>}>
    <Button ref={entry} type="text" className={'ac-conversation-icon ac-all-conversations'+(props.active?' is-active':'')+(stale?' is-stale':'')} aria-label={`所有对话，${reminder}`} aria-expanded={Boolean(props.active||open)} aria-pressed={Boolean(props.active)} aria-controls="agent-conversation-panel" title={(props.active?'收起对话列表':'对话列表')+'；'+reminder} aria-haspopup="dialog"
      onFocus={()=>{if(pointerFocus.current)return;dismissed.current=false;setOpen(true);}} onBlur={event=>{pointerFocus.current=false;if(event.relatedTarget instanceof Element&&event.relatedTarget.closest('.ac-activity-menu'))return;setOpen(false);}}
      onPointerEnter={()=>{if(!pointerFocus.current)dismissed.current=false;}}
      // Pointer focus precedes click. Cancel both focus-open and the pending hover,
      // otherwise the popup is rendered for one frame before history opens.
      onPointerDown={()=>{pointerFocus.current=true;dismiss();}} onPointerCancel={()=>{pointerFocus.current=false;}}
      onKeyDown={event=>{if(event.key==='Escape'){dismiss();event.currentTarget.blur();}}}
      onClick={()=>{pointerFocus.current=false;dismiss();(props.onToggleHistory??props.onHistory)();}}>
      <UnorderedListOutlined aria-hidden="true"/>{props.total>0&&<span className="ac-activity-count" data-count-kind="active" aria-label={`${props.total} 个活动对话`}>{props.total>99?'99+':props.total}</span>}
      {!!props.counts?.attention&&<span className="ac-activity-count ac-attention-count" data-count-kind="attention" aria-label={`${props.counts.attention} 个需关注对话`}>{props.counts.attention>99?'99+':props.counts.attention}</span>}
    </Button>
  </Popover>;
}
