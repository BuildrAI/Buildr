import { Button } from 'antd';
import {
  applicabilityLabel,
  capabilityOutcomeLabel,
  formatDateTime,
  reviewMethodLabel,
} from '../../lib/taskLabels';
import { Fact, TechnicalDetails } from './shared';

type Props = {
  active: boolean;
  taskId: string;
  taskActive: boolean;
  reviewData: any;
  verificationData: any;
  reviewLoading: boolean;
  verificationLoading: boolean;
  reviewError: string | null;
  verificationError: string | null;
  onRefreshReview: () => void;
  onRefreshVerification: () => void;
  openAgentAction: (action: string, context?: Record<string, unknown>) => void;
};

function ReviewList({
  title,
  values,
  describe = (value: any) => String(value),
}: {
  title: string;
  values: any[];
  describe?: (value: any) => string;
}) {
  return (
    <section className="review-evidence-section">
      <h4>{title}</h4>
      {!values.length ? (
        <p className="review-list-empty">无</p>
      ) : (
        <ul>
          {values.map((value) => {
            const text = describe(value);
            return <li key={text}>{text}</li>;
          })}
        </ul>
      )}
    </section>
  );
}

function ReviewSlotCard({
  reviewType,
  slot,
  taskId,
  taskActive,
  openAgentAction,
}: {
  reviewType: 'planning' | 'completion';
  slot: any;
  taskId: string;
  taskActive: boolean;
  openAgentAction: Props['openAgentAction'];
}) {
  const cardClass = slot.present ? 'present' : 'missing';
  const stateText = slot.present ? '已记录' : '未记录';

  return (
    <article className={`review-slot-card ${cardClass}`}>
      <div className="review-slot-heading">
        <div>
          <p className="eyebrow">{reviewType === 'planning' ? '方案对象' : '完成结果'}</p>
          <h3>{reviewType === 'planning' ? '方案审查（Planning Review）' : '完成审查（Completion Review）'}</h3>
        </div>
        <span className={`state review-state ${slot.present ? 'present' : 'missing'}`}>{stateText}</span>
      </div>
      {!slot.present ? (
        <div className="review-slot-empty">尚未形成完整结果；不会创建空占位记录。</div>
      ) : (
        <>
          <dl className="read-facts review-facts">
            <Fact label="审查对象身份" value={slot.result.subjectIdentity} />
            <Fact label="执行方式" value={reviewMethodLabel(slot.result.method)} />
            <Fact label="完成时间" value={formatDateTime(slot.result.completedAt)} />
            <Fact label="结果摘要（resultDigest）" value={slot.resultDigest} />
          </dl>
          <div className={`review-conclusion ${slot.result.conclusion.outcome}`}>
            <strong>{slot.result.conclusion.outcome === 'accepted' ? '已接受' : '要求修改'}</strong>
            <p>{slot.result.conclusion.summary}</p>
          </div>
          <div className="review-evidence-grid">
            <ReviewList title="已审阅" values={slot.result.reviewed} />
            <ReviewList title="未覆盖" values={slot.result.uncovered} describe={(item) => `${item.subject}：${item.reason}`} />
            <ReviewList title="发现" values={slot.result.findings} />
          </div>
          <TechnicalDetails value={`${slot.resultDigest} · ${slot.path}`} />
        </>
      )}
      <div className="review-slot-actions">
        <Button
          disabled={!taskActive}
          onClick={() => openAgentAction('task-review', { taskId, reviewType })}
        >
          {taskActive ? '交给智能体审查' : '终态只读'}
        </Button>
      </div>
    </article>
  );
}

