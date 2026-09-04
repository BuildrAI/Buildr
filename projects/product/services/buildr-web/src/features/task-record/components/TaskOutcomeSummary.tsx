import './TaskOutcomeSummary.css';

import type { TaskRecord } from '../api/generated/task-record-dto';

type Props = {
  record: TaskRecord;
};

const statusLabel: Record<string, string> = {
  'in-progress': '进行中', 'not-started': '尚未开始', cleaned: '已清理', abandoned: '已放弃',
  completed: '结果已保存', pending: '待处理', attention: '需关注', blocked: '受阻', failed: '未通过', unknown: '尚未确认', 'not-applicable': '不适用',
};

function tone(status: string) {
  if (['completed', 'cleaned'].includes(status)) return 'positive';
  if (['attention', 'blocked', 'failed'].includes(status)) return 'warning';
  if (status === 'in-progress') return 'active';
  return 'neutral';
}

function OutcomeCard({ label, value }: { label: string; value: { status: string; summary: string } }) {
  return <article className={`task-outcome-card ${tone(value.status)}`} data-outcome-status={value.status}>
    <span>{label}</span><strong>{statusLabel[value.status] || value.status}</strong><p>{value.summary}</p>
  </article>;
}

export function TaskOutcomeSummary({ record }: Props) {
  const result = record.status === 'completed'
    ? { status: 'completed', summary: record.result?.summary || '任务已完成。' }
    : record.status === 'abandoned'
      ? { status: 'abandoned', summary: record.result?.summary || '任务已放弃。' }
      : record.status === 'active'
        ? { status: 'in-progress', summary: '任务正在进行。' }
        : { status: 'not-started', summary: '任务尚未开始。' };
  return <section className="panel task-outcome-summary" id="task-outcome-summary" aria-live="polite">
    <div className="panel-heading">
      <div><p className="eyebrow">任务结果</p><h2>{record.title}</h2></div>
    </div>
    <p className="task-outcome-goal">{record.intent}</p>
    <div className="task-outcome-grid"><OutcomeCard label="任务结果" value={result} /></div>
  </section>;
}
