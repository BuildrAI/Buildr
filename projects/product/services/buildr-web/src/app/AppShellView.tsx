import { SplitDivider } from '../components/SplitDivider';
import { PaneToggleButton } from '../components/PaneToggleButton';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dropdown, type MenuProps } from 'antd';
import { CaretDownFilled, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
type HeaderProps = { isGlobal?:boolean; primaryNavigation?: 'top' | 'rail'; brandHref:string; development?:boolean; workspaceName:string; workspaceMenuItems:MenuProps['items']; area:'workspace'|'workbench'|'code';codeHref?:string; workbenchHref:string; workspaceDestination:{to:string;state?:unknown}; actions:ReactNode; modeNavigation?:ReactNode };
/** Shared product chrome; all business effects remain in the caller. */
export function AppShellHeader({isGlobal,primaryNavigation='top',brandHref,development,workspaceName,workspaceMenuItems,area,codeHref,workbenchHref,workspaceDestination,actions,modeNavigation}:HeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (primaryNavigation !== 'rail' || !headerRef.current) return;
    const header = headerRef.current;
    const shell = header.closest<HTMLElement>('.app-shell');
    const update = () => shell?.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, [primaryNavigation]);
  const identity = <>
          <Link
            className="brand-link"
            to={brandHref}
            aria-label="当前工作空间概览"
          >
            <span className="brand-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, display: 'block' }}>
                <path d="M6.2 4.9 11.2 2 14.8 4.1 9.8 7v2.6L6.2 7.5Z" fill="#1f92f6" />
                <path d="M10.9 6.36 14.8 4.1 18.3 6.1Q19 6.5 19 7.4V10.5L15.2 12.7V8.8Z" fill="#f8af08" />
                <path d="M10.7 11.4 13.2 10 18.3 12.9Q19 13.3 19 14.2V16.7Q19 17.6 18.3 18L16.3 19.1 13.5 17.5 15.2 16.5V15.3L10.7 12.7Z" fill="#14b3a4" />
                <path d="M6.2 8.7 9.8 10.8V17.2L11.8 18.4 13.5 17.5 16.5 19.2 11.8 22 4.8 18V16.8L6.2 16Z" fill="#1f92f6" />
              </svg>
            </span>
            <strong>Buildr</strong>
          </Link>
          {development ? (
            <span
              id="development-environment-badge"
              className="development-environment-badge"
              title="当前运行的是 Buildr 开发版"
            >
              开发版
            </span>
          ) : null}

          {modeNavigation}
            <Dropdown overlayClassName="workspace-switcher-popup" menu={{ items: workspaceMenuItems }} trigger={['click']}>
              <button type="button" className="workspace-switcher" aria-label="切换工作空间">
                <span className="context-label">工作空间</span>
                <strong id="shell-workspace-name">
                  {workspaceName}
                </strong>
                <CaretDownFilled aria-hidden />
              </button>
            </Dropdown>
          </>;
  return (
        <header className={"topbar" + (modeNavigation ? " development-topbar" : "")} ref={headerRef}>
          {modeNavigation ? <div className="topbar-identity">{identity}</div> : identity}
          {!isGlobal && primaryNavigation === 'top' ? <nav className="top-nav" aria-label="主导航">
            <Link to={workbenchHref} data-area="workbench" aria-current={area === 'workbench' ? 'page' : undefined} className={area === 'workbench' ? 'active' : ''}
              >工作台</Link>
            <Link to={workspaceDestination.to} state={workspaceDestination.state} data-area="workspace" aria-current={area === 'workspace' ? 'page' : undefined} className={area === 'workspace' ? 'active' : ''}>工作空间</Link>
            {codeHref ? <Link to={codeHref} data-area="code" data-prototype-position="code-top-entry" aria-current={area === 'code' ? 'page' : undefined} className={area === 'code' ? 'active' : ''}>代码</Link> : null}
          </nav> : null}
          <div className="topbar-actions">{actions}</div>
        </header>
  );
}
export function AppShellFrame({isGlobal,compactNavigation,sidebarCollapsed,sidebarWidth,onSidebarResize,onToggleSidebar,navigation,children,unifiedCollapse=false,navigationRail,beforeNavigation,afterContent}:{isGlobal?:boolean;compactNavigation?:boolean;sidebarCollapsed:boolean;sidebarWidth?:number;onSidebarResize?(width:number):void;onToggleSidebar():void;navigation:ReactNode;children:ReactNode;unifiedCollapse?:boolean;navigationRail?:ReactNode;beforeNavigation?:ReactNode;afterContent?:ReactNode}) {
  const dragOrigin = useRef<{x:number;width:number} | null>(null);
  const [dragging, setDragging] = useState(false);
  const move = useCallback((event: PointerEvent) => {
    if (!dragOrigin.current || !onSidebarResize) return;
    onSidebarResize(Math.min(256, Math.max(150, dragOrigin.current.width + event.clientX - dragOrigin.current.x)));
  }, [onSidebarResize]);
  const release = useCallback(() => { dragOrigin.current = null; setDragging(false); }, []);
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', release); };
  }, [dragging, move, release]);
  return <div className={`app-frame${isGlobal ? ' is-global' : ''}${sidebarCollapsed && !compactNavigation && !navigationRail ? ' sidebar-collapsed' : ''}${unifiedCollapse ? ' unified-pane-controls' : ''}`}>
    {beforeNavigation}
    {navigationRail}
    {!navigationRail && !isGlobal && !compactNavigation ? <aside className={`app-sidebar${dragging ? ' is-resizing' : ''}`} style={sidebarCollapsed || sidebarWidth === undefined ? undefined : { flexBasis: sidebarWidth, width: sidebarWidth }}>
      <div className="app-sidebar-head">{unifiedCollapse ? <PaneToggleButton collapsed={sidebarCollapsed} label="导航" position="navigation-toggle" onToggle={onToggleSidebar} /> : <Button type="text" className="sidebar-toggle" aria-label={sidebarCollapsed ? '展开菜单' : '折叠菜单'} title={sidebarCollapsed ? '展开菜单' : '折叠菜单'} icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={onToggleSidebar} />}</div>
      {navigation}
    </aside> : null}
    {!navigationRail && !isGlobal && !compactNavigation && !sidebarCollapsed && onSidebarResize ? <SplitDivider className="sidebar-resize" children={<span className="split-divider-header-marker" aria-hidden="true" />} aria-label="拖拽调整菜单宽度" title="拖拽调整菜单宽度（150–256px）" onPointerDown={event => { dragOrigin.current = { x: event.clientX, width: sidebarWidth ?? 256 }; setDragging(true); event.preventDefault(); }} onDoubleClick={() => onSidebarResize(256)} /> : null}
    <main id="app-view" tabIndex={-1} aria-live="polite">{children}</main>
    {afterContent}
  </div>;
}
