import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { workspaceApi, type ProjectResponse } from '../../../api';
import { useAppShell } from '../../../app/AppShellContext';

export type Project = NonNullable<ProjectResponse['projects']>[number];
export type Service = NonNullable<ProjectResponse['services']>[number];

export function useServiceCatalog() {
  const { setWorkspace, setBreadcrumbParts } = useAppShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCode, setProjectCode] = useState('');
  const [projectName, setProjectName] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [count, setCount] = useState('正在读取');
  const [title, setTitle] = useState('请选择项目');
  const [copy, setCopy] = useState('选择项目后显示服务。');
  const [emptyText, setEmptyText] = useState('选择项目后显示服务。');
  const [migrationMessage, setMigrationMessage] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([workspaceApi.read(), workspaceApi.listProjects()])
      .then(([workspace, data]) => {
        if (cancelled) return;
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '服务']);
        const nextProjects = data.projects ?? [];
        setProjects(nextProjects);
        const requested = searchParams.get('project');
        const selected = nextProjects.find((project) => project.code === requested) || nextProjects[0];
        if (selected) setProjectCode(selected.code);
        else {
          setTitle('尚无所属项目');
          setCount('0 个项目');
          setCopy('请先让 Agent 创建项目，再登记服务。');
          setEmptyText('请先让 Agent 创建项目，再登记服务。');
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTitle('读取失败');
          setCopy(error instanceof Error ? error.message : '读取失败');
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [setWorkspace, setBreadcrumbParts]);

  useEffect(() => {
    if (!projectCode) return;
    let cancelled = false;
    void workspaceApi.services(projectCode)
      .then((data) => {
        if (cancelled) return;
        const project = data.project;
        const nextServices = data.services ?? [];
        if (!project) throw new Error('项目响应缺少 project。');
        setProjectName(project.name || projectCode);
        setServices(nextServices);
        setTitle(`${project.name || projectCode}的服务`);
        setCopy('目录负责资源定位与关联跳转；稳定元数据可在弹框中编辑。');
        setCount(`${nextServices.length} 个服务`);
        setEmptyText(`项目“${project.name || projectCode}”暂未登记服务。服务只在需要管理代码仓、应用、模块或可执行资产时添加；你也可以直接回到“开始”页推进项目范围工作。`);
        setMigrationMessage(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
        setLoaded(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setCount('读取失败');
          setTitle('无法读取服务');
          setCopy(error instanceof Error ? error.message : '读取失败');
          setServices([]);
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [projectCode]);

  const selectProject = useCallback((code: string) => {
    setProjectCode(code);
    setSearchParams(code ? { project: code } : {});
  }, [setSearchParams]);

  const updateService = useCallback((saved: { code: string; name: string; description: string; type: string }) => {
    setServices((items) => items.map((item) => item.code === saved.code ? { ...item, ...saved } : item));
  }, []);

  return {
    projects,
    projectCode,
    projectName,
    services,
    count,
    title,
    copy,
    emptyText,
    migrationMessage,
    loaded,
    selectProject,
    updateService,
  };
}
