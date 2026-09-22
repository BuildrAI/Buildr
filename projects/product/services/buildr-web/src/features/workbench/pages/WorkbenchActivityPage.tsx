import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, DatePicker, Select, Skeleton } from 'antd';
import { RefreshButton } from '../../../components/RefreshButton';
import dayjs from 'dayjs';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkbench } from '../hooks/useWorkbench';
import { WorkbenchDailyProgress } from '../components/WorkbenchDailyProgress';
import { DailyProgressPanel } from '../../project-daily-progress/components/DailyProgressPanel';
import { dailyProgressActionContext, dailyProgressGroup, isDailyProgressDate } from '../../project-daily-progress/dailyProgressNavigation';
import '../workbench.css';

export function WorkbenchActivityPage() {
  const { workspaceId, workspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const [params, setParams] = useSearchParams();
  const project = params.get('project') || '', requestedDate = params.get('date') || '';
  const date = isDailyProgressDate(requestedDate) ? requestedDate : '';
  const invalidDate = Boolean(requestedDate && !date);
  const group = dailyProgressGroup(params.get('group'));
  const [detailRefresh, setDetailRefresh] = useState(0);
  const showDetail = Boolean(project && date);
  const { data, error, loading, refresh } = useWorkbench(workspaceId, project, date);
  useEffect(() => { setBreadcrumbParts([workspace?.name || '工作空间', '动态']); }, [workspace?.name, setBreadcrumbParts]);
  const update = (field: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(field, value); else next.delete(field); setParams(next); };
  const showLatest = () => { const next = new URLSearchParams(params); next.delete('date'); next.delete('group'); setParams(next); };
  const refreshCurrent = () => { setDetailRefresh(value => value + 1); void refresh(); };
  const askAgent = () => openAgentAction('daily-progress', dailyProgressActionContext(project, date));
  return <div className="workbench-page" id="workbench-activity">
    <header className="workbench-page-heading"><div><p className="workbench-eyebrow">工作台</p><h1>动态</h1><p className="workbench-subtitle">从已生成的项目演进，了解最近的变化与影响。</p></div><div className="workbench-heading-actions">
      <Select id="activity-project-filter" aria-label="筛选项目" value={project} onChange={value => update('project', value)} options={[{ label: '全部项目', value: '' }, ...(data?.projects || []).map(item => ({ label: item.name, value: item.code }))]} />
      <RefreshButton label="刷新项目变化" loading={loading} onClick={refreshCurrent} />
    </div></header>
    <div className="workbench-activity-toolbar">
      <div className="daily-progress-date-controls">
        {date ? <Button onClick={() => update('date', dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))}>前一天</Button> : null}
        <DatePicker id="progress-date" aria-label="演进日期" inputReadOnly value={date && dayjs(date).isValid() ? dayjs(date) : null} onChange={value => update('date', value ? value.format('YYYY-MM-DD') : '')} placeholder="各项目最近一份" />
        {date ? <Button onClick={() => update('date', dayjs(date).add(1, 'day').format('YYYY-MM-DD'))}>后一天</Button> : null}
        {date ? <Button id="activity-latest-button" type="link" onClick={showLatest}>最近演进</Button> : null}
      </div>
      <Button id="activity-generate-button" disabled={invalidDate} onClick={askAgent}>生成每日演进</Button>
    </div>
    {error ? <Alert type="error" message={error} action={<Button onClick={refreshCurrent}>重试</Button>} /> : null}
    {invalidDate ? <Alert type="warning" showIcon message="日期无效，请重新选择日期。" action={<Button onClick={showLatest}>查看最近演进</Button>} /> : showDetail ? <DailyProgressPanel projectCode={project} workspaceId={workspaceId} date={date} group={group} refreshKey={detailRefresh} onGroupChange={value => update('group', value === 'day' ? '' : value)} onAskAgent={askAgent} /> : <>
      {loading && !data ? <Skeleton active /> : null}
      {data ? <WorkbenchDailyProgress data={data.dailyProgress} full project={project} date={date} onRefresh={refreshCurrent} /> : null}
    </>}
  </div>;
}
