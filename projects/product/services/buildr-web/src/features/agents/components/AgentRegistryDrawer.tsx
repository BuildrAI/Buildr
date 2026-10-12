import { useContext, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Empty, Input, Modal, Popover, Spin, Tag, Tooltip } from 'antd';
import { CheckCircleFilled, CopyOutlined, PlusOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { useAgentRuntime } from '../../../app/AgentRuntimeContext';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { DrawerShell } from '../../../components/DrawerShell';
import { copyText } from '../../../lib/copyText';
import { agentRegistrationRequest } from '../agent-model';
import { agentGenerationState, codexDesktopState } from '../codex-connection-state';
import { useCodexConnections } from '../useCodexConnections';
import { AgentConnectionDetails } from './AgentConnectionDetails';
import { CodexConnectDrawer } from './CodexSetupPanel';
import './agent-registry.css';

export function AgentRegistryDrawer() {
  const {registry, loading, selecting, connecting, removing, error, open, setOpen, refresh, select, connectCodex, removeCodex} = useAgentRuntime();
  const viewActive = useContext(WorkspaceViewActiveContext);
  const [adding, setAdding] = useState<'codex' | 'dsh' | null>(null);
  const [repairing, setRepairing] = useState<string | null>(null), [details, setDetails] = useState<string | null>(null);
  const [feedback, setFeedback] = useState(''), [warning, setWarning] = useState('');
  const [feedbackTone, setFeedbackTone] = useState<'info' | 'warning'>('info'), [feedbackAgentId, setFeedbackAgentId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{id: string; label: string} | null>(null), [removalError, setRemovalError] = useState('');
  const detailsTrigger = useRef<HTMLElement | null>(null), restoreDetailsFocus = useRef(false);
  const agents = registry?.agents || [], firstCodexId = agents.find(agent => agent.kind === 'codex')?.id;
  const codexConnected = Boolean(firstCodexId);
  const desktop = useCodexConnections(open && viewActive && codexConnected);
  const busy = selecting || connecting || Boolean(removing);
  useEffect(() => {
    if (!open) {setAdding(null); setRepairing(null); setDetails(null); if (!removing) setRemoveTarget(null);}
    if (!viewActive) setDetails(null);
  }, [open, removing, viewActive]);
  useEffect(() => {if (details && !agents.some(agent => agent.id === details)) setDetails(null);}, [agents, details]);
  useEffect(() => {
    if (details || !restoreDetailsFocus.current) return;
    restoreDetailsFocus.current = false;
    const trigger = detailsTrigger.current; detailsTrigger.current = null;
    if (open && viewActive && trigger?.isConnected) trigger.focus();
  }, [details, open, viewActive]);
  const closeDetails = () => {restoreDetailsFocus.current = true; setDetails(null);};
  const copy = async () => {const copied = await copyText(agentRegistrationRequest); setFeedback(copied ? '已复制接入请求' : '无法复制，请选中文字后手动复制。'); setFeedbackTone(copied ? 'info' : 'warning'); setWarning(''); setFeedbackAgentId(null);};
  const remove = async () => {
    if (!removeTarget || busy) return;
    setRemovalError('');
    const result = await removeCodex(removeTarget.id);
    if (result.removed) {setRemoveTarget(null); setDetails(null); setFeedback('Codex 接入已移除。已有任务与聊天关联已保留。'); setFeedbackTone(result.warning ? 'warning' : 'info'); setFeedbackAgentId(null); setWarning(result.warning);}
    else setRemovalError(result.error);
  };
  const chooseAgent = (key: string) => {
    if (busy || !registry || key === 'codex' && codexConnected) return;
    if (key !== 'codex' && key !== 'dsh') return;
    setDetails(null); setRepairing(null); setAdding(key); setFeedback(''); setWarning('');
  };
  const close = () => {if (!busy) {setAdding(null); setRepairing(null); setDetails(null); setOpen(false);}};
  const menu = {
    items: [{key: 'codex', label: codexConnected ? 'Codex · 已接入' : 'Codex', disabled: codexConnected}, {key: 'dsh', label: 'DSH · 发送接入请求'}],
    onClick: ({key}: {key: string}) => chooseAgent(key),
  };
  return <DrawerShell title="智能体" width="min(640px, 100vw)" open={open} onClose={close} closeDisabled={busy} maskClosable={!busy} keyboard={!busy && !details} closeAriaLabel="关闭智能体" rootClassName="agent-registry-drawer" extra={<>
    <Tooltip title="刷新智能体状态"><Button id="refresh-agent-registry" type="text" size="small" aria-label="刷新智能体状态" loading={loading || desktop.state.loading} disabled={busy} icon={<ReloadOutlined />} onClick={() => void Promise.all([refresh(), desktop.refresh()])} /></Tooltip>
    <Dropdown trigger={['hover', 'click']} disabled={busy || !registry} menu={menu}>
      <Button id="add-agent-entry" type="text" size="small" icon={<PlusOutlined />} disabled={busy || !registry} aria-label="选择接入智能体">接入</Button>
    </Dropdown>
  </>}>
    {error && <Alert type="warning" showIcon message={error} />}
    {!registry && loading ? <Spin /> : agents.length ? <>
      <p className="agent-registry-caption">已接入 {agents.length} 个智能体；选中项用于之后的新调用。</p>
      <section className="agent-registry-list" aria-label="已接入的智能体">{agents.map(agent => {
        const isDefault = registry?.defaultAgentId === agent.id;
        const detailOpen = open && viewActive && details === agent.id;
        const generation = agentGenerationState(agent), connection = codexDesktopState(desktop.state, agent.id);
        return <article key={agent.id} data-agent-id={agent.id} data-agent-kind={agent.kind} className={'agent-registry-row' + (isDefault ? ' is-default' : '')}>
          <button type="button" className="agent-registry-select" aria-label={'设为默认智能体 ' + agent.label} aria-pressed={isDefault} disabled={busy} onClick={() => void select(agent.id)}>
            <span className="agent-registry-choice">{isDefault ? <CheckCircleFilled /> : <span />}</span>
            <span className="agent-registry-icon"><RobotOutlined /></span>
            <span className="agent-registry-copy"><span className="agent-registry-name"><strong>{agent.label}</strong>{isDefault && <Tag bordered={false}>默认</Tag>}</span><span className="agent-registry-summary"><span className={`agent-registry-status is-${generation.tone}`}>{generation.label}</span><span aria-hidden="true">·</span>{agent.kind === 'codex' ? <span data-agent-desktop-status className={`agent-registry-desktop-status is-${connection.tone}`}>原聊天关联：{connection.label}</span> : <span>DSH 桌面默认配置</span>}</span></span>
          </button>
          <Popover trigger="click" placement="bottom" align={{points: ['tr', 'br'], offset: [0, 8]}} autoAdjustOverflow arrow={false} destroyOnHidden overlayClassName="agent-registry-details-popover" open={detailOpen} onOpenChange={next => {if (next && viewActive) restoreDetailsFocus.current = false; setDetails(previous => next && viewActive ? agent.id : previous === agent.id ? null : previous);}} afterOpenChange={visible => {if (visible && detailOpen) document.getElementById(`agent-connection-details-${agent.id}`)?.focus();}} content={<>{detailOpen && <AgentConnectionDetails agent={agent} desktop={desktop.state} busy={busy} lastOperationReason={feedbackAgentId === agent.id ? warning : undefined} onClose={closeDetails} onRefresh={() => void desktop.refresh()} onPrepare={() => {if (!busy) {setDetails(null); setRepairing(agent.id); setFeedback(''); setWarning('');}}} />}</>}>
            <div className="agent-registry-actions" onKeyDown={event => {if (event.key === 'Escape' && detailOpen) {event.stopPropagation(); closeDetails();}}}>
              <Button type="text" size="small" aria-label={agent.label + ' 详情'} aria-haspopup="dialog" aria-expanded={detailOpen} aria-controls={detailOpen ? `agent-connection-details-${agent.id}` : undefined} onClick={event => {detailsTrigger.current = event.currentTarget; restoreDetailsFocus.current = false;}}>详情</Button>
              {agent.kind === 'codex' && <Button id={agent.id === firstCodexId ? 'remove-codex-entry' : undefined} type="text" size="small" danger disabled={busy} aria-label={`移除 ${agent.label} 接入`} onClick={event => {event.stopPropagation(); setDetails(null); setRemoveTarget({id: agent.id, label: agent.label}); setRemovalError('');}}>移除</Button>}
            </div>
          </Popover>
        </article>;
      })}</section>
    </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={registry ? '尚未接入智能体' : '暂时无法读取智能体'} />}
    {feedback && <Alert className="agent-registry-result" role="status" type={feedbackTone} showIcon closable={{closeIcon: true, 'aria-label': '关闭操作提示'}} onClose={() => setFeedback('')} message={feedback} description={!feedbackAgentId && warning ? warning : undefined} action={feedbackAgentId && agents.some(agent => agent.id === feedbackAgentId) ? <Button type="text" size="small" onClick={event => {detailsTrigger.current = event.currentTarget; restoreDetailsFocus.current = false; setDetails(feedbackAgentId);}}>查看详情</Button> : undefined} />}
    {open && (adding === 'codex' || repairing) && <CodexConnectDrawer registry={registry} connectCodex={connectCodex} existingAgentId={repairing ?? undefined} onClose={() => {setAdding(null); setRepairing(null);}} onConnected={(result, associationWarning) => {
      const configured = result.desktop?.status === 'configured';
      const outcome = configured ? '原聊天关联已配置' : result.desktop?.status === 'unavailable' ? '原聊天关联需检查' : '原聊天关联未配置';
      setAdding(null); setRepairing(null);
      setFeedback(repairing ? `${outcome}；现有接入与默认选择已保留。` : `提交说明等一次性生成已配置；${outcome}。`);
      setFeedbackTone(configured && !associationWarning ? 'info' : 'warning'); setFeedbackAgentId(result.agentId); setWarning(associationWarning); void desktop.refreshAfterChange();
    }} />}
    {open && adding === 'dsh' && <DrawerShell open title="让智能体接入 Buildr" width="min(520px, 100vw)" onClose={() => setAdding(null)} closeAriaLabel="关闭 DSH 接入提示" footer={<Button onClick={() => setAdding(null)}>返回</Button>}><section className="agent-registry-add"><p>把这句话发给你希望使用的智能体：</p><Input.TextArea id="agent-registration-prompt" value={agentRegistrationRequest} readOnly autoSize={{minRows: 3, maxRows: 4}} /><Button id="copy-registration-prompt" size="small" icon={<CopyOutlined />} onClick={() => void copy()}>复制接入请求</Button></section></DrawerShell>}
    <Modal open={open && Boolean(removeTarget)} title="移除 Codex 接入？" onCancel={() => {if (!removing) setRemoveTarget(null);}} closable={!removing} maskClosable={!removing} keyboard={!removing} footer={<><Button disabled={Boolean(removing)} onClick={() => setRemoveTarget(null)}>取消</Button><Button id="confirm-remove-codex" danger type="primary" loading={Boolean(removing)} disabled={selecting} onClick={() => void remove()}>确认移除</Button></>}>
      <p>将移除 {removeTarget?.label} 的接入并停止 Buildr 的独立生成服务。</p><p>桌面聊天、记忆（Memory）、配置和已有任务及聊天关联都会保留。已有聊天仍可打开。</p>{removalError && <Alert type="warning" showIcon message={removalError} />}
    </Modal>
  </DrawerShell>;
}
