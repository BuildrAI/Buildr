import { Alert, Checkbox, Radio, Select, Space, Tag } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';
import { backendConnectionChoices, dirtyLabel, shortCommit } from '../model';
import type { BackendMode, LocalBackendAvailability, ServiceRuntimeSummary, ServiceWorktree } from '../api/service-runtime-api';

export type RuntimeStartItem = { service: ServiceRuntimeSummary; worktree: ServiceWorktree | null; connectionTarget?: LocalBackendAvailability | null; diagnostics?: string[]; worktrees?: ServiceWorktree[] };
type Props = {
  items: RuntimeStartItem[];
  selected: string[];
  onSelected?(codes: string[]): void;
  onWorktree?(id: string): void;
  connection: BackendMode;
  onConnection(mode: BackendMode): void;
  taskScope?: boolean;
  disabled?: boolean;
};

/** 任务可选择服务，单服务可选择目录；后端目标只有经过验证的声明才提供单选。 */
export function RuntimeStartOptions({ items, selected, onSelected, onWorktree, connection, onConnection, taskScope, disabled }: Props) {
  const connections = backendConnectionChoices(items, selected, taskScope);
  const localAvailable = connections.every(choice => choice.available);
  return <div className="start-worktree-list">
    <p className="start-worktree-note">{taskScope ? '已带入本任务相关服务和代码目录。可只选一个服务；未选择的服务不会启动。' : '使用所选代码目录的当前文件，不切换分支、不更新代码。主工作库优先显示。'}</p>
    {items.map(({ service, worktree, diagnostics = [], worktrees }) => {
      const unavailable = !worktree || !service.definition;
      const checked = selected.includes(service.code);
      return <div className={`start-worktree-row runtime-start-choice${checked ? ' is-selected' : ''}`} key={service.code} data-worktree-id={worktree?.id} data-start-service={service.code}>
        <div className="start-worktree-main">
          <div className="runtime-start-name">{onSelected ? <Checkbox checked={checked} disabled={disabled || unavailable} onChange={event => onSelected(event.target.checked ? [...selected, service.code] : selected.filter(code => code !== service.code))}>{service.name}</Checkbox> : <strong>{service.name}</strong>}<Tag>{worktree?.main ? '主工作库' : worktree?.taskTitle || (taskScope ? '本任务目录' : '其他检出目录')}</Tag></div>
          {worktrees && onWorktree ? <Select aria-label="代码目录" value={worktree?.id} disabled={disabled} onChange={onWorktree} options={[...worktrees].sort((left, right) => Number(right.main) - Number(left.main)).map(item => ({ value: item.id, label: `${item.main ? '主工作库' : item.taskTitle || item.label} · ${item.branch || '分支未知'}` }))} /> : null}
          {worktree ? <><Space size={5} wrap><BranchesOutlined /><code>{worktree.branch || '分支未知'}</code><code>{shortCommit(worktree.head)}</code><Tag color={worktree.dirty ? 'gold' : undefined}>{dirtyLabel(worktree.dirty)}</Tag></Space><code className="runtime-start-path" title={worktree.path}>{worktree.path}</code></> : <span className="runtime-run-failure">没有唯一匹配的本任务代码目录，不会使用主工作库代替。</span>}
          {!service.definition ? <span className="runtime-run-failure">{service.definitionDiagnostic || '尚未配置已验证的启动方式'}</span> : null}
          {checked && service.definition && !service.definition.local.backend ? <p className="runtime-connection-note" role="note">未声明可切换的后端连接，将按现有启动配置运行。需要本地或远程选项时，请检查连接配置。</p> : null}
          {diagnostics.map(item => <small key={item} className="runtime-run-failure">{item}</small>)}
        </div>
      </div>;
    })}
    {connections.length ? <div className="runtime-backend-options"><strong>前端连接</strong><Radio.Group aria-label="前端连接" value={connection} onChange={event => onConnection(event.target.value as BackendMode)} disabled={disabled}>
      <div className="runtime-backend-choice" data-connection-option="local"><Radio value="local" disabled={!localAvailable}>{taskScope ? '本任务本地后端' : '本地后端'}</Radio>
        {connections.map(choice => <div key={choice.frontendCode} className="runtime-backend-target">{choice.target ? <><span>{choice.target.serviceCode} · {choice.target.worktreeLabel}{choice.target.branch ? ` · ${choice.target.branch}` : ''}</span><code>{choice.target.url}</code></> : <span className={choice.available ? undefined : 'runtime-run-failure'} role="note">{choice.startsBackend ? `先启动 ${choice.backend.serviceCode}，就绪后自动连接实际地址。` : choice.reason}</span>}</div>)}
      </div>
      <div className="runtime-backend-choice" data-connection-option="remote"><Radio value="remote">远程测试环境</Radio>{connections.map(choice => <code key={choice.frontendCode}>{choice.backend.remoteUrl}</code>)}</div>
    </Radio.Group></div> : null}
    {!selected.length && onSelected ? <Alert type="info" showIcon message="请选择要启动的服务" /> : null}
    <p className="start-worktree-note">端口由运行配置分配；具备覆盖方式时避让已占用端口。就绪表示进程可访问，业务验证仍需实际执行。</p>
  </div>;
}
