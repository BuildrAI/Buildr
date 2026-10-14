import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Button, Popover } from 'antd';
import { CloseOutlined, CopyOutlined, ExclamationCircleOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { codexRouteHref, codexWorkspace } from '../../../app/codex-navigation';
import { copyText } from '../../../lib/copyText';
import { agentSessionsApi, type AgentSessionRelation, type AgentSessionDiagnostic } from '../../agents/api/agent-sessions-api';
import { agentSessionHref, assertDshSessionOpened, mergeAgentSessionObservation, sessionProviderLabel, sessionRelationKey } from '../agent-session-model';
import './task-codex-sessions.css';

export function TaskAgentSessions({workspaceId, taskId}: {workspaceId: string; taskId: string}) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const panelRef = useRef<HTMLDivElement>(null), opener = useRef<HTMLElement | null>(null);
  const [relations, setRelations] = useState<AgentSessionRelation[]>([]), [diagnostics, setDiagnostics] = useState<AgentSessionDiagnostic[]>([]);
  const [expanded, setExpanded] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [actionError, setActionError] = useState(''), [feedback, setFeedback] = useState('');
  const mounted = useRef(false), serial = useRef(0), writing = useRef(false), observed = useRef<AgentSessionRelation[]>([]);
  const scope = useRef({workspaceId, taskId}); scope.current = {workspaceId, taskId};
  const requestText = `把当前会话关联到 Buildr 任务 ${taskId}。`;
  const taskPath = `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`;
  const taskHref = codexWorkspace(window.location.pathname) === workspaceId ? codexRouteHref(workspaceId, {pathname: taskPath, search: '', hash: ''}) : taskPath;
  const refresh = useCallback(async (silent = false) => {
    const request = ++serial.current;
    if (!silent) setLoading(true);
    try {
      const result = await agentSessionsApi.sessions(workspaceId, taskId);
      const next = mergeAgentSessionObservation(observed.current, result, workspaceId, taskId);
      if (mounted.current && request === serial.current) {observed.current = next; setRelations(next); setDiagnostics(result.diagnostics); setError('');}
    } catch (failure) {if (mounted.current && request === serial.current) setError(failure instanceof Error ? failure.message : '无法读取智能体会话关联。');}
    finally {if (mounted.current && request === serial.current) setLoading(false);}
  }, [workspaceId, taskId]);
  useEffect(() => {
    mounted.current = true; observed.current = []; setRelations([]); setDiagnostics([]); setExpanded(false); setFeedback(''); setError(''); setActionError('');
    void refresh();
    const observe = () => {if (document.visibilityState === 'visible') void refresh(true);};
    window.addEventListener('focus', observe); document.addEventListener('visibilitychange', observe);
    return () => {mounted.current = false; ++serial.current; window.removeEventListener('focus', observe); document.removeEventListener('visibilitychange', observe);};
  }, [workspaceId, taskId, refresh]);
  useEffect(() => {if (!viewActive) setExpanded(false);}, [viewActive]);
  useEffect(() => {
    if (expanded && viewActive && panelRef.current && !panelRef.current.contains(document.activeElement) && document.activeElement === document.body) panelRef.current.focus({preventScroll: true});
  }, [expanded, viewActive, relations.length]);
  const currentScope = () => mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId;
  const unlink = async (relation: AgentSessionRelation) => {
    if (writing.current) return;
    writing.current = true; ++serial.current; setBusy('unlink:' + sessionRelationKey(relation)); setActionError(''); setFeedback('');
    try {
      const result = await agentSessionsApi.unlink(workspaceId, relation);
      if (currentScope()) {
        // The successful write already proves this relation was removed. A
        // diagnostic for another provider must not restore it from an old cut.
        const previous = observed.current.filter(item => sessionRelationKey(item) !== sessionRelationKey(relation));
        const next = mergeAgentSessionObservation(previous, result, workspaceId, taskId);
        ++serial.current; observed.current = next; setRelations(next); setDiagnostics(result.diagnostics); setError(''); setFeedback('已解除关联，会话和任务内容仍保留。');
      }
    }
    catch (failure) {if (currentScope()) {await refresh(true); if (currentScope()) setActionError(failure instanceof Error ? failure.message : '解除未完成，当前关联已重新读取。');}}
    finally {writing.current = false; if (currentScope()) {setBusy(''); setLoading(false);}}
  };
  const openDsh = async (relation: AgentSessionRelation) => {
    if (writing.current) return;
    writing.current = true; setBusy('open:' + sessionRelationKey(relation)); setActionError(''); setFeedback('');
    try {const result = await agentSessionsApi.open(workspaceId, relation); assertDshSessionOpened(result, relation); if (currentScope()) setFeedback('已打开所选 DSH 会话。');}
    catch (failure) {if (currentScope()) setActionError(failure instanceof Error ? failure.message : '未能打开所选 DSH 会话，请核对桌面连接。');}
    finally {writing.current = false; if (currentScope()) setBusy('');}
  };
  const openButton = (relation: AgentSessionRelation, single = false) => {
    const href = agentSessionHref(relation);
    return relation.provider === 'codex'
      ? <Button id={single ? 'task-codex-open-single' : undefined} size="small" type="link" href={href || undefined} disabled={!href}>打开会话</Button>
      : <Button id={single ? 'task-dsh-open-single' : undefined} size="small" type="link" disabled={Boolean(busy)} loading={busy === 'open:' + sessionRelationKey(relation)} onClick={() => void openDsh(relation)}>打开会话</Button>;
  };
  const copyTask = async () => setFeedback(taskHref && await copyText(window.location.origin + taskHref) ? '任务链接已复制，可放到智能体会话中打开。' : '未能复制任务链接。');
  const copyAssociation = async () => {
    const text = requestText + (taskHref ? `\n任务链接：${window.location.origin}${taskHref}` : '');
    setFeedback(await copyText(text) ? '关联请求已复制，请在要关联的 Codex 或 DSH 会话中发送。' : '未能复制关联请求，请复制上面的文字。');
  };
  const closePanel = () => {setExpanded(false); if (opener.current?.isConnected) opener.current.focus({preventScroll: true});};
  const rememberOpener = (element: HTMLElement) => {opener.current = element;};
  const panelId = 'task-codex-panel-' + taskId;
  const status = error ? '读取失败' : diagnostics.length ? '部分未确认' : loading && !relations.length ? '读取中…' : relations.length ? String(relations.length) : '尚未关联会话';
  const panel = <div className="task-codex-panel" id={panelId} ref={panelRef} role="dialog" aria-label="智能体会话关联" tabIndex={-1} onKeyDown={event => {if (event.key === 'Escape') {event.stopPropagation(); closePanel();}}}>
    <header><strong>智能体会话</strong><Button type="text" size="small" aria-label="关闭会话关联" icon={<CloseOutlined />} onClick={closePanel} /></header>
    {error && <Alert type="warning" showIcon message={error} />}
    {diagnostics.map(item => <Alert key={item.provider + ':' + item.code} type="warning" showIcon message={`${sessionProviderLabel(item.provider)}：${item.message}`} />)}
    {actionError && <Alert type="warning" showIcon message={actionError} />}
    {relations.length > 0 ? <>
      <p className="task-codex-panel-caption">{error ? '上次读取的关联' : diagnostics.length ? '可见关联，含上次读取结果' : '已关联会话'} · {relations.length}</p>
      <ul>{relations.map((relation, index) => {
        const retained = Boolean(error || diagnostics.some(item => item.provider === relation.provider));
        return <li key={sessionRelationKey(relation)} data-agent-session={relation.nativeSessionId} data-session-provider={relation.provider} data-codex-session={relation.provider === 'codex' ? relation.nativeSessionId : undefined} data-dsh-session={relation.provider === 'dsh' ? relation.nativeSessionId : undefined}>
          <div><strong>{sessionProviderLabel(relation.provider)} 会话 {index + 1}{retained && ' · 上次读取'}</strong><code>{relation.nativeSessionId}</code></div>
          <div>{openButton(relation)}<Button size="small" type="text" disabled={Boolean(busy)} loading={busy === 'unlink:' + sessionRelationKey(relation)} onClick={() => void unlink(relation)}>解除关联</Button></div>
        </li>;
      })}</ul>
    </> : <p className="task-codex-panel-caption">{loading ? '正在读取会话关联…' : error || diagnostics.length ? '请刷新后重试。' : '尚未关联会话'}</p>}
    <div className="task-codex-panel-tools"><Button size="small" type="text" aria-label="复制任务链接" icon={<CopyOutlined />} onClick={() => void copyTask()}>复制任务链接</Button><Button type="text" size="small" aria-label="刷新会话关联" icon={<ReloadOutlined />} loading={loading} disabled={Boolean(busy)} onClick={() => void refresh()}>刷新</Button></div>
    <div className="task-codex-association"><p className="task-codex-panel-caption">在要关联的 Codex 或 DSH 会话中发送：</p><code>{requestText}</code><Button id="task-codex-copy-association" size="small" aria-label="复制关联请求" icon={<CopyOutlined />} onClick={() => void copyAssociation()}>复制关联请求</Button></div>
    {feedback && <p className="task-codex-feedback" role="status">{feedback}</p>}
  </div>;
  return <section className="task-codex-sessions" id="task-codex-sessions" data-task-codex-id={taskId} data-task-agent-sessions={taskId}>
    <Popover trigger="click" placement="bottomLeft" align={{ overflow: { adjustX: true, adjustY: true, shiftX: 8 } }} arrow={false} autoAdjustOverflow destroyOnHidden overlayClassName="task-codex-popover" open={viewActive && expanded} onOpenChange={next => setExpanded(viewActive && next)} afterOpenChange={visible => {if (visible && !panelRef.current?.contains(document.activeElement)) panelRef.current?.focus({preventScroll: true});}} content={panel}>
      <span className="task-codex-summary"><Button id="task-codex-manage" type="text" size="small" className={error || diagnostics.length ? 'task-codex-read-error' : undefined} aria-label="管理智能体会话" aria-haspopup="dialog" aria-expanded={viewActive && expanded} aria-controls={panelId} onClick={event => rememberOpener(event.currentTarget)} icon={error || diagnostics.length ? <ExclamationCircleOutlined /> : <LinkOutlined />}>智能体会话<span className="task-codex-status"> · {status}</span></Button>{relations.length !== 1 && <Button type="link" size="small" aria-haspopup="dialog" aria-expanded={viewActive && expanded} aria-controls={panelId} onClick={event => rememberOpener(event.currentTarget)}>{relations.length > 1 ? '打开会话' : '关联会话'}</Button>}</span>
    </Popover>
    {relations.length === 1 && openButton(relations[0], true)}
  </section>;
}
