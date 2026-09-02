import { Button } from 'antd';
import {
  developmentAxisLabel,
  developmentDispositionLabel,
  developmentReasonLabel,
  developmentStatusLabel,
  formatDateTime,
} from '../../lib/taskLabels';
import { Fact } from './shared';

type Props = {
  taskId: string;
  active: boolean;
  data: any;
  loading: boolean;
  onRefresh: () => void;
};

export function DevelopmentTab({ active, data, loading, onRefresh }: Props) {
  const development = data?.development;
  const applicability = development?.applicability;
  const status = data?.status === 'missing' ? 'missing' : applicability?.status || 'unknown';
  const receipt = development?.receipt;
  const unknown = status === 'unknown';
  const reasons = applicability?.reasons || [];
  const showDiagnostic = Boolean(data?.diagnostic || data?.nextActions?.length || reasons.length);
  const handoffs = receipt?.handoffs || [];
  const latest = handoffs.at(-1);
  const showHistoryNote = Boolean(latest && (unknown || applicability?.handoff !== 'current'));

  return (
    <section id="task-development-panel" className={active ? '' : 'hidden'} data-task-panel="development" aria-live="polite">
      <article className="panel development-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">研发事实</p>
            <h2>任务研发（Task Development）</h2>
            <p className="section-copy">这里只读展示已保存的研发聚合事实；任务结果、审查、验证和历史交付由各自页面独立展示。</p>
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
                  <h2 id="task-development-axes-title">当前有效性</h2>
                  <p id="task-development-axes-copy" className="section-copy">
                    分别展示任务上下文、研发规划、内容目标、候选与研发交接最近一次保存的有效性；不代表任务完成或交付。
                  </p>
                </div>
              </div>
              <div id="task-development-axes" className="development-axis-grid">
                {([
                  ['任务上下文', 'taskContext'],
                  ['研发规划', 'planning'],
                  ['内容目标', 'contentTarget'],
                  ['当前候选', 'candidate'],
                  ['研发交接', 'handoff'],
                ] as const).map(([label, key]) => {
                  const axisStatus = unknown ? 'unknown' : applicability?.[key] || 'unknown';
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
            <section>
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
                </dl>
              </article>
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
                    <Fact label="当前有效性" value={developmentAxisLabel(unknown ? 'unknown' : applicability?.handoff || 'unknown')} />
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
                {unknown
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
