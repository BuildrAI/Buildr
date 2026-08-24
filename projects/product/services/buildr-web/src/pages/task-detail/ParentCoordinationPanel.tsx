import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Drawer } from 'antd';
import { applicabilityLabel, formatDateTime, gateOutcomeLabel, taskStatusLabel } from '../../lib/taskLabels';
import { Fact } from './shared';
import {
  buildContributionProgressGroups,
  buildContributionProgressSummary,
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

type DeliveryFact = { label: string; value: string; tone: string };

function contributionDeliveryFacts(item: ParentContributionProgressItem): DeliveryFact[] {
  const { contribution } = item;
  const matchingDeliveries = item.children
    .filter((child) => child.deliveryProven && child.delivery)
    .map((child) => child.delivery!);
  const delivered = matchingDeliveries.some((delivery) => delivery.delivered.includes(contribution.id));
  const nextActions = [...new Set(matchingDeliveries.map((delivery) => delivery.nextAction).filter(Boolean))];
  return [
    delivered ? { label: '已交付', value: contribution.title, tone: 'positive' } : null,
    contribution.residual ? { label: '剩余工作', value: contribution.residual.summary, tone: 'warning' } : null,
    contribution.superseded ? { label: '已取代', value: contribution.superseded.reason, tone: 'neutral' } : null,
    ...nextActions.map((value) => ({ label: '下一步行动', value, tone: 'neutral' })),
  ].filter((fact): fact is { label: string; value: string; tone: string } => Boolean(fact));
}

function ContributionDeliverySummary({ item }: { item: ParentContributionProgressItem }) {
  const facts = contributionDeliveryFacts(item);
  if (!facts.length) return null;
  return <div className="parent-delivery-facts">{facts.map((fact, index) => (
    <span className={fact.tone} key={`${fact.label}-${index}-${fact.value}`}><b>{fact.label}</b>{fact.value}</span>
  ))}</div>;
}

function stopRowNavigation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function ContributionProgressRow({ item, taskHref, onOpen }: {
  item: ParentContributionProgressItem;
  taskHref: Props['taskHref'];
  onOpen: (item: ParentContributionProgressItem) => void;
}) {
  const { contribution } = item;
  const state = contributionStatus(contribution);
  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(item);
    }
  };
  return (
    <article className="parent-progress-row" role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={openFromKeyboard} data-contribution-id={contribution.id} data-contribution-group={item.groupId} data-contribution-disposition={contribution.actual.status}>
      <div className="parent-progress-contribution" data-progress-region="contribution">
        <div><span className="parent-priority">{contribution.priority}</span><span className={`parent-progress-state ${state.tone}`}>{state.label}</span></div>
        <h4>{contribution.title}</h4>
        <code>{contribution.id}</code>
      </div>

      <div className="parent-progress-children" data-progress-region="child">
        <span className="parent-progress-column-label">实际子任务</span>
        {item.children.length ? item.children.map((child) => <div className="parent-progress-child" key={child.taskId} data-child-task-id={child.taskId}>
          <div className="parent-progress-child-heading"><Link to={taskHref(child.taskId)} onClick={stopRowNavigation}>{child.title}</Link><Link className="parent-child-link" to={taskHref(child.taskId)} onClick={stopRowNavigation}>进入子任务 ›</Link></div>
          <div><span>{childStatusLabel(child.status)}</span><span className={child.deliveryProven ? 'delivery-proven' : 'delivery-unproven'}>{child.deliveryProven ? '交付已证明' : '交付未证明'}</span></div>
          <code>{child.taskId}</code>
        </div>) : <div className="parent-progress-unbound"><strong>尚未绑定</strong><span>{contribution.expectation.status === 'expected' ? `预期：${contribution.expectation.child}` : '未指定预期子任务'}</span></div>}
      </div>

      <div className="parent-progress-handoff" data-progress-region="handoff">
        <span className="parent-progress-column-label">{contribution.eligibility.blockers.length ? '依赖与阻塞' : '贡献交接'}</span>
        <ContributionDeliverySummary item={item} />
        {contribution.eligibility.blockers.length ? <div className="parent-inline-blockers">
          <strong>阻塞原因：等待依赖形成已证明交付</strong>
          {contribution.eligibility.blockers.map((blocker) => <span key={blocker.contributionId}>{blocker.title}<code>{blocker.contributionId}</code></span>)}
        </div> : null}
        {!contribution.eligibility.blockers.length && !contributionDeliveryFacts(item).length ? <span className="parent-progress-no-handoff">{item.children.length ? '尚无贡献交接' : '依赖已满足，可启动子任务'}</span> : null}
      </div>

      <button className="parent-progress-open" type="button" aria-label={`查看贡献项：${contribution.title}`} onClick={(event) => { event.stopPropagation(); onOpen(item); }} data-progress-region="detail">›</button>
    </article>
  );
}

