import { useEffect, useRef, useState, type HTMLAttributes, type ReactElement, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { SplitDivider } from '../../components/SplitDivider';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationActivity } from './ConversationActivity';
import { ConversationDockSurface } from './ConversationDockSurface';
import { AccountQuotaButton } from './AccountQuotaButton';
import type { ConversationWorkspace } from './ConversationHistory';
import { readOptionalPreference, writeOptionalPreference } from '../../lib/optional-preferences';
import './conversation-dock.css';

type Props = { panel: ReactElement<HTMLAttributes<HTMLElement> & {ref?: Ref<HTMLElement>}>; portalTarget?: HTMLElement | null; workspaces: ConversationWorkspace[] };
const minimumWidth = 560;
const defaultWidth = 620;
const maximumWidth = 800;
const clampWidth = (width: number) => Math.min(maximumWidth, Math.max(minimumWidth, width));

/** Keep the same conversation while it is temporarily shown or fixed beside the work. */
export function ConversationDock({panel, portalTarget, workspaces}: Props) {
  const context = useAgentConversations();
  const [width, setWidth] = useState(() => {
    const saved = Number(readOptionalPreference('buildr.agent-conversation-width'));
    return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : defaultWidth;
  });
  const drag = useRef<{pointerId: number; x: number; width: number; side: 'left'|'right'; element: HTMLButtonElement} | null>(null);
  const latestWidth = useRef(width);
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
  return render(<ConversationDockSurface panel={panel} activity={<ConversationActivity workspaces={workspaces}/>} settingsEntry={<AccountQuotaButton/>} open={context.open} view={context.view} onPreviewCurrent={()=>context.setView('conversation')} full={context.full} side={context.side} width={width} onToggle={()=>context.toggleView('conversation')} onSettings={()=>context.setSettings(true)} divider={divider}/>);
}
