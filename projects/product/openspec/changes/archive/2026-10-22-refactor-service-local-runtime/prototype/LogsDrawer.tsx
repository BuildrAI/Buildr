import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Space, Switch, Tag, Tooltip } from 'antd';
import { ArrowDownOutlined, CheckOutlined, CopyOutlined, SearchOutlined } from '@ant-design/icons';
import { DrawerShell } from '@product/components/DrawerShell';
import { logLines, type Run, type RuntimeService } from './model';

const statuses: Record<Run['status'], { label: string; color?: string }> = {
  starting: { label: '启动中', color: 'processing' },
  running: { label: '已就绪', color: 'success' },
  stopping: { label: '停止中', color: 'warning' },
  stopped: { label: '已停止' },
  failed: { label: '启动失败', color: 'error' },
};

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // A local preview may disallow the Clipboard API. Preserve an explicit copy action.
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0';
  field.setAttribute('aria-hidden', 'true');
  document.body.appendChild(field);
  field.focus();
  field.select();
  try {
    if (!document.execCommand('copy')) throw new Error('copy-unavailable');
  } finally {
    field.remove();
  }
}

export function LogsDrawer({
  open,
  run,
  service,
  backendTarget,
  onClose,
}: {
  open: boolean;
  run: Run | null;
  service: RuntimeService | null;
  backendTarget?: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(true);
  const [copyResult, setCopyResult] = useState<'idle' | 'success' | 'failure'>('idle');
  const output = useRef<HTMLPreElement>(null);
  const sequence = useRef(0);
  const id = run?.id;
  const status = run?.status;
  const previousStatus=useRef<string|undefined>(undefined);
  const worktree = service?.worktrees.find(item => item.id === run?.worktreeId);
  const displayStatus = status ? statuses[status] : null;

  useEffect(() => {
    const initialLines = run && service ? logLines(run, service).slice(-100) : [];
    setLines(backendTarget
      ? initialLines.map(line => line.replace(/http:\/\/(?:127\.0\.0\.1|localhost):8081\b|https:\/\/qa-gateway\.example\.com\b/g, () => backendTarget))
      : initialLines);
    setQuery('');
    setFollow(true);
    setCopyResult('idle');
    sequence.current = 0;previousStatus.current=status;
  }, [id, backendTarget]);

  useEffect(() => {
    if(!status||previousStatus.current===status)return;
    previousStatus.current=status;
    const time=new Date().toLocaleTimeString('zh-CN',{hour12:false});
    const text=status==='failed'?`${time}  ERROR  ${run?.failure||'服务未通过就绪检查'}`:status==='running'?`${time}  INFO  服务已通过就绪检查，可以访问页面`:`${time}  INFO  运行状态：${statuses[status].label}`;
    setLines(previous=>[...previous,text].slice(-100));
  },[id,status]);

  useEffect(() => {
    if (!open || !id || (status !== 'starting' && status !== 'running')) return;
    const timer = window.setInterval(() => {
      sequence.current += 1;
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const text = status === 'starting'
        ? `${time}  INFO  正在等待服务就绪，检查访问地址…`
        : `${time}  INFO  请求已完成  GET /api/health  200  ${12 + (sequence.current % 5) * 3}ms`;
      setLines(previous => [...previous, text].slice(-100));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [open, id, status]);

  useEffect(() => {
    if (follow && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [lines, follow, open]);

  useEffect(() => {
    if (copyResult === 'idle') return;
    const timer = window.setTimeout(() => setCopyResult('idle'), 2600);
    return () => window.clearTimeout(timer);
  }, [copyResult]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? lines.filter(line => line.toLocaleLowerCase().includes(needle)) : lines;
  }, [lines, query]);

  const handleCopy = async () => {
    try {
      await copyText(filtered.join('\n'));
      setCopyResult('success');
    } catch {
      setCopyResult('failure');
    }
  };

  return (
    <DrawerShell
      open={open}
      width={640}
      title="本地日志"
      sub={service ? `${service.name} · ${worktree?.label ?? '运行实例'}` : undefined}
      onClose={onClose}
      footer={<div style={{ color: 'var(--text-muted, #858080)', fontSize: 12 }}>日志仅保存在本机 · 保留最近 100 行</div>}
    >
      <div className="lr-logs" data-prototype-position="local-logs" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Space size={8} wrap>
            {displayStatus ? <Tag color={displayStatus.color} style={{ margin: 0 }}>{displayStatus.label}</Tag> : null}
            {run ? <span style={{ color: 'var(--text-secondary, #706b70)', fontSize: 12 }}>端口 {run.port}</span> : null}
            {worktree ? <span style={{ color: 'var(--text-secondary, #706b70)', fontSize: 12 }}>分支 {worktree.branch}</span> : null}
          </Space>
          <Tooltip title={query ? '复制筛选后的日志' : '复制当前日志'}>
            <Button size="small" icon={copyResult === 'success' ? <CheckOutlined /> : <CopyOutlined />} onClick={handleCopy} disabled={filtered.length === 0}>
              {copyResult === 'success' ? '已复制' : '复制日志'}
            </Button>
          </Tooltip>
        </div>

        <div className="lr-log-tools" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#aaa' }} />}
            placeholder="搜索日志"
            aria-label="搜索日志"
            value={query}
            allowClear
            onChange={event => {
              setQuery(event.target.value);
              if (event.target.value) setFollow(false);
            }}
            style={{ flex: 1 }}
          />
          <Space size={7} style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary, #706b70)', fontSize: 12 }}>
            <Switch size="small" checked={follow} onChange={setFollow} aria-label="自动跟随日志" />
            自动跟随
          </Space>
        </div>

        <div style={{ position: 'relative' }}>
          <pre
            ref={output}
            className="lr-log-output"
            tabIndex={0}
            aria-label="日志内容"
            onScroll={event => {
              const target = event.currentTarget;
              if (follow && target.scrollHeight - target.scrollTop - target.clientHeight > 48) setFollow(false);
            }}
            style={{ margin: 0, minHeight: 300, height: 'min(560px, calc(100vh - 330px))', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#242329', color: '#e2dfe9', border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, padding: '18px 18px 64px', fontSize: 12, lineHeight: 1.9, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          >
            {filtered.length ? filtered.join('\n') : query ? '没有匹配的日志，试试其他关键词。' : '暂无日志。'}
          </pre>
          {!follow ? (
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              style={{ position: 'absolute', right: 14, bottom: 14, borderColor: '#61576c', background: '#f5eefb', color: '#62516e' }}
              onClick={() => setFollow(true)}
            >恢复跟随</Button>
          ) : null}
        </div>

        <div aria-live="polite" style={{ display: 'flex', justifyContent: 'space-between', minHeight: 18, fontSize: 12, color: copyResult === 'failure' ? '#b54c5f' : 'var(--text-muted, #918991)' }}>
          <span>{query ? `找到 ${filtered.length} 行 · 共 ${lines.length} 行` : `共 ${lines.length} 行`}</span>
          <span>{copyResult === 'failure' ? '复制未完成，请选择日志文字后手动复制。' : follow ? '正在跟随最新日志' : '已暂停跟随，可自由滚动查看'}</span>
        </div>
      </div>
    </DrawerShell>
  );
}
