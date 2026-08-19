import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { api } from '../../api';
import { workspaceHref } from '../../lib/labels';
import { taskStatusLabel } from '../../lib/taskLabels';

dayjs.locale('zh-cn');

type TaskRef = {
  taskId: string;
  title: string | null;
  status: string | null;
  resolved: boolean;
};

type Commit = {
  sha: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorship: 'self' | 'other';
  taskIds: string[];
  tasks: TaskRef[];
};

type Group = {
  key: string;
  label: string;
  commits: Commit[];
};

type DaySummary = {
  added: string;
  updated: string;
  deleted: string;
  drawbacks: string;
};

type InspectResult = {
  status: 'inspected' | 'not-found' | 'incompatible';
  project: string;
  date: string;
  group: string;
  itemCount: number;
  taskReferenceCount: number;
  daySummary: DaySummary | null;
  commits: Commit[];
  groups: Group[];
};

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

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function TaskChips({ commit, href }: { commit: Commit; href: (path: string) => string }) {
  if (commit.authorship !== 'self' || !commit.tasks.length) return null;
  return (
    <>
      {commit.tasks.map((task) => (
        task.resolved ? (
          <Link key={task.taskId} className="progress-task-chip" to={href(`/tasks/${encodeURIComponent(task.taskId)}`)}>
            {task.title || task.taskId} · {taskStatusLabel(task.status || '')}
          </Link>
        ) : (
          <span key={task.taskId} className="progress-task-chip unresolved" title="本机已无此 Task">
            {task.taskId} · 未解析
          </span>
        )
      ))}
    </>
  );
}

function CommitCard({ commit, href }: { commit: Commit; href: (path: string) => string }) {
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
        <TaskChips commit={commit} href={href} />
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
  onAskAgent: () => void;
};

export function DailyProgressPanel({ projectCode, workspaceId, onAskAgent }: Props) {
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [date, setDate] = useState('');
  const [group, setGroup] = useState<'day' | 'person' | 'task'>('day');
  const [data, setData] = useState<InspectResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ group });
    const suffix = date ? `/${date}` : '';
    void (async () => {
      try {
        const next = await api(`/api/v1/projects/${encodeURIComponent(projectCode)}/daily-progress${suffix}?${query}`) as InspectResult;
        if (cancelled) return;
        setData(next);
        if (!date) setDate(next.date);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法读取每日演进');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, date, group]);

  const emptyCopy = data?.status === 'incompatible'
    ? '当天文件仍是旧形状，需要 Agent 先同步最新代码，再收集当日 Git 提交后重跑覆盖。页面不会根据 Git 自动填充。'
    : '需要 Agent 先同步最新代码，再拉取当日 Git 提交与更改文件，对比本机 user.email 后总结新增、更新、删除与弊端，并判断是否关联 Task。页面不会根据 Git 自动填充。';

  return (
    <section className="project-document-body daily-progress-panel" aria-label="每日演进">
      <div className="progress-toolbar">
        <div className="date-field">
          <span>日期</span>
          <Button size="small" onClick={() => date && setDate(shiftDate(date, -1))} disabled={!date}>前一天</Button>
          <DatePicker
            id="progress-date"
            size="small"
            allowClear={false}
            inputReadOnly
            format="YYYY-MM-DD"
            value={date ? dayjs(date) : null}
            aria-label="选择日期"
            onChange={(next: Dayjs | null) => {
              if (next?.isValid()) setDate(next.format('YYYY-MM-DD'));
            }}
          />
          <Button size="small" onClick={() => date && setDate(shiftDate(date, 1))} disabled={!date}>后一天</Button>
        </div>
        <div className="segmented" role="group" aria-label="分组方式">
          {GROUPS.map((item) => (
            <button
              key={item.value}
              type="button"
              data-group={item.value}
              className={group === item.value ? 'active' : undefined}
              aria-pressed={group === item.value}
              onClick={() => setGroup(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="progress-meta" id="progress-meta">
          {data?.status === 'inspected' ? `本机 · ${data.itemCount} 条提交 · 关联 ${data.taskReferenceCount} 个 Task` : data?.status === 'incompatible' ? '本机 · 当天文件不兼容' : '本机 · 当天还没有文件'}
        </span>
      </div>
      <p className="progress-hint">只读展示当天已保存的摘要。生成或重跑请用右上角「交给 Agent」，页面不提供写入或编辑，打开时也不会扫描 Git。</p>
      <div id="progress-body">
        {loading ? <p className="page-copy">正在读取…</p> : null}
        {error ? <p className="alert error">{error}</p> : null}
        {!loading && !error && data?.status !== 'inspected' ? (
          <div className="empty-state" id="daily-progress-empty">
            <h2>{data?.status === 'incompatible' ? '当天文件需要按 Git 提交重跑' : '这一天还没有每日演进'}</h2>
            <p>{emptyCopy}</p>
            <Button type="primary" id="empty-agent-action" onClick={onAskAgent}>交给 Agent</Button>
          </div>
        ) : null}
        {!loading && !error && data?.status === 'inspected' && data.daySummary ? (
          <>
            {group !== 'task' ? <SummaryGrid summary={data.daySummary} /> : null}
            {group === 'task' ? <p className="progress-hint">按任务只聚合已关联的自己的提交；他人提交不进入任务分组。</p> : null}
            {data.groups.map((section) => (
              <section key={section.key} className="progress-group">
                {group === 'day' ? <h3>今日提交</h3> : <h3>{section.label}</h3>}
                {section.commits.map((commit) => <CommitCard key={`${section.key}-${commit.sha}`} commit={commit} href={href} />)}
              </section>
            ))}
            <p className="local-note">文件保存在本机 .buildr/daily-progress/{data.project}/{data.date}.yml，不进 Git。提交列表由 Agent 写入；打开页面时不会 git log。</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