export function EvidenceTab({
  active,
  taskId,
  taskActive,
  reviewData,
  verificationData,
  reviewLoading,
  verificationLoading,
  reviewError,
  verificationError,
  onRefreshReview,
  onRefreshVerification,
  openAgentAction,
}: Props) {
  const reviewDiagnostic = reviewError || reviewData?.diagnostic?.message || null;
  const verificationDiagnostic = verificationError || verificationData?.diagnostic?.message || null;
  const slot = verificationData?.slot;
  const verificationClass = slot?.present ? slot.applicability.status : 'missing';
  const verificationState = slot?.present ? applicabilityLabel(slot.applicability.status) : '未记录';

  return (
    <section id="task-evidence-panel" className={active ? '' : 'hidden'} data-task-panel="evidence" aria-live="polite">
      <section id="task-review-panel" className="evidence-section">
        <article className="panel review-summary">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">轻量语义证据</p>
              <h2>审查结果（Review Results）</h2>
              <p className="section-copy">方案审查与完成审查是两个可选的当前槽位；这里只读展示，不在页面内编辑结果。</p>
            </div>
            <Button id="task-review-refresh" disabled={reviewLoading} onClick={onRefreshReview}>
              刷新审查结果
            </Button>
          </div>
          <div id="task-review-diagnostic" className={`environment-diagnostic${reviewDiagnostic ? '' : ' hidden'}`}>
            {reviewDiagnostic || ''}
          </div>
        </article>
        <div id="task-review-loading" className={`page-loading${reviewLoading ? '' : ' hidden'}`}>
          <span className="loader" />
          <p>正在读取审查结果…</p>
        </div>
        <div id="task-review-slots" className="review-slot-grid">
          {reviewData && !reviewData.diagnostic ? (
            <>
              <ReviewSlotCard
                reviewType="planning"
                slot={reviewData.slots.planning}
                taskId={taskId}
                taskActive={taskActive}
                openAgentAction={openAgentAction}
              />
              <ReviewSlotCard
                reviewType="completion"
                slot={reviewData.slots.completion}
                taskId={taskId}
                taskActive={taskActive}
                openAgentAction={openAgentAction}
              />
            </>
          ) : null}
        </div>
      </section>
      <section id="task-verification-panel" className="evidence-section">
        <article className="panel review-summary">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">开发完成后的验证事实</p>
              <h2>任务验证报告（Task Verification Report）</h2>
              <p className="section-copy">Agent 直接调用项目测试工具完成验证后保存有意义报告；开发中的临时测试不进入本页。</p>
            </div>
            <div className="panel-actions">
              <Button id="task-verification-refresh" disabled={verificationLoading} onClick={onRefreshVerification}>
                刷新验证结果
              </Button>
            </div>
          </div>
          <div id="task-verification-diagnostic" className={`environment-diagnostic${verificationDiagnostic ? '' : ' hidden'}`}>
            {verificationDiagnostic || ''}
          </div>
        </article>
        <div id="task-verification-loading" className={`page-loading${verificationLoading ? '' : ' hidden'}`}>
          <span className="loader" />
          <p>正在读取验证结果…</p>
        </div>
        <div id="task-verification-result" className="review-slot-grid">
          {verificationData && slot ? (
            <article className={`review-slot-card ${verificationClass}`}>
              <div className="review-slot-heading">
                <div>
                  <p className="eyebrow">当前报告</p>
                  <h3>任务验证报告</h3>
                </div>
                <span className={`state review-state ${slot.present ? slot.applicability.status : 'missing'}`}>{verificationState}</span>
              </div>
              {!slot.present ? (
                <div className="review-slot-empty">尚未形成开发完成后的验证报告；开发中可以继续按需运行测试。</div>
              ) : (
                <>
                  <dl className="read-facts review-facts">
                    <Fact label="内容版本" value={slot.report.content.identity} />
                    <Fact label="验证内容" value={slot.report.content.summary} />
                    <Fact label="内容适用性" value={applicabilityLabel(slot.applicability.content.status)} />
                    <Fact label="测试地图适用性" value={applicabilityLabel(slot.applicability.declarations.status)} />
                    <Fact label="完成时间" value={formatDateTime(slot.report.completedAt)} />
                    <Fact label="报告摘要（reportDigest）" value={slot.reportDigest} />
                  </dl>
                  <div className={`review-conclusion ${slot.report.conclusion.outcome}`}>
                    <strong>{slot.report.conclusion.outcome === 'passed' ? '已通过' : slot.report.conclusion.outcome === 'not-passed' ? '未通过' : '未完成'}</strong>
                    <p>{slot.report.conclusion.summary}</p>
                  </div>
                  <div className="review-evidence-grid">
                    <ReviewList title="项目测试地图" values={slot.report.declarations} describe={(item) => `${item.project} · ${item.status === 'ready' ? '可用' : item.status === 'absent' ? '缺失' : '无效'} · ${item.identity} · ${item.path}${item.summary ? ` · ${item.summary}` : ''}`} />
                    <ReviewList title="实际检查" values={slot.report.checks} describe={(item) => `${item.project}/${item.testing} · ${item.mapStatus === 'map-unavailable' ? '地图不可用' : '已声明'} · ${item.selection} · ${capabilityOutcomeLabel(item.outcome)} · ${item.targets.join('、')} · ${item.summary}`} />
                    <ReviewList title="未覆盖项" values={slot.report.gaps} describe={(item) => `${item.project ? `${item.project}/` : ''}${item.service ? `${item.service}/` : ''}${item.testing}：${item.reason}`} />
                    <ReviewList title="失效原因" values={slot.applicability.reasons} describe={(item) => `${item.code}：${item.message}`} />
                  </div>
                  <TechnicalDetails value={`${slot.reportDigest} · ${slot.path}`} />
                </>
              )}
              <div className="review-slot-actions">
                <Button
                  disabled={!taskActive}
                  onClick={() => openAgentAction('task-verification', { taskId })}
                >
                  {taskActive ? '交给智能体验证' : '终态只读'}
                </Button>
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </section>
  );
}
