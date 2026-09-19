import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Select, Skeleton, Tooltip } from 'antd';
import { ArrowRightOutlined, ClockCircleOutlined, ReloadOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { formatDateTime } from '../../../lib/taskLabels';
import { useWorkbench } from '../hooks/useWorkbench';
import { useWorkbenchPreferences } from '../hooks/useWorkbenchPreferences';
import { WorkbenchTaskRow, attentionLabels } from '../components/WorkbenchTaskRow';
import { WorkbenchDailyProgress } from '../components/WorkbenchDailyProgress';
import { WorkbenchResources } from '../components/WorkbenchResources';
import '../workbench.css';

export function WorkbenchPage() {
  const { workspaceId, setBreadcrumbParts, workspace, openAgentAction } = useAppShell();
  const [params, setParams] = useSearchParams(), location = useLocation();
  const project = params.get('project') || '';
  const { data, loading, error, refresh } = useWorkbench(workspaceId, project);
  const prefs = useWorkbenchPreferences(workspaceId);
  const [actionError, setActionError] = useState(''), [busyProject, setBusyProject] = useState('');
  const href = (path: string) => workspaceHref(workspaceId, path);
  const from = location.pathname + location.search;
  const projectNames = Object.fromEntries((data?.projects || []).map(item => [item.code, item.name]));
  const followed = (prefs.preferences?.items || []).filter(item => item.kind === 'followed-project');
  useEffect(() => { setBreadcrumbParts([workspace?.name || '工作空间', '工作概览']); }, [workspace?.name, setBreadcrumbParts]);
  const toggleProject = async (code: string) => {
    setBusyProject(code); setActionError('');
    try { if (prefs.has('followed-project', code)) await prefs.remove('followed-project', code); else await prefs.set('followed-project', code); }
    catch (err) { setActionError(err instanceof Error ? err.message : '关注未保存'); }
    finally { setBusyProject(''); }
  };
  return <div className="workbench-page" id="workbench-overview">
    <header className="workbench-page-heading">
      <div><p className="workbench-eyebrow">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p><h1>工作概览</h1><p className="workbench-subtitle">{data ? data.attention.total + ' 件事需要你处理，' + data.active.total + ' 项工作正在推进。' : '从关注事项、工作进展和共同资料开始。'}</p></div>
      <div className="workbench-heading-actions">
        <Select id="workbench-project-filter" aria-label="筛选项目" value={project} onChange={value => setParams(value ? { project: value } : {})}
          options={[{ value: '', label: '全部项目' }, ...(data?.projects || []).map(item => ({ value: item.code, label: item.name }))]} />
        <Tooltip title="刷新当前内容"><Button type="text" icon={<ReloadOutlined spin={loading} />} onClick={() => void refresh()} aria-label="刷新工作概览" /></Tooltip>
      </div>
    </header>
    {error ? <Alert type="error" showIcon message="工作概览暂时不可用" description={error} action={<Button onClick={() => void refresh()}>重试</Button>} /> : null}
    {actionError ? <Alert type="warning" message={actionError} closable onClose={() => setActionError('')} /> : null}
    {loading && !data ? <div className="workbench-loading" aria-label="正在读取工作概览"><Skeleton active /><Skeleton active /></div> : null}
    {data ? <>
      <section id="workbench-attention" className="workbench-attention">
        <div className="workbench-section-heading"><h2>待我处理 <span className="workbench-count">{data.attention.total}</span></h2>{data.attention.hasMore ? <Link to={href('/tasks?status=all' + (project ? '&project=' + encodeURIComponent(project) : ''))}>查看全部任务 <ArrowRightOutlined /></Link> : null}</div>
        {data.attention.diagnostic ? <Alert type="warning" message={data.attention.diagnostic.message} /> : null}
        <div className="workbench-attention-grid">
          {data.attention.items.map(({ task, workContext }) => {
            const attention = workContext.context?.attention;
            if (!attention || attention.state !== 'pending') return null;
            const taskPath = href('/tasks/' + encodeURIComponent(task.record.taskId));
            return <article className="workbench-attention-card" key={task.record.taskId} data-attention-task={task.record.taskId}>
              <div className="workbench-attention-top"><span className={'workbench-attention-label ' + attention.kind}><i />{attentionLabels[attention.kind]}</span><Tooltip title={'请求于 ' + formatDateTime(attention.createdAt)}><ClockCircleOutlined /></Tooltip></div>
              <h3><Link to={taskPath} state={{ from }}>{task.record.title}</Link></h3>
              <p>{attention.reason}</p>
              <footer><span>{task.record.scope.projects.map(code => projectNames[code] || code).join('、') || '工作空间范围'}</span><Link to={taskPath} state={{ from }}><Button size="small">{attention.kind === 'decision' ? '查看方案' : attention.kind === 'acceptance' ? '查看成果' : '查看问题'} <ArrowRightOutlined /></Button></Link></footer>
            </article>;
          })}
        </div>
        {!data.attention.items.length && !data.attention.diagnostic ? <div className="workbench-attention-empty"><span className="workbench-quiet-dot" /><div><strong>暂时没有需要你处理的事</strong><p>可以继续手头的工作，或查看最近的变化。</p></div></div> : null}
      </section>
      <div className="workbench-home-grid">
        <div className="workbench-main-stack">
          <section id="workbench-active">
            <div className="workbench-section-heading"><h2>继续推进 <span className="workbench-count">{data.active.total}</span></h2><Link className="workbench-link" to={href('/tasks' + (project ? '?project=' + encodeURIComponent(project) : ''))}>全部任务 <ArrowRightOutlined /></Link></div>
            {data.active.diagnostic ? <Alert type="warning" message={data.active.diagnostic.message} /> : null}
            {data.active.items.length ? <div className="workbench-task-list">{data.active.items.map(item => <WorkbenchTaskRow key={item.task.record.taskId} item={item} projectNames={projectNames} compact onError={setActionError} />)}</div> : !data.active.diagnostic ? <div className="workbench-empty-inline"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有进行中的工作" /><Button onClick={() => openAgentAction('start', project ? { projectCode: project } : {})}>提出新目标</Button></div> : null}
            {data.active.hasMore ? <Link className="workbench-link workbench-more" to={href('/tasks?status=active' + (project ? '&project=' + encodeURIComponent(project) : ''))}>查看全部进行中的工作 <ArrowRightOutlined /></Link> : null}
            <div className="workbench-upnext" id="workbench-planned">
              <div className="workbench-section-heading"><h3>接下来准备做</h3><Link className="workbench-link" to={href('/tasks?status=todo' + (project ? '&project=' + encodeURIComponent(project) : ''))}>查看待办 <ArrowRightOutlined /></Link></div>
              {data.planned.diagnostic ? <Alert type="warning" message={data.planned.diagnostic.message} /> : null}
              {data.planned.items.length ? data.planned.items.map(({ task }) => <Link className="workbench-next-row" key={task.record.taskId} to={href('/tasks/' + encodeURIComponent(task.record.taskId))} state={{ from }}><ClockCircleOutlined /><span>{task.record.title}</span><ArrowRightOutlined /></Link>) : <p className="workbench-muted">在待办详情中选择“加入接下来”，安排准备推进的工作。</p>}
              {data.planned.hasMore ? <Link to={href('/tasks?status=todo' + (project ? '&project=' + encodeURIComponent(project) : ''))}>更多待办</Link> : null}
            </div>
          </section>
          <section>
            <div className="workbench-section-heading"><h2>项目变化</h2><Link className="workbench-link" to={href('/activity' + (project ? '?project=' + encodeURIComponent(project) : ''))}>更多动态 <ArrowRightOutlined /></Link></div>
            <WorkbenchDailyProgress data={data.dailyProgress} project={project} onRefresh={() => void refresh()} />
            {data.recentResults.items.length ? <div className="workbench-recent-results"><h3>近期完成</h3>{data.recentResults.items.slice(0, 3).map(item => <WorkbenchTaskRow key={item.task.record.taskId} item={item} compact projectNames={projectNames} onError={setActionError} />)}<Link className="workbench-link" to={href('/tasks?status=completed' + (project ? '&project=' + encodeURIComponent(project) : ''))}>查看完成记录 <ArrowRightOutlined /></Link></div> : null}
          </section>
        </div>
        <aside className="workbench-rail">
          <WorkbenchResources />
          <section className="workbench-rail-card">
            <div className="workbench-section-heading"><h2>关注的项目</h2><Link className="workbench-link" to={href('/projects')}>全部 <ArrowRightOutlined /></Link></div>
            {(followed.length ? followed.map(item => ({ code: item.key, name: item.label })) : data.projects.slice(0, 5)).map(item => (
              <div className="workbench-project-row" key={item.code}><Link to={href('/projects/' + encodeURIComponent(item.code))}><span className="workbench-project-dot" /><strong>{item.name}</strong></Link><Button type="text" size="small" loading={busyProject === item.code} aria-label={(prefs.has('followed-project', item.code) ? '取消关注：' : '关注：') + item.name} icon={prefs.has('followed-project', item.code) ? <StarFilled /> : <StarOutlined />} onClick={() => void toggleProject(item.code)} /></div>
            ))}
            {!followed.length ? <p className="workbench-muted">关注后，可从侧栏快速回到项目。</p> : null}
          </section>
          <p className="workbench-observed">读取于 {formatDateTime(data.observedAt)}<br />工作进展按实际记录展示。</p>
        </aside>
      </div>
    </> : null}
  </div>;
}
