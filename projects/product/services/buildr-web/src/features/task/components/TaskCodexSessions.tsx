import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Select, Spin, Tag } from 'antd';
import { CopyOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAgentRuntime } from '../../../app/AgentRuntimeContext';
import { codexRouteHref } from '../../../app/codex-navigation';
import { copyText } from '../../../lib/copyText';
import { codexDesktopApi, codexConnectionStatus, codexSessionHref, type CodexBinding, type CodexConnection, type CodexSessionRelation } from '../../agents/api/codex-desktop-api';
import { clearBindingRecovery, createBindingRecovery, readBindingRecovery, saveBindingRecovery, type CodexBindingRecovery } from '../../agents/codex-binding-recovery';
import './task-codex-sessions.css';

export function TaskCodexSessions({workspaceId, taskId}: {workspaceId: string; taskId: string}) {
  const agents = useAgentRuntime();
  const [relations, setRelations] = useState<CodexSessionRelation[]>([]), [connections, setConnections] = useState<CodexConnection[]>([]), [connectionId, setConnectionId] = useState('');
  const [expanded, setExpanded] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [binding, setBinding] = useState<CodexBinding | null>(null);
  const [recovery, setRecovery] = useState<CodexBindingRecovery | null>(null), [bindingMissing, setBindingMissing] = useState(false);
  const mounted = useRef(false), serial = useRef(0), writing = useRef(false);
  const checking = useRef(new Set<string>());
  const activeBinding = useRef<string | null>(null);
  const scope = useRef({workspaceId, taskId}); scope.current = {workspaceId, taskId};
  const refresh = useCallback(async () => {
    const request = ++serial.current;
    setLoading(true);
    try {
      const [sessions, desktop] = await Promise.all([codexDesktopApi.sessions(workspaceId, taskId), codexDesktopApi.connections()]);
      if (sessions.workspaceId !== workspaceId || sessions.relations.some(item => item.workspaceId !== workspaceId || item.taskId !== taskId)) throw new Error('聊天关联响应与当前任务不匹配，未显示其他任务的数据。');
      if (mounted.current && request === serial.current) {
        setRelations(sessions.relations); setConnections(desktop.connections); setError('');
        setConnectionId(previous => desktop.connections.some(item => item.id === previous) ? previous : desktop.connections.length === 1 ? desktop.connections[0].id : '');
      }
    } catch (failure) { if (mounted.current && request === serial.current) setError(failure instanceof Error ? failure.message : '无法读取 Codex 聊天关联。'); }
    finally { if (mounted.current && request === serial.current) setLoading(false); }
  }, [workspaceId, taskId]);
  useEffect(() => {
    mounted.current = true; setRelations([]); setConnections([]); setBinding(null); setFeedback(''); setError(''); void refresh();
    return () => {mounted.current = false; ++serial.current;};
  }, [refresh]);
  const queryBinding = useCallback(async (request: Pick<CodexBinding, 'id' | 'connectionId'>) => {
    if (checking.current.has(request.id) || request.id !== activeBinding.current) return;
    checking.current.add(request.id);
    try {
      const receipt = await codexDesktopApi.binding(workspaceId, request.id);
      if (!mounted.current || scope.current.workspaceId !== workspaceId || scope.current.taskId !== taskId || request.id !== activeBinding.current) return;
      if (receipt.id !== request.id || receipt.workspaceId !== workspaceId || receipt.taskId !== taskId || receipt.connectionId !== request.connectionId) throw new Error('聊天绑定回执与当前请求不匹配。');
      setBinding(previous => !previous || previous.id === request.id && previous.status === 'pending' ? receipt : previous); setBindingMissing(false); setError('');
      if (receipt.status === 'bound' || receipt.status === 'expired') {clearBindingRecovery(workspaceId, taskId); setRecovery(null);}
      if (receipt.status === 'bound') {setFeedback('已关联原聊天。关联不会启动开发或改变任务状态。'); await refresh();}
    } catch (failure) {
      if (mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId && request.id === activeBinding.current) {
        const missing = Boolean(failure && typeof failure === 'object' && 'code' in failure && failure.code === 'codex_binding_missing');
        setBindingMissing(missing); setError(missing ? '尚未查到此关联请求，可用原请求编号重试创建。' : failure instanceof Error ? failure.message : '绑定结果暂无法确认，请查询原请求。');
      }
    }
    finally {checking.current.delete(request.id);}
  }, [workspaceId, taskId, refresh]);
  useEffect(() => {
    const restored = readBindingRecovery(workspaceId, taskId); activeBinding.current = restored?.id || null; setRecovery(restored); setBindingMissing(false);
    if (restored) {setConnectionId(restored.connectionId); setExpanded(true); void queryBinding(restored);}
  }, [workspaceId, taskId, queryBinding]);
  useEffect(() => {
    if (!recovery) return;
    const timer = window.setTimeout(() => {
      if (activeBinding.current !== recovery.id) return;
      clearBindingRecovery(workspaceId, taskId); activeBinding.current = null; setRecovery(null); setBindingMissing(false);
      setBinding(previous => previous?.status === 'pending' ? {...previous, status: 'expired'} : previous); void refresh();
    }, Math.max(0, recovery.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [recovery, workspaceId, taskId, refresh]);
  useEffect(() => {
    if (binding?.status !== 'pending') return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void queryBinding(binding); }, 3000);
    return () => window.clearInterval(timer);
  }, [binding, queryBinding]);
  const createBinding = async () => {
    if (!connectionId || writing.current || connections.find(item => item.id === connectionId)?.status === 'disconnected') return;
    writing.current = true; setBusy('bind'); setError(''); setFeedback('');
    const handle = recovery?.connectionId === connectionId && recovery.expiresAt > Date.now() ? recovery : createBindingRecovery(workspaceId, taskId, connectionId);
    activeBinding.current = handle.id; saveBindingRecovery(handle); setRecovery(handle); setBinding(null); setBindingMissing(false);
    try {
      const result = await codexDesktopApi.bind(workspaceId, connectionId, taskId, handle.id);
      if (mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId && activeBinding.current === handle.id) {
        if (result.id !== handle.id || result.workspaceId !== workspaceId || result.taskId !== taskId || result.connectionId !== connectionId) throw new Error('绑定请求与当前任务不匹配。');
        setBinding(result);
        if (result.status === 'bound' || result.status === 'expired') {clearBindingRecovery(workspaceId, taskId); setRecovery(null);}
        if (result.status === 'bound') {setFeedback('已关联原聊天。关联不会启动开发或改变任务状态。'); await refresh();}
      }
    } catch (failure) { if (mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId) {setError(failure instanceof Error ? failure.message : '关联请求创建结果待确认，先查询原请求。'); await queryBinding(handle);} }
    finally {writing.current = false; if (mounted.current) setBusy('');}
  };
  const unlink = async (relation: CodexSessionRelation) => {
    if (writing.current) return;
    writing.current = true; setBusy(relation.id); setError(''); setFeedback('');
    try {await codexDesktopApi.unlink(workspaceId, relation); if (mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId) {setFeedback('已解除关联，聊天和任务内容仍保留。'); await refresh();}}
    catch (failure) { if (mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId) {await refresh(); setError(failure instanceof Error ? failure.message : '解除未完成，当前关联已重新读取。');} }
    finally {writing.current = false; if (mounted.current) setBusy('');}
  };
  const copyTask = async () => {
    setExpanded(true);
    const href = codexRouteHref(workspaceId, {pathname: `/workspaces/${workspaceId}/tasks/${encodeURIComponent(taskId)}`, search: '', hash: ''});
    setFeedback(href && await copyText(window.location.origin + href) ? '已复制任务链接。在聊天中打开时，优先复用同一固定入口页。' : '未能复制任务链接。');
  };
  const panelHref = binding && /^(?:plugin|codex):\/\//u.test(binding.panelUrl) ? binding.panelUrl : undefined;
  return <section className="task-codex-sessions" id="task-codex-sessions" data-task-codex-id={taskId}><header><button type="button" className="task-codex-toggle" aria-expanded={expanded} aria-controls={`task-codex-relations-${taskId}`} onClick={() => setExpanded(value => !value)}><LinkOutlined /> Codex 原聊天 <span>{relations.length}</span></button><div><Button size="small" type="text" icon={<CopyOutlined />} onClick={() => void copyTask()}>复制任务链接</Button><Button size="small" type="text" onClick={() => setExpanded(true)}>关联聊天</Button></div></header>
    {expanded && <div id={`task-codex-relations-${taskId}`}><p className="task-codex-caption">一个任务可关联多个原聊天，一个原聊天也可关联多个任务。打开聊天后，在该聊天的 Buildr 入口确认或继续工作。</p>{error && <Alert type="warning" showIcon message={error} />}
      {loading && !relations.length ? <Spin size="small" /> : !relations.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未关联 Codex 原聊天" /> : <ul>{relations.map(relation => {
        const connection = connections.find(item => item.id === relation.connectionId), href = codexSessionHref(relation.nativeSessionId);
        return <li key={relation.id} data-codex-session={relation.nativeSessionId}><div><strong>{connection?.label || 'Codex 原聊天'}</strong>{connection && <Tag bordered={false}>{codexConnectionStatus(connection)}</Tag>}<code>{relation.nativeSessionId}</code></div><div><Button size="small" type="link" href={href || undefined} disabled={!href}>打开原聊天</Button><Button size="small" type="text" disabled={Boolean(busy)} loading={busy === relation.id} onClick={() => void unlink(relation)}>解除关联</Button></div></li>;
      })}</ul>}
      <div className="task-codex-bind">{connections.some(item => item.status !== 'disconnected') ? <><Select aria-label="选择桌面 Codex 接入" placeholder="选择桌面 Codex 接入" value={connectionId || undefined} disabled={Boolean(busy) || Boolean(recovery && !bindingMissing)} onChange={setConnectionId} options={connections.map(item => ({value: item.id, label: `${item.label} · ${codexConnectionStatus(item)}`, disabled: item.status === 'disconnected'}))} /><Button id="task-codex-bind" size="small" disabled={!connectionId || connections.find(item => item.id === connectionId)?.status === 'disconnected' || Boolean(busy) || Boolean((binding?.status === 'pending' || recovery) && !bindingMissing)} loading={busy === 'bind'} onClick={() => void createBinding()}>{bindingMissing ? '重试创建原请求' : '创建关联请求'}</Button></> : <Button size="small" onClick={() => agents.setOpen(true)}>先接入本机 Codex</Button>}<Button type="text" size="small" icon={<ReloadOutlined />} loading={loading} disabled={Boolean(busy)} onClick={() => void refresh()}>刷新</Button></div>
      {(binding || recovery) && <Alert id="task-codex-binding" type={binding?.status === 'bound' ? 'success' : 'info'} showIcon message={binding?.status === 'bound' ? '原聊天已关联' : binding?.status === 'expired' ? '关联请求已过期，请重新创建' : bindingMissing ? '原关联请求尚未创建' : binding ? '等待在目标原聊天确认' : '关联请求创建结果待确认'} description={<>{binding?.status === 'pending' && <p>在你希望关联的原聊天里打开 Buildr 入口，选择本请求并确认。接入总览不会代替目标聊天完成关联。</p>}<div>{panelHref && <Button size="small" type="link" href={panelHref}>查看 Codex 接入入口</Button>}{(binding?.status === 'pending' || recovery) && <Button size="small" onClick={() => void queryBinding((binding || recovery)!)}>查询关联结果</Button>}</div></>} />}
      {feedback && <p className="task-codex-feedback" role="status">{feedback}</p>}
    </div>}
  </section>;
}
