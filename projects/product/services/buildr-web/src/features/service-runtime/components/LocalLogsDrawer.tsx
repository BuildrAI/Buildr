import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Input, Space, Switch, Tag } from 'antd';
import { CopyOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { useAppShell } from '../../../app/AppShellContext';
import { api } from '../../../api';
import { copyText } from '../../../lib/copyText';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { RUN_STATUS_COLOR, RUN_STATUS_LABEL, filterRunLog, isActiveRun, runFailure, shortCommit, sourceLabel } from '../model';
import { createServiceRuntimeClient, type ManagedRun, type RunLogResponse } from '../api/service-runtime-api';

type Props = { open: boolean; run: ManagedRun | null; serviceName?: string; onClose(): void };
const LOG_REFRESH_MS = 2000;

/** 日志读取绑定工作空间和运行编号；关闭、换实例或迟到请求不会串入其他输出。 */
export function LocalLogsDrawer({ open, run, serviceName, onClose }: Props) {
  const { workspaceId } = useAppShell();
  const { message } = App.useApp();
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  const [data, setData] = useState<RunLogResponse | null>(null);
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(true);
  const bodyRef = useRef<HTMLPreElement | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const identity = open && run ? JSON.stringify([workspaceId, run.id]) : '';
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const runId = run?.id;
  const load = useCallback(async (silent = false) => {
    if (!identity || !runId || currentIdentity.current !== identity) return;
    if (silent && controller.current) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const current = ++generation.current;
    try {
      const next = await client.log(runId, undefined, { signal: abort.signal });
      if (!abort.signal.aborted && current === generation.current && currentIdentity.current === identity) { setData(next); setLoadedIdentity(identity); setError(''); }
    } catch (cause) {
      if (!abort.signal.aborted && current === generation.current && currentIdentity.current === identity) setError(cause instanceof Error ? cause.message : '日志暂时不可用');
    } finally { if (controller.current === abort) controller.current = null; }
  }, [client, identity, runId]);
  useEffect(() => {
    setData(null); setLoadedIdentity(''); setError(''); setQuery(''); setFollow(true);
    if (identity) void load();
    return () => { generation.current += 1; controller.current?.abort(); controller.current = null; };
  }, [identity, load]);
  const current = data && loadedIdentity === identity && data.record.id === runId && identity ? data.record : run;
  const active = current ? isActiveRun(current) : false;
  useEffect(() => {
    if (!identity || !active) return;
    const timer = setInterval(() => void load(true), LOG_REFRESH_MS);
    return () => clearInterval(timer);
  }, [identity, active, load]);
  const log = data && loadedIdentity === identity && data.record.id === runId && identity ? data.log : '';
  const filtered = useMemo(() => filterRunLog(log, query), [log, query]);
  useEffect(() => { if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [filtered, follow, identity]);
  return <DrawerShell open={open} onClose={onClose} eyebrow="本地运行" title="本地日志" sub={serviceName && current ? `${serviceName} · ${sourceLabel(current)}` : ''} width={760} id="service-runtime-log-drawer" footer={<Space className="local-logs-footer"><Button onClick={() => void load()}>刷新</Button><Button onClick={onClose}>关闭</Button></Space>}>
    {current ? <div className="local-logs">
      <div className="local-logs-meta"><Tag color={RUN_STATUS_COLOR[current.status]}>{RUN_STATUS_LABEL[current.status]} :{current.actualPort}</Tag><span>{formatShortDateTime(current.startedAt)}</span><span>{current.branch || '分支未记录'} · {shortCommit(current.head)}</span><code>{current.worktreePath}</code></div>
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load()}>重试</Button>} /> : null}
      {current.failure ? <Alert type="warning" showIcon message={runFailure(current)} /> : null}
      <div className="local-logs-toolbar"><Input aria-label="搜索本实例日志" allowClear prefix={<SearchOutlined />} placeholder="搜索本实例日志" value={query} onChange={event => { setQuery(event.target.value); if (event.target.value) setFollow(false); }} /><Space><span>跟随输出</span><Switch size="small" checked={follow} aria-label="跟随日志输出" onChange={setFollow} /><Button size="small" icon={<CopyOutlined />} disabled={!filtered} onClick={async () => { if (await copyText(filtered)) message.success('日志已复制'); else message.error('复制失败，请选择日志文本复制'); }}>复制{query ? '匹配日志' : '日志'}</Button></Space></div>
      <pre className="local-log-lines" ref={bodyRef}>{filtered || (data ? query ? '没有匹配的日志。' : '暂无输出。' : error ? '日志读取失败，请重试。' : '正在读取日志…')}</pre>
      {data?.truncated ? <p className="local-logs-note">只显示最新 {Math.round(data.maxBytes / 1024)} KB；完整日志保存在本机 <code>{current.logPath}</code>。</p> : null}
      <p className="local-logs-note"><FileTextOutlined />仅当前受管进程的标准输出与错误输出，保存在本机。搜索只针对当前已加载片段。</p>
    </div> : null}
  </DrawerShell>;
}
