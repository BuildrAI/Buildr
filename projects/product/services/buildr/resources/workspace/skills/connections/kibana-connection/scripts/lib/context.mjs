import { connectionFailure, inputObject } from './errors.mjs';
import { kibanaConfiguration } from './configuration.mjs';

/** Authentication is accepted only over the private child IPC channel. */
export function openContextChannel(channel = process, timeoutMs = 10_000) {
  if (!channel.connected || typeof channel.send !== 'function') throw connectionFailure('kibana_context_required', '请通过已选连接的 Buildr 通用启动入口执行。', 409);
  let timer, receive, disconnected;
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(connectionFailure('kibana_context_timeout', '未收到本次私有连接上下文。', 409)), timeoutMs);
    disconnected = () => reject(connectionFailure('kibana_context_disconnected', '本次连接上下文通道已关闭。', 409));
    receive = message => {
      if (message?.type !== 'buildr.connection-context') return;
      clearTimeout(timer);
      const context = message.context;
      if (context?.protocolVersion !== 'buildr.connection-context/v1' || typeof context.callId !== 'string' || context.definition?.definitionId !== 'kibana' || !context.connections?.primary) {
        reject(connectionFailure('kibana_context_invalid', '本次连接上下文协议或定义身份不匹配。', 409));
      } else resolve(context);
    };
    channel.on('message', receive);
    channel.once('disconnect', disconnected);
  });
  return { ready, close() { clearTimeout(timer); channel.off('message', receive); channel.off('disconnect', disconnected); if (channel.connected) channel.disconnect(); } };
}

export function selectedConfiguration(context) {
  const primary = context.connections.primary;
  if (typeof primary.id !== 'string' || typeof primary.revision !== 'string' || !['team', 'personal'].includes(primary.authentication?.source)) throw connectionFailure('kibana_context_invalid', '本次连接身份或完整认证组来源无效。', 409);
  const config = inputObject(primary.config, ['apiBaseUrl', 'consoleUrl', 'dataViewId']);
  const values = inputObject(primary.authentication.values, ['username', 'password']);
  let url;
  try { url = new URL(config.apiBaseUrl); } catch { throw connectionFailure('kibana_url_invalid', '实际接口基址无效。'); }
  if (url.search || url.hash || /\/app(?:\/|$)/u.test(url.pathname)) throw connectionFailure('kibana_url_invalid', '接口基址须包含准确代理前缀及空间路径，不得包含页面、查询或锚点。');
  const resolved = kibanaConfiguration({ consoleUrl: config.apiBaseUrl, username: values.username, dataViewId: config.dataViewId ?? null });
  return { config: resolved, credentials: { password: values.password }, observation: { connectionId: primary.id, connectionRevision: primary.revision, authenticationSource: primary.authentication.source } };
}
