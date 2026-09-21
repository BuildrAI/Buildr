import { TaskGoalSummary } from './TaskGoalSummary';
import { useState } from 'react';
import { Alert, Button, Input, Select, Spin, Table } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useResourcePreview } from '../../../app/resource-preview';
import type { TaskDetailResponse } from '../../../../build/generated/task-dto';
import type { ParentCoordinationResult } from './parentCoordination';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { taskApi } from '../api/task-api';
import { CompositeTaskPlan } from './CompositeTaskPlan';
import { formatDateTime, taskStatusLabel } from '../../../lib/taskLabels';
import './composite-task.css';

type Props = { task: TaskDetailResponse; coordination: ParentCoordinationResult | null; loading: boolean; briefs: TaskBriefState[]; refresh(): Promise<void>; onEnd(): void; href(path: string): string; onDocument(changeKey: string, path: string): void };
export function CompositeTaskContent({ task, coordination, loading, briefs, refresh, onEnd, href, onDocument }: Props) {
  const previews = useResourcePreview();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview'), [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const terminal = ['completed', 'abandoned'].includes(task.record.status);
  const children = coordination?.children || [];
  const loadOptions = async () => {
    if (loaded || optionsLoading) return;
    setOptionsLoading(true);
    try {
      const result = []; let cursor: string | undefined;
      do {
        const page = await taskApi.list({ taskType: 'ordinary', status: 'all', pageSize: '100', ...(cursor ? { cursor } : {}) });
        result.push(...page.tasks); cursor = page.hasMore ? page.nextCursor || undefined : undefined;
      } while (cursor);
      setOptions(result.filter(item => !item.record.parentTaskId && item.record.taskId !== task.record.taskId).map(item => ({ value: item.record.taskId, label: item.record.title }))); setLoaded(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取候选任务失败'); }
    finally { setOptionsLoading(false); }
  };
  const associate = async (id: string, unlink = false) => {
    setSaving(true); setError('');
    try {
      const latest = await taskApi.detail(id);
      if ((!unlink && latest.record.parentTaskId) || (unlink && latest.record.parentTaskId !== task.record.taskId)) throw new Error('所属关系已变化，请刷新任务后重新核对。');
      await taskApi.update(id, { expectedRecordDigest: latest.recordDigest, ...(unlink ? { parentTaskId: null } : { parentTaskId: task.record.taskId }), ...(['completed', 'abandoned'].includes(latest.record.status) ? { reason: '用户在组合任务中调整所属关系，保持已有状态和结果。' } : {}) });
      setLoaded(false); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '关联未保存'); }
    finally { setSaving(false); }
  };
  const selectCount = (state: string) => { setFilter(state); setQuery(''); setTab('children'); };
  const visible = children.filter(child => (filter === 'all' || child.status === filter) && `${child.title} ${child.intent}`.includes(query));

  return <>
    <div className="task-work-path"><div className="task-path-track">{[['overview', '概览'], ['children', '子任务'], ['acceptance', '验收']].map(([key, label]) => <Button key={key} type="text" className={`task-work-tab ${tab === key ? 'selected' : ''}`} onClick={() => setTab(key)}>{label}</Button>)}</div></div>
    <div className="composite-task-reader">
      {error && <Alert message={error} type="warning" closable onClose={() => setError('')} />}
      {tab !== 'acceptance' && coordination?.diagnostic && <Alert type="warning" message={coordination.diagnostic.message} action={<Button onClick={() => void refresh()}>重试</Button>} />}
      {tab === 'overview' && <>
        {loading ? <Spin size="small" /> : coordination?.children && <div className="composite-task-counts"><button onClick={() => selectCount('all')}><b>{children.length}</b>项子任务</button>{(['completed', 'active', 'todo', 'abandoned'] as const).filter(status => status !== 'abandoned' || children.some(child => child.status === status)).map(status => <button key={status} onClick={() => selectCount(status)}><b>{children.filter(child => child.status === status).length}</b>{taskStatusLabel(status)}</button>)}</div>}
        <CompositeTaskPlan record={task.record} briefs={briefs} onDocument={onDocument} />
      </>}
      {tab === 'children' && <>
        <div className="composite-task-toolbar"><Input aria-label="搜索子任务" placeholder="搜索子任务" value={query} onChange={event => setQuery(event.target.value)} /><Select aria-label="子任务状态" value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部状态' }, ...['completed', 'active', 'todo', 'abandoned'].map(value => ({ value, label: taskStatusLabel(value) }))]} />{!terminal && <div className="composite-task-picker"><CreatableResourceSelect label="关联子任务" placeholder="关联子任务" options={options} value={null} disabled={saving || task.record.status !== 'active'} loading={optionsLoading} onOpen={() => void loadOptions()} onChange={value => void associate(value as string)} /></div>}</div>
        <div className="resource-directory-table task-list-table composite-task-list"><Table
          className="task-compact-table" tableLayout="fixed" pagination={false} rowKey="taskId" dataSource={visible}
          locale={{ emptyText: '暂无符合条件的子任务。' }}
          onRow={child => ({ tabIndex: 0, onClick: () => {
            const path = href(`/tasks/${encodeURIComponent(child.taskId)}${child.isParent ? '?taskType=composite' : ''}`);
            if (!previews?.open(location.pathname, path)) navigate(path);
          }, onKeyDown: event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } } })}
          columns={[
            { title: '任务', key: 'task', render: (_value, child) => <div className="task-compact-copy"><div className="task-row-heading"><Link className="task-row-main" to={href(`/tasks/${encodeURIComponent(child.taskId)}${child.isParent ? '?taskType=composite' : ''}`)}><strong>{child.title}</strong></Link>{child.isParent && <span className="task-type-badge">组合任务</span>}</div><TaskGoalSummary goal={child.intent} /></div> },
            { title: '状态', key: 'status', width: 88, render: (_value, child) => <span className={`lifecycle-badge ${child.status}`}>{taskStatusLabel(child.status)}</span> },
            ...(!terminal ? [{ title: '', key: 'unlink', width: 42, render: (_value: unknown, child: NonNullable<ParentCoordinationResult['children']>[number]) => <Button type="text" size="small" icon={<CloseOutlined />} disabled={saving} aria-label={`解除关联 ${child.title}`} onClick={event => { event.stopPropagation(); void associate(child.taskId, true); }} /> }] : []),
          ]}
        /></div>
      </>}
      {tab === 'acceptance' && <section className="task-reader"><h2>{task.record.status === 'completed' ? '已完成' : task.record.status === 'abandoned' ? '已放弃' : '尚未验收'}</h2>{task.record.result ? <><p className="task-report-meta">记录时间：{formatDateTime(task.record.result.parentCompletion?.recordedAt || task.record.updatedAt)}</p><p>{task.record.result.summary}</p>{task.record.status === 'completed' && !task.record.result.parentCompletion && <p>历史记录未保存独立验收依据。</p>}</> : <><p>{coordination?.children ? `当前 ${children.length} 项子任务，${children.filter(child => ['todo', 'active'].includes(child.status)).length} 项未结束。` : '子任务情况暂不可读取。'}</p><Button onClick={onEnd}>结束组合任务</Button></>}</section>}
    </div>
  </>;
}
