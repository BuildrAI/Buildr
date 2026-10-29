import { Button, Space } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { CopyButton } from '../../../components/CopyButton';
import { useAppShell } from '../../../app/AppShellContext';
import { runtimeConfigurationPrompt } from '../configurationPrompt';
import { AgentDiscoveryContent } from './AgentDiscoveryContent';

type Props = {
  open: boolean;
  serviceCode: string | null;
  serviceName?: string;
  tone?: 'info' | 'warning' | 'error';
  reason?: string;
  onClose(): void;
};

/** 未接入时的复制交接；内部已受理或待核对的执行不进入此抽屉。 */
export function AgentDiscoveryDrawer({
  open,
  serviceCode,
  serviceName,
  tone = 'info',
  reason = '当前没有可用的内部智能体。复制指令后，发送给你正在使用的智能体。',
  onClose,
}: Props) {
  const { workspace } = useAppShell();
  const prompt = runtimeConfigurationPrompt({ workspace, serviceCode, serviceName });

  return <DrawerShell
    open={open}
    onClose={onClose}
    eyebrow="交给智能体"
    title="运行配置"
    sub={serviceName && serviceCode ? `${serviceName} · ${serviceCode}` : ''}
    width={560}
    id="service-runtime-discovery-drawer"
    footer={<div className="discovery-footer"><span role="status">尚未执行</span><Space><Button onClick={onClose}>关闭</Button><CopyButton type="primary" size="middle" text={prompt} disabled={!prompt} failureMessage="自动复制失败，请展开指令并选择文本复制。">复制指令</CopyButton></Space></div>}
  >
    <AgentDiscoveryContent prompt={prompt} tone={tone} reason={reason} />
  </DrawerShell>;
}
