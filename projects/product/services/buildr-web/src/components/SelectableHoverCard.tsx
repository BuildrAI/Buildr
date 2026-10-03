import { useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Popover, type PopoverProps } from 'antd';
import { WorkspaceViewActiveContext } from '../app/pageTabs';
import './selectable-hover-card.css';

type Props = {
  children: ReactElement;
  content: ReactNode;
  title?: ReactNode;
  placement?: PopoverProps['placement'];
  open?: boolean;
  onOpenChange?(open: boolean): void;
};

/** Buildr's existing Popover interaction, with time to enter and select its content. */
export function SelectableHoverCard({ children, content, title, placement = 'rightTop', open: controlledOpen, onOpenChange }: Props) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const [localOpen, setLocalOpen] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null), panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = viewActive && (controlledOpen ?? localOpen);
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const change = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
  const contains = (node: EventTarget | null) => node instanceof Node && Boolean(trigger.current?.contains(node) || panel.current?.contains(node));
  const openNow = () => { if (viewActive) { cancelClose(); change(true); } };
  const closeSoon = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!contains(document.activeElement) && !trigger.current?.matches(':hover') && !panel.current?.matches(':hover')) change(false);
    }, 350);
  };
  useEffect(() => () => cancelClose(), []);
  useEffect(() => { if (!viewActive) { cancelClose(); change(false); } }, [viewActive]);
  useEffect(() => { if (!open) cancelClose(); }, [open]);
  return <Popover trigger={['hover']} placement={placement} mouseEnterDelay={0.35} mouseLeaveDelay={0}
    open={open} onOpenChange={next => { if (next) openNow(); else closeSoon(); }}
    classNames={{ root: 'selectable-hover-card' }} title={title}
    content={<div ref={panel} className="selectable-hover-card-content" onPointerEnter={cancelClose} onPointerLeave={closeSoon}
      onFocusCapture={cancelClose} onBlurCapture={event => { if (!contains(event.relatedTarget)) closeSoon(); }}>{content}</div>}>
    <span ref={trigger} className="selectable-hover-trigger" onFocusCapture={openNow}
      onBlurCapture={event => { if (!contains(event.relatedTarget)) closeSoon(); }}>{children}</span>
  </Popover>;
}
