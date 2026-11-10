import { App } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { useOptionalAgentConversations } from '../../agent-conversations/AgentConversationsContext';
import { SERVICE_RUNTIME_CHANGED } from '../api/service-runtime-api';
import { runtimeDefinitionSignature } from '../configurationOutcome.ts';
import { executeRuntimeConfiguration, type RuntimeConfigurationTarget } from '../configurationAction';
import {
  readRuntimeConfigurationHandoff, recordRuntimeConfigurationHandoff, subscribeRuntimeConfigurationHandoff,
  type RuntimeConfigurationPending,
} from '../runtimeConfigurationHandoff.ts';
import { runtimeConfigurationStartRequested, subscribeRuntimeConfigurationStart } from '../runtimeConfigurationStart.ts';

export type RuntimeConfigurationFeedback = {
  tone: 'info' | 'warning' | 'error';
  message: string;
  /** 提交前没有可用执行入口时，把复制指令作为主要交接方式。 */
  copyFirst: boolean;
};

export type { RuntimeConfigurationPending };

/** 订阅交接记录变化：刷新或切换页面后仍按同一记录呈现进行中的运行配置。 */
export function useRuntimeConfigurationPending(workspaceId: string | null | undefined): RuntimeConfigurationPending | null {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeRuntimeConfigurationHandoff(() => setVersion(value => value + 1)), []);
  return readRuntimeConfigurationHandoff(workspaceId);
}

/** 订阅完成通知的一次性启动请求；由目标服务运行区打开启动抽屉后消费。 */
export function useRuntimeConfigurationStartRequest(workspaceId: string | null | undefined, code: string | null | undefined): boolean {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeRuntimeConfigurationStart(() => setVersion(value => value + 1)), []);
  return runtimeConfigurationStartRequested(workspaceId, code);
}

/** 三个服务入口共用“先说明、确认后提交”的交接；本钩子只持有当前页的待确认目标、提交状态和已提交记录。 */
export function useRuntimeConfiguration() {
  const { workspaceId, workspace } = useAppShell();
  const conversations = useOptionalAgentConversations();
  const { message } = App.useApp();
  const [target, setTarget] = useState<RuntimeConfigurationTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<RuntimeConfigurationFeedback | null>(null);
  const pendingSubmit = useRef(false);
  const pending = useRuntimeConfigurationPending(workspaceId);

  /** 回到原对话；进行中的运行配置不再提供可重复提交的入口。 */
  const openPendingConversation = useCallback(() => {
    const handoff = readRuntimeConfigurationHandoff(workspaceId);
    if (!handoff) return;
    if (conversations && workspaceId) { void conversations.openConversation(workspaceId, handoff.conversationId); return; }
    message.info('该服务的运行配置仍在进行，请在对话面板查看原执行。');
  }, [conversations, message, workspaceId]);

  const open = useCallback((service: RuntimeConfigurationTarget) => {
    if (pendingSubmit.current) return;
    const handoff = readRuntimeConfigurationHandoff(workspaceId);
    if (handoff) {
      if (handoff.code === service.code) { openPendingConversation(); return; }
      message.info('上一项运行配置仍在进行，请等待完成或查看原对话后再开始新的配置。');
      return;
    }
    setFeedback(null);
    setTarget(service);
  }, [message, openPendingConversation, workspaceId]);

  const close = useCallback(() => {
    if (pendingSubmit.current) return;
    setTarget(null); setFeedback(null);
  }, []);

  const submit = useCallback(async () => {
    if (pendingSubmit.current || !target) return;
    const existing = readRuntimeConfigurationHandoff(workspaceId);
    if (existing && existing.code === target.code) {
      // 已有进行中的交接：不再提交，回到原对话。
      setTarget(null); setFeedback(null); openPendingConversation();
      return;
    }
    pendingSubmit.current = true; setSubmitting(true); setFeedback(null);
    try {
      const result = await executeRuntimeConfiguration({ workspaceId, workspace, service: target, start: conversations?.startTextConversation });
      if (result.status === 'copy') { setFeedback({ tone: result.tone, message: result.message, copyFirst: true }); return; }
      if (result.status === 'busy') { setFeedback({ tone: 'warning', message: result.message, copyFirst: false }); return; }
      if (result.status === 'recovering') {
        setTarget(null); message.warning(result.message);
        return;
      }
      if (workspaceId) recordRuntimeConfigurationHandoff({
        workspaceId,
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
  }, [workspaceId, workspace, target, conversations?.startTextConversation, message, openPendingConversation]);

  return { target, feedback, submitting, pending, open, close, submit, openPendingConversation };
}
