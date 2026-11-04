/**
 * 完成通知里的“启动本地”一次性动作。
 *
 * 服务详情常以目录旁的预览呈现，导航地址会回落到目录并丢掉查询参数，
 * 因此这里不依赖地址栏，只在内存中保存最近一次用户点击，由目标服务的运行区消费。
 * 请求不写入存储、不表示配置成功或服务已启动；页面刷新或超时未消费时自然失效。
 */
type StartRequest = { workspaceId: string; code: string; requestedAt: number };

/** 点击后短时间内没有打开对应服务时不再生效，避免以后偶然打开服务时弹出启动面板。 */
const MAX_AGE_MS = 60 * 1000;
const listeners = new Set<() => void>();
let request: StartRequest | null = null;

function emit() {
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* 单个订阅者的失败不阻止其他入口更新。 */ }
  }
}

function liveRequest(): StartRequest | null {
  if (request && Date.now() - request.requestedAt > MAX_AGE_MS) request = null;
  return request;
}

/** 请求打开该服务的启动抽屉；只保留最近一次点击。 */
export function requestRuntimeConfigurationStart(workspaceId: string, code: string) {
  request = { workspaceId, code, requestedAt: Date.now() };
  emit();
}

/** 该服务是否存在待消费的启动请求；超时请求按不存在处理。 */
export function runtimeConfigurationStartRequested(workspaceId: string | null | undefined, code: string | null | undefined): boolean {
  if (!workspaceId || !code) return false;
  const current = liveRequest();
  return current?.workspaceId === workspaceId && current.code === code;
}

/** 消费启动请求：只在请求仍属于同一工作空间与服务时清除。 */
export function consumeRuntimeConfigurationStart(workspaceId: string | null | undefined, code: string | null | undefined) {
  if (!runtimeConfigurationStartRequested(workspaceId, code)) return;
  request = null;
  emit();
}

export function subscribeRuntimeConfigurationStart(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
