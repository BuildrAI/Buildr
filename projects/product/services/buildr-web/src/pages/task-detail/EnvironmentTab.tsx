import {
  environmentStatusLabel,
  formatDateTime,
  probeStatusLabel,
} from '../../lib/taskLabels';
import { Fact } from './shared';

type Props = {
  active: boolean;
  data: any;
  loading: boolean;
  onRefresh: () => void;
};

export function EnvironmentTab({ active, data, loading, onRefresh }: Props) {
  const environment = data?.environment;
  const showDiagnostic = Boolean(data?.diagnostic || data?.nextActions?.length);

  return (
    <section id="task-environment-panel" className={active ? '' : 'hidden'} data-task-panel="environment" aria-live="polite">
      <article className="panel environment-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">当前机器事实</p>
            <h2>任务环境（Task Environment）</h2>
            <p className="section-copy">读取 Workspace SQLite 中最近保存的环境事实；GET 不探测、不执行准备步骤也不回写。</p>
          </div>
          <button id="task-environment-refresh" className="button secondary" type="button" disabled={loading} onClick={onRefresh}>
            刷新当前事实
          </button>
        </div>
        <dl className="read-facts">
          <Fact label="状态" value={<span id="task-environment-status">{data ? environmentStatusLabel(data.status) : '尚未读取'}</span>} />
          <Fact label="观察时间" value={<span id="task-environment-observed">{data?.observedAt ? formatDateTime(data.observedAt) : '—'}</span>} />
          <Fact
            label="来源"
            value={(
              <span id="task-environment-source">
                {data?.source === 'current-machine' || !data?.source ? '当前机器（current-machine）' : data.source}
              </span>
            )}
          />
          <Fact
            label="环境回执（Environment Receipt）"
            value={(
              <span id="task-environment-receipt">
                {data ? `${data.receipt?.available ? '可用' : '不可用'} · ${data.receipt?.locator || '—'}` : '—'}
              </span>
            )}
          />
        </dl>
        <div id="task-environment-diagnostic" className={`environment-diagnostic${showDiagnostic ? '' : ' hidden'}`}>
          {data?.diagnostic ? <p>{`${data.diagnostic.code || 'diagnostic'}：${data.diagnostic.message}`}</p> : null}
          {data?.nextActions?.length ? (
            <ul>
              {data.nextActions.map((value: string) => <li key={value}>{value}</li>)}
            </ul>
          ) : null}
        </div>
      </article>
      <div id="task-environment-loading" className={`page-loading${loading ? '' : ' hidden'}`}>
        <span className="loader" />
        <p>正在读取保存的环境事实…</p>
      </div>
      <div id="task-environment-detail" className={`environment-detail${environment ? '' : ' hidden'}`}>
        {environment ? (
          <>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>工作范围与执行基础</h2>
                  <p className="section-copy">每个范围展示真实执行根、任务验证工作区根与最小探测。</p>
                </div>
              </div>
              <div id="task-environment-scopes" className="environment-scope-list">
                <article className="environment-scope-card controller-card">
                  <div className="environment-scope-heading">
                    <h3>环境管理器（Environment Manager）</h3>
                    <span className="state">{environment.controller.adapter}</span>
                  </div>
                  <dl className="read-facts">
                    <Fact label="产品源码" value={environment.controller.sourceRoot} />
                    <Fact label="回执创建指纹" value={environment.controller.identity} />
                  </dl>
                </article>
                {environment.scopes.map((scope: any) => (
                  <article key={scope.selector} className="environment-scope-card">
                    <div className="environment-scope-heading">
                      <h3>{scope.selector}</h3>
                      <span className="state">{scope.shared ? '共享根' : '隔离检出（checkout）'}</span>
                    </div>
                    <dl className="read-facts">
                      <Fact label="执行根" value={scope.executionRoot} />
                      <Fact label="任务验证工作区根" value={scope.validationRoot} />
                      <Fact label="来源" value={scope.sourcePath} />
                      <Fact label="Git 提供方证据" value={scope.provider ? `${scope.provider.capability} · ${scope.provider.evidence}` : '不适用'} />
                    </dl>
                    <div className="environment-probe-grid">
                      {([
                        ['运行时（Runtime）', scope.runtime],
                        ['工作区 CLI', scope.cli],
                        ['环境准备', scope.preparation || scope.dependencies],
                        ['运行时投影', scope.projection],
                      ] as const).map(([label, value]) => (
                        <div key={label} className={`environment-probe ${value.status}`}>
                          <span>{label}</span>
                          <strong>{probeStatusLabel(value.status)}</strong>
                          <small>{value.diagnostic || value.identity || `观察于 ${formatDateTime(value.observedAt)}`}</small>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>环境准备计划</h2>
                  <p className="section-copy">Agent按Task scope登记多个Service及有序Step；此处只展示Environment current中保存的计划与执行事实。</p>
                </div>
              </div>
              {!environment.legacy && environment.preparationServices?.length ? (
                <div className="environment-probe-grid">
                  {environment.preparationServices.map((service: any) => (
                    <div key={service.selector} className={`environment-probe ${service.status}`}>
                      <span>{service.selector}</span>
                      <strong>{probeStatusLabel(service.status)}</strong>
                      <small>{service.diagnostic || `${service.stepIds.length} 个Step`}</small>
                    </div>
                  ))}
                </div>
              ) : null}
              <div id="task-environment-preparation-steps" className="environment-scope-list">
                {environment.legacy ? (
                  <div className="empty-state">Legacy Receipt没有Agent登记的Preparation Plan；需要显式登记后再prepare。</div>
                ) : !environment.preparationPlan ? (
                  <div className="empty-state">当前Task尚未登记Environment Preparation Plan。</div>
                ) : !environment.preparationSteps?.length ? (
                  <div className="empty-state">计划identity：{environment.preparationPlan.identity}。当前Task无需执行Step，或尚未prepare。</div>
                ) : environment.preparationSteps.map((step: any) => (
                  <article key={step.id} className="environment-scope-card">
                    <div className="environment-scope-heading">
                      <h3>{step.id}</h3>
                      <span className="state">{step.status}</span>
                    </div>
                    <dl className="read-facts">
                      <Fact label="Service" value={step.scope} />
                      <Fact label="工作目录" value={step.cwd} />
                      <Fact label="可执行文件" value={`${step.executable} · ${step.executableIdentity || 'missing'}`} />
                      <Fact label="输入" value={step.inputs.map((input: any) => `${input.path} · ${input.identity || 'missing'}`).join('；') || '无'} />
                      <Fact label="输出" value={step.outputs.map((output: any) => `${output.path} · ${output.kind} · ${output.status}`).join('；')} />
                      <Fact label="Required" value={step.required ? '是' : '否'} />
                      <Fact label="最近观察" value={formatDateTime(step.observedAt)} />
                      <Fact label="诊断" value={step.diagnostic || '—'} />
                    </dl>
                  </article>
                ))}
              </div>
            </section>
            <section className="detail-layout">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>动态资源</h2>
                    <p className="section-copy">只展示环境应用层返回的非敏感事实。</p>
                  </div>
                </div>
                <div id="task-environment-resources">
                  {!environment.resources.length ? (
                    <div className="empty-state">当前没有已登记的任务所属动态资源。</div>
                  ) : (
                    <div className="environment-resource-list">
                      {environment.resources.map((resource: any) => (
                        <article key={resource.id} className="environment-resource">
                          <strong>{resource.id}</strong>
                          <dl className="resource-facts">
                            <Fact label="状态" value={resource.status} />
                            <Fact label="提供方" value={resource.provider} />
                            <Fact label="工作范围" value={resource.scope} />
                            <Fact
                              label="最近探测"
                              value={`${probeStatusLabel(resource.probe.status)} · ${resource.probe.diagnostic || resource.probe.identity || resource.probe.observedAt}`}
                            />
                          </dl>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </article>
              <aside className="panel facts-panel">
                <p className="eyebrow">处置事实</p>
                <h2>清理结果</h2>
                <dl id="task-environment-cleanup" className="fact-list">
                  {environment.latest.cleanup ? (
                    <>
                      <Fact label="状态" value={environmentStatusLabel(environment.latest.cleanup.status)} />
                      <Fact label="完成时间" value={formatDateTime(environment.latest.cleanup.completedAt)} />
                      <Fact label="摘要" value={environment.latest.cleanup.summary} />
                    </>
                  ) : (
                    <>
                      <Fact label="状态" value="尚无清理结果" />
                      <Fact
                        label="最近就绪状态"
                        value={`${environmentStatusLabel(environment.latest.ready.status)} · ${formatDateTime(environment.latest.ready.observedAt)}`}
                      />
                    </>
                  )}
                </dl>
              </aside>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
