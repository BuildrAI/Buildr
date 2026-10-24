import { SplitDivider } from '../components/SplitDivider';
import { PaneToggleButton } from '../components/PaneToggleButton';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dropdown, type MenuProps } from 'antd';
import { CaretDownFilled, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
type HeaderProps = { isGlobal?:boolean; primaryNavigation?: 'top' | 'rail'; brandHref:string; development?:boolean; workspaceName:string; workspaceMenuItems:MenuProps['items']; area:'workspace'|'workbench'|'code';codeHref?:string; workbenchHref:string; workspaceDestination:{to:string;state?:unknown}; actions:ReactNode };
/** Shared product chrome; all business effects remain in the caller. */
export function AppShellHeader({isGlobal,primaryNavigation='top',brandHref,development,workspaceName,workspaceMenuItems,area,codeHref,workbenchHref,workspaceDestination,actions}:HeaderProps) {
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
  return (
        <header className="topbar" ref={headerRef}>
          <Link
            className="brand-link"
            to={brandHref}
            aria-label="当前工作空间概览"
          >
            <span className="brand-mark">B</span>
            <strong>Buildr Web</strong>
          </Link>
          {development ? (
            <span
              id="development-environment-badge"
              className="development-environment-badge"
              title="当前运行的是 Buildr Web 开发版"
            >
              开发版
            </span>
          ) : null}

            <Dropdown overlayClassName="workspace-switcher-popup" menu={{ items: workspaceMenuItems }} trigger={['click']}>
              <button type="button" className="workspace-switcher" aria-label="切换工作空间">
                <span className="context-label">工作空间</span>
                <strong id="shell-workspace-name">
                  {workspaceName}
                </strong>
                <CaretDownFilled aria-hidden />
              </button>
            </Dropdown>
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
