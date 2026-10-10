import { useState } from 'react';
import { Alert, Button, Empty, Input, Spin, Tag, Tooltip } from 'antd';
import { CheckCircleFilled, CopyOutlined, InfoCircleOutlined, PlusOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { useAgentRuntime } from '../../../app/AgentRuntimeContext';
import { DrawerShell } from '../../../components/DrawerShell';
import { copyText } from '../../../lib/copyText';
import { agentRegistrationRequest, agentStatusLabel } from '../agent-model';
import './agent-registry.css';

export function AgentRegistryDrawer() {
  const {registry, loading, selecting, error, open, setOpen, refresh, select} = useAgentRuntime();
  const [adding, setAdding] = useState(false), [details, setDetails] = useState<string | null>(null), [feedback, setFeedback] = useState('');
  const agents = registry?.agents || [], selected = agents.find(agent => agent.id === details);
  const copy = async () => setFeedback(await copyText(agentRegistrationRequest) ? '已复制接入请求' : '无法复制，请选中文字后手动复制。');
  return <DrawerShell title="智能体" width="min(520px, 100vw)" open={open} onClose={() => setOpen(false)} closeAriaLabel="关闭智能体" rootClassName="agent-registry-drawer" extra={<><Tooltip title="刷新智能体状态"><Button id="refresh-agent-registry" type="text" size="small" aria-label="刷新智能体状态" loading={loading} icon={<ReloadOutlined />} onClick={() => void refresh()} /></Tooltip><Button id="add-agent-entry" type="text" size="small" icon={<PlusOutlined />} onClick={() => {setAdding(value => !value); setFeedback('');}}>接入</Button></>}>
    {error && <Alert type="warning" showIcon message={error} />}
    {!registry && loading ? <Spin /> : agents.length ? <><p className="agent-registry-caption">选中项用于之后发起的新调用。</p><section className="agent-registry-list">{agents.map(agent => <article key={agent.id} className={'agent-registry-row' + (registry?.defaultAgentId === agent.id ? ' is-default' : '')}>
      <button type="button" className="agent-registry-select" aria-label={'设为默认智能体 ' + agent.label} aria-pressed={registry?.defaultAgentId === agent.id} disabled={selecting} onClick={() => void select(agent.id)}><span className="agent-registry-choice">{registry?.defaultAgentId === agent.id ? <CheckCircleFilled /> : <span />}</span><RobotOutlined /><strong>{agent.label}</strong><small>{agentStatusLabel(agent)}</small>{registry?.defaultAgentId === agent.id && <Tag bordered={false}>默认</Tag>}</button>
      <Tooltip title={agent.label + ' 详情'}><Button type="text" size="small" aria-label={agent.label + ' 详情'} icon={<InfoCircleOutlined />} onClick={() => setDetails(previous => previous === agent.id ? null : agent.id)} /></Tooltip>
    </article>)}</section></> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={registry ? '尚未接入智能体' : '暂时无法读取智能体'} />}
    {selected && <section className="agent-registry-details"><header><strong>{selected.label} · 详情</strong><Button type="text" size="small" onClick={() => setDetails(null)}>收起</Button></header><p className="agent-registry-caption">已接入 · {agentStatusLabel(selected)}</p>{selected.safeReason && <Alert type="warning" showIcon message={selected.safeReason} description="接入记录仍保留。完成原有智能体授权或恢复可用状态后重试。" />}
      <section className="agent-registry-execution" aria-label="最近一次使用"><strong>最近一次使用</strong><p>沿用 Codex 配置</p>{selected.lastExecutionConfig ? <dl><dt>模型</dt><dd>{selected.lastExecutionConfig.model ?? '未返回'}</dd><dt>提供方</dt><dd>{selected.lastExecutionConfig.modelProvider ?? '未返回'}</dd><dt>推理级别</dt><dd>{selected.lastExecutionConfig.reasoningEffort ?? '未返回'}</dd></dl> : <p>首次调用后确认</p>}</section>
      <dl><dt>运行</dt><dd>首次使用自动准备，后续复用专用服务。</dd><dt>回收</dt><dd>没有排队、执行或等待回应的工作，从最后一次工作结束起空闲 30 分钟后释放；下次自动启动。</dd><dt>生成</dt><dd>临时会话不积累对话历史，结果可在原处编辑和复制。</dd><dt>退出</dt><dd>退出 Buildr 会关闭专用服务；关闭浏览器标签不会退出 Buildr。</dd></dl>
    </section>}
    {(adding || registry?.agents.length === 0) && <section className="agent-registry-add"><header><strong>让智能体接入 Buildr</strong>{agents.length > 0 && <Button type="text" size="small" onClick={() => setAdding(false)}>收起</Button>}</header><p>把这句话发给你希望使用的智能体：</p><Input.TextArea id="agent-registration-prompt" value={agentRegistrationRequest} readOnly autoSize={{minRows: 3, maxRows: 4}} /><Button id="copy-registration-prompt" size="small" icon={<CopyOutlined />} onClick={() => void copy()}>复制接入请求</Button></section>}
    {feedback && <p className="agent-registry-feedback" role="status">{feedback}</p>}
  </DrawerShell>;
}
