import crypto from 'node:crypto';

// Replace the business adapter only after observing the real system and its authorization boundaries.
export function receiveContext(timeoutMs = 5000) {
  if (!process.send) return Promise.reject(new Error('需要通过 Buildr 私有启动通道运行。'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { process.off('message', onMessage); reject(new Error('上下文交接超时，未执行业务动作。')); }, timeoutMs);
    function onMessage(message) {
      if (message?.type !== 'buildr.connection-context') return;
      clearTimeout(timer); process.off('message', onMessage);
      if (message.context?.protocolVersion !== 'buildr.connection-context/v1' || !message.context.callId || !message.context.connections?.primary) reject(new Error('上下文格式不支持。'));
      else resolve(message.context);
    }
    process.on('message', onMessage);
  });
}

export function revalidate(context, timeoutMs = 5000) {
  if (!process.send || !process.connected) return Promise.reject(new Error('私有校验通道不可用，停止旧上下文。'));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { process.off('message', onMessage); reject(new Error('版本再核验超时，不自动重试。')); }, timeoutMs);
    function onMessage(message) {
      if (message?.type !== 'buildr.connection-revalidated' || message.requestId !== requestId) return;
      clearTimeout(timer); process.off('message', onMessage);
      if (message.ok === true) resolve(); else reject(new Error('上下文已变化，停止写入并重新核对。'));
    }
    process.on('message', onMessage);
    process.send({ type: 'buildr.connection-revalidate', requestId, callId: context.callId });
  });
}

try {
  const [action = '--help', ...args] = process.argv.slice(2);
  if (args.length) throw new Error('模板命令不接受额外参数。');
  if (action === '--help') {
    console.log('Usage: client.mjs --self-test | test | discover\n--self-test: 无上下文或认证的离线模板检查。\ntest/discover: 经 Buildr 私有通道检查模拟上下文并返回固定示例范围；未实现真实系统能力。');
  } else if (action === '--self-test') {
    console.log(JSON.stringify({ status: 'success', templateParsed: true, businessImplemented: false, limitations: ['仅离线模板检查；未接收认证，未验证私有通道或真实系统。'] }));
  } else if (action === 'test' || action === 'discover') {
    const context = await receiveContext();
    const primary = context.connections.primary;
    if (!['team', 'personal'].includes(primary.authentication?.source) || !primary.authentication.values || !primary.config) throw new Error('模拟上下文不完整。');
    // Draft hooks are read-only and cannot request write revalidation. A real
    // write command must await revalidate(context), then check remote versions.
    console.log(JSON.stringify({ status: 'success', checks: ['已接收明确选择的模拟实例上下文'], diagnostics: [], limitations: ['模板业务未实现；只验证私有协议，未访问或认证真实系统。'], warnings: [], ...(action === 'discover' ? { options: [{ value: 'example-scope', label: '本机模拟范围' }], truncated: false } : {}) }));
  } else {
    throw new Error('示例程序尚未实现此动作，未访问任何外部系统。');
  }
} catch (error) {
  console.log(JSON.stringify({ status: 'failure', checks: [], diagnostics: [error instanceof Error ? error.message : '示例失败。'], limitations: ['模板业务未实现，未访问真实系统。'], warnings: [] })); process.exitCode = 2;
} finally { if (process.connected) process.disconnect(); }
