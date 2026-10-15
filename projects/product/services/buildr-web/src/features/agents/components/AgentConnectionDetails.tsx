import { Alert, Button, Collapse, Tag } from 'antd';
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import type { AgentRegistry } from '../api/agent-operations-api';
import { agentGenerationState, desktopConnectionState, type DesktopConnectionsState } from '../codex-connection-state';

type Props = {
  agent: AgentRegistry['agents'][number];
  desktop: DesktopConnectionsState;
  busy: boolean;
  onClose(): void;
  onPrepare(): void;
  onRefresh(): void;
  lastOperationReason?: string;
};

export function AgentConnectionDetails({agent, desktop, busy, onClose, onPrepare, onRefresh, lastOperationReason}: Props) {
  const generation = agentGenerationState(agent), status = desktopConnectionState(desktop, agent.id);
  const connection = status.connection, config = agent.lastExecutionConfig;
  const technical = <div className="agent-registry-technical">
    {agent.safeReason && <Alert type="warning" showIcon message={agent.safeReason} />}
    {desktop.error && <Alert type="warning" showIcon message={desktop.error} />}
    {connection?.safeReason && <Alert type="warning" showIcon message={connection.safeReason} />}
    {connection && <dl><dt>安装</dt><dd>{connection.installationLabel}</dd><dt>配置来源</dt><dd>{connection.configurationLabel}</dd></dl>}
    {lastOperationReason && lastOperationReason !== connection?.safeReason && <section><strong>最近操作说明</strong><p>{lastOperationReason}</p></section>}
    <section><strong>最近读取的生成配置</strong>{config ? <dl><dt>模型</dt><dd>{config.model ?? '未提供具体值'}</dd><dt>提供方</dt><dd>{config.modelProvider ?? '未提供具体值'}</dd><dt>推理级别</dt><dd>{config.reasoningEffort ?? '未提供具体值'}</dd></dl> : <p>本次服务尚未读取生成配置。</p>}</section>
    <p>{agent.kind === 'codex' ? '独立服务按需启动，空闲 30 分钟后释放，退出 Buildr 时关闭。一次性生成不积累对话历史。桌面继续管理原生会话及记忆（Memory）。' : '使用正在运行的 DSH 桌面后台；空闲 30 分钟后释放连接。退出 Buildr 只清理自身请求与连接，DSH 桌面继续运行。一次性生成不积累对话历史。'}</p>
  </div>;
  return <section id={`agent-connection-details-${agent.id}`} className="agent-registry-details" role="dialog" aria-modal="false" aria-label={`${agent.label} 接入详情`} tabIndex={-1} onKeyDown={event => {if (event.key === 'Escape') {event.stopPropagation(); onClose();}}}>
      <header className="agent-registry-detail-heading"><div><strong>{agent.label}</strong><span>接入详情</span></div><Button type="text" size="small" aria-label="关闭接入详情" icon={<CloseOutlined />} onClick={onClose} /></header>
      <section className="agent-registry-capability" aria-label={agent.kind === 'codex' ? '独立一次性生成' : '桌面后台生成'}><header><strong>{agent.kind === 'codex' ? '独立一次性生成' : '桌面后台生成'}</strong><Tag bordered={false} className={`agent-registry-state-tag is-${generation.tone}`}>{generation.label}</Tag></header><p>{agent.kind === 'dsh' ? agent.safeReason || '使用 DSH 桌面当前默认模型与认证；提交说明按模型支持的最低推理级别生成，不修改桌面聊天设置。每次独立生成，不创建聊天。' : agent.safeReason ? '生成服务需要检查，可展开配置与运行信息查看原因。' : 'Codex 基础配置已接入，使用独立服务完成提交说明等一次性生成。'}</p></section>
      <section className="agent-registry-capability" aria-label={`${agent.kind === 'codex' ? 'Codex' : 'DSH'} 原生会话关联`}><header><strong>原生会话关联</strong><Tag bordered={false} data-agent-desktop-status className={`agent-registry-state-tag is-${status.tone}`}>{status.label}</Tag></header>{desktop.error ? <p>暂时无法确认关联配置，请刷新后再试。</p> : (desktop.connections !== null || !desktop.loading) && <p>在 {agent.kind === 'codex' ? 'Codex' : 'DSH'} 会话中关联任务；任务与会话可互相打开。</p>}<div className="agent-registry-detail-actions"><Button type="text" size="small" icon={<ReloadOutlined />} loading={desktop.loading} onClick={onRefresh}>刷新接入状态</Button><Button size="small" disabled={busy || desktop.loading} onClick={onPrepare}>重新检查接入</Button></div></section>
      <Collapse ghost size="small" className="agent-registry-technical-collapse" items={[{key: 'technical', label: '配置与运行信息', children: technical}]} />
  </section>;
}
