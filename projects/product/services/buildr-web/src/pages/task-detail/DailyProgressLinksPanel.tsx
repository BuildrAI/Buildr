import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { api } from '../../api';
import { workspaceHref } from '../../lib/labels';

type LinkedItem = {
  project: string;
  projectName: string;
  date: string;
  item: {
    id: string;
    summary: string;
    author: string | null;
    sha?: string;
    authorship?: 'self' | 'other';
  };
};

type TaskView = {
  taskId: string;
  itemCount: number;
  items: LinkedItem[];
};

type Props = {
  taskId: string;
  workspaceId: string | null;
};

export function DailyProgressLinksPanel({ taskId, workspaceId }: Props) {
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [data, setData] = useState<TaskView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/daily-progress`) as TaskView;
        if (!cancelled) setData(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法读取每日演进');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  return (
    <section className="panel" id="task-daily-progress" aria-live="polite">
      <div className="panel-heading">
        <div>
          <h2>本机每日演进</h2>
          <p className="section-copy">只列出已关联该 Task 的自己的提交；每日演进不是任务状态、进度或验证结果。</p>
        </div>
        <Button onClick={() => {
          setLoading(true);
          void api(`/api/v1/tasks/${encodeURIComponent(taskId)}/daily-progress`).then((next) => setData(next as TaskView)).catch((err) => setError(err instanceof Error ? err.message : '无法读取每日演进')).finally(() => setLoading(false));
        }} disabled={loading}>{loading ? '读取中…' : '刷新关联'}</Button>
      </div>
      {error ? <p className="alert error">{error}</p> : null}
      {!error && !loading && !data?.items.length ? (
        <p className="page-copy">还没有本机每日演进引用这个任务。</p>
      ) : null}
      {!error && data?.items.length ? (
        <ul className="progress-task-links">
          {data.items.map((entry) => (
            <li key={`${entry.project}-${entry.date}-${entry.item.id}`}>
              <Link to={href(`/projects/${encodeURIComponent(entry.project)}`)}>
                {entry.date} · {entry.projectName}
              </Link>
              <span>{entry.item.summary}</span>
              <span className="progress-author">{entry.item.sha || entry.item.id} · {entry.item.author || '未署名'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
