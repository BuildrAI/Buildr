import { useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Popover, type PopoverProps } from 'antd';
import { WorkspaceViewActiveContext } from '../app/pageTabs';
import './selectable-hover-card.css';

type Props = {
  children: ReactElement;
  content: ReactNode;
  title?: ReactNode;
  placement?: PopoverProps['placement'];
  focusTrigger?: 'always' | 'keyboard';
  closeOnTriggerClick?: boolean;
  /** Keep interactive information beside this ancestor, outside its pointer path. */
  sideBoundary?: string;
  open?: boolean;
  onOpenChange?(open: boolean): void;
};

/** Buildr's existing Popover interaction, with time to enter and select its content. */
export function SelectableHoverCard({ children, content, title, placement = 'rightTop', focusTrigger = 'always', closeOnTriggerClick = false, sideBoundary, open: controlledOpen, onOpenChange }: Props) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const [localOpen, setLocalOpen] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null), panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedHover = useRef(false);
  const [sideLayout, setSideLayout] = useState<{offset: number; width: number} | null>(null);
  const open = viewActive && (controlledOpen ?? localOpen);
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const change = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
  const contains = (node: EventTarget | null) => node instanceof Node && Boolean(trigger.current?.contains(node) || panel.current?.contains(node));
  const keepsFocus = (node: Element | null) => Boolean(node && (panel.current?.contains(node) || trigger.current?.contains(node) && (focusTrigger === 'always' || node.matches(':focus-visible'))));
  const placeBeside = () => {
    const anchor = trigger.current, boundary = sideBoundary && anchor?.closest(sideBoundary);
    if (!anchor || !boundary) return false;
    const boundaryBox = boundary.getBoundingClientRect(), anchorBox = anchor.getBoundingClientRect();
    if (!boundaryBox.width || !boundaryBox.height || !anchorBox.width || !anchorBox.height) return false;
    const right = boundaryBox.right;
    const width = Math.min(440, window.innerWidth - right - 40);
    if (width <= 0) return false;
    const offset = right + 8 - anchorBox.right;
    setSideLayout(previous => previous?.offset === offset && previous.width === width ? previous : {offset, width});
    return true;
  };
  const openNow = () => { if (viewActive && !dismissedHover.current && (!sideBoundary || placeBeside())) { cancelClose(); change(true); } };
  const closeSoon = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!keepsFocus(document.activeElement) && !trigger.current?.matches(':hover') && !panel.current?.matches(':hover')) change(false);
    }, 350);
  };
  useEffect(() => () => cancelClose(), []);
  useEffect(() => { if (!viewActive) { dismissedHover.current = false; cancelClose(); change(false); } }, [viewActive]);
  useEffect(() => { if (!open) cancelClose(); }, [open]);
  useEffect(() => {
    if (!open || !sideBoundary) return;
    const boundary = trigger.current?.closest(sideBoundary);
    if (!boundary) return;
    const update = () => { if (!placeBeside()) change(false); };
    const observer = new ResizeObserver(update); observer.observe(boundary);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, sideBoundary]);
  return <Popover trigger={['hover']} placement={sideBoundary ? 'rightTop' : placement} mouseEnterDelay={0.35} mouseLeaveDelay={0}
    align={sideBoundary && sideLayout ? {offset: [sideLayout.offset, 0], overflow: {adjustX: false, adjustY: true, shiftY: true}} : undefined}
    open={open} onOpenChange={next => { if (next) openNow(); else closeSoon(); }}
    classNames={{ root: 'selectable-hover-card' }} title={title}
    content={<div ref={panel} className="selectable-hover-card-content" style={sideBoundary && sideLayout ? {width: sideLayout.width} : undefined} onPointerEnter={cancelClose} onPointerLeave={closeSoon}
      onFocusCapture={cancelClose} onBlurCapture={event => { if (!contains(event.relatedTarget)) closeSoon(); }}>{content}</div>}>
    <span ref={trigger} className="selectable-hover-trigger" onClickCapture={() => { if (closeOnTriggerClick) { dismissedHover.current = true; cancelClose(); change(false); } }}
      onPointerLeave={() => { dismissedHover.current = false; }}
      onFocusCapture={event => { if (focusTrigger === 'always' || event.target instanceof Element && event.target.matches(':focus-visible')) { dismissedHover.current = false; openNow(); } }}
      onBlurCapture={event => { if (!contains(event.relatedTarget)) closeSoon(); }}>{children}</span>
  </Popover>;
}
