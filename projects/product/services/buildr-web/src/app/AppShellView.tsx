import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dropdown, type MenuProps } from 'antd';
import { CaretDownFilled, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
type HeaderProps = { isGlobal?:boolean; brandHref:string; development?:boolean; workspaceName:string; workspaceMenuItems:MenuProps['items']; area:'workspace'|'workbench'; workbenchHref:string; workspaceDestination:{to:string;state?:unknown}; actions:ReactNode };
/** Shared product chrome; all business effects remain in the caller. */
export function AppShellHeader({isGlobal,brandHref,development,workspaceName,workspaceMenuItems,area,workbenchHref,workspaceDestination,actions}:HeaderProps) {
  return (
        <header className="topbar">
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

            <Dropdown menu={{ items: workspaceMenuItems }} trigger={['click']}>
              <button type="button" className="workspace-switcher" aria-label="切换工作空间">
                <span className="context-label">工作空间</span>
                <strong id="shell-workspace-name">
                  {workspaceName}
                </strong>
                <CaretDownFilled aria-hidden />
              </button>
            </Dropdown>
          {!isGlobal ? <nav className="top-nav" aria-label="主导航">
            <Link to={workbenchHref} data-area="workbench" aria-current={area === 'workbench' ? 'page' : undefined} className={area === 'workbench' ? 'active' : ''}
              >工作台</Link>
            <Link to={workspaceDestination.to} state={workspaceDestination.state} data-area="workspace" aria-current={area === 'workspace' ? 'page' : undefined} className={area === 'workspace' ? 'active' : ''}>工作空间</Link>
          </nav> : null}
          <div className="topbar-actions">{actions}</div>
        </header>
  );
}
export function AppShellFrame({isGlobal,compactNavigation,sidebarCollapsed,onToggleSidebar,navigation,children}:{isGlobal?:boolean;compactNavigation?:boolean;sidebarCollapsed:boolean;onToggleSidebar():void;navigation:ReactNode;children:ReactNode}) {
  return <div className={`app-frame${isGlobal ? ' is-global' : ''}${sidebarCollapsed && !compactNavigation ? ' sidebar-collapsed' : ''}`}>
    {!isGlobal && !compactNavigation ? <aside className="app-sidebar"><Button type="text" className="sidebar-toggle" aria-label={sidebarCollapsed ? '展开菜单' : '折叠菜单'} title={sidebarCollapsed ? '展开菜单' : '折叠菜单'} icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={onToggleSidebar} />{navigation}</aside> : null}
    <main id="app-view" tabIndex={-1} aria-live="polite">{children}</main>
  </div>;
}
