import { Button } from 'antd';
import {
  decisionOutcomeLabel,
  developmentAxisLabel,
  developmentDispositionLabel,
  developmentReasonLabel,
  developmentStatusLabel,
  formatDateTime,
  gateOutcomeLabel,
} from '../../lib/taskLabels';
import { Fact, TechnicalDetails } from './shared';

type Props = {
  taskId: string;
  active: boolean;
  data: any;
  loading: boolean;
  onRefresh: () => void;
  onSelectEvidence: () => void;
  onSelectFinishExecutionRecords: () => void;
};

export function DevelopmentTab({ active, data, loading, onRefresh, onSelectEvidence, onSelectFinishExecutionRecords }: Props) {
  const development = data?.development;
  const terminal = data?.terminal;
  const applicability = development?.applicability;
  const terminalStatus = terminal && terminal.status !== 'active' ? terminal.status : null;
  const status = terminalStatus || (data?.status === 'missing' ? 'missing' : applicability?.status || 'unknown');
  const receipt = development?.receipt;
  const delivered = terminalStatus === 'delivered';
  const historical = terminalStatus === 'abandoned';
  const unknown = !terminalStatus && status === 'unknown';
  const reasons = applicability?.reasons || [];
  const showDiagnostic = Boolean(data?.diagnostic || data?.nextActions?.length || reasons.length);
  const handoffs = receipt?.handoffs || [];
  const latest = handoffs.at(-1);
  const showHistoryNote = delivered ? true : Boolean(latest && (unknown || applicability?.handoff !== 'current'));

  return (
    <section id="task-development-panel" className={active ? '' : 'hidden'} data-task-panel="development" aria-live="polite">
      <article className="panel development-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">研发事实</p>
            <h2>任务研发（Task Development）</h2>
            <p className="section-copy">从首个正式研发动作开始，只读聚合规划节点、当前目标、候选、门禁与最近一次交接；terminal Task 另行展示交付时事实，不伪装实时 currentness。</p>
          </div>
          <Button id="task-development-refresh" disabled={loading} onClick={onRefresh}>
            刷新研发状态
          </Button>
        </div>
        <dl className="read-facts">
          <div>
            <dt>主结论</dt>
            <dd id="task-development-status">{data ? developmentStatusLabel(status) : '尚未读取'}</dd>
          </div>
          <div>
            <dt>更新时间</dt>
            <dd id="task-development-updated">{receipt?.updatedAt ? formatDateTime(receipt.updatedAt) : '—'}</dd>
          </div>
        </dl>
        <div id="task-development-terminal" className={`delivery-summary${terminalStatus ? '' : ' hidden'}`}>
          {terminalStatus ? (
            <>
              <p className="delivery-conclusion">{developmentStatusLabel(terminalStatus)}</p>
              {terminal.delivery ? (
                <>
                  <dl className="read-facts delivery-facts">
                    <Fact label="交付目标" value={`${terminal.delivery.remote}/${terminal.delivery.targetBranch}`} />
                    <Fact label="完成时间" value={formatDateTime(terminal.delivery.completedAt)} />
                    <Fact
                      label="环境清理"
                      value={`${terminal.delivery.cleanup.status === 'cleaned' ? '已按正常流程清理' : terminal.delivery.cleanup.status} · ${terminal.delivery.cleanup.summary}`}
                    />
                  </dl>
                  <TechnicalDetails value={`final ref ${terminal.delivery.finalRemoteRef} · run ${terminal.delivery.runId} · ${terminal.delivery.reuseMode} · ${terminal.delivery.semanticEquivalence}`} />
                </>
              ) : null}
              {terminalStatus === 'completed-no-change' ? <p>Task 明确以 noChange 完成，不要求 Formal Finish Result。</p> : null}
              {terminalStatus === 'completed' ? <p>任务结果已保存；交付位置与验证说明见任务结果，不要求旧收尾运行证明。</p> : null}
              {terminalStatus === 'completed-unproven' ? <p>没有找到与 immutable handoff/Candidate 完整匹配的成功 Finish Result。</p> : null}
              {terminalStatus === 'abandoned' ? <p>这里只读展示已保存的历史快照，不会恢复 Environment 或 Candidate。</p> : null}
            </>
          ) : null}
        </div>
        <details className="technical-details compact">
          <summary>技术信息</summary>
          <dl className="read-facts">
            <Fact label="研发回执" value={<span id="task-development-receipt">{development ? `${development.receiptDigest} · ${development.path}` : '尚未形成'}</span>} />
          </dl>
        </details>
        <div id="task-development-diagnostic" className={`environment-diagnostic${showDiagnostic ? '' : ' hidden'}`}>
          {data?.diagnostic ? <p>{data.diagnostic.message}</p> : null}
          {(reasons.length || data?.nextActions?.length) ? (
            <ul>
              {[...reasons.map(developmentReasonLabel), ...(data?.nextActions || [])].map((value: string) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </article>
      <article id="task-finish-execution-records-entry" className="panel finish-execution-records-entry">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Task Finish</p>
            <h2>Finish 执行记录</h2>
            <p className="section-copy">查看每次 Finish invocation 的 diagnostics、失败与恢复记录；这里不替代 current/terminal 交付事实。</p>
          </div>
          <Button onClick={onSelectFinishExecutionRecords}>查看 Finish 执行记录</Button>
        </div>
        <dl className="read-facts">
          <Fact label="当前专业事实" value={terminalStatus ? developmentStatusLabel(terminalStatus) : terminal?.status || '尚未形成'} />
        </dl>
      </article>
      <div id="task-development-loading" className={`page-loading${loading ? '' : ' hidden'}`}>
        <span className="loader" />
        <p>正在读取研发状态…</p>
      </div>
      <section id="task-development-empty" className={`empty-state${development || !data ? ' hidden' : ''}`}>
        <h2 id="task-development-empty-title">{data?.status === 'missing' ? '尚未形成研发回执' : '当前无法读取研发状态'}</h2>
        <p id="task-development-empty-copy">
          {data?.status === 'missing'
            ? '任务仍可继续推进；从写提案、写方案或直接实现等首个正式研发动作开始，这里会记录研发事实。'
            : '当前读取失败，没有足够事实判断候选或交接状态。请根据诊断处理后重试。'}
        </p>
      </section>
      <div id="task-development-detail" className={`development-detail${development ? '' : ' hidden'}`}>
        {development && receipt ? (
          <>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2 id="task-development-axes-title">{delivered ? '交付时快照' : historical ? '历史快照' : '当前有效性'}</h2>
                  <p id="task-development-axes-copy" className="section-copy">
                    {delivered
                      ? '这些事实随 immutable handoff 被交付采用；它们不是对已清理 Environment 的实时 currentness 判断。'
                      : historical
                        ? '只展示放弃前已保存的研发事实，不重新判断或恢复 Candidate。'
                        : '分别判断任务上下文、内容目标、验证策略、候选与研发交接是否仍然有效。'}
                  </p>
                </div>
              </div>
              <div id="task-development-axes" className="development-axis-grid">
                {([
                  ['任务上下文', 'taskContext'],
                  ['研发规划', 'planning'],
                  ['内容目标', 'contentTarget'],
                  ['验证策略', 'policy'],
                  ['当前候选', 'candidate'],
                  ['研发交接', 'handoff'],
                ] as const).map(([label, key]) => {
                  const axisStatus = delivered ? 'snapshot' : historical ? 'historical' : unknown ? 'unknown' : applicability?.[key] || 'unknown';
                  return (
                    <article key={key} className={`development-axis-card ${axisStatus}`}>
                      <span>{label}</span>
                      <strong>{developmentAxisLabel(axisStatus)}</strong>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>研发规划事实</h2>
                  <p className="section-copy">节点不构成必经工作流；存在时仅记录其 authority、引用、身份与当前处置。</p>
                </div>
              </div>
              <div id="task-development-planning" className="development-planning-list">
                {receipt.planning.nodes.length ? receipt.planning.nodes.map((node: any) => (
                  <article key={`${node.kind}-${node.id}`} className={`development-planning-card ${node.disposition}`}>
                    <div className="development-gate-heading">
                      <strong>{`${node.kind} · ${node.id}`}</strong>
                      <span className="state">{developmentDispositionLabel(node.disposition)}</span>
                    </div>
                    <p>{`${node.authority} · ${node.reference}`}</p>
                    <p>{node.summary || '未提供摘要'}</p>
                    <small className="development-identity">{node.source ? `${node.identity} · ${node.source}` : node.identity}</small>
                  </article>
                )) : (
                  <p className="development-status-note">当前没有需要记录的规划节点；这不阻止研发继续。</p>
                )}
              </div>
            </section>
            <section className="detail-layout">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>当前候选</h2>
                    <p className="section-copy">候选由研发模块冻结；页面不重新计算身份。</p>
                  </div>
                </div>
                <dl id="task-development-candidate" className="read-facts">
                  <Fact label="候选代次" value={receipt.candidate ? String(receipt.candidate.generation) : receipt.generation ? `第 ${receipt.generation} 代已失效` : '尚未形成'} />
                  <Fact label="候选身份" value={receipt.candidate?.identity || '尚未形成'} />
                  <Fact label="任务上下文身份" value={receipt.taskContext.identity} />
                  <Fact label="内容目标身份" value={receipt.contentTarget?.identity || '尚未稳定'} />
                  <Fact label="验证策略身份" value={receipt.verificationPolicy?.identity || '尚未形成'} />
                </dl>
              </article>
              <aside className="panel facts-panel">
                <p className="eyebrow">研发决策</p>
                <h2>保存的推进结论</h2>
                <dl id="task-development-decision" className="fact-list">
                  <Fact label="已保存结论" value={decisionOutcomeLabel(receipt.decision?.outcome)} />
                  <Fact label="摘要" value={receipt.decision?.summary || '尚未形成'} />
                  <Fact label="已接受风险数" value={String(receipt.decision?.risks?.length || 0)} />
                </dl>
                <div id="task-development-risks" className="development-risk-list">
                  {receipt.decision?.risks?.length ? (
                    <>
                      <h3>已接受风险</h3>
                      <ul>
                        {receipt.decision.risks.map((risk: any) => (
                          <li key={`${risk.gate}-${risk.scope}-${risk.summary}`}>
                            {`${risk.gate === 'verification' ? '任务验证' : '完成审查'} · ${risk.scope}：${risk.summary}`}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </aside>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>交付门禁</h2>
                  <p className="section-copy">方案审查、任务验证和完成审查的当前结果；详情统一进入“证据”。</p>
                </div>
              </div>
              <div id="task-development-gates" className="development-gate-grid">
                {([
                  ['方案审查', delivered ? terminal.snapshot?.handoff?.gates?.planning : applicability?.gates?.planning],
                  ['任务验证', delivered ? terminal.snapshot?.handoff?.gates?.verification : applicability?.gates?.verification],
                  ['完成审查', delivered ? terminal.snapshot?.handoff?.gates?.completion : applicability?.gates?.completion],
                ] as const).map(([label, gate]) => {
                  const gateStatus = unknown ? 'unknown' : gate ? 'current' : 'missing';
                  return (
                    <article key={label} className={`development-gate-card ${gateStatus}`}>
                      <div className="development-gate-heading">
                        <strong>{label}</strong>
                        <span className={`state review-state ${gateStatus}`}>
                          {unknown ? '当前无法判断' : gate?.disposition ? developmentDispositionLabel(gate.disposition) : gateOutcomeLabel(gate?.outcome)}
                        </span>
                      </div>
                      <small className="development-identity">
                        {gate
                          ? (gate.resultDigest ? `${gate.targetIdentity} · ${gate.resultDigest}` : `${gate.summary} · ${gate.source}`)
                          : (unknown ? '当前无法实时复核目标。' : '尚未形成当前门禁结果。')}
                      </small>
                      {gate?.resultDigest ? (
                        <Button type="link" className="text-button" onClick={onSelectEvidence}>查看证据</Button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>最近保存的研发交接</h2>
                  <p className="section-copy">仅展示最近一次不可变快照；当前有效性以实时适用性判断为准。</p>
                </div>
              </div>
              <dl id="task-development-handoff" className="read-facts">
                {latest ? (
                  <>
                    <Fact label={delivered ? '交付关联' : '当前有效性'} value={developmentAxisLabel(delivered ? 'snapshot' : historical ? 'historical' : unknown ? 'unknown' : applicability?.handoff || 'unknown')} />
                    <Fact label="交接身份" value={latest.identity} />
                    <Fact label="候选代次" value={String(latest.candidate.generation)} />
                    <Fact label="形成时间" value={formatDateTime(latest.createdAt)} />
                    <Fact label="已保存交接数" value={String(handoffs.length)} />
                  </>
                ) : (
                  <>
                    <Fact label="状态" value="尚未形成" />
                    <Fact label="已保存交接数" value="0" />
                  </>
                )}
              </dl>
              <p id="task-development-history-note" className={`development-status-note${showHistoryNote ? '' : ' hidden'}`}>
                {delivered
                  ? 'Environment 已按正常流程清理；刷新只会重读交付事实，不会重新创建 Environment。'
                  : unknown
                    ? '历史研发交接仍被保留，但当前无法实时复核。'
                    : '最近保存的研发交接仍被保留，但已不再代表当前交付状态。'}
              </p>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
