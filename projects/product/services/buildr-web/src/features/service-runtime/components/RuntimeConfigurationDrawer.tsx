import { Button, Space } from 'antd';
import { CommentOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { CopyButton } from '../../../components/CopyButton';
import { useAppShell } from '../../../app/AppShellContext';
import { runtimeConfigurationPrompt } from '../configurationPrompt';
import type { RuntimeConfigurationTarget } from '../configurationAction';
import type { RuntimeConfigurationFeedback } from '../hooks/useRuntimeConfiguration';
import type { RuntimeConfigurationPending } from '../runtimeConfigurationHandoff';
import { AgentDiscoveryContent } from './AgentDiscoveryContent';

type Props = {
  target: RuntimeConfigurationTarget | null;
  submitting: boolean;
  feedback: RuntimeConfigurationFeedback | null;
  pending: RuntimeConfigurationPending | null;
  onSubmit(): void;
  onClose(): void;
  onOpenConversation(): void;
};

/** 配置入口的统一交接抽屉：先说明目标和影响，确认后才创建对话并提交请求。 */
export function RuntimeConfigurationDrawer({ target, submitting, feedback, pending, onSubmit, onClose, onOpenConversation }: Props) {
  const { workspace } = useAppShell();
  const prompt = runtimeConfigurationPrompt({ workspace, serviceCode: target?.code ?? null, serviceName: target?.name });
  const copyFirst = Boolean(feedback?.copyFirst && prompt);
  // 该服务已有进行中的交接时只提供回到原对话，避免第二次提交。
  const inProgress = Boolean(target && pending && pending.code === target.code);
  const status = submitting ? '正在创建对话并提交，请稍候'
    : inProgress ? '配置进行中 · 请回到原对话查看进展'
    : copyFirst ? '尚未执行 · 可复制指令交给外部智能体'
    : '尚未执行 · 关闭不会产生改动';
  const copy = <CopyButton type="primary" size="middle" text={prompt} disabled={!prompt || submitting} failureMessage="自动复制失败，请展开指令并选择文本复制。">复制指令</CopyButton>;

  return <DrawerShell
    open={Boolean(target)}
    onClose={onClose}
    eyebrow="本地运行"
    title="运行配置"
    sub={target ? `${target.name} · ${target.code}` : ''}
    width={560}
    id="service-runtime-configuration-drawer"
    rootClassName="runtime-configuration-drawer"
    closeDisabled={submitting}
    maskClosable={!submitting}
    keyboard={!submitting}
    footer={<div className="discovery-footer">
      <span role="status">{status}</span>
      <Space>
        <Button disabled={submitting} onClick={onClose}>取消</Button>
        {inProgress
          ? <Button type="primary" icon={<CommentOutlined />} onClick={() => { onClose(); onOpenConversation(); }}>查看对话</Button>
          : copyFirst ? copy : <Button type="primary" loading={submitting} disabled={!prompt} onClick={onSubmit}>运行配置</Button>}
      </Space>
    </div>}
  >
    <AgentDiscoveryContent prompt={prompt} serviceCode={target?.code ?? null} workspaceName={workspace?.name} tone={feedback?.tone} reason={feedback?.message} inProgress={inProgress} />
  </DrawerShell>;
}
