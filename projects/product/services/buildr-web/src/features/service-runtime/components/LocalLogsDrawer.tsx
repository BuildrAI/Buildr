import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { isActiveRun, runFailure, shortCommit } from '../model';
import { serviceRuntimeApi, type ManagedRun, type RunLogResponse } from '../api/service-runtime-api';

type Props = {
  open: boolean;
  run: ManagedRun | null;
  serviceName?: string;
  onClose(): void;
};

const LOG_REFRESH_MS = 2000;

/** 日志是 Buildr 托管进程的标准输出与错误输出，只保存在本机。 */
export function LocalLogsDrawer({ open, run, serviceName, onClose }: Props) {
  const [data, setData] = useState<RunLogResponse | null>(null);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLPreElement | null>(null);

  const load = useCallback(async (silent: boolean) => {
    if (!run) return;
    if (!silent) setError('');
    try {
      const next = await serviceRuntimeApi.log(run.id);
      setData(next);
      const element = bodyRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : '日志暂时不可用');
    }
  }, [run]);

  useEffect(() => {
    if (!open || !run) { setData(null); return; }
    void load(false);
    if (!isActiveRun(run)) return;
    const timer = setInterval(() => void load(true), LOG_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, run, load]);

  const current = data?.record ?? run;
  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="本地运行"
    title="本地日志"
    sub={serviceName && current ? `${serviceName} · ${current.worktreeLabel}` : ''}
    width={680}
    id="service-runtime-log-drawer"
    footer={<Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
      <Button onClick={() => void load(true)}>刷新</Button>
      <Button onClick={onClose}>关闭</Button>
    </Space>}
  >
    {current ? <div className="local-logs">
      <div className="local-logs-meta">
        <Tag color={current.status === 'running' ? 'success' : current.status === 'starting' ? 'processing' : current.status === 'failed' ? 'error' : undefined}>
          {current.status === 'running' ? `运行中 :${current.actualPort}` : current.status === 'starting' ? `启动中 :${current.actualPort}` : current.status === 'failed' ? '失败' : '已停止'}
        </Tag>
        <span>{formatShortDateTime(current.startedAt)}</span>
        <span>{current.branch ?? '—'} · {shortCommit(current.head)}</span>
        <span className="directory-muted">{current.portNote}</span>
      </div>
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load(false)}>重试</Button>} /> : null}
      {current.failure ? <Alert type="warning" showIcon message={runFailure(current)} /> : null}
      <pre className="local-log-lines" ref={bodyRef}>{data?.log || (data && !data.log ? '暂无输出。' : '正在读取日志…')}</pre>
      {data?.truncated ? <p className="local-logs-note">日志较长，只显示最新 {Math.round(data.maxBytes / 1024)} KB；完整内容保存在本机 <code>{current.logPath}</code>。</p> : null}
      <p className="local-logs-note"><FileTextOutlined /> 日志是 Buildr 托管进程的标准输出与错误输出，智能体通过托管启动的运行同样在这里；只保存在本机，不管理 Nacos 注册、流量或 MQ。</p>
    </div> : null}
  </DrawerShell>;
}
