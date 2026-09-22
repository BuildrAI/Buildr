import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Alert, Button, Skeleton } from 'antd';
import { dailyProgressApi, type Commit, type DaySummary, type InspectResult } from '../api/daily-progress-api';
import { workspaceHref } from '../../../lib/labels';
import { taskStatusLabel } from '../../../lib/taskLabels';
import type { DailyProgressGroup } from '../dailyProgressNavigation';
import '../daily-progress.css';

const GROUPS = [
  { value: 'day', label: '按日' },
  { value: 'person', label: '按人' },
  { value: 'task', label: '按任务' },
] as const;

const SUMMARY_CARDS = [
  { key: 'added', title: '新增了什么' },
  { key: 'updated', title: '更新了什么' },
  { key: 'deleted', title: '删除了什么' },
  { key: 'drawbacks', title: '有什么弊端' },
] as const;

function TaskChips({ commit, href, from }: { commit: Commit; href: (path: string) => string; from: string }) {
  if (commit.authorship !== 'self' || !commit.tasks.length) return null;
  return (
    <>
      {commit.tasks.map((task) => (
        task.resolved ? (
          <Link key={task.taskId} className="progress-task-chip" to={href(`/tasks/${encodeURIComponent(task.taskId)}`)} state={{ from }}>
            {task.title || task.taskId} · {taskStatusLabel(task.status || '')}
          </Link>
        ) : (
          <span key={task.taskId} className="progress-task-chip unresolved" title="本机已无此任务">
            {task.taskId} · 未解析
          </span>
        )
      ))}
    </>
  );
}

function CommitCard({ commit, href, from }: { commit: Commit; href: (path: string) => string; from: string }) {
  return (
    <article className="commit-item" data-progress-item={commit.sha}>
      <div className="commit-top">
        <span className="sha">{commit.sha}</span>
        <span className={`owner-chip ${commit.authorship}`}>
          {commit.authorship === 'self' ? '我的提交' : '他人提交'}
        </span>
      </div>
      <p className="commit-subject">{commit.subject}</p>
      <div className="commit-meta">
        <span className="author-chip">{commit.authorName} · {commit.authorEmail}</span>
        <TaskChips commit={commit} href={href} from={from} />
      </div>
    </article>
  );
}

function SummaryGrid({ summary }: { summary: DaySummary }) {
  return (
    <section className="summary-grid" aria-label="日摘要">
      {SUMMARY_CARDS.map((card) => (
        <article key={card.key} className="summary-card">
          <h3>{card.title}</h3>
          <p>{summary[card.key]}</p>
        </article>
      ))}
    </section>
  );
}

type Props = {
  projectCode: string;
  workspaceId: string | null;
  date: string;
  group: DailyProgressGroup;
  refreshKey: number;
  onGroupChange: (group: DailyProgressGroup) => void;
  onAskAgent: () => void;
};

type ReadState = { key: string; data: InspectResult | null; loading: boolean; error: string | null };

export function DailyProgressPanel({ projectCode, workspaceId, date, group, refreshKey, onGroupChange, onAskAgent }: Props) {
  const location = useLocation();
  const from = location.pathname + location.search;
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [focusRefresh, setFocusRefresh] = useState(0);
  const readKey = JSON.stringify([workspaceId, projectCode, date, group, refreshKey, focusRefresh]);
  const [read, setRead] = useState<ReadState>({ key: '', data: null, loading: true, error: null });
  const { data, loading, error } = read.key === readKey ? read : { data: null, loading: true, error: null };

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') setFocusRefresh(value => value + 1); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRead({ key: readKey, data: null, loading: true, error: null });
    void (async () => {
      try {
        const next = await dailyProgressApi.inspect(projectCode, date, group, { signal: controller.signal });
        if (!controller.signal.aborted) setRead({ key: readKey, data: next, loading: false, error: null });
      } catch (err) {
        if (!controller.signal.aborted) setRead({ key: readKey, data: null, loading: false, error: err instanceof Error ? err.message : '无法读取每日演进' });
      }
    })();
    return () => { controller.abort(); };
  }, [projectCode, date, group, readKey]);

  const emptyCopy = data?.status === 'incompatible'
    ? '这一天的摘要格式较旧，可交给智能体（Agent）按已确认的提交范围重新生成。'
    : '可交给智能体（Agent）根据这一天的本地提交生成摘要，并说明覆盖范围。';

  return (
    <section className="daily-progress-panel" aria-label="每日演进" data-progress-project={projectCode} data-progress-date={date}>
      <div className="progress-toolbar">
        <div className="segmented" role="group" aria-label="分组方式">
          {GROUPS.map((item) => (
            <button
              key={item.value}
              type="button"
              data-group={item.value}
              className={group === item.value ? 'active' : undefined}
              aria-pressed={group === item.value}
              onClick={() => onGroupChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="progress-meta" id="progress-meta">
          {loading ? '正在读取…' : data?.status === 'inspected' ? `${data.itemCount} 条提交 · 关联 ${data.taskReferenceCount} 个任务` : data?.status === 'incompatible' ? '当天摘要格式不兼容' : error ? '摘要暂不可用' : '当天还没有摘要'}
        </span>
      </div>
      <div id="progress-body">
        {loading ? <Skeleton active /> : null}
        {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => setFocusRefresh(value => value + 1)}>重试</Button>} /> : null}
        {!loading && !error && data?.status !== 'inspected' ? (
          <div className="empty-state" id="daily-progress-empty">
            <h2>{data?.status === 'incompatible' ? '这一天的摘要需要重新生成' : '这一天还没有每日演进'}</h2>
            <p>{emptyCopy}</p>
            <Button type="primary" id="empty-agent-action" onClick={onAskAgent}>生成每日演进</Button>
          </div>
        ) : null}
        {!loading && !error && data?.status === 'inspected' && data.daySummary ? (
          <>
            <SummaryGrid summary={data.daySummary} />
            {group === 'task' ? <p className="progress-hint">按任务只聚合已关联的自己的提交；他人提交不进入任务分组。</p> : null}
            {data.groups.map((section) => (
              <section key={section.key} className="progress-group">
                {group === 'day' ? <h3>提交记录</h3> : <h3>{section.label}</h3>}
                {section.commits.map((commit) => <CommitCard key={`${section.key}-${commit.sha}`} commit={commit} href={href} from={from} />)}
              </section>
            ))}
            {!data.groups.some(section => section.commits.length) ? <p className="progress-hint">{group === 'task' ? '这一天没有关联任务的自己的提交。' : '这份摘要没有提交记录。'}</p> : null}
            <p className="local-note">仅展示这一天已保存的摘要与提交，具体覆盖范围见摘要说明。</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
