import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { applicabilityLabel, formatDateTime, gateOutcomeLabel, taskStatusLabel } from '../../lib/taskLabels';
import { Fact } from './shared';
import {
  buildContributionProgressGroups,
  completedContributionCount,
  contributionDispositionLabel,
  contributionEligibilityLabel,
  startupBlockerLabel,
  type ParentContribution,
  type ParentContributionProgressItem,
  type ParentCoordinationResult,
} from './parentCoordination';
import './ParentCoordinationPanel.css';

type Props = {
  data: ParentCoordinationResult | null;
  loading: boolean;
  onRefresh: () => void;
  taskHref: (taskId: string) => string;
};

function list(items: string[], empty: string) {
  return items.length ? <ul className="parent-plan-list">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-copy">{empty}</p>;
}

function statusTone(status: string) {
  if (['delivered', 'superseded', 'eligible'].includes(status)) return 'positive';
  if (['residual', 'unproven', 'waiting-dependency'].includes(status)) return 'warning';
  return 'neutral';
}

function childStatusLabel(status: string) {
  const label = taskStatusLabel(status);
  return label === status ? '未知状态' : label;
}

function contributionStatus(contribution: ParentContribution) {
  if (contribution.actual.status !== 'unassigned') return {
    label: contributionDispositionLabel(contribution.actual.status),
    tone: statusTone(contribution.actual.status),
  };
  return {
    label: contributionEligibilityLabel(contribution.eligibility.status),
    tone: statusTone(contribution.eligibility.status),
  };
}

