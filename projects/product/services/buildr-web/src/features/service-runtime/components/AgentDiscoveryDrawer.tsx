import { useState } from 'react';
import { Alert, App, Button, Input, Space, Typography } from 'antd';
import { CopyOutlined, ScanOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { copyText } from '../../../lib/copyText';
import { useAppShell } from '../../../app/AppShellContext';
import { runtimeConfigurationPrompt } from '../configurationPrompt';

type Props = {
  open: boolean;
  serviceCode: string | null;
  serviceName?: string;
  onClose(): void;
};

/** 首期不提供手动配置入口；运行定义只来自智能体发现并实际验证。 */
export function AgentDiscoveryDrawer({ open, serviceCode, serviceName, onClose }: Props) {
  const { message } = App.useApp();
  const { workspace } = useAppShell();
  const [notice, setNotice] = useState('');
  const prompt = runtimeConfigurationPrompt({ workspace, serviceCode, serviceName });

  const copy = async () => {
    if (!prompt) return;
    if (await copyText(prompt)) {
      setNotice('指令已复制。');
      message.success('指令已复制');
    } else {
      setNotice('自动复制失败，请选择文本复制。');
    }
  };

  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="交给智能体"
    title="运行配置"
    sub={serviceName && serviceCode ? `${serviceName} · ${serviceCode}` : ''}
    width={560}
    id="service-runtime-discovery-drawer"
    footer={<Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}><Button onClick={onClose}>关闭</Button></Space>}
  >
    <div className="discovery-drawer">
      <Alert
        type="info"
        showIcon
        icon={<ScanOutlined />}
        message="交给智能体配置并验证"
        description="复制指令后，发送给你正在使用的智能体（Agent）。完成后回到“本地运行”查看配置结果。"
      />
      <ul className="discovery-steps">
        <li>读取当前工作空间的服务登记、真实代码和已有运行定义</li>
        <li>核对启动方式；需要切换后端时验证本地与远程连接</li>
        <li>保留已有运行与无关配置，说明已验证结果和剩余缺口</li>
      </ul>
      {!prompt ? <Alert type="warning" showIcon message="当前工作空间路径尚未读取，请关闭后重试。" /> : null}
      <div className="config-field">
        <label>可交给智能体的指令</label>
        <Input.TextArea aria-label="运行配置指令" value={prompt} readOnly autoSize={{ minRows: 7, maxRows: 10 }} />
      </div>
      <Space wrap>
        <Button type="primary" icon={<CopyOutlined />} disabled={!prompt} onClick={() => void copy()}>复制指令</Button>
      </Space>
      {notice ? <Typography.Text type="secondary">{notice}</Typography.Text> : null}
      <div className="discovery-note">已有配置会先被检查，再按需要调整。保存新配置不会自动重启正在运行的实例。</div>
    </div>
  </DrawerShell>;
}
