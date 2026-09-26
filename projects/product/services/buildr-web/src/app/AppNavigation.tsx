import { AppNavigationItem } from './AppNavigationItem';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { UnorderedListOutlined, FileTextOutlined, FolderOutlined, BranchesOutlined, AppstoreOutlined, ThunderboltOutlined, HistoryOutlined, HomeOutlined, RightOutlined } from '@ant-design/icons';
import { useWorkbenchPreferences } from '../features/workbench/hooks/useWorkbenchPreferences';
import { useAppShell } from './AppShellContext';
import { navigationState } from './navigation';
import { workspaceHref } from '../lib/labels';

/**
 * 工作台按关注与接续组织；长期内容入口位于工作空间。
 * 不在导航内展开项目树或所属服务；对象由页面级页签与领域全景承载。
 */
export function AppNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaceId, workspaceMenuTarget } = useAppShell();
  const { preferences } = useWorkbenchPreferences(workspaceId);
  const location = useLocation();
  const state = navigationState(location.pathname, location.search, workspaceId);
  const href = (path: string) => workspaceHref(workspaceId, path);

  const icons: Record<string, ReactNode> = {
    tasks: <UnorderedListOutlined />,
    overview: <HomeOutlined />,
    'workspace-overview': <HomeOutlined />,
    activity: <HistoryOutlined />,
    articles: <FileTextOutlined />,
    projects: <FolderOutlined />,
    services: <AppstoreOutlined />,
    repositories: <BranchesOutlined />,
    skills: <ThunderboltOutlined />,
  };
  const item = (path: string, label: string, name: string, onClick?: () => void) => {
    const destination = state.area === 'workspace' && !['projects', 'articles'].includes(name) ? workspaceMenuTarget(name) : { to: href(path), state: undefined };
    return <AppNavigationItem to={destination.to} state={destination.state} path={path} name={name} label={label} icon={icons[name]} active={location.pathname === href(path) || location.pathname.startsWith(href(path) + '/')} onClick={event => { if (state.area === 'workspace' && destination.to === location.pathname + location.search + location.hash) event.preventDefault(); onClick?.(); onNavigate?.(); }} />;
  };

  return (
    <nav className="shell-navigation" aria-label={state.area === 'workbench' ? '工作台导航' : '工作空间导航'}>
      {state.area === 'workbench' ? (
        <>
          <p className="shell-nav-caption">工作台</p>
          {item('/overview', '概览', 'overview')}
          {item('/tasks', '任务', 'tasks')}
          {item('/activity', '动态', 'activity')}
          <div className="workbench-followed-navigation">
            <p className="shell-nav-caption">我关注的项目</p>
            {(preferences?.items || []).filter(entry => entry.kind === 'followed-project').map(entry => (
              <NavLink key={entry.key} className="shell-nav-item" to={href('/projects/' + encodeURIComponent(entry.key))}>
                <span className="workbench-project-dot" /><span>{entry.label}</span><RightOutlined />
              </NavLink>
            ))}
            {!(preferences?.items || []).some(entry => entry.kind === 'followed-project') ? <p className="workbench-nav-empty">在项目主页关注后，从这里快速进入。</p> : null}
          </div>
        </>
      ) : (
        <>
          <p className="shell-nav-caption">工作空间</p>
          {item('/workspace-overview', '总览', 'workspace-overview')}
          {item('/projects', '项目', 'projects')}
          {item('/services', '服务', 'services')}
          {item('/repositories', '代码库', 'repositories')}
          {item('/skills', '技能', 'skills')}
          {item('/articles', '文章', 'articles')}
        </>
      )}
    </nav>
  );
}
