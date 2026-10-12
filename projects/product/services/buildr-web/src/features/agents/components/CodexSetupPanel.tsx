import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Radio, Space, Spin, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { agentOperationsApi, type AgentRegistry, type CodexConnectRequest, type CodexConnectResult, type CodexDiscovery } from '../api/agent-operations-api';
import { adoptCodexPage, codexWorkspace } from '../../../app/codex-navigation';
import { DrawerShell } from '../../../components/DrawerShell';

type Props = {registry: AgentRegistry | null; existingAgentId?: string; connectCodex(input: CodexConnectRequest): Promise<CodexConnectResult>; onClose(): void; onConnected(result: CodexConnectResult, warning: string): void};

export function CodexConnectDrawer({registry, existingAgentId, connectCodex, onClose, onConnected}: Props) {
  const [discovery, setDiscovery] = useState<CodexDiscovery | null>(null), [candidateId, setCandidateId] = useState(''), [loading, setLoading] = useState(false), [connecting, setConnecting] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false), [adopt, setAdopt] = useState(true), [error, setError] = useState('');
  const mounted = useRef(false), request = useRef(0), writing = useRef(false);
  const discover = useCallback(async () => {
    if (writing.current) return;
    const serial = ++request.current;
    setLoading(true); setError(''); setDiscovery(null);
    try {
      const result = await agentOperationsApi.discoverCodex();
      if (mounted.current && serial === request.current) {
        const candidates = existingAgentId ? result.candidates.filter(item => item.registeredAgentId === existingAgentId) : result.candidates;
        setDiscovery({...result, candidates}); setCandidateId(previous => candidates.some(item => item.id === previous) ? previous : candidates[0]?.id || '');
      }
    } catch (failure) { if (mounted.current && serial === request.current) setError(failure instanceof Error ? failure.message : '无法发现本机 Codex。'); }
    finally { if (mounted.current && serial === request.current) setLoading(false); }
  }, [existingAgentId]);
  useEffect(() => {mounted.current = true; void discover(); return () => {mounted.current = false; ++request.current;};}, [discover]);
  const selected = discovery?.candidates.find(item => item.id === candidateId);
  const repairing = Boolean(existingAgentId);
  const registeredCodex = registry?.agents.filter(agent => agent.kind === 'codex') || [];
  const registryChanged = repairing ? !registeredCodex.some(agent => agent.id === existingAgentId) : registeredCodex.length > 0;
  const canAdopt = !repairing && /^\/workspaces\/[^/]+\//u.test(window.location.pathname) && !codexWorkspace(window.location.pathname);
  const connect = async () => {
    if (!selected || !discovery || !registry || writing.current) return;
    if (registryChanged || selected.registeredAgentId && !repairing || repairing && selected.registeredAgentId !== existingAgentId) {
      setError(repairing ? 'Codex 接入已变化，请关闭并重新检查。' : 'Codex 已接入。请在现有条目的详情中检查接入。'); return;
    }
    if (repairing && !selected.desktopAvailable) {setError('当前关联范围无法确认；独立生成配置与已有聊天关联仍保留。'); return;}
    writing.current = true; ++request.current; setConnecting(true); setError('');
    try {
      const result = await connectCodex({candidateId: selected.id, expectedDiscoveryRevision: discovery.revision, expectedRevision: registry.revision, makeDefault: repairing ? false : !registry.defaultAgentId || makeDefault, ...(existingAgentId ? {existingAgentId} : {})});
      if (mounted.current) {
        const warning = [result.desktopError?.message || result.desktop?.safeReason || '', adopt && canAdopt && !adoptCodexPage() ? '当前页面暂不支持采用 Codex 固定入口；现有内容已保留。' : ''].filter(Boolean).join(' ');
        onConnected(result, warning);
      }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Codex 接入未完成。'); }
    finally {writing.current = false; if (mounted.current) setConnecting(false);}
  };
  return <DrawerShell open title={repairing ? '检查 Codex 接入' : '接入 Codex'} width="min(560px, 100vw)" rootClassName="codex-connect-drawer" onClose={onClose} closeAriaLabel={repairing ? '关闭 Codex 接入检查' : '关闭 Codex 接入'} closeDisabled={connecting} maskClosable={!connecting} keyboard={!connecting} footer={<Space style={{display: 'flex', justifyContent: 'flex-end'}}><Button id="cancel-local-codex" disabled={connecting} onClick={onClose}>取消</Button><Button id="confirm-local-codex" type="primary" loading={connecting} disabled={loading || !registry || registryChanged || !selected || selected.generationAvailability !== 'available' || repairing && !selected.desktopAvailable || !repairing && Boolean(selected.registeredAgentId)} onClick={() => void connect()}>{repairing ? '确认检查' : '确认接入'}</Button></Space>}>
    <section className="codex-setup" id="codex-local-setup"><header><strong>{repairing ? '检查已接入的 Codex' : '选择本机 Codex'}</strong><Button id="discover-local-codex" size="small" type="text" icon={<ReloadOutlined />} loading={loading} disabled={connecting} onClick={() => void discover()}>重新检测</Button></header>
    <p>{repairing ? '重新检测现有 Codex 的安装与配置来源，保留接入标识、默认选择和已有聊天关联。' : '检测运行 Buildr 的这台机器。确认后配置原聊天关联与独立的一次性生成服务；Codex 继续管理自己的聊天与记忆（Memory）。'}</p>
    {error && <Alert type="warning" showIcon message={error} />}
    {registryChanged && <Alert type="info" showIcon message={repairing ? 'Codex 接入已变化，请关闭并重新检查。' : 'Codex 已接入。请在现有条目的详情中检查接入。'} />}
    {repairing && selected && !selected.desktopAvailable && <Alert type="info" showIcon message="未发现原 Codex 桌面安装，无法确认当前关联范围。独立生成配置与已有聊天关联仍保留。" />}
    {loading ? <div className="codex-discovery-loading" role="status"><Spin size="small" /><span>正在检测本机 Codex…</span></div> : discovery && !discovery.candidates.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={repairing ? '未发现已接入的 Codex' : '未发现 Codex'}><p>{repairing ? '原安装或配置来源当前不可用。请恢复后重新检测，现有接入记录保留。' : '请确认 Codex 已安装在运行 Buildr 的机器上，然后重新检测。'}</p></Empty> : discovery && <Radio.Group value={candidateId} disabled={connecting} onChange={event => setCandidateId(String(event.target.value))} className="codex-candidate-list">{discovery.candidates.map(candidate => <article key={candidate.id} className="codex-candidate" data-codex-candidate={candidate.id}><Radio value={candidate.id} disabled={!repairing && Boolean(candidate.registeredAgentId)}><strong>{candidate.label}</strong>{candidate.registeredAgentId && <Tag bordered={false}>已接入</Tag>}</Radio><dl><dt>安装</dt><dd>{candidate.installationLabel}</dd><dt>版本</dt><dd>{candidate.version}</dd><dt>配置来源</dt><dd>{candidate.configurationLabel}</dd><dt>能力</dt><dd>{candidate.desktopAvailable ? '原聊天关联' : '未发现桌面安装'} · {candidate.generationAvailability === 'available' ? '独立一次性生成可用' : '独立一次性生成暂不可用'}</dd></dl>{candidate.safeReason && <p>{candidate.safeReason}</p>}</article>)}</Radio.Group>}
    {selected && <><p className="agent-registry-caption">独立生成使用已确认的基础配置，不读取原聊天历史与记忆（Memory）。</p>{!repairing && registry?.defaultAgentId && <Checkbox checked={makeDefault} disabled={connecting} onChange={event => setMakeDefault(event.target.checked)}>设为之后生成的默认智能体（Agent）</Checkbox>}{canAdopt && <Checkbox checked={adopt} disabled={connecting} onChange={event => setAdopt(event.target.checked)}>让当前页采用 Codex 固定入口，保留当前位置与编辑内容</Checkbox>}</>}
    </section>
  </DrawerShell>;
}
