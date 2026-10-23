import { Button, Space, Tag, Typography } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../components/DrawerShell';
import type { LocalRun, Service } from './model';
import { worktreeOf } from './model';

type Props = {
  service: Service | null;
  run: LocalRun | null;
  open: boolean;
  onClose(): void;
};

export function LocalLogsDrawer({ service, run, open, onClose }: Props) {
  const worktree = service && run ? worktreeOf(service, run) : null;
  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="本地运行"
    title="本地日志"
    sub={service && worktree ? `${service.name} · ${worktree.label}` : ''}
    width={620}
    footer={<Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}><Button onClick={onClose}>关闭</Button></Space>}
  >
    {service && run && worktree && <div className="local-logs" data-prototype-position="logs">
      <div className="local-logs-meta">
        <Tag color="success">运行中 :{run.actualPort}</Tag>
        <span>{run.startedAt}</span>
        <span>{worktree.branch} · {worktree.head}</span>
      </div>
      <pre className="local-log-lines">{run.logs.join('\n')}</pre>
      <p className="local-logs-note"><FileTextOutlined /> 日志是 Buildr 托管进程的标准输出与错误输出，智能体通过托管启动的运行同样在这里；只保存在本机，不管理 Nacos 注册、流量或 MQ。</p>
      <Typography.Text type="secondary" className="config-save-note">
        原型展示虚构日志，不读取真实进程输出。
      </Typography.Text>
    </div>}
  </DrawerShell>;
}
