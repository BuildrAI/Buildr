import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { UnorderedListOutlined, FileTextOutlined, FolderOutlined, BranchesOutlined, AppstoreOutlined, ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';
import { useAppShell } from './AppShellContext';
import { navigationState } from './navigation';
import { workspaceHref } from '../lib/labels';

/**
 * 领域导航：工作台（任务/文章）与工作空间（项目/服务/技能/设置）均为平级行式入口。
 * 不在导航内展开项目树或所属服务；对象由页面级页签与领域全景承载。
 */
export function AppNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaceId, resetTaskList, workspaceMenuTarget } = useAppShell();
  const location = useLocation();
  const state = navigationState(location.pathname, location.search, workspaceId);
  const href = (path: string) => workspaceHref(workspaceId, path);

  const icons: Record<string, ReactNode> = {
    tasks: <UnorderedListOutlined />,
    articles: <FileTextOutlined />,
    projects: <FolderOutlined />,
    services: <AppstoreOutlined />,
    repositories: <BranchesOutlined />,
    skills: <ThunderboltOutlined />,
    settings: <SettingOutlined />,
  };
  const item = (path: string, label: string, name: string, onClick?: () => void) => {
    const destination = state.area === 'workspace' && name !== 'projects' ? workspaceMenuTarget(name) : { to: href(path), state: undefined };
    return <NavLink to={destination.to} state={destination.state} data-nav={name} data-workspace-route={path} title={label} aria-label={label}
      className={`shell-nav-item${location.pathname === href(path) || location.pathname.startsWith(href(path) + '/') ? ' active' : ''}`}
      onClick={event => { if (state.area === 'workspace' && destination.to === location.pathname + location.search + location.hash) event.preventDefault(); onClick?.(); onNavigate?.(); }}>{icons[name]}<span>{label}</span></NavLink>;
  };

  return (
    <nav className="shell-navigation" aria-label={state.area === 'workbench' ? '工作台导航' : '工作空间导航'}>
      {state.area === 'workbench' ? (
        <>
          <p className="shell-nav-caption">工作台</p>
          {item('/tasks', '任务', 'tasks', resetTaskList)}
          {item('/articles', '文章', 'articles')}
        </>
      ) : (
        <>
          <p className="shell-nav-caption">工作空间</p>
          {item('/projects', '项目', 'projects')}
          {item('/services', '服务', 'services')}
          {item('/repositories', '代码库', 'repositories')}
          {item('/skills', '技能', 'skills')}
          {item('/settings', '设置', 'settings')}
        </>
      )}
    </nav>
  );
}
