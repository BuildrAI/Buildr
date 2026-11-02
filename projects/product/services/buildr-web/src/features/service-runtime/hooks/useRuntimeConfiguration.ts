import { App } from 'antd';
import { useCallback, useRef, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { useOptionalAgentConversations } from '../../agent-conversations/AgentConversationsContext';
import { SERVICE_RUNTIME_CHANGED } from '../api/service-runtime-api';
import { runtimeDefinitionSignature } from '../configurationOutcome.ts';
import { executeRuntimeConfiguration, type RuntimeConfigurationTarget } from '../configurationAction';

export type RuntimeConfigurationFeedback = {
  tone: 'info' | 'warning' | 'error';
  message: string;
  /** 提交前没有可用执行入口时，把复制指令作为主要交接方式。 */
  copyFirst: boolean;
};

/** 已交接的这次配置；完成反馈只观察该对话与运行定义，不另写业务状态。 */
export type RuntimeConfigurationPending = {
  code: string;
  name: string;
  conversationId: string;
  /** 交接前的运行定义快照；null 表示首次配置。 */
  baseline: string | null;
  startedAt: string;
};

/** 三个服务入口共用“先说明、确认后提交”的交接；本钩子只持有当前页的待确认目标、提交状态和待完成观察。 */
export function useRuntimeConfiguration() {
  const { workspaceId, workspace } = useAppShell();
  const conversations = useOptionalAgentConversations();
  const { message } = App.useApp();
  const [target, setTarget] = useState<RuntimeConfigurationTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<RuntimeConfigurationFeedback | null>(null);
  const [pending, setPending] = useState<RuntimeConfigurationPending | null>(null);
  const pendingSubmit = useRef(false);

  const open = useCallback((service: RuntimeConfigurationTarget) => {
    if (pendingSubmit.current) return;
    if (pending) {
      message.info('上一项运行配置仍在进行，请等待完成或查看原对话后再开始新的配置。');
      return;
    }
    setFeedback(null);
    setTarget(service);
  }, [message, pending]);

  const close = useCallback(() => {
    if (pendingSubmit.current) return;
    setTarget(null); setFeedback(null);
  }, []);

  const resolve = useCallback(() => setPending(null), []);

  const submit = useCallback(async () => {
    if (pendingSubmit.current || !target) return;
    pendingSubmit.current = true; setSubmitting(true); setFeedback(null);
    try {
      const result = await executeRuntimeConfiguration({ workspaceId, workspace, service: target, start: conversations?.startTextConversation });
      if (result.status === 'copy') { setFeedback({ tone: result.tone, message: result.message, copyFirst: true }); return; }
      if (result.status === 'busy') { setFeedback({ tone: 'warning', message: result.message, copyFirst: false }); return; }
      if (result.status === 'recovering') {
        setTarget(null); message.warning(result.message);
        return;
      }
      setPending({
        code: target.code,
        name: target.name,
        conversationId: result.conversation.id,
        baseline: runtimeDefinitionSignature(target.definition ?? null),
        startedAt: new Date().toISOString(),
      });
      if (workspaceId && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SERVICE_RUNTIME_CHANGED, { detail: { workspaceId } }));
      }
      setTarget(null);
    } catch (failure) {
      setTarget(null);
      message.error(failure instanceof Error ? failure.message : '配置提交结果待核对，请先查看原对话，不要重复提交。');
    } finally {
      pendingSubmit.current = false; setSubmitting(false);
    }
  }, [workspaceId, workspace, target, conversations?.startTextConversation, message]);

  return { target, feedback, submitting, pending, open, close, submit, resolve };
}
