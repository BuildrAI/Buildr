import { useState } from 'react';
import { Alert, Button, Input, Space, Typography } from 'antd';
import { CopyOutlined, ScanOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../components/DrawerShell';
import type { Service } from './model';

type Props = {
  service: Service | null;
  open: boolean;
  onClose(): void;
};

export function AgentDiscoveryDrawer({ service, open, onClose }: Props) {
  const [notice, setNotice] = useState('');
  const prompt = service
    ? `请使用 service-runtime 技能为「${service.name}」（${service.code}）配置本地启动方式：先读取服务登记、代码库、AGENTS.md、构建配置、运行配置、脚本和已有运行记录；形成候选命令、工作目录、profile、端口覆盖方式、就绪检查和已知共享环境副作用。先只读调查，再在明确授权下实际启动验证；验证后写入服务级运行定义并报告证据。不要部署，不要读取连接秘密，不要修改 Nacos、流量或 MQ 配置。`
    : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice('指令已复制。');
    } catch {
      setNotice('自动复制失败，请选择文本复制。');
    }
  };

  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="交给智能体"
    title="运行配置"
    sub={service ? `${service.name} · ${service.code}` : ''}
    width={560}
    footer={<Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}><Button onClick={onClose}>关闭</Button></Space>}
  >
    <div className="discovery-drawer" data-prototype-position="discovery">
      <Alert
        type="info"
        showIcon
        icon={<ScanOutlined />}
        message="这一步不是手动填命令"
        description="智能体会从真实仓库事实形成候选，并实际启动验证；Buildr Web 只在验证后提供确定性的启动按钮。"
      />
      <ul className="discovery-steps">
        <li>读取仓库脚本、构建配置、运行 profile、IDE 配置和已有运行记录</li>
        <li>核对工作目录、端口、就绪信号和共享环境副作用</li>
        <li>不读取连接秘密、不部署、不修改 Nacos 注册、流量或 MQ</li>
      </ul>
      <div className="config-field">
        <label>可交给智能体的指令</label>
        <Input.TextArea value={prompt} readOnly autoSize={{ minRows: 7, maxRows: 10 }} />
      </div>
      <Space wrap>
        <Button type="primary" icon={<CopyOutlined />} onClick={() => void copy()}>复制指令</Button>
      </Space>
      {notice && <Typography.Text type="secondary">{notice}</Typography.Text>}
      <div className="discovery-note">
        首期不提供手动配置入口；配置结果有误时重新运行配置。后续按真实纠错需要再评估手动字段。
      </div>
    </div>
  </DrawerShell>;
}
