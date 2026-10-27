import { useRef, useState } from 'react';
import { Alert, Button, Empty, Popover } from 'antd';
import { UnorderedListOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { ConversationActivityStatus } from './ConversationActivityStatus';
import type { ActivityState } from './conversation-activity';
import './conversation-activity.css';
export type ActivityItem={id:string;workspaceId:string;title:string;meta:string;state:ActivityState};
export type ActivityPopupControl={open?:boolean;onOpenChange?(value:boolean):void};
type Props=ActivityPopupControl&{items:ActivityItem[];total:number;error?:string;hasMore?:boolean;workspaces:Array<{id:string;name:string}>;selectedId?:string;active?:boolean;side?:'left'|'right';onOpen(item:ActivityItem):void;onHistory():void;onToggleHistory?():void;onMore?():void};
/** Shared by the product and offline prototype. It never reads or mutates conversations. */
export function ConversationActivityEntry(props:Props) {
  const [localOpen,setLocalOpen]=useState(false),dismissed=useRef(false),entry=useRef<HTMLButtonElement>(null);
  const open=!props.active&&(props.open??localOpen);
  const setOpen=(value:boolean)=>{const next=value&&!props.active;setLocalOpen(next);props.onOpenChange?.(next);};
  const groups=new Map<string,ActivityItem[]>();
  for(const item of props.items){const rows=groups.get(item.workspaceId);if(rows)rows.push(item);else groups.set(item.workspaceId,[item]);}
  const dismiss=()=>{dismissed.current=true;setOpen(false);};
  const history=()=>{dismiss();props.onHistory();};
  return <Popover open={open} placement={props.side==='left'?'rightTop':'leftTop'} trigger={['hover']} mouseEnterDelay={0.15} mouseLeaveDelay={0.2} rootClassName="ac-activity-popover"
    onOpenChange={next=>{if(next&&dismissed.current)return;if(!next&&(document.activeElement===entry.current||document.activeElement?.closest('.ac-activity-menu')))return;setOpen(next);}}
    content={<section className="ac-activity-menu" aria-label="活动中的对话"
      onBlur={event=>{const next=event.relatedTarget;if(next instanceof Element&&(next.closest('.ac-activity-menu')||next===entry.current))return;setOpen(false);}}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();entry.current?.focus();dismiss();}}}>
      <header><div className="ac-activity-heading"><strong>活动对话</strong><small>{props.total}</small></div>
        <Button type="text" className="ac-activity-history" aria-label="查看全部对话" onClick={history}>查看全部对话<ArrowRightOutlined aria-hidden="true"/></Button></header>
      {props.error&&<Alert type="warning" showIcon message={props.error}/>}
      <div className="ac-activity-items">{[...groups].map(([workspaceId,items])=><section className="ac-activity-workspace" key={workspaceId} data-activity-workspace={workspaceId} aria-label={props.workspaces.find(row=>row.id===workspaceId)?.name||workspaceId}>
        <h3><span title={props.workspaces.find(row=>row.id===workspaceId)?.name||workspaceId}>{props.workspaces.find(row=>row.id===workspaceId)?.name||workspaceId}</span><small>{items.length}</small></h3>
        {items.map(item=><button key={item.workspaceId+':'+item.id} data-activity-id={item.id} className={props.selectedId===item.id?'is-selected':''} onClick={()=>{dismiss();props.onOpen(item);}}>
        <span className="ac-activity-title"><strong title={item.title}>{item.title}</strong><ConversationActivityStatus state={item.state}/></span><small title={item.meta}>{item.meta}</small>
      </button>)}</section>)}
      {!props.items.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活动中的对话"/>}
      {props.hasMore&&<Button type="text" className="ac-activity-more" onClick={props.onMore}>显示更多活动对话</Button>}</div>
    </section>}>
    <Button ref={entry} type="text" className={'ac-conversation-icon ac-all-conversations'+(props.active?' is-active':'')} aria-label="所有对话" aria-expanded={Boolean(props.active||open)} aria-pressed={Boolean(props.active)} aria-controls="agent-conversation-panel" title={props.active?'收起对话历史':'对话历史'} aria-haspopup="dialog"
      onFocus={()=>{dismissed.current=false;setOpen(true);}} onBlur={event=>{if(event.relatedTarget instanceof Element&&event.relatedTarget.closest('.ac-activity-menu'))return;setOpen(false);}}
      onPointerEnter={()=>{dismissed.current=false;}} onPointerDown={()=>{dismissed.current=false;}}
      onKeyDown={event=>{if(event.key==='Escape'){dismiss();event.currentTarget.blur();}}}
      onClick={()=>{dismiss();(props.onToggleHistory??props.onHistory)();}}>
      <UnorderedListOutlined aria-hidden="true"/>{props.total>0&&<span className="ac-activity-count" aria-label={`${props.total} 个活动对话`}>{props.total>99?'99+':props.total}</span>}
    </Button>
  </Popover>;
}
