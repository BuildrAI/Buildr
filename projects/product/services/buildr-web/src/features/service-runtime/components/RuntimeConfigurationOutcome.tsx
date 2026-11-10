import { useEffect } from 'react';
import { Button, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import { workspaceHref } from '../../../lib/labels';
import { useOptionalAgentConversations } from '../../agent-conversations/AgentConversationsContext';
import { createServiceRuntimeClient, SERVICE_RUNTIME_CHANGED } from '../api/service-runtime-api';
import { configurationOutcome } from '../configurationOutcome';
import { useRuntimeConfigurationPending } from '../hooks/useRuntimeConfiguration';
import { clearRuntimeConfigurationHandoff } from '../runtimeConfigurationHandoff.ts';
import { requestRuntimeConfigurationStart } from '../runtimeConfigurationStart.ts';

const POLL_MS = 3000;
const MAX_WAIT_MS = 30 * 60 * 1000;
const TERMINAL_RUN_STATUS = new Set(['completed', 'failed', 'stopped']);

/**
 * 只观察当前工作空间已交接的配置对话，挂载一次即可覆盖所有入口。
 * 完成反馈来自两个可核对事实：该执行已经结束，以及 Buildr 能读到该服务的运行定义。
 */
export function RuntimeConfigurationOutcome({ workspaceId }: { workspaceId: string | null }) {
  const pending = useRuntimeConfigurationPending(workspaceId);
  const conversations = useOptionalAgentConversations();
  const { notification } = App.useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!pending || !workspaceId || !conversations?.api) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const client = createServiceRuntimeClient(api, workspaceId);
    const resolve = () => { if (!cancelled) clearRuntimeConfigurationHandoff(workspaceId, pending.conversationId); };

    const finish = async (runStatus: string) => {
      try {
        const detail = await client.detail(pending.code, { standalone: true });
        if (cancelled) return;
        window.dispatchEvent(new CustomEvent(SERVICE_RUNTIME_CHANGED, { detail: { workspaceId } }));
        const outcome = configurationOutcome({
          serviceName: pending.name,
          runStatus,
          definition: detail.service.definition,
          definitionDiagnostic: detail.service.definitionDiagnostic,
          baseline: pending.baseline,
        });
        const serviceHref = workspaceHref(workspaceId, `/services/${encodeURIComponent(detail.service.id)}?view=runtime`);
        // 只有正常结束且已有可用定义时才给启动入口；验证未完成的配置不催促启动。
        const startable = Boolean(detail.service.definition) && (outcome.tone === 'success' || outcome.tone === 'info');
        const openStart = () => {
          if (!workspaceId) return;
          // 服务详情可能以目录旁预览呈现，导航地址无法稳定携带一次性动作，交给运行区按服务编码消费。
          requestRuntimeConfigurationStart(workspaceId, pending.code);
          navigate(serviceHref);
        };
        notification[outcome.tone]({
          message: outcome.title,
          description: outcome.description,
          duration: 8,
          placement: 'bottomRight',
          actions: startable
            ? [
                <Button key="start" size="small" type="primary" onClick={openStart}>启动本地</Button>,
                <Button key="service" size="small" type="link" onClick={() => navigate(serviceHref)}>查看服务</Button>,
              ]
            : <Button size="small" type="link" onClick={() => navigate(serviceHref)}>查看服务</Button>,
        });
      } catch {
        if (!cancelled) notification.warning({
          message: `「${pending.name}」配置结果尚未核对`,
          description: '本次执行已结束，但运行状态暂时无法读取；请回到服务页或对话确认结果。',
          duration: 8,
          placement: 'bottomRight',
        });
      } finally {
        resolve();
      }
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const view = await conversations.api.read(workspaceId, pending.conversationId);
        if (cancelled) return;
        const status = view.run?.status;
        if (status && TERMINAL_RUN_STATUS.has(status)) { await finish(status); return; }
      } catch (failure) {
        if (cancelled) return;
        // 原对话已被删除或不可访问：结束观察并说明，不把不可读当成配置完成或失败。
        if ((failure as { status?: number }).status === 404) {
          window.dispatchEvent(new CustomEvent(SERVICE_RUNTIME_CHANGED, { detail: { workspaceId } }));
          notification.warning({
            message: `「${pending.name}」配置结果无法核对`,
            description: '原配置对话已不可读取，可能已被删除。请查看服务运行定义，或重新发起运行配置。',
            duration: 8,
            placement: 'bottomRight',
          });
          resolve();
          return;
        }
        /* 其他读取失败保留待核对；下一次读取再判断，不据此宣布完成。 */
      }
      if (cancelled) return;
      if (Date.now() - Date.parse(pending.startedAt) >= MAX_WAIT_MS) {
        notification.info({
          message: `「${pending.name}」运行配置仍在进行`,
          description: '本次执行尚未结束。可在对话中查看进展或回答智能体的请求。',
          duration: 8,
          placement: 'bottomRight',
        });
        resolve();
        return;
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };

    timer = setTimeout(() => void tick(), POLL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [pending, workspaceId, conversations?.api, notification, navigate]);

  return null;
}
