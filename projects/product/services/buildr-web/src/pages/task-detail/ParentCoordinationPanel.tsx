import { useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { formatDateTime, taskStatusLabel } from '../../lib/taskLabels';
import { Fact } from './shared';
import {
  completedContributionCount,
  contributionDispositionLabel,
  contributionEligibilityLabel,
  startupBlockerLabel,
  type ParentContribution,
  type ParentCoordinationResult,
} from './parentCoordination';
import './ParentCoordinationPanel.css';

type Props = { data: ParentCoordinationResult | null; loading: boolean; onRefresh: () => void };

function list(items: string[], empty: string) {
  return items.length ? <ul className="parent-plan-list">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-copy">{empty}</p>;
}

function statusTone(status: string) {
  if (['delivered', 'superseded', 'eligible'].includes(status)) return 'positive';
  if (['residual', 'unproven', 'waiting-dependency'].includes(status)) return 'warning';
  return 'neutral';
}

function ContributionRail({ contributions, selectedId, onSelect }: { contributions: ParentContribution[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ol className="parent-contribution-rail">
      {contributions.map((item) => (
        <li key={item.id}>
          <button type="button" className={item.id === selectedId ? 'selected' : ''} onClick={() => onSelect(item.id)} data-contribution-id={item.id}>
            <span className="parent-priority">{item.priority}</span>
            <span className="parent-rail-copy"><strong>{item.title}</strong><small>{item.objective}</small></span>
            <span className={`parent-status-dot ${statusTone(item.actual.status)}`} aria-label={contributionDispositionLabel(item.actual.status)} />
          </button>
        </li>
      ))}
    </ol>
  );
}

function ContributionDetail({ contribution, byId }: { contribution: ParentContribution; byId: Map<string, ParentContribution> }) {
  return (
    <article className="parent-contribution-detail" data-contribution-disposition={contribution.actual.status}>
      <header>
        <div><span className="parent-priority">{contribution.priority}</span><h3>{contribution.title}</h3><code>{contribution.id}</code></div>
        <div className="parent-axis-badges">
          <span className="neutral">预期：{contribution.expectation.status === 'expected' ? contribution.expectation.child : '无'}</span>
          <span className={statusTone(contribution.eligibility.status)}>执行：{contributionEligibilityLabel(contribution.eligibility.status)}</span>
          <span className={statusTone(contribution.actual.status)}>实际：{contributionDispositionLabel(contribution.actual.status)}</span>
        </div>
      </header>
      <p className="parent-objective">{contribution.objective}</p>
      <div className="parent-detail-columns">
        <section><h4>实现方向</h4>{list(contribution.directions, '未补充实现方向。')}</section>
        <section><h4>边界</h4>{list(contribution.boundaries, '未补充边界。')}</section>
      </div>
      <section className="parent-dependency-summary">
        <h4>依赖</h4>
        {contribution.dependencies.length ? contribution.dependencies.map((id) => <span key={id}>{byId.get(id)?.title || id}</span>) : <span>无前置依赖</span>}
      </section>
      {contribution.actualChild ? <p className="parent-actual-child">实际 Child：<strong>{contribution.actualChild.title}</strong> · <code>{contribution.actualChild.taskId}</code> · {taskStatusLabel(contribution.actualChild.status)}</p> : null}
      {contribution.eligibility.blockers.length ? <p className="parent-wait-copy">等待：{contribution.eligibility.blockers.map((item) => item.title).join('、')}</p> : null}
    </article>
  );
}

export function ParentCoordinationPanel({ data, loading, onRefresh }: Props) {
  const contributions = data?.contributions || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const recommendedId = data?.startup?.next?.contributionIds?.[0] || data?.startup?.eligibleContributions?.[0] || contributions[0]?.id || null;
  useEffect(() => {
    if (!selectedId || !contributions.some((item) => item.id === selectedId)) setSelectedId(recommendedId);
  }, [contributions, recommendedId, selectedId]);
  const byId = useMemo(() => new Map(contributions.map((item) => [item.id, item])), [contributions]);
  const selected = selectedId ? byId.get(selectedId) || null : null;

  if (!data && !loading) return null;
  if (data?.mode === 'ordinary' || data?.mode === 'legacy') return null;
  if (data?.mode === 'child') return (
    <section className="panel child-parent-source" id="task-parent-coordination">
      <div className="child-parent-heading"><p className="eyebrow">Parent 来源</p><h2>{data.parentSource?.title || data.parentSource?.taskId || 'Parent Task'}</h2><code>{data.parentSource?.taskId}</code></div>
      <p>本任务是 Child；协调计划与最终集成验收由 Parent 管理。</p>
      {data.parentSource?.contributions?.length ? <div className="child-binding-list">{data.parentSource.contributions.map((item) => <article key={item.id}>
        <span className="parent-priority">{item.priority}</span><strong>{item.title}</strong><span>{contributionDispositionLabel(item.bindingStatus)}</span>
        <p>{item.objective}</p>{list(item.directions, '未补充实施方向。')}
      </article>)}</div> : <p className="empty-copy">尚未绑定 Parent Contribution。</p>}
    </section>
  );
  if (data?.diagnostic?.code && data.mode !== 'parent-plan') return <section className="panel"><p className="alert error">{data.diagnostic.message}</p></section>;
  if (data?.mode !== 'parent-plan') return null;

  const completed = completedContributionCount(contributions);
  const review = data.planningReview;
  return (
    <section className="panel parent-coordination-panel" id="task-parent-coordination" aria-live="polite">
      <div className="panel-heading parent-plan-heading">
        <div><p className="eyebrow">Parent Plan</p><h2>{data.plan?.outcome}</h2><p className="section-copy">直接消费 Parent Coordination Application 的派生 read model，以结构化 Contribution Map 协调范围、依赖与实际交付。</p></div>
        <Button onClick={onRefresh} disabled={loading}>{loading ? '读取中…' : '刷新协调事实'}</Button>
      </div>

      <div className="parent-summary-strip">
        <div><span>当前动作</span><strong>{data.startup?.next?.summary || '暂无下一步'}</strong></div>
        <div><span>可启动</span><strong>{data.startup?.eligibleContributions?.length || 0}</strong></div>
        <div><span>明确处置</span><strong>{completed} / {contributions.length}</strong></div>
        <div><span>最终验收</span><strong>{data.parentAcceptance ? '已记录' : data.prerequisitesSatisfied ? '待记录' : '未就绪'}</strong></div>
      </div>

      {data.startup?.blockers?.length ? <div className="parent-blocker-banner">{data.startup.blockers.map((item) => <span key={`${item.code}-${item.contributionId || ''}`}>{startupBlockerLabel(item)}</span>)}</div> : null}

      <div className="parent-plan-workbench">
        <nav aria-label="Contribution Map"><h3>Contribution Map</h3><ContributionRail contributions={contributions} selectedId={selectedId} onSelect={setSelectedId} /></nav>
        {selected ? <ContributionDetail contribution={selected} byId={byId} /> : <p className="empty-copy">尚无 Contribution。</p>}
      </div>

      <details className="technical-details parent-governance-details">
        <summary>架构决定、最终验收与治理事实</summary>
        <div className="parent-governance-grid">
          <section><h3>架构决定</h3>{list(data.plan?.architectureDecisions || [], '尚未记录。')}</section>
          <section><h3>最终验收条件</h3>{list(data.plan?.finalAcceptance || [], '尚未记录。')}</section>
        </div>
        <dl className="read-facts detail-facts">
          <Fact label="Plan schema" value={data.plan?.sourceSchemaVersion || '—'} />
          <Fact label="Plan identity" value={data.plan?.identity || '—'} />
          <Fact label="最终集成验收" value={data.parentAcceptance ? `${data.parentAcceptance.summary} · ${formatDateTime(data.parentAcceptance.acceptedAt)}` : '尚未记录'} />
          <Fact label="Planning Review" value={review?.present ? `${review.result?.conclusion?.outcome || '未知'} · ${review.applicability || '未知'}` : '尚未记录'} />
        </dl>
      </details>
    </section>
  );
}
