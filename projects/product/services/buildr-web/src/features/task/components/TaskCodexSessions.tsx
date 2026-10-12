import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { CopyOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { codexRouteHref } from '../../../app/codex-navigation';
import { copyText } from '../../../lib/copyText';
import { codexDesktopApi, codexSessionHref, type CodexSessionRelation } from '../../agents/api/codex-desktop-api';
import './task-codex-sessions.css';

export function TaskCodexSessions({workspaceId, taskId}: {workspaceId: string; taskId: string}) {
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
  return <section className="task-codex-sessions" id="task-codex-sessions" data-task-codex-id={taskId}>
    <header><div className="task-codex-title"><LinkOutlined /> <strong>Codex 聊天</strong>{relations.length > 0 && <span>{relations.length}</span>}{!loading && !relations.length && !error && <span className="task-codex-empty">尚未关联聊天</span>}</div><div className="task-codex-actions"><Button size="small" type="text" aria-label="复制任务链接" icon={<CopyOutlined />} onClick={() => void copyTask()}>复制任务链接</Button><Button size="small" type="text" aria-expanded={expanded} aria-controls={`task-codex-association-${taskId}`} onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '关联聊天'}</Button><Button type="text" size="small" aria-label="刷新聊天关联" icon={<ReloadOutlined />} loading={loading} disabled={Boolean(busy)} onClick={() => void refresh()} /></div></header>
    {error && <Alert type="warning" showIcon message={error} />}
    {loading && !relations.length && <Spin size="small" />}
    {relations.length > 0 && <ul>{relations.map(relation => {
      const href = codexSessionHref(relation.nativeSessionId);
      return <li key={relation.id} data-codex-session={relation.nativeSessionId}><div><strong>Codex 聊天</strong><code>{relation.nativeSessionId}</code></div><div><Button size="small" type="link" href={href || undefined} disabled={!href}>打开原聊天</Button><Button size="small" type="text" disabled={Boolean(busy)} loading={busy === relation.id} onClick={() => void unlink(relation)}>解除关联</Button></div></li>;
    })}</ul>}
    {expanded && <div className="task-codex-association" id={`task-codex-association-${taskId}`}>
      <p className="task-codex-caption">在你希望关联的 Codex 聊天中发送下面这句话，即可关联当前聊天与本任务。</p>
      <div className="task-codex-request"><code>{requestText}</code><Button id="task-codex-copy-association" size="small" aria-label="复制关联请求" icon={<CopyOutlined />} onClick={() => void copyAssociation()}>复制关联请求</Button></div>
    </div>}
    {feedback && <p className="task-codex-feedback" role="status">{feedback}</p>}
  </section>;
}
