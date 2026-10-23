import { Alert, Checkbox, Radio, Select, Space, Tag } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';
import { backendConnectionChoices, dirtyLabel, routingScopeError, shortCommit } from '../model';
import type { ConnectionSelection, LocalBackendAvailability, ServiceRuntimeSummary, ServiceWorktree } from '../api/service-runtime-api';

export type RuntimeStartItem = { service: ServiceRuntimeSummary; worktree: ServiceWorktree | null; connectionTarget?: LocalBackendAvailability[] | null; diagnostics?: string[]; worktrees?: ServiceWorktree[] };
type Props = {
  items: RuntimeStartItem[];
  selected: string[];
  onSelected?(codes: string[]): void;
  onWorktree?(id: string): void;
  connection: ConnectionSelection;
  onConnection(mode: ConnectionSelection): void;
  /** 提供时按声明后端逐组渲染候选实例；不区分任务整体连接开关。 */
  backendSelections?: Record<string, string>;
  onBackendSelection?(backendCode: string, value: string): void;
  taskScope?: boolean;
  /** 重开已有任务路由实例时保留逐下游选择，普通后端启动不进入联调表单。 */
  preserveTaskConnections?: boolean;
  disabled?: boolean;
};

/** 任务可选择服务，单服务可选择目录；后端目标只有经过验证的声明才提供单选。 */
export function RuntimeStartOptions({ items, selected, onSelected, onWorktree, connection, onConnection, backendSelections, onBackendSelection, taskScope, preserveTaskConnections, disabled }: Props) {
  const ordinaryBackend = (service: ServiceRuntimeSummary) => service.type === 'backend' && !taskScope && !preserveTaskConnections;
  const connections = backendConnectionChoices(items.filter(item => !ordinaryBackend(item.service)), selected, taskScope);
  const localAvailable = connections.every(choice => choice.available);
  const hasDiscovery = connections.some(choice => choice.backend.kind === 'service-discovery');
  return <div className="start-worktree-list">
    <p className="start-worktree-note">{taskScope ? '已带入本任务相关服务和代码目录。可只选一个服务；未选择的服务不会启动。' : '使用所选代码目录的当前文件，不切换分支、不更新代码。主工作库优先显示。'}</p>
    {items.map(({ service, worktree, diagnostics = [], worktrees }) => {
      const unavailable = !worktree || !service.definition;
      const checked = selected.includes(service.code);
      return <div className={`start-worktree-row runtime-start-choice${checked ? ' is-selected' : ''}`} key={service.code} data-worktree-id={worktree?.id} data-start-service={service.code}>
        <div className="start-worktree-main">
          <div className="runtime-start-name">{onSelected ? <Checkbox checked={checked} disabled={disabled || unavailable} onChange={event => onSelected(event.target.checked ? [...selected, service.code] : selected.filter(code => code !== service.code))}>{service.name}</Checkbox> : <strong>{service.name}</strong>}<Tag>{worktree?.main ? '主工作库' : worktree?.taskTitle || (taskScope ? '本任务目录' : '其他检出目录')}</Tag></div>
          {worktrees && onWorktree ? <Select aria-label="代码目录" value={worktree?.id} disabled={disabled} onChange={onWorktree} options={[...worktrees].sort((left, right) => Number(right.main) - Number(left.main)).map(item => ({ value: item.id, disabled: Boolean(service.definition?.local.routing && routingScopeError(item)), label: `${item.main ? '主工作库' : item.taskTitle || item.label} · ${item.branch || '分支未知'}` }))} /> : null}
          {worktree ? <><Space size={5} wrap><BranchesOutlined /><code>{worktree.branch || '分支未知'}</code><code>{shortCommit(worktree.head)}</code><Tag color={worktree.dirty ? 'gold' : undefined}>{dirtyLabel(worktree.dirty)}</Tag></Space><code className="runtime-start-path" title={worktree.path}>{worktree.path}</code></> : <span className="runtime-run-failure">没有唯一匹配的本任务代码目录，不会使用主工作库代替。</span>}
          {!service.definition ? <span className="runtime-run-failure">{service.definitionDiagnostic || '尚未配置已验证的启动方式'}</span> : null}
          {checked && service.definition && ordinaryBackend(service) ? <p className="runtime-connection-note" role="note">沿应用现有配置启动；下游连接使用应用已有配置。</p> : checked && service.definition && !service.definition.local.backends?.length ? <p className="runtime-connection-note" role="note">未声明可切换的后端连接，将按现有启动配置运行。需要本地或远程选项时，请检查连接配置。</p> : null}
          {diagnostics.map(item => <small key={item} className="runtime-run-failure">{item}</small>)}
        </div>
      </div>;
    })}
    {taskScope ? <p className="runtime-connection-note" role="note">一键启动所选前后端；本任务已启动的后端自动连接本地实际端口，其他请求继续使用远程测试环境。</p> : onBackendSelection ? connections.map(choice => {
      const availability = choice.availability;
      const value = backendSelections?.[choice.backend.serviceCode] ?? 'auto';
      return <div className="runtime-backend-group" key={`${choice.frontendCode}:${choice.backend.serviceCode}`} data-backend={choice.backend.serviceCode}>
        <div className="runtime-backend-head"><strong>{items.find(item => item.service.code === choice.frontendCode)?.service.type === 'backend' ? '下游服务' : '后端'} {choice.backend.serviceCode}</strong><code title={choice.backend.kind === 'service-discovery' ? '服务发现（Service Discovery）名称' : '注入环境变量'}>{choice.backend.kind === 'service-discovery' ? choice.backend.serviceId : choice.backend.environmentVariable}</code></div>
        <Radio.Group className="runtime-backend-radio" value={value} disabled={disabled} onChange={event => onBackendSelection(choice.backend.serviceCode, event.target.value as string)}>
          <Radio value="auto"><span className="runtime-backend-option"><span className="runtime-backend-option-name">默认（自动）</span><small>{choice.target ? `${choice.target.worktreeLabel}${choice.target.branch ? ` · ${choice.target.branch}` : ''} · ${choice.target.url}` : choice.backend.kind === 'service-discovery' ? availability?.state === 'missing' ? '本任务没有本地目标，使用既有 QA' : '本地目标状态待确认；已选目标失效时不会回落' : '同范围无就绪实例时使用远程测试环境'}</small></span></Radio>
          {(availability?.candidates ?? []).map(candidate => <Radio key={candidate.runId} value={`run:${candidate.runId}`}><span className="runtime-backend-option"><span className="runtime-backend-option-name">{candidate.worktreeLabel}{candidate.branch ? ` · ${candidate.branch}` : ''}<code>{candidate.url}</code></span><Tag color={candidate.sameScope ? 'green' : undefined}>{candidate.sameScope ? '同范围' : '其他范围'}</Tag></span></Radio>)}
          <Radio value="remote"><span className="runtime-backend-option"><span className="runtime-backend-option-name">{choice.backend.kind === 'service-discovery' ? 'QA' : '远程测试环境'}</span><code>{choice.backend.kind === 'service-discovery' ? choice.backend.fallback.context : choice.backend.remoteUrl}</code></span></Radio>
        </Radio.Group>
        {!availability?.candidates?.length && !choice.target ? <p className="runtime-backend-hint" role="note">{choice.reason || '没有发现已就绪实例，将使用远程测试环境。'}</p> : null}
      </div>;
    }) : connections.length ? <div className="runtime-backend-options"><strong>{hasDiscovery ? '下游连接' : '前端连接'}</strong><Radio.Group aria-label={hasDiscovery ? '下游连接' : '前端连接'} value={connection} onChange={event => onConnection(event.target.value as ConnectionSelection)} disabled={disabled}>
      {hasDiscovery ? <div className="runtime-backend-choice" data-connection-option="auto"><Radio value="auto">同任务优先，缺少时回落 QA</Radio><small>已选目标失效或尚未就绪时明确报错。</small></div> : null}
      <div className="runtime-backend-choice" data-connection-option="local"><Radio value="local" disabled={!localAvailable}>{taskScope ? '本任务本地后端' : '本地后端'}</Radio>
        {connections.map(choice => <div key={`${choice.frontendCode}:${choice.backend.serviceCode}`} className="runtime-backend-target">{choice.target ? <><span>{choice.backend.serviceCode} · {choice.target.worktreeLabel}{choice.target.branch ? ` · ${choice.target.branch}` : ''}</span><code>{choice.target.url}</code></> : <span className={choice.available ? undefined : 'runtime-run-failure'} role="note">{choice.startsBackend ? choice.backend.kind === 'service-discovery' ? `与 ${choice.backend.serviceCode} 同任务启动，调用使用预分配的运行身份。` : `先启动 ${choice.backend.serviceCode}，就绪后自动连接实际地址。` : choice.reason}</span>}</div>)}
      </div>
      <div className="runtime-backend-choice" data-connection-option="remote"><Radio value="remote">远程测试环境</Radio>{connections.map(choice => <code key={`${choice.frontendCode}:${choice.backend.serviceCode}`}>{choice.backend.serviceCode} → {choice.backend.kind === 'service-discovery' ? 'QA' : choice.backend.remoteUrl}</code>)}</div>
    </Radio.Group></div> : null}
    {!selected.length && onSelected ? <Alert type="info" showIcon message="请选择要启动的服务" /> : null}
    <p className="start-worktree-note">端口由运行配置分配；具备覆盖方式时避让已占用端口。就绪表示进程可访问，业务验证仍需实际执行。</p>
  </div>;
}
