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
  const [action = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help'].includes(action)) {
    if (args.length) throw new Error('帮助没有额外参数。');
    console.log(JSON.stringify({help:['inspect [--json]: 本机读取业务标准输入，检查完整上下文；不访问外部系统。','check-context: 请求本机上下文再核验；不执行外部写入。'],businessImplemented:'local-read-only'}));
  } else if (['inspect', 'check-context'].includes(action)) {
    if (args.some(value => value !== '--json')) throw new Error('未知参数，未执行任何操作。');
    const context = await receiveContext();
    const primary = context.connections.primary;
    if (!['team','personal'].includes(primary.authentication?.source) || typeof primary.authentication?.values?.username !== 'string' || typeof primary.authentication?.values?.password !== 'string') throw new Error('认证组不完整，未读取其他来源。');
    const chunks = []; let bytes = 0;
    for await (const chunk of process.stdin) { bytes += chunk.length; if (bytes > 64 * 1024) throw new Error('示例输入超过64 KiB。'); chunks.push(chunk); }
    if (action === 'check-context') await revalidate(context);
    console.log(JSON.stringify({status:'success',checks:['private-context','complete-business-stdin'],diagnostics:[],limitations:['仅本机只读示例，未实现真实外部业务'],observedAt:new Date().toISOString(),instanceId:primary.id,account:primary.authentication.values.username,authenticationSource:primary.authentication.source,inputBytes:bytes,inputSha256:crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex'),contextChecked:action === 'check-context',externalSystems:'not-contacted'}));
  } else {
    throw new Error('此示例仅支持本机读取；未知动作或任何写入均拒绝。');
  }
} catch (error) {
  console.log(JSON.stringify({status:'failure',error:{message:error instanceof Error ? error.message : '示例失败。'},externalSystems:'not-contacted'})); process.exitCode=2;
} finally { if (process.connected) process.disconnect(); }
