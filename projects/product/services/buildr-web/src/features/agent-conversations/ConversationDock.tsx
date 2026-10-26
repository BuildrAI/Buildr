import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type Ref } from 'react';
import { Button } from 'antd';
import { createPortal } from 'react-dom';
import { CommentOutlined } from '@ant-design/icons';
import { SplitDivider } from '../../components/SplitDivider';
import { usePanePeek } from '../../components/usePanePeek';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationAttention } from './ConversationAttention';
import { readOptionalPreference, writeOptionalPreference } from '../../lib/optional-preferences';
import './conversation-dock.css';

type Props = { panel: ReactElement<HTMLAttributes<HTMLElement> & {ref?: Ref<HTMLElement>}>; portalTarget?: HTMLElement | null };
const minimumWidth = 560;
const defaultWidth = 620;
const maximumWidth = 800;
const clampWidth = (width: number) => Math.min(maximumWidth, Math.max(minimumWidth, width));

/** Keep the same conversation while it is temporarily shown or fixed beside the work. */
export function ConversationDock({panel, portalTarget}: Props) {
  const context = useAgentConversations();
  const [width, setWidth] = useState(() => {
    const saved = Number(readOptionalPreference('buildr.agent-conversation-width'));
    return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : defaultWidth;
  });
  const pane = useRef<HTMLElement>(null), rail = useRef<HTMLElement>(null);
  const peek = usePanePeek({enabled: !context.open, paneRef:pane, railRef:rail});
  const drag = useRef<{pointerId: number; x: number; width: number; side: 'left'|'right'; element: HTMLButtonElement} | null>(null);
  const latestWidth = useRef(width);
  const collapsedButton = useRef<HTMLButtonElement>(null);
  const boundaryFocus = useRef(false);
  const toggleBoundary = () => {
    boundaryFocus.current = document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest('#agent-conversation-panel,.ac-collapsed-rail'));
    context.toggle();
  };
  useLayoutEffect(() => {
    if (!boundaryFocus.current) return;
    boundaryFocus.current = false;
    const button = collapsedButton.current;
    (button?.getClientRects().length ? button : document.getElementById('global-conversations-entry'))?.focus({preventScroll:true});
  }, [context.open]);
  const resize = (value: number, persist = false) => {
    latestWidth.current = clampWidth(value);
    setWidth(latestWidth.current);
    if (persist) writeOptionalPreference('buildr.agent-conversation-width', String(Math.round(latestWidth.current)));
  };
  const finish = (pointerId?: number) => {
    const active = drag.current;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    drag.current = null;
    if (active.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
    resize(latestWidth.current, true);
  };
  useEffect(() => {
    if (drag.current && (!context.open || context.full || drag.current.side !== context.side)) finish();
  }, [context.open, context.full, context.side]);
  const render = (value: ReactElement) => portalTarget ? createPortal(value, portalTarget) : value;
  const collapsedRail = <aside ref={rail} className="ac-collapsed-rail" data-dock={context.side} aria-label={context.open?'对话导航':'已收起的对话'}
    onPointerEnter={event=>peek.enter('rail',event.pointerType,collapsedButton.current||undefined)} onPointerLeave={event=>{if(event.pointerType==='mouse'&&document.activeElement===collapsedButton.current)collapsedButton.current?.blur();peek.exit('rail',event.pointerType);}}>
    <Button ref={collapsedButton} type="text" className={'ac-conversation-icon'+(context.open?' is-active':'')} icon={<CommentOutlined/>} aria-label={context.open?'收起对话':'展开对话'} title="对话" aria-expanded={context.open} aria-controls="agent-conversation-panel" onClick={event=>{toggleBoundary();if(event.detail>0)requestAnimationFrame(()=>collapsedButton.current?.blur());}}/>
    <ConversationAttention/>
  </aside>;
  const content = cloneElement(panel, {
    hidden:!context.open&&!peek.open,
    ref:pane, style: {...panel.props.style, width: context.full ? 'calc(100% - 52px)' : width},
    className:(panel.props.className||'')+(!context.open?' is-peeking':''),
    onPointerEnter:event=>peek.enter('pane',event.pointerType), onPointerLeave:event=>peek.exit('pane',event.pointerType),
  }, <>{panel.props.children}</>);
  const divider = <SplitDivider className="ac-divider" data-dock={context.side} aria-label="调整对话宽度" aria-controls="agent-conversation-panel"
    aria-valuemin={minimumWidth} aria-valuemax={maximumWidth} aria-valuenow={Math.round(width)} aria-valuetext={`对话宽度 ${Math.round(width)}px`} title="拖动调整对话宽度；方向键微调，双击恢复"
    onKeyDown={event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const direction = (event.key === 'ArrowLeft' ? -1 : 1) * (context.side === 'left' ? 1 : -1);
      resize(event.key === 'Home' ? minimumWidth : event.key === 'End' ? maximumWidth : width + direction * (event.shiftKey ? 32 : 16), true);
    }}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {pointerId:event.pointerId, x:event.clientX, width, side:context.side, element:event.currentTarget};
    }}
    onPointerMove={event => { const active = drag.current; if (active?.pointerId === event.pointerId) resize(active.width + (event.clientX-active.x) * (active.side === 'left' ? 1 : -1)); }}
    onPointerUp={event => finish(event.pointerId)} onPointerCancel={event => finish(event.pointerId)} onLostPointerCapture={event => finish(event.pointerId)} onDoubleClick={() => resize(defaultWidth, true)}>
    <span className="split-divider-header-marker" aria-hidden="true"/>
  </SplitDivider>;
  // Retain the content at the same sibling position when switching from hover to fixed.
  return render(<>{context.open && !context.full && context.side === 'right' && divider}{content}{context.open && !context.full && context.side === 'left' && divider}{collapsedRail}</>);
}
