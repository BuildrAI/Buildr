import { ProjectCreateDrawer } from '../components/ProjectCreateDrawer';
import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { ProjectEditDrawer } from '../components/ProjectEditDrawer';
import { workspaceApi } from '../../workspace/api/workspace-api';
import { type ProjectResponse, projectApi } from '../api/project-api';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Alert, Button } from 'antd';

import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { WorkspaceStage } from '../../../components/WorkspaceStage';

type Project = NonNullable<ProjectResponse['projects']>[number];

export function ProjectsPage() {
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const navigate = useNavigate(), location = useLocation();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [creating, setCreating] = useState(Boolean(location.state?.createProject));
  const [editing, setEditing] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState('正在读取');
  const [migrationMessage, setMigrationMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pageTabs = useWorkspacePageTabs(workspaceId);

  useEffect(() => {
    pageTabs.register({ key: 'dir:projects', kind: 'dir', title: '项目目录', path: href('/projects') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);


  useEffect(() => {
    let cancelled = false;
    setRefreshing(true); setError(null);
    void (async () => {
      try {
        const [workspace, data] = await Promise.all([
          workspaceApi.read(),
          projectApi.listProjects(),
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '项目']);
        const nextProjects = data.projects ?? [];
        setProjects(nextProjects);
        setState(`${nextProjects.length} 个项目`);
        setMigrationMessage(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
      } catch (err) {
        if (!cancelled) {
          setState('读取失败');
          setError(err instanceof Error ? err.message : '读取失败');
          setProjects([]);
        }
      } finally { if (!cancelled) setRefreshing(false); }
    })();
    return () => { cancelled = true; };
  }, [setWorkspace, setBreadcrumbParts, refresh]);

  return <WorkspaceStage pageTabs={pageTabs.tabs} onClosePageTab={pageTabs.close}>
    <ResourceDirectory onRefresh={() => setRefresh(value => value + 1)} refreshing={refreshing} title="项目" noun="项目" description="组织业务目标，连接服务与工作成果。" data={projects}
      loading={state === '正在读取'} error={error || undefined} rowKey={p => p.id} name={p => p.name} summary={p => p.description}
      searchText={p => `${p.name} ${p.code} ${p.description}`} href={p => href(`/projects/${p.code}`)} onOpen={p => navigate(href(`/projects/${p.code}`))} onEdit={p => setEditing(p.code)}
      tableId="project-table-wrap" bodyId="project-table-body" countId="projects-state" searchId="projects-search"
      columns={[{ title: '项目标识', width: 160, render: (_, p) => <code className="resource-code">{p.code}</code> }]}
      notice={migrationMessage ? <Alert type="warning" message={migrationMessage} /> : null}
      actions={<Button id="project-directory-create-button" type="primary" onClick={() => setCreating(true)}>新增项目</Button>} />
    {creating && <ProjectCreateDrawer onClose={() => { setCreating(false); setRefresh(value => value + 1); }} />}
    {editing && <ProjectEditDrawer open projectCode={editing} onClose={() => setEditing(null)} onSaved={saved => setProjects(items => items.map(item => item.code === saved.code ? { ...item, name: saved.name, description: saved.description } : item))} />}
  </WorkspaceStage>;
}
