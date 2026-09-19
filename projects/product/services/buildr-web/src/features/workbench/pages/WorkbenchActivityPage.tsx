import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, DatePicker, Select, Skeleton } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkbench } from '../hooks/useWorkbench';
import { WorkbenchDailyProgress } from '../components/WorkbenchDailyProgress';
import '../workbench.css';

export function WorkbenchActivityPage() {
  const { workspaceId, workspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const [params, setParams] = useSearchParams();
  const project = params.get('project') || '', date = params.get('date') || '';
  const { data, error, loading, refresh } = useWorkbench(workspaceId, project, date);
  useEffect(() => { setBreadcrumbParts([workspace?.name || '工作空间', '动态']); }, [workspace?.name, setBreadcrumbParts]);
  const update = (field: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(field, value); else next.delete(field); setParams(next); };
  return <div className="workbench-page" id="workbench-activity">
    <header className="workbench-page-heading"><div><p className="workbench-eyebrow">工作台</p><h1>动态</h1><p className="workbench-subtitle">从已生成的项目演进，了解最近的变化与影响。</p></div><div className="workbench-heading-actions">
      <Select aria-label="筛选项目" value={project} onChange={value => update('project', value)} options={[{ label: '全部项目', value: '' }, ...(data?.projects || []).map(item => ({ label: item.name, value: item.code }))]} />
      <Button type="text" icon={<ReloadOutlined spin={loading} />} aria-label="刷新项目变化" onClick={() => void refresh()} />
    </div></header>
    <div className="workbench-activity-toolbar"><DatePicker aria-label="演进日期" value={date && dayjs(date).isValid() ? dayjs(date) : null} onChange={value => update('date', value ? value.format('YYYY-MM-DD') : '')} placeholder="各项目最近一份" /><Button onClick={() => openAgentAction('daily-progress', project ? { projectCode: project } : {})}>生成每日演进</Button></div>
    {error ? <Alert type="error" message={error} action={<Button onClick={() => void refresh()}>重试</Button>} /> : null}
    {loading && !data ? <Skeleton active /> : null}
    {data ? <WorkbenchDailyProgress data={data.dailyProgress} full project={project} onRefresh={() => void refresh()} /> : null}
  </div>;
}
