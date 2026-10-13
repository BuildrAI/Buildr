/** Host-side Client leases and observed navigation acknowledgements. */
import { randomUUID } from 'node:crypto';
import { DSH_DESKTOP_BRIDGE_LIMITS, dshDesktopIdentifier,
  type DshDesktopClientAck, type DshDesktopClientCommand, type DshDesktopClientState,
  type DshDesktopNavigationResult, type DshDesktopSessionTarget, type DshDesktopTaskTarget,
} from '../../buildr/src/modules/agent-operations/contracts/dsh-desktop-bridge.ts';

export class DesktopFault extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = 'agent_dsh_' + code; }
}
export function desktopFault(code: string, message: string): DesktopFault { return new DesktopFault(code, message); }
type Lease = { state: DshDesktopClientState; queue: DshDesktopClientCommand[]; wake?: () => void; disposed: boolean };
type Pending = { clientId: string; sessionId: string; resolve(value: DshDesktopNavigationResult): void;
  reject(error: unknown): void; taskUrl?: string };

export class DesktopNavigation {
  private readonly leases = new Map<string, Lease>();
  private readonly pending = new Map<string, Pending>();
  private disposed = false;
  private readonly timeoutMs: number;
  constructor(timeoutMs: number = DSH_DESKTOP_BRIDGE_LIMITS.navigationTimeoutMs) { this.timeoutMs = timeoutMs; }
  clients(): DshDesktopClientState[] { return [...this.leases.values()].map(row => ({ ...row.state })); }
  update(state: DshDesktopClientState): void {
    const lease = this.leases.get(state.clientId);
    if (lease && !lease.disposed && (state.sessionId === null || dshDesktopIdentifier(state.sessionId))) {
      lease.state = { clientId: state.clientId, sessionId: state.sessionId, desktop: true };
    }
  }
  /** Iterator retirement owns precisely this Client lease. */
  async *watch(state: DshDesktopClientState, signal?: AbortSignal): AsyncGenerator<DshDesktopClientCommand> {
    if (this.disposed || !state.desktop || !dshDesktopIdentifier(state.clientId)
      || !(state.sessionId === null || dshDesktopIdentifier(state.sessionId))) throw desktopFault('client_invalid', '桌面客户端身份无效。');
    if (this.leases.has(state.clientId)) throw desktopFault('client_exists', '桌面客户端已连接。');
    const lease: Lease = { state: { ...state }, queue: [], disposed: false };
    this.leases.set(state.clientId, lease);
    const abort = () => { lease.disposed = true; lease.wake?.(); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      while (!lease.disposed) {
        if (lease.queue.length === 0) await new Promise<void>(resolve => { lease.wake = resolve; });
        if (lease.disposed) break;
        while (lease.queue.length) yield lease.queue.shift()!;
      }
    } finally {
      signal?.removeEventListener('abort', abort);
      lease.disposed = true;
      lease.wake?.();
      if (this.leases.get(state.clientId) === lease) this.leases.delete(state.clientId);
      for (const [id, pending] of this.pending) if (pending.clientId === state.clientId) {
        this.pending.delete(id); pending.reject(desktopFault('client_disconnected', '目标桌面客户端已断开。'));
      }
    }
  }
  current(clientId?: string): DshDesktopClientState { return { ...this.select(clientId).state }; }
  private select(clientId?: string): Lease {
    if (this.disposed) throw desktopFault('disposed', '桌面连接已释放。');
    const candidates = [...this.leases.values()].filter(row => !row.disposed && row.state.desktop);
    if (clientId !== undefined) {
      const lease = this.leases.get(clientId);
      if (!lease || lease.disposed) throw desktopFault('client_unavailable', '目标桌面客户端不可用。');
      return lease;
    }
    if (candidates.length !== 1) throw desktopFault(candidates.length ? 'client_ambiguous' : 'client_unavailable',
      candidates.length ? '有多个桌面客户端，请明确目标窗口。' : '没有可用的桌面客户端。');
    return candidates[0];
  }
  async navigate(method: 'openSession' | 'openTask', target: DshDesktopSessionTarget | DshDesktopTaskTarget,
    signal: AbortSignal): Promise<DshDesktopNavigationResult> {
    signal.throwIfAborted();
    if (!dshDesktopIdentifier(target.sessionId)) throw desktopFault('session_invalid', '原生会话编号无效。');
    const lease = this.select(target.clientId), clientId = lease.state.clientId;
    if ([...this.pending.values()].some(row => row.clientId === clientId)) throw desktopFault('navigation_busy', '目标窗口正在处理另一项导航。');
    const commandId = randomUUID();
    const taskUrl = 'taskUrl' in target ? target.taskUrl : undefined;
    return new Promise<DshDesktopNavigationResult>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort);
        this.pending.delete(commandId); lease.queue = lease.queue.filter(row => row.commandId !== commandId); };
      const fail = (error: unknown) => { cleanup(); reject(error); };
      const abort = () => fail(desktopFault('navigation_cancelled', '本次导航已取消。'));
      const timer = setTimeout(() => fail(desktopFault('navigation_timeout', '未观察到目标会话选中，请重试。')), this.timeoutMs);
      this.pending.set(commandId, { clientId, sessionId: target.sessionId, ...(taskUrl ? { taskUrl } : {}),
        resolve: value => { cleanup(); resolve(value); }, reject: fail });
      signal.addEventListener('abort', abort, { once: true });
      lease.queue.push({ commandId, method, sessionId: target.sessionId, ...(taskUrl ? { taskUrl } : {}) });
      lease.wake?.(); lease.wake = undefined;
    });
  }
  acknowledge(ack: DshDesktopClientAck): void {
    const row = this.pending.get(ack.commandId), lease = this.leases.get(ack.clientId);
    if (!row || row.clientId !== ack.clientId || !lease) return;
    if (!ack.ok || ack.sessionId !== row.sessionId || lease.state.sessionId !== row.sessionId) {
      row.reject(desktopFault('navigation_unconfirmed', '目标客户端未确认准确会话选中。')); return;
    }
    row.resolve({ clientId: ack.clientId, sessionId: row.sessionId, opened: true, ...(row.taskUrl ? { taskUrl: row.taskUrl } : {}) });
  }
  dispose(): void {
    this.disposed = true;
    for (const lease of this.leases.values()) { lease.disposed = true; lease.wake?.(); }
    for (const pending of [...this.pending.values()]) pending.reject(desktopFault('disposed', '桌面导航已释放。'));
    this.leases.clear();
  }
}

/** Only the verified Buildr channel's exact Task route may cross the bridge. */
export function validateDesktopTaskUrl(value: unknown, origin: string): string {
  if (typeof value !== 'string' || value.length > 4096) throw desktopFault('task_url_invalid', '任务地址无效。');
  let url: URL;
  try { url = new URL(value); } catch { throw desktopFault('task_url_invalid', '任务地址无效。'); }
  if (url.origin !== origin || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.search || url.hash || !/^\/workspaces\/[^/]+\/tasks\/[^/]+$/.test(url.pathname)
    || /%(?:2f|5c|00)/i.test(url.pathname)) throw desktopFault('task_url_invalid', '任务地址不属于当前 Buildr 渠道。');
  return url.href;
}
