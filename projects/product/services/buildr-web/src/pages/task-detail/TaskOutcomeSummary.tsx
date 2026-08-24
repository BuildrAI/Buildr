import { Button } from 'antd';

import './TaskOutcomeSummary.css';

type OutcomeFact = { status: string; summary: string; source: string };

export type TaskUserSummary = {
  goal: { status: string; title: string; intent: string };
  delivery: OutcomeFact;
  activation: OutcomeFact;
  cleanup: OutcomeFact;
  attention: Array<{ owner: string; scope: string; summary: string }>;
  authorization: Array<{ owner: string; action: string; summary: string }>;
};

type Props = {
  summary?: TaskUserSummary | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenOwner: (owner: string) => void;
  onAuthorize: (authorization: TaskUserSummary['authorization'][number]) => void;
};

const statusLabel: Record<string, string> = {
  delivered: '已交付', 'in-progress': '进行中', 'not-started': '尚未开始', passed: '已通过', cleaned: '已清理',
  pending: '待处理', attention: '需关注', blocked: '受阻', failed: '未通过', unknown: '尚未确认', 'not-applicable': '不适用',
};

function tone(status: string) {
  if (['delivered', 'passed', 'cleaned'].includes(status)) return 'positive';
  if (['attention', 'blocked', 'failed'].includes(status)) return 'warning';
  if (status === 'in-progress') return 'active';
  return 'neutral';
}

function OutcomeCard({ label, value }: { label: string; value: OutcomeFact }) {
  return <article className={`task-outcome-card ${tone(value.status)}`} data-outcome-status={value.status}>
    <span>{label}</span><strong>{statusLabel[value.status] || value.status}</strong><p>{value.summary}</p>
  </article>;
}

export function TaskOutcomeSummary({ summary, loading, onRefresh, onOpenOwner, onAuthorize }: Props) {
  return <section className="panel task-outcome-summary" id="task-outcome-summary" aria-live="polite">
    <div className="panel-heading">
      <div><p className="eyebrow">任务结果</p><h2>{summary?.goal.title || '目标与结果'}</h2></div>
      <Button onClick={onRefresh} disabled={loading}>{loading ? '读取中…' : '刷新'}</Button>
    </div>
    <p className="task-outcome-goal">{summary?.goal.intent || '正在读取当前任务目标与专业结果。'}</p>
    {summary ? <>
      <div className="task-outcome-grid">
        <OutcomeCard label="交付（Delivery）" value={summary.delivery} />
        <OutcomeCard label="激活（Activation）" value={summary.activation} />
        <OutcomeCard label="环境清理（Cleanup）" value={summary.cleanup} />
      </div>
      {summary.attention.length ? <div className="task-outcome-attention"><h3>局部关注事项</h3>
        {summary.attention.map((item, index) => <div key={`${item.owner}-${item.scope}-${index}`}><p>{item.summary}</p><Button size="small" onClick={() => onOpenOwner(item.owner)}>查看专业事实</Button></div>)}
      </div> : null}
      {summary.authorization.length ? <div className="task-outcome-authorization"><h3>需要你的决定</h3>
        {summary.authorization.map((item, index) => <div key={`${item.owner}-${item.action}-${index}`}><p>{item.summary}</p><Button type="primary" size="small" onClick={() => onAuthorize(item)}>交给智能体处理</Button></div>)}
      </div> : null}
    </> : null}
  </section>;
}
