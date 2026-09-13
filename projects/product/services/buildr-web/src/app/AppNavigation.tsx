import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button, Tooltip } from 'antd';
import { PlusOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import { useAppShell } from './AppShellContext';
import { navigationState } from './navigation';
import { projectApi, type ProjectResponse } from '../features/project/api/project-api';
import { serviceApi } from '../features/service/api/service-api';
import { workspaceHref } from '../lib/labels';

type Project = NonNullable<ProjectResponse['projects']>[number];
type Service = NonNullable<ProjectResponse['services']>[number];

export function AppNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaceId, openAgentAction, resetTaskList } = useAppShell();
  const location = useLocation();
  const state = navigationState(location.pathname, location.search, workspaceId);
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
  }, [workspaceId, state.area, retry]);

  useEffect(() => {
    setServices([]);
    setLoadedProject(null);
    setServiceError(false);
    if (state.area !== 'workspace' || !state.projectCode) { setServiceLoading(false); return; }
    const controller = new AbortController();
    setServiceLoading(true);
    void serviceApi.services(state.projectCode, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setServices(data.services ?? []); setLoadedProject(state.projectCode); }
    }).catch(() => {
      if (!controller.signal.aborted) { setServiceError(true); setLoadedProject(state.projectCode); }
    }).finally(() => {
      if (!controller.signal.aborted) setServiceLoading(false);
    });
    return () => controller.abort();
  }, [workspaceId, state.area, state.projectCode, retry]);

  const item = (path: string, label: string, name: string, onClick?: () => void) => (
    <NavLink to={href(path)} data-nav={name} data-workspace-route={path}
      className={({ isActive }) => `shell-nav-item${isActive ? ' active' : ''}`}
      onClick={() => { onClick?.(); onNavigate?.(); }}>{label}</NavLink>
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
              const expanded = state.projectCode === project.code;
              return (
                <div key={project.code} data-project-node={project.code} data-expanded={expanded}>
                  <NavLink to={href(`/projects/${encodeURIComponent(project.code)}`)}
                    aria-expanded={expanded} title={project.name}
                    className={`shell-nav-item shell-project-link${expanded && state.resource === 'projects' ? ' active' : ''}`}
                    onClick={onNavigate}>
                    {expanded ? <DownOutlined /> : <RightOutlined />}<span>{project.name}</span>
                  </NavLink>
                  {expanded ? <div className="shell-service-tree">
                    {serviceLoading || loadedProject !== state.projectCode ? <p className="shell-nav-hint" role="status">正在读取服务…</p> : null}
                    {serviceError && loadedProject === state.projectCode ? <div className="shell-nav-hint" role="status">服务读取失败 <Button size="small" type="link" onClick={() => setRetry((v) => v + 1)}>重试</Button></div> : null}
                    {!serviceLoading && loadedProject === state.projectCode && !serviceError && services.length === 0 ? <p className="shell-nav-hint">暂无所属服务</p> : null}
                    {!serviceLoading && loadedProject === state.projectCode && !serviceError ? services.map((service) => (
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
            {item('/services', '全部服务', 'services')}
            {item('/skills', '技能', 'skills')}
            {item('/settings', '设置', 'settings')}
          </div>
        </>
      )}
    </nav>
  );
}
