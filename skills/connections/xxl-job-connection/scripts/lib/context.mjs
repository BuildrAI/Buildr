import crypto from 'node:crypto';
import { connectionFailure } from './errors.mjs';

/** IPC is private to the selected child; stdin remains available to business input. */
export function openContextChannel(channel = process, timeoutMs = 10_000) {
  if (typeof channel.send !== 'function' || !channel.connected) throw connectionFailure('xxl_job_context_required', '请通过已选连接的 Buildr 通用启动入口执行；不能从参数或环境变量读取认证。', 409);
  const pending = new Map();
  let context, settleContext, rejectContext;
  const ready = new Promise((resolve, reject) => { settleContext = resolve; rejectContext = reject; });
  const initialTimer = setTimeout(() => rejectContext(connectionFailure('xxl_job_context_timeout', '未收到本次私有连接上下文。', 409)), timeoutMs);
  const rejectAll = () => {
    clearTimeout(initialTimer);
    rejectContext(connectionFailure('xxl_job_context_disconnected', '连接上下文通道已关闭，未继续执行。', 409));
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(connectionFailure('xxl_job_context_disconnected', '连接上下文通道已关闭，未继续写入。', 409)); }
    pending.clear();
  };
  const receive = message => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'buildr.connection-context' && context === undefined) {
      clearTimeout(initialTimer);
      if (message.context?.protocolVersion !== 'buildr.connection-context/v1' || typeof message.context?.callId !== 'string') {
        rejectContext(connectionFailure('xxl_job_context_invalid', '连接上下文协议或调用身份无效。', 409));
        return;
      }
      context = message.context;
      settleContext(context);
    } else if (message.type === 'buildr.connection-revalidated' && pending.has(message.requestId)) {
      const request = pending.get(message.requestId);
      pending.delete(message.requestId); clearTimeout(request.timer);
      if (message.ok === true) request.resolve();
      else request.reject(connectionFailure(typeof message.error?.code === 'string' ? message.error.code : 'xxl_job_context_changed', typeof message.error?.message === 'string' ? message.error.message : '本机连接、绑定或认证已变化，请重新观察。', 409));
    }
  };
  channel.on('message', receive); channel.on('disconnect', rejectAll);
  return {
    ready,
    revalidate: async () => {
      await ready;
      if (!channel.connected) throw connectionFailure('xxl_job_context_disconnected', '连接上下文通道已关闭。', 409);
      return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const timer = setTimeout(() => { pending.delete(requestId); reject(connectionFailure('xxl_job_context_timeout', '写前本机上下文检查未完成，未提交操作。', 409)); }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        channel.send({ type: 'buildr.connection-revalidate', requestId, callId: context.callId }, error => {
          if (!error || !pending.has(requestId)) return;
          clearTimeout(timer); pending.delete(requestId); reject(connectionFailure('xxl_job_context_disconnected', '写前本机上下文检查发送失败，未提交操作。', 409));
        });
      });
    },
    close: () => { clearTimeout(initialTimer); channel.off('message', receive); channel.off('disconnect', rejectAll); rejectAll(); if (channel.connected) channel.disconnect(); },
  };
}
