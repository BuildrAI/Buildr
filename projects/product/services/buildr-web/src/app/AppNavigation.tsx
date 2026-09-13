import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button, Tooltip } from 'antd';
import { PlusOutlined, RightOutlined, UnorderedListOutlined, FileTextOutlined, AppstoreOutlined, ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';
import { useAppShell } from './AppShellContext';
import { navigationState } from './navigation';
import { projectApi, type ProjectResponse } from '../features/project/api/project-api';
import { serviceApi } from '../features/service/api/service-api';
import { workspaceHref } from '../lib/labels';

type Project = NonNullable<ProjectResponse['projects']>[number];
type Service = NonNullable<ProjectResponse['services']>[number];

export function AppNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaceId, openAgentAction, resetTaskList, navigationRevision } = useAppShell();
  const location = useLocation();
  const state = navigationState(location.pathname, location.search, workspaceId);
  const [manualExpansion, setManualExpansion] = useState<{ routeKey: string; projectCode: string | null } | null>(null);
  const expandedProjectCode = manualExpansion?.routeKey === location.key ? manualExpansion.projectCode : state.projectCode;
  const [projects, setProjects] = useState<Project[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [loadedProject, setLoadedProject] = useState<string | null>(null);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [projectError, setProjectError] = useState(false);
  const [serviceError, setServiceError] = useState(false);
  const [retry, setRetry] = useState(0);
  const href = (path: string) => workspaceHref(workspaceId, path);

  useEffect(() => {
    if (state.area !== 'workspace') return;
    const controller = new AbortController();
    setProjectLoading(true);
    setProjectError(false);
    void projectApi.listProjects({ signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setProjects(data.projects ?? []);
    }).catch(() => {
      if (!controller.signal.aborted) setProjectError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setProjectLoading(false);
    });
    return () => controller.abort();
  }, [workspaceId, state.area, retry, navigationRevision]);

  useEffect(() => {
    setServices([]);
    setLoadedProject(null);
    setServiceError(false);
    if (state.area !== 'workspace' || !expandedProjectCode) { setServiceLoading(false); return; }
    const controller = new AbortController();
    setServiceLoading(true);
    void serviceApi.services(expandedProjectCode, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setServices(data.services ?? []); setLoadedProject(expandedProjectCode); }
    }).catch(() => {
      if (!controller.signal.aborted) { setServiceError(true); setLoadedProject(expandedProjectCode); }
    }).finally(() => {
      if (!controller.signal.aborted) setServiceLoading(false);
    });
    return () => controller.abort();
  }, [workspaceId, state.area, expandedProjectCode, retry, navigationRevision]);

  const icons: Record<string, ReactNode> = {
    tasks: <UnorderedListOutlined />, articles: <FileTextOutlined />, services: <AppstoreOutlined />,
    skills: <ThunderboltOutlined />, settings: <SettingOutlined />,
  };
  const item = (path: string, label: string, name: string, onClick?: () => void) => (
    <NavLink to={href(path)} data-nav={name} data-workspace-route={path}
      className={({ isActive }) => `shell-nav-item${isActive ? ' active' : ''}`}
      onClick={() => { onClick?.(); onNavigate?.(); }}>{icons[name]}<span>{label}</span></NavLink>
  );

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
          <div className="shell-nav-heading">
            <NavLink to={href('/projects')} data-nav="projects" data-workspace-route="/projects"
              className={state.resource === 'projects' ? 'active' : ''} onClick={onNavigate}>项目</NavLink>
            <Tooltip title="新增项目">
              <Button id="create-project-button" type="text" size="small" aria-label="新增项目" icon={<PlusOutlined />}
                onClick={() => { onNavigate?.(); openAgentAction('project'); }} />
            </Tooltip>
          </div>
          <div className="shell-project-tree">
            {projectLoading && projects.length === 0 ? <p className="shell-nav-hint" role="status">正在读取项目…</p> : null}
            {projectError ? <div className="shell-nav-hint" role="status">项目读取失败 <Button size="small" type="link" onClick={() => setRetry((v) => v + 1)}>重试</Button></div> : null}
            {!projectLoading && !projectError && projects.length === 0 ? <p className="shell-nav-hint">还没有项目</p> : null}
            {projects.map((project) => {
              const expanded = expandedProjectCode === project.code;
              const current = state.projectCode === project.code && state.resource === 'projects';
              return (
                <div key={project.code} data-project-node={project.code} data-expanded={expanded}>
                  <div className={`shell-project-row${current ? ' active' : ''}`}>
                    <button type="button" className="shell-project-toggle"
                      aria-label={`${expanded ? '收起' : '展开'}${project.name}`} aria-expanded={expanded}
                      aria-controls={expanded ? `project-services-${project.code}` : undefined}
                      onClick={() => setManualExpansion({ routeKey: location.key, projectCode: expanded ? null : project.code })}>
                      <RightOutlined className={expanded ? 'is-expanded' : ''} />
                    </button>
                    <NavLink to={href(`/projects/${encodeURIComponent(project.code)}`)} title={project.name}
                      className="shell-nav-item shell-project-link"
                      onClick={() => { setManualExpansion(null); onNavigate?.(); }}>
                      <span>{project.name}</span>
                    </NavLink>
                  </div>
                  {expanded ? <div className="shell-service-tree" id={`project-services-${project.code}`}>
                    {serviceLoading || loadedProject !== expandedProjectCode ? <p className="shell-nav-hint" role="status">正在读取服务…</p> : null}
                    {serviceError && loadedProject === expandedProjectCode ? <div className="shell-nav-hint" role="status">服务读取失败 <Button size="small" type="link" onClick={() => setRetry((v) => v + 1)}>重试</Button></div> : null}
                    {!serviceLoading && loadedProject === expandedProjectCode && !serviceError && services.length === 0 ? <p className="shell-nav-hint">暂无服务</p> : null}
                    {!serviceLoading && loadedProject === expandedProjectCode && !serviceError ? services.map((service) => (
                      <NavLink key={service.code} title={service.name} data-service-node={service.code}
                        to={href(`/services/${encodeURIComponent(project.code)}/${encodeURIComponent(service.code)}`)}
                        className={({ isActive }) => `shell-nav-item${isActive ? ' active' : ''}`} onClick={onNavigate}>
                        {service.name}
                      </NavLink>
                    )) : null}
                  </div> : null}
                </div>
              );
            })}
          </div>
          <div className="shell-nav-secondary">
            {item('/services', '服务', 'services')}
            {item('/skills', '技能', 'skills')}
            {item('/settings', '设置', 'settings')}
          </div>
        </>
      )}
    </nav>
  );
}
