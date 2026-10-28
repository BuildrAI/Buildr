import { cloneElement, useRef, useState, type HTMLAttributes, type ReactElement, type Ref } from 'react';
import { Button } from 'antd';
import { CommentOutlined } from '@ant-design/icons';
import { usePanePeek } from '../../components/usePanePeek';
import type { ActivityPopupControl } from './ConversationActivityEntry';
import './conversation-dock.css';

type Props={panel:ReactElement<HTMLAttributes<HTMLElement>&{ref?:Ref<HTMLElement>}>;activity:ReactElement<ActivityPopupControl>;open:boolean;initialActivityOpen?:boolean;view?:'conversation'|'history';onPreviewCurrent?():void;full?:boolean;side?:'left'|'right';width:number;onToggle():void;divider?:ReactElement;railClassName?:string};
/** Current conversation keeps its transient/pinned behavior; activity is a separate entry. */
export function ConversationDockSurface({panel,activity,open,initialActivityOpen=false,view='conversation',onPreviewCurrent,full,side='right',width,onToggle,divider,railClassName=''}:Props) {
  const pane=useRef<HTMLElement>(null),current=useRef<HTMLButtonElement>(null);
  const [activityOpen,setActivityOpen]=useState(initialActivityOpen);
  const peek=usePanePeek({enabled:!open,paneRef:pane,railRef:current});
  const activityChange=(next:boolean)=>{if(next)peek.close();setActivityOpen(next);};
  const enterCurrent=(pointerType:string)=>{setActivityOpen(false);if(!open)onPreviewCurrent?.();peek.enter('current',pointerType,current.current??undefined);};
  const content=cloneElement(panel,{
    ref:pane,hidden:!open&&!peek.open,
    style:{...panel.props.style,width:full?'calc(100% - 52px)':width},
    className:(panel.props.className??'')+(!open?' is-peeking':''),
    'data-dock':side,
    // The pointer crosses this pane in the gap before entering the activity portal.
    // Let the popover's shared hover boundary close it, without opening another peek.
    onPointerEnter:event=>{if(!activityOpen)peek.enter('pane',event.pointerType);},onPointerLeave:event=>peek.exit('pane',event.pointerType),
  } as HTMLAttributes<HTMLElement>&{ref:Ref<HTMLElement>});
  return <>{open&&!full&&side==='right'&&divider}{content}{open&&!full&&side==='left'&&divider}
    <aside className={'ac-collapsed-rail '+railClassName} data-dock={side} aria-label="当前对话与所有对话" data-prototype-position="activity-rail">
      <Button ref={current} type="text" className={'ac-conversation-icon ac-current-conversation'+(open&&view==='conversation'?' is-active':'')} icon={<CommentOutlined aria-hidden="true"/>} aria-label={open&&view==='conversation'?'收起当前对话':'展开当前对话'} title="当前对话" aria-expanded={open&&view==='conversation'} aria-controls={panel.props.id}
        onPointerEnter={event=>enterCurrent(event.pointerType)} onPointerLeave={event=>{if(event.pointerType==='mouse'&&document.activeElement===current.current)current.current?.blur();peek.exit('current',event.pointerType);}}
        onFocus={()=>enterCurrent('keyboard')} onBlur={()=>peek.exit('current','keyboard')}
        onClick={event=>{setActivityOpen(false);peek.close();onToggle();if(event.detail>0)requestAnimationFrame(()=>current.current?.blur());}}/>
      {cloneElement(activity,{open:activityOpen,onOpenChange:activityChange})}
    </aside>
  </>;
}
