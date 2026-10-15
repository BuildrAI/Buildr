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
  if (process.argv.includes('--help') || process.argv.length === 2) {
    console.log('Usage: client.mjs --self-test\n仅检查上下文与业务输入协议；未实现真实系统动作。');
  } else if (process.argv.includes('--self-test')) {
    const context = await receiveContext();
    let bytes = 0; for await (const chunk of process.stdin) bytes += chunk.length;
    await revalidate(context); // A real adapter also checks professional object versions and authorization before each write.
    console.log(JSON.stringify({ protocolVerified: true, inputBytes: bytes, businessImplemented: false }));
  } else {
    throw new Error('示例程序尚未实现此动作，未访问任何外部系统。');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : '示例失败。'); process.exitCode = 2;
} finally { if (process.connected) process.disconnect(); }
