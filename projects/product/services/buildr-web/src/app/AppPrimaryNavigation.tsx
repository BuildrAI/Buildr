import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CodeOutlined, FolderOpenOutlined, HomeOutlined } from '@ant-design/icons';
import { AppNavigation } from './AppNavigation';
import { PaneToggleButton } from '../components/PaneToggleButton';
import { SplitDivider } from '../components/SplitDivider';
import { usePanePeek } from '../components/usePanePeek';
import { readOptionalPreference, writeOptionalPreference } from '../lib/optional-preferences';
import './primary-navigation.css';

type Area = 'workbench' | 'workspace' | 'code';
type Props = {
  area: Area;
  workspaceId: string;
  sidebarWidth: number;
  onSidebarResize(width: number): void;
};
const labels: Record<Area, string> = { workbench: '工作台', workspace: '工作空间', code: '代码' };
const icons = { workbench: <HomeOutlined aria-hidden />, workspace: <FolderOpenOutlined aria-hidden />, code: <CodeOutlined aria-hidden /> };
const clampWidth = (value: number) => Math.min(256, Math.max(150, value));

/** The existing page panes remain siblings; only secondary navigation is transient. */
export function AppPrimaryNavigation(props: Props) {
  const panelId = useId();
  const fixedPanelId = panelId + '-fixed';
  const [pinned, setPinned] = useState(() => readOptionalPreference('buildr.primary-navigation-pinned') === 'true');
  const [preview, setPreview] = useState<Area>(props.area);
  const [fixedArea, setFixedArea] = useState<Area>(() => {
    const saved = readOptionalPreference('buildr.primary-navigation-area');
    return saved === 'workbench' || saved === 'workspace' || saved === 'code' ? saved : props.area;
  });
  const [floatingOpen, setFloatingOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const rail = useRef<HTMLElement>(null), panel = useRef<HTMLDivElement>(null);
  const fixedPanel = useRef<HTMLDivElement>(null), fixedToggle = useRef<HTMLButtonElement>(null);
  const focusAfterOpen = useRef(false), focusAfterPin = useRef(false);
  const pointerType = useRef('');
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const peek = usePanePeek({ enabled: !pinned, paneRef: panel, railRef: rail, control: {open: floatingOpen, onChange: setFloatingOpen} });
  const shown = !pinned && peek.open;
  const highlightedArea = shown ? preview : pinned ? fixedArea : undefined;
  const width = clampWidth(props.sidebarWidth);
  useLayoutEffect(() => {
    if ((shown || pinned) && focusAfterOpen.current) {
      focusAfterOpen.current = false;
      (pinned ? fixedPanel : panel).current?.querySelector<HTMLAnchorElement>('.shell-nav-item')?.focus({preventScroll: true});
    }
    if (pinned && focusAfterPin.current) {
      focusAfterPin.current = false;
      fixedToggle.current?.focus({preventScroll: true});
    }
  }, [shown, preview, pinned, fixedArea]);
  const setFixed = (value: boolean, area = fixedArea) => {
    focusAfterOpen.current = false;
    if (value) {
      setFixedArea(area);
      writeOptionalPreference('buildr.primary-navigation-area', area);
      focusAfterPin.current = true;
    }
    setPinned(value);
    writeOptionalPreference('buildr.primary-navigation-pinned', String(value));
    peek.close();
    if (!value) rail.current?.querySelector<HTMLButtonElement>(`[data-nav="${area}"]`)?.focus({ preventScroll: true });
  };
  const stopResizing = () => { drag.current = null; setResizing(false); };
  const closePreview = () => {
    if (panel.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    peek.close();
  };
  const openExplicit = (area: Area, keyboard: boolean, trigger: HTMLButtonElement) => {
    if (pinned) {
      peek.close();
      if (area === fixedArea) {
        if (keyboard) fixedPanel.current?.querySelector<HTMLAnchorElement>('.shell-nav-item')?.focus({preventScroll: true});
        return;
      }
      focusAfterOpen.current = keyboard;
      setFixedArea(area);
      writeOptionalPreference('buildr.primary-navigation-area', area);
      return;
    }
    if (shown && preview === area) { peek.close(true); return; }
    setPreview(area);
    focusAfterOpen.current = keyboard;
    // Register the trigger without pinning the hover lifecycle. Escape can then
    // return keyboard focus even when this menu has never been hovered.
    peek.enter('rail', 'keyboard', trigger);
    setFloatingOpen(true);
  };
  return <aside className={'primary-navigation' + (pinned ? ' is-pinned' : '') + (resizing ? ' is-resizing' : '')} aria-label="工作导航" data-primary-navigation="rail" data-fixed-area={pinned ? fixedArea : undefined} style={{ '--primary-secondary-width': `${width}px` } as CSSProperties}>
    <nav ref={rail} className="primary-navigation-rail" aria-label="一级导航">
      {(Object.keys(labels) as Area[]).map(item => <div key={item} onPointerEnter={event => {
        if (pinned || event.pointerType === 'touch') return;
        focusAfterOpen.current = false;
        setPreview(item);
        if (event.pointerType === 'mouse' && rail.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        peek.enter('rail', event.pointerType, event.currentTarget.querySelector('button') || undefined);
      }} onPointerLeave={event => peek.exit('rail', event.pointerType)}>
        <button type="button" className="shell-nav-item primary-navigation-trigger" data-nav={item} data-fixed={pinned && fixedArea === item || undefined} data-highlighted={highlightedArea === item || undefined} title={labels[item]} aria-label={labels[item] + '导航'} aria-expanded={pinned && fixedArea === item || shown && preview === item} aria-controls={`${fixedPanelId} ${panelId}`}
          onPointerDown={event => { pointerType.current = event.pointerType; if (event.pointerType === 'mouse' && event.button === 0) event.preventDefault(); }}
          onClick={event => { if (pinned || event.detail === 0 || pointerType.current === 'touch' || pointerType.current === 'pen') openExplicit(item, event.detail === 0, event.currentTarget); }}
          onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); openExplicit(item, true, event.currentTarget); } }}>
          {icons[item]}<span>{labels[item]}</span>
        </button>
      </div>)}
    </nav>
    <div id={fixedPanelId} ref={fixedPanel} className="primary-secondary-navigation is-fixed" data-navigation-mode="fixed" data-navigation-area={fixedArea} hidden={!pinned} aria-label={labels[fixedArea] + '固定二级导航'}>
      <header><strong>{labels[fixedArea]}</strong><PaneToggleButton collapsed={false} label="导航" controls={fixedPanelId} buttonRef={fixedToggle} position="navigation-toggle" onToggle={() => setFixed(false)} /></header>
      {pinned ? <AppNavigation key={props.workspaceId + ':' + fixedArea} area={fixedArea} /> : null}
    </div>
    <div id={panelId} ref={panel} className="primary-secondary-navigation is-floating" data-navigation-mode="preview" data-navigation-area={preview} hidden={!shown} aria-label={labels[preview] + '二级导航'} onPointerEnter={event => peek.enter('pane', event.pointerType)} onPointerLeave={event => { if (event.pointerType === 'mouse' && panel.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur(); peek.exit('pane', event.pointerType); }}>
      <header><strong>{labels[preview]}</strong><PaneToggleButton collapsed label="导航" controls={panelId} position="navigation-toggle" onToggle={() => setFixed(true, preview)} /></header>
      {shown ? <AppNavigation key={props.workspaceId + ':' + preview} area={preview} onNavigate={closePreview} /> : null}
    </div>
    {pinned ? <SplitDivider className="sidebar-resize primary-navigation-resize" aria-label="拖拽调整菜单宽度" aria-controls={fixedPanelId} aria-valuemin={150} aria-valuemax={256} aria-valuenow={Math.round(width)} aria-valuetext={`${Math.round(width)} 像素`} title="拖拽调整菜单宽度（150–256px）；方向键微调，双击恢复"
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
        setResizing(true);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start?.pointerId === event.pointerId) props.onSidebarResize(clampWidth(start.width + event.clientX - start.x));
      }}
      onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) { stopResizing(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } }}
      onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) stopResizing(); }} onLostPointerCapture={event => { if (drag.current?.pointerId === event.pointerId) stopResizing(); }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        props.onSidebarResize(event.key === 'Home' ? 150 : event.key === 'End' ? 256 : clampWidth(width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 32 : 16)));
      }}
      onDoubleClick={() => props.onSidebarResize(256)}><span className="split-divider-header-marker" aria-hidden="true" /></SplitDivider> : null}
  </aside>;
}
