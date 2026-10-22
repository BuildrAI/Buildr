import crypto from 'node:crypto';

export const DEPLOYMENT_ADAPTER_PROTOCOL = 'buildr.service-deployment/v1';

// 与 scripts/client.mjs 相同的私有通道；模板保持自包含，便于单独运行与核对。
function receiveContext(timeoutMs = 5000) {
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

function revalidate(context, timeoutMs = 5000) {
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

function sampleRequest(action) {
  return {
    protocol: DEPLOYMENT_ADAPTER_PROTOCOL,
    action,
    service: { code: 'example-service' },
    environment: 'qa',
    target: '示例部署目标',
    targetRef: 'EXAMPLE-SERVICE-QA',
    ...(action === 'submit' ? { plan: { branch: 'dev-example', commit: '0000000000000000000000000000000000000000' } } : {}),
  };
}

function sampleOutput(mode, request) {
  const version = `${request.plan?.branch ?? 'dev-example'}@${(request.plan?.commit ?? '0000000').slice(0, 7)}`;
  if (mode === 'branches') return { protocol: DEPLOYMENT_ADAPTER_PROTOCOL, branches: [{ branch: 'dev-example', commit: '0000000000000000000000000000000000000000', integration: true }] };
  if (mode === 'success') return { protocol: DEPLOYMENT_ADAPTER_PROTOCOL, state: 'success', version, at: '2026-10-21T15:04:00.000Z', externalUrl: 'https://ci.example.invalid/builds/92', diagnostics: ['样例：远端已确认部署完成。'] };
  if (mode === 'failed') return { protocol: DEPLOYMENT_ADAPTER_PROTOCOL, state: 'failed', version, at: '2026-10-21T15:03:00.000Z', externalUrl: 'https://ci.example.invalid/builds/91', diagnostics: ['样例：流水线在构建阶段失败。'] };
  return { protocol: DEPLOYMENT_ADAPTER_PROTOCOL, state: 'unknown', version, at: '2026-10-21T15:02:00.000Z', externalUrl: 'https://ci.example.invalid/builds/90', diagnostics: ['样例：请求已发出但没有取得可核验响应，先到外部系统核对实际记录。'] };
}

async function readRequest() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString('utf8').trim();
  if (!content) throw new Error('未收到部署请求输入。');
  const request = JSON.parse(content);
  if (request?.protocol !== DEPLOYMENT_ADAPTER_PROTOCOL) throw new Error(`部署请求协议不支持：${request?.protocol ?? '<缺失>'}`);
  if (!['submit', 'list-branches'].includes(request.action)) throw new Error(`部署请求动作不支持：${request.action}`);
  return request;
}

// phase 区分“尚未发出提交”（failed）与“可能已发出”（unknown）；真实适配按实际调用位置维护。
let phase = 'input';

try {
  const argv = process.argv.slice(2);
  const [action = 'deploy', argument] = argv;
  if (argv.length > 2) throw new Error('模板部署程序最多接受一个参数。');
  if (action === '--help') {
    console.log('Usage: deployment-adapter.mjs deploy | --mock <success|failed|unknown|branches> | --self-test\n'
      + 'deploy: 经 Buildr 私有通道接收上下文，从标准输入读取部署请求；模板未实现真实 CI/CD 业务。\n'
      + '--mock: 离线打印成功、失败、未知与分支列表样例输出，不接收上下文、认证或访问外部系统。\n'
      + '--self-test: 离线核对四种样例输出仍符合部署适配器契约。');
  } else if (action === '--mock') {
    const mode = argument ?? '';
    if (!['success', 'failed', 'unknown', 'branches'].includes(mode)) throw new Error(`样例模式不支持：${mode || '<缺失>'}`);
    console.log(JSON.stringify(sampleOutput(mode, sampleRequest(mode === 'branches' ? 'list-branches' : 'submit'))));
  } else if (action === '--self-test') {
    const checks = ['success', 'failed', 'unknown', 'branches'].map(mode => {
      const output = sampleOutput(mode, sampleRequest(mode === 'branches' ? 'list-branches' : 'submit'));
      if (mode === 'branches') {
        if (!Array.isArray(output.branches) || output.branches.some(branch => typeof branch.branch !== 'string' || typeof branch.commit !== 'string')) throw new Error('分支样例不符合契约。');
        return 'branches 样例包含 branch 与 commit';
      }
      if (!['success', 'submitted', 'failed', 'unknown'].includes(output.state)) throw new Error('状态样例不符合契约。');
      if (typeof output.version !== 'string' || !output.externalUrl.startsWith('https://')) throw new Error('版本或外链样例不符合契约。');
      return `${output.state} 样例包含 version、at 与 externalUrl`;
    });
    console.log(JSON.stringify({ status: 'success', templateParsed: true, businessImplemented: false, checks, limitations: ['仅离线样例检查；未接收认证，未访问真实 CI/CD。'] }));
  } else if (action === 'deploy') {
    const context = await receiveContext();
    const primary = context.connections.primary;
    if (!['team', 'personal'].includes(primary.authentication?.source) || !primary.authentication.values || !primary.config) throw new Error('连接上下文不完整。');
    const request = await readRequest();
    if (request.action === 'list-branches') {
      // 只读发现不需要写前再核验；真实适配在此按 target/targetRef 查询远端分支与提交。
      console.log(JSON.stringify({ protocol: DEPLOYMENT_ADAPTER_PROTOCOL, branches: [], diagnostics: ['模板业务未实现；未访问真实 CI/CD，返回空分支列表。'] }));
    } else {
      // 提交是外部写入：先经私有通道再核验当前上下文，失败即停止，不换认证重试。
      await revalidate(context);
      phase = 'write';
      console.log(JSON.stringify({ protocol: DEPLOYMENT_ADAPTER_PROTOCOL, state: 'unknown', version: `${request.plan.branch}@${request.plan.commit.slice(0, 7)}`, at: new Date().toISOString(), externalUrl: null, diagnostics: ['模板业务未实现；没有向真实 CI/CD 发出提交，结果保留未知。'] }));
    }
  } else {
    throw new Error('模板部署程序尚未实现此动作，未访问任何外部系统。');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : '模板部署程序失败。';
  console.log(JSON.stringify(phase === 'write'
    ? { protocol: DEPLOYMENT_ADAPTER_PROTOCOL, state: 'unknown', diagnostics: [message], limitations: ['模板业务未实现；提交可能已发出，结果未知，先核对实际记录。'] }
    : { protocol: DEPLOYMENT_ADAPTER_PROTOCOL, state: 'failed', diagnostics: [message], limitations: ['模板业务未实现；没有发出提交，未访问真实 CI/CD。'] }));
  process.exitCode = 2;
} finally { if (process.connected) process.disconnect(); }