function ContributionDeliverySummary({ item }: { item: ParentContributionProgressItem }) {
  const { contribution } = item;
  const matchingDeliveries = item.children
    .filter((child) => child.deliveryProven && child.delivery)
    .map((child) => child.delivery!);
  const delivered = matchingDeliveries.some((delivery) => delivery.delivered.includes(contribution.id));
  const nextActions = [...new Set(matchingDeliveries.map((delivery) => delivery.nextAction).filter(Boolean))];
  const facts = [
    delivered ? { label: '已交付', value: contribution.title, tone: 'positive' } : null,
    contribution.residual ? { label: '剩余工作', value: contribution.residual.summary, tone: 'warning' } : null,
    contribution.superseded ? { label: '已取代', value: contribution.superseded.reason, tone: 'neutral' } : null,
    ...nextActions.map((value) => ({ label: '下一步行动', value, tone: 'neutral' })),
  ].filter((fact): fact is { label: string; value: string; tone: string } => Boolean(fact));

  if (!facts.length) return null;
  return <dl className="parent-delivery-summary">{facts.map((fact, index) => (
    <div className={fact.tone} key={`${fact.label}-${index}-${fact.value}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
  ))}</dl>;
}

function ContributionProgressCard({ item, byId, taskHref }: {
  item: ParentContributionProgressItem;
  byId: Map<string, ParentContribution>;
  taskHref: Props['taskHref'];
}) {
  const { contribution } = item;
  const state = contributionStatus(contribution);
  return (
    <article className="parent-progress-card" data-contribution-id={contribution.id} data-contribution-group={item.groupId} data-contribution-disposition={contribution.actual.status}>
      <header className="parent-progress-card-heading">
        <div className="parent-progress-title"><span className="parent-priority">{contribution.priority}</span><h4>{contribution.title}</h4><code>{contribution.id}</code></div>
        <span className={`parent-rail-state ${state.tone}`}>{state.label}</span>
      </header>
      <p className="parent-objective">{contribution.objective}</p>

      {item.children.length ? <div className="parent-actual-children">
        <h5>实际子任务</h5>
        {item.children.map((child) => <article key={child.taskId} data-child-task-id={child.taskId}>
          <div><Link to={taskHref(child.taskId)}>{child.title}</Link><code>{child.taskId}</code></div>
          <span>{childStatusLabel(child.status)}</span>
          <span className={child.deliveryProven ? 'delivery-proven' : 'delivery-unproven'}>{child.deliveryProven ? '交付已证明' : '交付未证明'}</span>
          <Link className="parent-child-link" to={taskHref(child.taskId)}>查看子任务</Link>
        </article>)}
      </div> : null}

      <ContributionDeliverySummary item={item} />

      {contribution.eligibility.blockers.length ? <div className="parent-wait-reason">
        <strong>阻塞原因：需等待以下依赖形成已证明交付。</strong>
        <div>{contribution.eligibility.blockers.map((blocker) => <span key={blocker.contributionId}><b>{blocker.title}</b><code>{blocker.contributionId}</code></span>)}</div>
      </div> : null}

      <details className="parent-progress-detail">
        <summary>查看计划方向与边界</summary>
        <div className="parent-detail-columns">
          <section><h5>实现方向</h5>{list(contribution.directions, '未补充实现方向。')}</section>
          <section><h5>边界</h5>{list(contribution.boundaries, '未补充边界。')}</section>
        </div>
        <section className="parent-dependency-summary">
          <h5>计划依赖</h5>
          {contribution.dependencies.length ? contribution.dependencies.map((id) => <span key={id}><strong>{byId.get(id)?.title || '未知贡献项'}</strong><code>{id}</code></span>) : <span>无前置依赖</span>}
        </section>
        <p className="parent-expected-child"><span>预期子任务：</span><strong>{contribution.expectation.status === 'expected' ? contribution.expectation.child : '无'}</strong></p>
      </details>
    </article>
  );
}

function DecisionList({ items }: { items: string[] }) {
  return <ol className="parent-decision-grid">{items.map((item, index) => <li key={`${index}-${item}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>;
}

function AcceptanceList({ items }: { items: string[] }) {
  return <ol className="parent-acceptance-list">{items.map((item, index) => <li key={`${index}-${item}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>;
}

export function ParentCoordinationPanel({ data, loading, onRefresh, taskHref }: Props) {
  const contributions = data?.contributions || [];
  const byId = useMemo(() => new Map(contributions.map((item) => [item.id, item])), [contributions]);
  const progressGroups = useMemo(() => buildContributionProgressGroups(contributions, data?.children || []), [contributions, data?.children]);

  if (!data && !loading) return null;
  if (data?.mode === 'ordinary' || data?.mode === 'legacy') return null;
  if (data?.mode === 'child') return (
    <section className="panel child-parent-source" id="task-parent-coordination">
      <div className="child-parent-heading">
        <p className="eyebrow">父任务来源</p>
        <h2>{data.parentSource?.taskId ? <Link to={taskHref(data.parentSource.taskId)}>{data.parentSource.title || data.parentSource.taskId}</Link> : '父任务'}</h2>
        <code>{data.parentSource?.taskId}</code>
      </div>
      <p>本任务是子任务；协调计划与最终集成验收由父任务管理。</p>
      {data.parentSource?.contributions?.length ? <div className="child-binding-list">{data.parentSource.contributions.map((item) => <article key={item.id}>
        <span className="parent-priority">{item.priority}</span><strong>{item.title}</strong><span>{contributionDispositionLabel(item.bindingStatus)}</span>
        <p>{item.objective}</p>{list(item.directions, '未补充实施方向。')}
      </article>)}</div> : <p className="empty-copy">尚未绑定父任务贡献项。</p>}
    </section>
  );
  if (data?.diagnostic?.code && data.mode !== 'parent-plan') return <section className="panel"><p className="alert error">{data.diagnostic.message}</p></section>;
  if (data?.mode !== 'parent-plan') return null;

  const completed = completedContributionCount(contributions);
  const review = data.planningReview;
  return (
    <section className="parent-coordination-panel" id="task-parent-coordination" aria-live="polite">
      <div className="parent-overview-hero">
        <article className="panel parent-outcome-card">
          <p className="eyebrow">父任务目标</p><h2>{data.plan?.outcome}</h2>
          <p className="section-copy">以完整父任务计划为核心，协调工作范围、依赖、实际交付与最终集成验收。</p>
        </article>
        <aside className="panel parent-action-card">
          <div className="parent-action-copy"><div><span>当前动作</span><strong>{data.startup?.next?.summary || '暂无下一步'}</strong></div><Button onClick={onRefresh} disabled={loading}>{loading ? '刷新中…' : '刷新'}</Button></div>
          <div className="parent-summary-strip">
            <div><span>可启动</span><strong>{data.startup?.eligibleContributions?.length || 0}</strong></div>
            <div><span>已明确处置</span><strong>{completed} / {contributions.length}</strong></div>
            <div><span>最终验收</span><strong>{data.parentAcceptance ? '已记录' : data.prerequisitesSatisfied ? '待记录' : '未就绪'}</strong></div>
          </div>
        </aside>
      </div>

      {data.startup?.blockers?.length ? <div className="parent-blocker-banner">{data.startup.blockers.map((item) => <span key={`${item.code}-${item.contributionId || ''}`}>{startupBlockerLabel(item)}</span>)}</div> : null}

      <section className="panel parent-work-section">
        <div className="parent-section-heading"><div><p className="eyebrow">工作迁移</p><h3>贡献项迁移进度</h3><p className="section-copy">由父任务计划与当前子任务、贡献绑定和贡献交接事实即时生成。</p></div><span>{contributions.length} 项</span></div>
        <div className="parent-plan-workbench" data-progress-group-count={progressGroups.length}>
          {progressGroups.map((group) => <section className={`parent-progress-group ${group.id}`} data-progress-group={group.id} key={group.id}>
            <header><div><h4>{group.label}</h4><p>{group.id === 'active-delivered' ? '已有实际子任务承担，或已有明确交付处置。' : group.id === 'startable' ? '依赖已满足，可以创建并绑定子任务。' : '仍需等待依赖或其他启动条件。'}</p></div><strong>{group.items.length} 项</strong></header>
            {group.items.length ? <div className="parent-progress-items">{group.items.map((item) => <ContributionProgressCard key={item.contribution.id} item={item} byId={byId} taskHref={taskHref} />)}</div> : <p className="parent-progress-empty">当前没有此类贡献项。</p>}
          </section>)}
        </div>
      </section>

      {(data.plan?.architectureDecisions?.length || 0) > 0 ? <section className="panel parent-plan-section parent-plan-architecture">
        <div className="parent-section-heading"><div><p className="eyebrow">架构决定</p><h3>推进过程中保持不变的约束</h3><p className="section-copy">这些是父任务的稳定边界；子任务不能自行改变。</p></div><span>{data.plan?.architectureDecisions.length} 项</span></div>
        <DecisionList items={data.plan?.architectureDecisions || []} />
      </section> : null}

      {(data.plan?.finalAcceptance?.length || 0) > 0 ? <section className="panel parent-plan-section parent-plan-acceptance">
        <div className="parent-section-heading"><div><p className="eyebrow">最终验收</p><h3>父任务完成前必须共同满足</h3><p className="section-copy">这些是最终集成结果，不是当前启动阻塞。</p></div><span>{data.plan?.finalAcceptance.length} 项</span></div>
        <AcceptanceList items={data.plan?.finalAcceptance || []} />
      </section> : null}

      <details className="panel technical-details parent-governance-details">
        <summary>技术治理事实</summary>
        <dl className="read-facts detail-facts">
          <Fact label="计划结构版本" value={data.plan?.sourceSchemaVersion || '—'} />
          <Fact label="计划标识" value={data.plan?.identity || '—'} />
          <Fact label="最终集成验收" value={data.parentAcceptance ? `${data.parentAcceptance.summary} · ${formatDateTime(data.parentAcceptance.acceptedAt)}` : '尚未记录'} />
          <Fact label="方案审查" value={review?.present ? `${gateOutcomeLabel(review.outcome || undefined)} · ${applicabilityLabel(review.applicability || '')}` : '尚未记录'} />
        </dl>
      </details>
    </section>
  );
}
