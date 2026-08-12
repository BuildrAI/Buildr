import { Button } from 'antd';
import {
  applicabilityLabel,
  capabilityOutcomeLabel,
  developmentDispositionLabel,
  formatDateTime,
  reviewMethodLabel,
} from '../../lib/taskLabels';
import { Fact, TechnicalDetails } from './shared';
import { ExecutionRecordsPanel, type ExecutionRecordView } from './ExecutionRecordsPanel';

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
  executionRecordView: ExecutionRecordView;
  executionRecordsData: any;
  executionRecordsLoading: boolean;
  executionRecordsError: string | null;
  onRefreshReview: () => void;
  onRefreshVerification: () => void;
  onSelectExecutionRecordView: (view: ExecutionRecordView) => void;
  onRefreshExecutionRecords: () => void;
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
  association,
  taskId,
  taskActive,
  openAgentAction,
}: {
  reviewType: 'planning' | 'completion';
  slot: any;
  association: any;
  taskId: string;
  taskActive: boolean;
  openAgentAction: Props['openAgentAction'];
}) {
  const cardClass = association?.status === 'adopted-at-delivery'
    ? 'delivered'
    : slot.present ? slot.applicability : 'missing';
  const stateText = association?.status === 'adopted-at-delivery'
    ? '已随交付候选采用'
    : !slot.present
      ? '未记录'
      : ({ current: '当前适用', stale: '目标已变化', unknown: '适用性未知' } as Record<string, string>)[slot.applicability] || '未知';

  return (
    <article className={`review-slot-card ${cardClass}`}>
      <div className="review-slot-heading">
        <div>
          <p className="eyebrow">{reviewType === 'planning' ? '计划目标' : '完成候选'}</p>
          <h3>{reviewType === 'planning' ? '方案审查（Planning Review）' : '完成审查（Completion Review）'}</h3>
        </div>
        <span className={`state review-state ${slot.present ? slot.applicability : 'missing'}`}>{stateText}</span>
      </div>
      {!slot.present ? (
        <>
          <div className="review-slot-empty">尚未形成完整结果；不会创建空占位记录。</div>
          {association?.status === 'gate-disposition' ? (
            <p className="delivery-gate-note">
              {`Development gate：${developmentDispositionLabel(association.disposition)} · ${association.summary} · ${association.source}`}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <dl className="read-facts review-facts">
            <Fact label="目标身份" value={slot.result.targetIdentity} />
            <Fact label="执行方式" value={reviewMethodLabel(slot.result.method)} />
            <Fact label="完成时间" value={formatDateTime(slot.result.completedAt)} />
            <Fact label="结果摘要（resultDigest）" value={slot.resultDigest} />
          </dl>
          <div className={`review-conclusion ${slot.result.conclusion.outcome}`}>
            <strong>{slot.result.conclusion.outcome === 'ready' ? '已就绪' : '需要修改'}</strong>
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
  executionRecordView,
  executionRecordsData,
  executionRecordsLoading,
  executionRecordsError,
  onRefreshReview,
  onRefreshVerification,
  onSelectExecutionRecordView,
  onRefreshExecutionRecords,
  openAgentAction,
}: Props) {
  const slot = verificationData?.slot;
  const association = verificationData?.terminal?.associations?.verification;
  const verificationClass = association?.status === 'verified-at-delivery'
    ? 'delivered'
    : slot?.present ? slot.applicability.status : 'missing';
  const verificationState = association?.status === 'verified-at-delivery'
    ? `已随交付目标验证${association.outcome === 'passed' ? '通过' : '未通过'}`
    : slot?.present ? applicabilityLabel(slot.applicability.status) : '未记录';

  return (
    <section id="task-evidence-panel" className={active ? '' : 'hidden'} data-task-panel="evidence" aria-live="polite">
      <ExecutionRecordsPanel
        taskId={taskId}
        view={executionRecordView}
        data={executionRecordsData}
        loading={executionRecordsLoading}
        error={executionRecordsError}
        onSelectView={onSelectExecutionRecordView}
        onRefresh={onRefreshExecutionRecords}
      />
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
          <div id="task-review-diagnostic" className={`environment-diagnostic${reviewError ? '' : ' hidden'}`}>
            {reviewError || ''}
          </div>
        </article>
        <div id="task-review-loading" className={`page-loading${reviewLoading ? '' : ' hidden'}`}>
          <span className="loader" />
          <p>正在读取审查结果…</p>
        </div>
        <div id="task-review-slots" className="review-slot-grid">
          {reviewData ? (
            <>
              <ReviewSlotCard
                reviewType="planning"
                slot={reviewData.slots.planning}
                association={reviewData.terminal?.associations?.planning}
                taskId={taskId}
                taskActive={taskActive}
                openAgentAction={openAgentAction}
              />
              <ReviewSlotCard
                reviewType="completion"
                slot={reviewData.slots.completion}
                association={reviewData.terminal?.associations?.completion}
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
              <p className="eyebrow">可移植的当前事实</p>
              <h2>验证结果（Verification Result）</h2>
              <p className="section-copy">这里只读展示一个当前结果；完整命令输出和临时执行证据不进入本页。</p>
            </div>
            <div className="panel-actions">
              <Button id="task-verification-execution-records" onClick={() => onSelectExecutionRecordView('verification')}>查看 Verification 执行记录</Button>
              <Button id="task-verification-refresh" disabled={verificationLoading} onClick={onRefreshVerification}>
                刷新验证结果
              </Button>
            </div>
          </div>
          <div id="task-verification-diagnostic" className={`environment-diagnostic${verificationError ? '' : ' hidden'}`}>
            {verificationError || ''}
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
                  <p className="eyebrow">单一当前槽位</p>
                  <h3>验证结果（Verification Result）</h3>
                </div>
                <span className={`state review-state ${slot.present ? slot.applicability.status : 'missing'}`}>{verificationState}</span>
              </div>
              {!slot.present ? (
                <div className="review-slot-empty">尚未形成完整结果；不会创建空占位或从当前代码版本（HEAD）推断验证状态。</div>
              ) : (
                <>
                  <dl className="read-facts review-facts">
                    <Fact label="目标身份" value={slot.result.target.identity} />
                    <Fact label="验证目标" value={slot.result.target.summary} />
                    <Fact label="目标适用性" value={applicabilityLabel(slot.applicability.target.status)} />
                    <Fact label="声明适用性" value={applicabilityLabel(slot.applicability.declarations.status)} />
                    <Fact label="完成时间" value={formatDateTime(slot.result.completedAt)} />
                    <Fact label="结果摘要（resultDigest）" value={slot.resultDigest} />
                  </dl>
                  <div className={`review-conclusion ${slot.result.conclusion.outcome}`}>
                    <strong>{slot.result.conclusion.outcome === 'passed' ? '已通过' : '未通过'}</strong>
                    <p>{slot.result.conclusion.summary}</p>
                  </div>
                  <div className="review-evidence-grid">
                    <ReviewList title="能力声明" values={slot.result.declarations} describe={(item) => `${item.project} · ${item.identity} · ${item.path}`} />
                    <ReviewList title="实际能力事实" values={slot.result.capabilities} describe={(item) => `${item.project}/${item.capability} · ${capabilityOutcomeLabel(item.outcome)} · ${item.facts.join('；')}`} />
                    <ReviewList title="覆盖缺口" values={slot.result.coverageGaps} describe={(item) => `${item.scope}：${item.summary}`} />
                    <ReviewList title="失效原因" values={slot.applicability.reasons} describe={(item) => `${item.code}：${item.message}`} />
                  </div>
                  <TechnicalDetails value={`${slot.resultDigest} · ${slot.path}`} />
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
