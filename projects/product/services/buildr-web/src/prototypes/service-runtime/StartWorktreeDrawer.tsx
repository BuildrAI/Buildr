import { Button, Space, Tag } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../components/DrawerShell';
import type { Service } from './model';

type Props = {
  service: Service | null;
  open: boolean;
  onClose(): void;
  onStart(worktreeId: string): void;
};

export function StartWorktreeDrawer({ service, open, onClose, onStart }: Props) {
  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="本地运行"
    title="选择工作树启动"
    sub={service ? `${service.name} · ${service.code}` : ''}
    width={480}
    footer={<Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}><Button onClick={onClose}>取消</Button></Space>}
  >
    {service && <div className="start-worktree-list" data-prototype-position="start-worktree">
      <p className="start-worktree-note">每个工作树最多保留一个受管运行实例。智能体在其任务工作树中启动时，也会出现在这里。</p>
      {service.worktrees.map(worktree => {
        const run = service.runs.find(item => item.worktreeId === worktree.id);
        return <div key={worktree.id} className="start-worktree-row">
          <div className="start-worktree-main">
            <strong>{worktree.label}</strong>
            <code>{worktree.path}</code>
            <Space size={4} wrap>
              <Tag>{worktree.branch}</Tag>
              <Tag>{worktree.head}</Tag>
              {worktree.dirty && <Tag color="gold">未提交改动</Tag>}
            </Space>
          </div>
          {run
            ? <div className="start-worktree-running"><Tag color="success">运行中 :{run.actualPort}</Tag><Button size="small" disabled>已在运行</Button></div>
            : <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => onStart(worktree.id)}>启动</Button>}
        </div>;
      })}
      <p className="start-worktree-note">端口在启动时分配；首选端口被占用且服务声明了覆盖方式时，Buildr 会避让并记录实际端口。</p>
    </div>}
  </DrawerShell>;
}
