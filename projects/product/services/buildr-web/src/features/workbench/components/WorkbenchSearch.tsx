import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Alert, Button, Empty, Input, Modal, Spin, Tooltip } from 'antd';
import { FileTextOutlined, FolderOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { TaskListResponse } from '../../../../build/generated/task-dto';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { taskStatusLabel } from '../../../lib/taskLabels';
import { taskApi } from '../../task/api/task-api';
import { isIndexedTaskQuery } from '../../task/task-search';
import { projectApi } from '../../project/api/project-api';
import { useWorkbenchPreferences } from '../hooks/useWorkbenchPreferences';

export function WorkbenchSearch() {
  const { workspaceId } = useAppShell(), location = useLocation();
  const { preferences } = useWorkbenchPreferences(workspaceId);
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<TaskListResponse['tasks']>([]);
  const [projects, setProjects] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const normalized = query.trim(), searchable = Boolean(normalized) && isIndexedTaskQuery(normalized);
  useEffect(() => {
    if (!open || !workspaceId) return;
    const controller = new AbortController();
    void projectApi.listProjects({ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setProjects((result.projects || []).map(item => ({ code: item.code, name: item.name })));
    }).catch(() => { /* Task and saved-resource searches remain available. */ });
    return () => controller.abort();
  }, [open, workspaceId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    setTasks([]); setError(''); setLoading(false);
    if (!open || !workspaceId || !searchable) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void taskApi.list({ q: normalized, status: 'all', pageSize: '12' }, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) setTasks(result.tasks);
      }).catch(err => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '任务搜索暂不可用');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, workspaceId, normalized, searchable]);
  const source = (preferences?.items || []).filter(item => ['saved-resource', 'recent-resource'].includes(item.kind));
  const resources = source.filter((item, index) => source.findIndex(other => other.href === item.href) === index && (!normalized || item.label.toLocaleLowerCase().includes(normalized.toLocaleLowerCase()))).slice(0, 8);
  const foundProjects = projects.filter(item => !normalized || (item.name + item.code).toLocaleLowerCase().includes(normalized.toLocaleLowerCase())).slice(0, 5);
  const close = () => setOpen(false);
  return <>
    <Tooltip title="查找工作与资料（⌘K）"><Button type="text" icon={<SearchOutlined />} aria-label="查找工作与资料" onClick={() => setOpen(true)} /></Tooltip>
    <Modal title="查找工作与资料" open={open} onCancel={close} footer={null} destroyOnClose>
      <Input autoFocus prefix={<SearchOutlined />} aria-label="查找工作与资料关键词" placeholder="输入任务、项目或常用资料名称" value={query} onChange={event => setQuery(event.target.value)} allowClear />
      {normalized && !searchable ? <p className="workbench-muted">任务关键词至少 3 个字符；完整编号可使用 #task-id。下方仍可查找项目与常用资料。</p> : null}
      {!normalized ? <p className="workbench-muted">输入关键词查找任务，或直接进入最近使用的项目与资料。</p> : null}
      {error ? <Alert type="warning" message={error} /> : null}
      {loading ? <Spin size="small" /> : null}
      <div className="workbench-search-results">
        {tasks.map(item => <Link onClick={close} className="workbench-search-result" key={item.record.taskId} to={workspaceHref(workspaceId, '/tasks/' + encodeURIComponent(item.record.taskId))} state={{ from: location.pathname + location.search }}><UnorderedListOutlined /><span><strong>{item.record.title}</strong><small>{taskStatusLabel(item.record.status)}</small></span></Link>)}
        {foundProjects.map(item => <Link onClick={close} className="workbench-search-result" key={'project:' + item.code} to={workspaceHref(workspaceId, '/projects/' + encodeURIComponent(item.code))}><FolderOutlined /><span><strong>{item.name}</strong><small>项目</small></span></Link>)}
        {resources.map(item => <Link onClick={close} className="workbench-search-result" key={item.key} to={item.href}><FileTextOutlined /><span><strong>{item.label}</strong><small>常用资料</small></span></Link>)}
        {!loading && normalized && !tasks.length && !resources.length && !foundProjects.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的工作或常用资料" /> : null}
      </div>
    </Modal>
  </>;
}
