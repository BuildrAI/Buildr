import { App } from 'antd';
import { useCallback, useRef, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { useOptionalAgentConversations } from '../../agent-conversations/AgentConversationsContext';
import { SERVICE_RUNTIME_CHANGED } from '../api/service-runtime-api';
import { executeRuntimeConfiguration, type RuntimeConfigurationTarget } from '../configurationAction';

export type RuntimeConfigurationDiscovery = RuntimeConfigurationTarget & {
  tone: 'info' | 'warning' | 'error';
  message: string;
};

/** 三个服务入口共用提交、复制与刷新语义；本钩子只持有当前页的展示状态。 */
export function useRuntimeConfiguration() {
  const { workspaceId, workspace } = useAppShell();
  const conversations = useOptionalAgentConversations();
  const { message } = App.useApp();
  const [pendingCode, setPendingCode] = useState('');
  const [discovery, setDiscovery] = useState<RuntimeConfigurationDiscovery | null>(null);
  const pending = useRef(false);

  const configure = useCallback(async (service: RuntimeConfigurationTarget) => {
    if (pending.current) return;
    pending.current = true; setPendingCode(service.code); setDiscovery(null);
    try {
      const result = await executeRuntimeConfiguration({ workspaceId, workspace, service, start: conversations?.startTextConversation });
      if (result.status === 'copy') { setDiscovery({ ...service, tone: result.tone, message: result.message }); return; }
      if (result.status === 'busy') { message.info(result.message); return; }
      if (result.status === 'recovering') { message.warning(result.message); return; }
      if (result.status === 'started' && workspaceId && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SERVICE_RUNTIME_CHANGED, { detail: { workspaceId } }));
      }
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : '配置提交结果待核对，请先查看原对话，不要重复提交。');
    } finally {
      pending.current = false; setPendingCode('');
    }
  }, [workspaceId, workspace, conversations?.startTextConversation, message]);

  return { configure, pendingCode, discovery, closeDiscovery: useCallback(() => setDiscovery(null), []) };
}
