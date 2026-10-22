import { useState } from 'react';
import { Alert, App, Button, Space, Tag } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { useAppShell } from '../../../app/AppShellContext';
import { useServiceRuntimeDetail } from '../hooks/useServiceRuntime';
import { isActiveRun, shortCommit } from '../model';
import { serviceRuntimeApi } from '../api/service-runtime-api';

type Props = {
  open: boolean;
  serviceCode: string | null;
  serviceName?: string;
  onClose(): void;
  onStarted?(): void;
};

/** 每个工作树最多一个受管运行实例；端口由 Buildr 在启动时分配。 */
export function StartWorktreeDrawer({ open, serviceCode, serviceName, onClose, onStarted }: Props) {
  const { workspaceId } = useAppShell();
  const { message } = App.useApp();
  const detail = useServiceRuntimeDetail(workspaceId, open ? serviceCode : null);
  const [starting, setStarting] = useState('');
  const [error, setError] = useState('');
  const worktrees = detail.data?.worktrees ?? [];
  const runs = detail.data?.service.runs ?? [];

  const start = async (worktreeId: string) => {
    if (!serviceCode) return;
    setStarting(worktreeId);
    setError('');
    try {
      const run = await serviceRuntimeApi.start(serviceCode, worktreeId);
      message.success(`已启动 ${run.worktreeLabel}，端口 :${run.actualPort}`);
      await detail.refresh({ silent: true });
      onStarted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败');
    } finally {
      setStarting('');
    }
  };

  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="本地运行"
    title="选择工作树启动"
    sub={serviceName && serviceCode ? `${serviceName} · ${serviceCode}` : ''}
    width={520}
    id="service-runtime-start-drawer"
    footer={<Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}><Button onClick={onClose}>取消</Button></Space>}
  >
    <div className="start-worktree-list">
      <p className="start-worktree-note">每个工作树最多保留一个受管运行实例。智能体在其任务工作树中启动的运行也会出现在这里。</p>
      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}
      {detail.error ? <Alert type="warning" showIcon message={detail.error} action={<Button size="small" onClick={() => void detail.refresh()}>重试</Button>} /> : null}
      {detail.loading && !detail.data ? <p className="start-worktree-note">正在读取检出目录…</p> : null}
      {!detail.loading && !worktrees.length && !detail.error ? <Alert type="info" showIcon message="没有可用检出目录" description="先准备代码库；服务检出目录可用后才能启动本地运行。" /> : null}
      {worktrees.map(worktree => {
        const run = runs.find(item => item.worktreeId === worktree.id && isActiveRun(item));
        return <div key={worktree.id} className="start-worktree-row" data-worktree-id={worktree.id}>
          <div className="start-worktree-main">
            <strong>{worktree.label}{worktree.taskTitle ? ` · ${worktree.taskTitle}` : ''}</strong>
            <code title={worktree.path}>{worktree.path}</code>
            <Space size={4} wrap>
              {worktree.branch ? <Tag>{worktree.branch}</Tag> : null}
              {worktree.head ? <Tag>{shortCommit(worktree.head)}</Tag> : null}
              {worktree.dirty ? <Tag color="gold">未提交改动</Tag> : null}
            </Space>
          </div>
          {run
            ? <div className="start-worktree-running"><Tag color={run.status === 'running' ? 'success' : 'processing'}>{run.status === 'running' ? `运行中 :${run.actualPort}` : `启动中 :${run.actualPort}`}</Tag><Button size="small" disabled>已在运行</Button></div>
            : <Button type="primary" icon={<PlayCircleOutlined />} loading={starting === worktree.id} disabled={Boolean(starting)} onClick={() => void start(worktree.id)}>启动</Button>}
        </div>;
      })}
      <p className="start-worktree-note">端口在启动时分配；首选端口被占用且运行定义声明了覆盖方式时，Buildr 会避让并记录实际端口。</p>
    </div>
  </DrawerShell>;
}
