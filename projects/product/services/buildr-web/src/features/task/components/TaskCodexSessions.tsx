import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Button, Popover } from 'antd';
import { CloseOutlined, CopyOutlined, ExclamationCircleOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { codexRouteHref } from '../../../app/codex-navigation';
import { copyText } from '../../../lib/copyText';
import { codexDesktopApi, codexSessionHref, type CodexSessionRelation } from '../../agents/api/codex-desktop-api';
import './task-codex-sessions.css';

export function TaskCodexSessions({workspaceId, taskId}: {workspaceId: string; taskId: string}) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const panelRef = useRef<HTMLDivElement>(null), opener = useRef<HTMLElement | null>(null);
  const [relations, setRelations] = useState<CodexSessionRelation[]>([]);
  const [expanded, setExpanded] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [feedback, setFeedback] = useState('');
  const mounted = useRef(false), serial = useRef(0), writing = useRef(false);
  const scope = useRef({workspaceId, taskId}); scope.current = {workspaceId, taskId};
  const requestText = `把当前会话关联到 Buildr 任务 ${taskId}。`;
  const taskHref = codexRouteHref(workspaceId, {pathname: `/workspaces/${workspaceId}/tasks/${encodeURIComponent(taskId)}`, search: '', hash: ''});
  const refresh = useCallback(async (silent = false) => {
    const request = ++serial.current;
    if (!silent) setLoading(true);
    try {
      const sessions = await codexDesktopApi.sessions(workspaceId, taskId);
      if (sessions.workspaceId !== workspaceId || sessions.relations.some(item => item.workspaceId !== workspaceId || item.taskId !== taskId)) throw new Error('聊天关联响应与当前任务不匹配，未显示其他任务的数据。');
      if (mounted.current && request === serial.current) {setRelations(sessions.relations); setError('');}
    } catch (failure) {if (mounted.current && request === serial.current) setError(failure instanceof Error ? failure.message : '无法读取 Codex 聊天关联。');}
    finally {if (mounted.current && request === serial.current) setLoading(false);}
  }, [workspaceId, taskId]);
  useEffect(() => {
    mounted.current = true; setRelations([]); setExpanded(false); setFeedback(''); setError('');
    void refresh();
    const observe = () => {if (document.visibilityState === 'visible') void refresh(true);};
    window.addEventListener('focus', observe); document.addEventListener('visibilitychange', observe);
    return () => {mounted.current = false; ++serial.current; window.removeEventListener('focus', observe); document.removeEventListener('visibilitychange', observe);};
  }, [workspaceId, taskId, refresh]);
  useEffect(() => {if (!viewActive) setExpanded(false);}, [viewActive]);
  useEffect(() => {
    if (expanded && viewActive && panelRef.current && !panelRef.current.contains(document.activeElement) && document.activeElement === document.body) panelRef.current.focus({preventScroll: true});
  }, [expanded, viewActive, relations.length]);
  const unlink = async (relation: CodexSessionRelation) => {
    if (writing.current) return;
    writing.current = true; setBusy(relation.id); setError(''); setFeedback('');
    try {await codexDesktopApi.unlink(workspaceId, relation); if (mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId) {setFeedback('已解除关联，聊天和任务内容仍保留。'); await refresh(true);}}
    catch (failure) {if (mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId) {await refresh(true); if (mounted.current && scope.current.workspaceId === workspaceId && scope.current.taskId === taskId) setError(failure instanceof Error ? failure.message : '解除未完成，当前关联已重新读取。');}}
    finally {writing.current = false; if (mounted.current) setBusy('');}
  };
  const copyTask = async () => setFeedback(taskHref && await copyText(window.location.origin + taskHref) ? '任务链接已复制，可放到 Codex 聊天中打开。' : '未能复制任务链接。');
  const copyAssociation = async () => {
    const text = requestText + (taskHref ? `\n任务链接：${window.location.origin}${taskHref}` : '');
    setFeedback(await copyText(text) ? '关联请求已复制，请在要关联的 Codex 聊天中发送。' : '未能复制关联请求，请复制上面的文字。');
  };
  const closePanel = () => {setExpanded(false); if (opener.current?.isConnected) opener.current.focus({preventScroll: true});};
  const rememberOpener = (element: HTMLElement) => {opener.current = element;};
  const singleHref = relations.length === 1 ? codexSessionHref(relations[0].nativeSessionId) : null;
  const panelId = 'task-codex-panel-' + taskId;
  const status = error ? '读取失败' : loading && !relations.length ? '读取中…' : relations.length ? String(relations.length) : '尚未关联聊天';
  const panel = <div className="task-codex-panel" id={panelId} ref={panelRef} role="dialog" aria-label="Codex 聊天关联" tabIndex={-1} onKeyDown={event => {if (event.key === 'Escape') {event.stopPropagation(); closePanel();}}}>
    <header><strong>Codex 聊天</strong><Button type="text" size="small" aria-label="关闭聊天关联" icon={<CloseOutlined />} onClick={closePanel} /></header>
    {error && <Alert type="warning" showIcon message={error} />}
    {relations.length > 0 ? <>
      <p className="task-codex-panel-caption">{error ? '上次读取的关联' : '已关联聊天'} · {relations.length}</p>
      <ul>{relations.map((relation, index) => {
        const href = codexSessionHref(relation.nativeSessionId);
        return <li key={relation.id} data-codex-session={relation.nativeSessionId}>
          <div><strong>聊天 {index + 1}</strong><code>{relation.nativeSessionId}</code></div>
          <div><Button size="small" type="link" href={href || undefined} disabled={!href}>打开聊天</Button><Button size="small" type="text" disabled={Boolean(busy)} loading={busy === relation.id} onClick={() => void unlink(relation)}>解除关联</Button></div>
        </li>;
      })}</ul>
    </> : <p className="task-codex-panel-caption">{loading ? '正在读取聊天关联…' : error ? '请刷新后重试。' : '尚未关联聊天'}</p>}
    <div className="task-codex-panel-tools"><Button size="small" type="text" aria-label="复制任务链接" icon={<CopyOutlined />} onClick={() => void copyTask()}>复制任务链接</Button><Button type="text" size="small" aria-label="刷新聊天关联" icon={<ReloadOutlined />} loading={loading} disabled={Boolean(busy)} onClick={() => void refresh()}>刷新</Button></div>
    <div className="task-codex-association">
      <p className="task-codex-panel-caption">在要关联的 Codex 聊天中发送：</p>
      <code>{requestText}</code>
      <Button id="task-codex-copy-association" size="small" aria-label="复制关联请求" icon={<CopyOutlined />} onClick={() => void copyAssociation()}>复制关联请求</Button>
    </div>
    {feedback && <p className="task-codex-feedback" role="status">{feedback}</p>}
  </div>;
  return <section className="task-codex-sessions" id="task-codex-sessions" data-task-codex-id={taskId}>
    <Popover trigger="click" placement="bottomLeft" arrow={false} autoAdjustOverflow destroyOnHidden overlayClassName="task-codex-popover" open={viewActive && expanded} onOpenChange={next => setExpanded(viewActive && next)} afterOpenChange={visible => {if (visible) panelRef.current?.focus({preventScroll: true});}} content={panel}>
      <span className="task-codex-summary">
        <Button id="task-codex-manage" type="text" size="small" className={error ? 'task-codex-read-error' : undefined} aria-label="管理 Codex 聊天" aria-haspopup="dialog" aria-expanded={viewActive && expanded} aria-controls={panelId} onClick={event => rememberOpener(event.currentTarget)} icon={error ? <ExclamationCircleOutlined /> : <LinkOutlined />}>Codex 聊天<span className="task-codex-status"> · {status}</span></Button>
        {relations.length !== 1 && <Button type="link" size="small" aria-haspopup="dialog" aria-expanded={viewActive && expanded} aria-controls={panelId} onClick={event => rememberOpener(event.currentTarget)}>{relations.length > 1 ? '打开聊天' : '关联聊天'}</Button>}
      </span>
    </Popover>
    {relations.length === 1 && <Button id="task-codex-open-single" type="link" size="small" href={singleHref || undefined} disabled={!singleHref}>打开聊天</Button>}
  </section>;
}
