/**
 * 运行配置交接索引：记录“哪段对话正在为哪个服务做运行配置”。
 *
 * 对话执行状态与运行定义已经是权威事实；这里只保存界面恢复状态所需的索引，
 * 按工作空间保存到浏览器本机。存储不可用、内容损坏或换浏览器时退化为无记录，
 * 入口回到可再次发起，完成事实仍以原对话与运行定义读取为准。
 */
export type RuntimeConfigurationPending = {
  workspaceId: string;
  code: string;
  name: string;
  conversationId: string;
  /** 交接前的运行定义快照；null 表示首次配置。 */
  baseline: string | null;
  startedAt: string;
};

type Handoffs = Record<string, RuntimeConfigurationPending>;

const listeners = new Set<() => void>();
let snapshot: Handoffs | null = null;
let cachedKey: string | null = null;

function storageKey(): string {
  if (!cachedKey) {
    const profile = typeof document === 'undefined'
      ? 'local'
      : document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local';
    cachedKey = 'buildr.runtime-configuration.handoff:' + profile;
  }
  return cachedKey;
}

function validHandoff(value: unknown): value is RuntimeConfigurationPending {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RuntimeConfigurationPending>;
  return typeof item.workspaceId === 'string' && item.workspaceId.length > 0
    && typeof item.code === 'string' && item.code.length > 0
    && typeof item.name === 'string'
    && typeof item.conversationId === 'string' && item.conversationId.length > 0
    && (item.baseline === null || typeof item.baseline === 'string')
    && typeof item.startedAt === 'string' && Number.isFinite(Date.parse(item.startedAt));
}

function parseHandoffs(raw: string | null | undefined): Handoffs {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Handoffs = {};
    for (const [workspaceId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (validHandoff(value) && value.workspaceId === workspaceId) result[workspaceId] = value;
    }
    return result;
  } catch { return {}; }
}

function readStorage(): Handoffs {
  if (typeof localStorage === 'undefined') return {};
  try { return parseHandoffs(localStorage.getItem(storageKey())); } catch { return {}; }
}

function current(): Handoffs {
  if (!snapshot) snapshot = readStorage();
  return snapshot;
}

function emit() {
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* 单个订阅者的失败不阻止其他入口更新。 */ }
  }
}

function persist(next: Handoffs) {
  snapshot = next;
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(storageKey(), JSON.stringify(next)); } catch { /* 存储不可用时保留内存观察。 */ }
  }
  emit();
}

/** 读取该工作空间当前已交接的配置；没有记录、身份不完整或存储损坏时返回 null。 */
export function readRuntimeConfigurationHandoff(workspaceId: string | null | undefined): RuntimeConfigurationPending | null {
  if (!workspaceId) return null;
  return current()[workspaceId] ?? null;
}

/** 记录一次已提交的交接；同一工作空间只保留最近一项。 */
export function recordRuntimeConfigurationHandoff(handoff: RuntimeConfigurationPending) {
  persist({ ...current(), [handoff.workspaceId]: handoff });
}

/** 结束一次界面观察；传入对话身份时只在仍是同一段对话时清除，避免清掉更新的交接。 */
export function clearRuntimeConfigurationHandoff(workspaceId: string | null | undefined, conversationId?: string) {
  if (!workspaceId) return;
  const existing = current()[workspaceId];
  if (!existing) return;
  if (conversationId && existing.conversationId !== conversationId) return;
  const next = { ...current() };
  delete next[workspaceId];
  persist(next);
}

export function subscribeRuntimeConfigurationHandoff(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  // 另一个标签页写入或清除交接时，本页按真实记录重新读取。
  window.addEventListener('storage', event => {
    if (event.key !== storageKey()) return;
    snapshot = parseHandoffs(event.newValue);
    emit();
  });
}
