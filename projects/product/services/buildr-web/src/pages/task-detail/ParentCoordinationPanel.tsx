import { Button } from 'antd';
import { formatDateTime, taskStatusLabel } from '../../lib/taskLabels';
import { Fact } from './shared';
import {
  completedContributionCount,
  contributionDispositionLabel,
  contributionMap,
  startupBlockerLabel,
  type ParentContribution,
  type ParentCoordinationResult,
} from './parentCoordination';
import './ParentCoordinationPanel.css';

type Props = {
  data: ParentCoordinationResult | null;
  loading: boolean;
  onRefresh: () => void;
};

function ContributionIdentity({ contribution }: { contribution: ParentContribution }) {
  return (
    <div className="parent-contribution-identity">
      <span>{contribution.summary}</span>
      <code>{contribution.id}</code>
    </div>
  );
}

export function ParentCoordinationPanel({ data, loading, onRefresh }: Props) {
  const contributions = data?.contributions || [];
  const byId = contributionMap(contributions);
  const startup = data?.startup;
  const eligibleIds = startup?.eligibleContributions || [];
  const nextIds = startup?.next?.contributionIds || [];
  const recommendedId = nextIds.find((id) => eligibleIds.includes(id)) || eligibleIds[0] || null;
  const otherEligibleIds = eligibleIds.filter((id) => id !== recommendedId);
  const completedCount = completedContributionCount(contributions);
  const finalRemaining = Math.max(0, contributions.length - completedCount);
  const planningReview = data?.planningReview;

  return (
    <section className="panel parent-coordination-panel" id="task-parent-coordination" aria-live="polite">
      <div className="panel-heading">
        <div>
          <h2>父子任务协调</h2>
          <p className="section-copy">直接展示 Parent Coordination Application 的派生 read model；不在 Parent Task Record 复制 Child 状态或交付结果。</p>
        </div>
        <Button onClick={onRefresh} disabled={loading}>{loading ? '读取中…' : '刷新协调事实'}</Button>
      </div>

      {data?.mode === 'parent-plan' ? (
        <>
          <div className="parent-progress-grid">
            <article id="parent-current-status" className={`parent-progress-card ${startup?.status === 'ready' ? 'ready' : 'blocked'}`}>
              <span className="parent-progress-eyebrow">当前推进</span>
              <strong>{startup?.status === 'ready' ? '可以推进' : '需要先处理'}</strong>
              <p>{startup?.status === 'ready' ? '已有依赖满足的工作可启动。' : '当前治理条件或 Contribution 依赖尚未满足。'}</p>
            </article>
            <article id="parent-next-action" className="parent-progress-card">
              <span className="parent-progress-eyebrow">下一步</span>
              <strong>{startup?.next?.action || '尚无动作'}</strong>
              <p>{startup?.next?.summary || '当前 read model 没有给出下一步。'}</p>
            </article>
            <article id="parent-final-progress" className="parent-progress-card">
              <span className="parent-progress-eyebrow">最终验收进度</span>
              <strong>{completedCount} / {contributions.length}</strong>
              <p>{data.prerequisitesSatisfied ? '全部 Contribution 已有明确处置，仍需显式最终集成验收。' : `尚有 ${finalRemaining} 项未形成 delivered 或 superseded 处置。`}</p>
            </article>
          </div>

          <section id="parent-eligible-contributions" className="parent-coordination-section">
            <h3>可启动 Contribution</h3>
            {recommendedId ? (
              <div className="parent-eligible-list">
                {byId.get(recommendedId) ? (
                  <article className="parent-eligible-card recommended" data-contribution-id={recommendedId}>
                    <span className="parent-eligible-kind">建议先启动</span>
                    <ContributionIdentity contribution={byId.get(recommendedId)!} />
                  </article>
                ) : null}
                {otherEligibleIds.map((id) => byId.get(id) ? (
                  <article key={id} className="parent-eligible-card" data-contribution-id={id}>
                    <span className="parent-eligible-kind">其他可启动</span>
                    <ContributionIdentity contribution={byId.get(id)!} />
                  </article>
                ) : null)}
              </div>
            ) : <p className="empty-copy">当前没有可启动 Contribution。</p>}
          </section>

          <div className="parent-coordination-columns">
            <section id="parent-startup-blockers" className="parent-coordination-section">
              <h3>当前推进阻塞</h3>
              {startup?.blockers?.length ? (
                <ul className="parent-compact-list">
                  {startup.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{startupBlockerLabel(blocker)}</li>)}
                </ul>
              ) : <p className="empty-copy">无当前推进阻塞。</p>}
            </section>
            <section id="parent-dependency-waits" className="parent-coordination-section">
              <h3>等待依赖</h3>
              {startup?.dependencyBlockers?.length ? (
                <ul className="parent-compact-list">
                  {startup.dependencyBlockers.map((blocker) => (
                    <li key={blocker.contributionId}>
                      <code>{blocker.contributionId}</code>
                      <span>等待 {blocker.dependsOn.join('、')}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="empty-copy">没有等待依赖的未分配项。</p>}
            </section>
          </div>

          <section className="parent-coordination-section">
            <h3>全部 Contribution</h3>
            <ul className="parent-contribution-list">
              {contributions.map((contribution) => (
                <li key={contribution.id} data-contribution-disposition={contribution.disposition}>
                  <ContributionIdentity contribution={contribution} />
                  <div className="parent-contribution-meta">
                    <span className={`parent-disposition ${contribution.disposition}`}>{contributionDispositionLabel(contribution.disposition)}</span>
                    <span>承担 / 交付：{contribution.deliveredBy?.taskId || contribution.plannedChildTaskId || '尚未分配'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="parent-coordination-section">
            <h3>直接 Child Tasks</h3>
            {data.children?.length ? (
              <ul className="parent-child-list">
                {data.children.map((child) => (
                  <li key={child.taskId}>
                    <div className="parent-child-heading"><strong>{child.title}</strong><code>{child.taskId}</code></div>
                    <p>{taskStatusLabel(child.status)} · handoff：{child.deliveryProven ? '已证明' : '未证明'}</p>
                    <div className="parent-child-contributions">
                      {child.plannedContributions.length ? child.plannedContributions.map((id) => (
                        <span key={id}>{byId.get(id)?.summary || '未找到计划结果'} <code>{id}</code></span>
                      )) : <span>未绑定 Contribution</span>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="empty-copy">尚无直接 Child Task。</p>}
          </section>

          <details className="technical-details parent-governance-details">
            <summary>查看 Parent Plan 与审查事实</summary>
            <dl className="read-facts detail-facts">
              <Fact label="Parent outcome" value={data.parentPlan?.outcome || '—'} />
              <Fact label="Plan identity" value={data.parentPlan?.identity || '—'} />
              <Fact label="最终集成验收" value={data.parentAcceptance ? `${data.parentAcceptance.summary} · ${formatDateTime(data.parentAcceptance.acceptedAt)}` : '尚未记录'} />
              <Fact label="Planning Review outcome" value={planningReview?.present ? planningReview.result?.conclusion?.outcome || '未提供 outcome' : '尚未记录'} />
              <Fact label="Planning Review applicability" value={planningReview?.present ? planningReview.applicability || '适用性未知' : '尚未记录'} />
              <Fact label="Planning Review 摘要" value={planningReview?.present ? planningReview.result?.conclusion?.summary || '未提供摘要' : '尚未记录'} />
              <Fact label="Planning Review 时间" value={planningReview?.present && planningReview.result?.completedAt ? formatDateTime(planningReview.result.completedAt) : '未提供时间'} />
            </dl>
          </details>
        </>
      ) : (
        <p className={data?.diagnostic?.code && data.diagnostic.code !== 'parent_plan_absent' ? 'alert error' : 'section-copy'}>
          {data?.diagnostic?.message || '该 Task 没有 Parent Plan；历史 Task 保持可读且不会自动 backfill。'}
        </p>
      )}
    </section>
  );
}