function ContributionDetail({ item, byId, taskHref }: {
  item: ParentContributionProgressItem;
  byId: Map<string, ParentContribution>;
  taskHref: Props['taskHref'];
}) {
  const { contribution } = item;
  const state = contributionStatus(contribution);
  return <div className="parent-contribution-detail" data-contribution-detail={contribution.id}>
    <header><div><span className="parent-priority">{contribution.priority}</span><h3>{contribution.title}</h3><code>{contribution.id}</code></div><div className="parent-axis-badges"><span className={state.tone}>{state.label}</span></div></header>
    <section className="parent-detail-section"><h4>目标</h4><p className="parent-objective">{contribution.objective}</p></section>
    <div className="parent-detail-columns">
      <section><h4>实现方向</h4>{list(contribution.directions, '未补充实现方向。')}</section>
      <section><h4>边界</h4>{list(contribution.boundaries, '未补充边界。')}</section>
    </div>
    <section className="parent-dependency-summary"><h4>计划依赖</h4>{contribution.dependencies.length ? contribution.dependencies.map((id) => <span key={id}><strong>{byId.get(id)?.title || '未知贡献项'}</strong><code>{id}</code></span>) : <span>无前置依赖</span>}</section>
    <section className="parent-detail-section"><h4>预期子任务</h4><p>{contribution.expectation.status === 'expected' ? contribution.expectation.child : '无'}</p></section>
    <section className="parent-detail-section"><h4>实际子任务与贡献交接</h4>{item.children.length ? item.children.map((child) => <div className="parent-detail-child" key={child.taskId}><Link to={taskHref(child.taskId)}>{child.title}</Link><span>{childStatusLabel(child.status)} · {child.deliveryProven ? '交付已证明' : '交付未证明'}</span><code>{child.taskId}</code></div>) : <p className="empty-copy">尚未绑定实际子任务。</p>}<ContributionDeliverySummary item={item} /></section>
  </div>;
}

function DecisionList({ items }: { items: string[] }) {
  return <ol className="parent-decision-grid">{items.map((item, index) => <li key={`${index}-${item}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>;
}

function AcceptanceList({ items }: { items: string[] }) {
  return <ol className="parent-acceptance-list">{items.map((item, index) => <li key={`${index}-${item}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>;
}

export function ParentCoordinationPanel({ data, loading, onRefresh, taskHref }: Props) {
  const [selectedContributionId, setSelectedContributionId] = useState<string | null>(null);
  const contributions = data?.contributions || [];
  const byId = useMemo(() => new Map(contributions.map((item) => [item.id, item])), [contributions]);
  const progressGroups = useMemo(() => buildContributionProgressGroups(contributions, data?.children || []), [contributions, data?.children]);
  const progressSummary = useMemo(() => buildContributionProgressSummary(contributions, data?.children || []), [contributions, data?.children]);
  const selectedItem = useMemo(() => progressGroups.flatMap((group) => group.items).find((item) => item.contribution.id === selectedContributionId) || null, [progressGroups, selectedContributionId]);

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
            <div data-summary-kind="delivered"><span>已交付</span><strong>{progressSummary.delivered}</strong></div>
            <div data-summary-kind="residual"><span>剩余工作</span><strong>{progressSummary.residual}</strong></div>
            <div data-summary-kind="superseded"><span>已取代</span><strong>{progressSummary.superseded}</strong></div>
            <div data-summary-kind="active"><span>进行中</span><strong>{progressSummary.active}</strong></div>
          </div>
          <p className="parent-progress-source">父任务计划 + 直接子任务 + 贡献交接动态生成 · 不写回父任务计划</p>
        </aside>
      </div>

      {data.startup?.blockers?.length ? <div className="parent-blocker-banner">{data.startup.blockers.map((item) => <span key={`${item.code}-${item.contributionId || ''}`}>{startupBlockerLabel(item)}</span>)}</div> : null}

      <section className="panel parent-work-section">
        <div className="parent-section-heading"><div><p className="eyebrow">工作迁移</p><h3>贡献项迁移进度</h3><p className="section-copy">由父任务计划与当前子任务、贡献绑定和贡献交接事实即时生成。</p></div><span>{contributions.length} 项</span></div>
        <div className="parent-plan-workbench" data-progress-group-count={progressGroups.length}>
          {progressGroups.map((group) => <section className={`parent-progress-group ${group.id}`} data-progress-group={group.id} key={group.id}>
            <header><div><h4>{group.label}</h4><p>{group.id === 'active-delivered' ? '已有实际子任务承担，或已有明确交付处置。' : group.id === 'startable' ? '依赖已满足，可以创建并绑定子任务。' : '仍需等待依赖或其他启动条件。'}</p></div><strong>{group.items.length} 项</strong></header>
            {group.items.length ? <div className="parent-progress-items">{group.items.map((item) => <ContributionProgressRow key={item.contribution.id} item={item} taskHref={taskHref} onOpen={(selected) => setSelectedContributionId(selected.contribution.id)} />)}</div> : <p className="parent-progress-empty">当前没有此类贡献项。</p>}
          </section>)}
        </div>
      </section>

      <Drawer className="parent-contribution-drawer" title="贡献项详情" width={520} open={Boolean(selectedItem)} onClose={() => setSelectedContributionId(null)} destroyOnHidden>
        {selectedItem ? <ContributionDetail item={selectedItem} byId={byId} taskHref={taskHref} /> : null}
      </Drawer>

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
