import crypto from 'node:crypto';
import fs from 'node:fs';
import { DshDesktopTransport, readDesktopDiscovery, dshDesktopScopeIdentity, type DshAgentRegistration, type DshDesktopConnectionView } from '../../agent-operations/module.ts';
import { DshDesktopRepository, type DshConnection } from '../persistence/dsh-desktop-repository.ts';
const failure = (code: string, message: string, status = 409) => Object.assign(new Error(message), { code, status });
export class DshDesktopApplication {
  private repository: DshDesktopRepository;
  private clients = new Set<DshDesktopTransport>();
  private closed = false;
  private dependencies: { dataRoot: string; readRegistrationActive(agentId: string): boolean; readOrigin?(): string | null };
  constructor(dependencies: { dataRoot: string; readRegistrationActive(agentId: string): boolean; readOrigin?(): string | null }) { this.dependencies = dependencies; this.repository = new DshDesktopRepository(dependencies.dataRoot); }
  private active(connection: DshConnection) {
    if (this.closed) throw failure('agent_operations_closed', 'Buildr 正在退出，桌面业务连接已释放。', 503);
    if (connection.disconnected || !this.dependencies.readRegistrationActive(connection.agentId)) throw failure('agent_dsh_connection_disconnected', '此 DSH 接入已移除或断开；原聊天和关联保留。');
    try { if (fs.realpathSync(connection.executable) !== connection.executable || fs.realpathSync(connection.dshHome) !== connection.dshHome || fs.realpathSync(connection.appPath) !== connection.appPath || dshDesktopScopeIdentity(connection.executable, connection.dshHome, connection.appPath) !== connection.scopeIdentity) throw new Error(); }
    catch { throw failure('agent_dsh_connection_scope_changed', 'DSH 安装或配置范围已变化，请重新检查接入。'); }
  }
  private connection(id: string) { const value = this.repository.read().find(c => c.id === id); if (!value) throw failure('agent_dsh_connection_missing', 'DSH 桌面关联配置不存在。', 404); return value; }
  assertConnectionActive(id: string) { this.active(this.connection(id)); }
  resolveLinkConnection(connectionId?: string) {
    const candidates = connectionId ? [this.connection(connectionId)] : this.repository.read().filter(c => { try { this.active(c); return true; } catch { return false; } });
    if (candidates.length !== 1) throw failure(candidates.length ? 'agent_dsh_connection_ambiguous' : 'agent_dsh_connection_missing', candidates.length ? '存在多个 DSH 接入，请通过 --connection-id 明确选择。' : '尚无已确认的 DSH 接入，请先检查接入。');
    this.active(candidates[0]); return { id: candidates[0].id, label: candidates[0].label };
  }
  private client(connection: DshConnection) {
    this.active(connection);
    const discovery = readDesktopDiscovery(connection.dshHome, connection.channel);
    if (discovery.appPath !== connection.appPath || discovery.executable !== connection.executable || discovery.dshVersion !== connection.version) throw failure('agent_dsh_connection_scope_changed', 'DSH 桌面范围或版本已变化，请重新检查。');
    const client = new DshDesktopTransport(discovery); this.clients.add(client); return client;
  }
  private view(c: DshConnection, unavailable?: string): DshDesktopConnectionView { return { id: c.id, agentId: c.agentId, label: c.label, installationLabel: 'DSH 桌面', configurationLabel: '已确认的 DSH 桌面当前配置', status: c.disconnected ? 'disconnected' : unavailable ? 'unavailable' : 'configured', safeReason: c.disconnected ? '此接入已断开，原聊天和关系保留。' : unavailable ?? null }; }
  async listConnections() {
    if (this.closed) throw failure('agent_operations_closed', 'Buildr 正在退出，不能检查连接。', 503);
    const connections = this.repository.read(), results: DshDesktopConnectionView[] = [];
    // Keep inspection concurrency below the shared desktop connection limit.
    for (let i = 0; i < connections.length; i += 4) results.push(...await Promise.all(connections.slice(i, i + 4).map(async c => {
      let client: DshDesktopTransport | null = null;
      try { client = this.client(c); await client.start(); this.active(c); return this.view(c); }
      catch { return this.view(c, 'DSH 桌面后台当前不可用，或安装与配置范围需重新确认。'); }
      finally { if (client) await this.release(client); }
    })));
    return { connections: results };
  }
  async connect(registration: DshAgentRegistration): Promise<DshDesktopConnectionView> {
    if (this.closed) throw failure('agent_operations_closed', 'Buildr 正在退出，不能接入桌面。', 503);
    if (!registration.desktop || !this.dependencies.readRegistrationActive(registration.id)) throw failure('agent_dsh_connection_disconnected', 'DSH 桌面登记尚未确认或已移除。');
    let id = '';
    this.repository.mutate(connections => {
      if (!this.dependencies.readRegistrationActive(registration.id)) throw failure('agent_dsh_connection_disconnected', 'DSH 接入已变化，请刷新。');
      let connection = connections.find(c => c.executable === registration.executable && c.dshHome === registration.dshHome && c.appPath === registration.desktop!.appPath && c.channel === registration.desktop!.channel && c.scopeIdentity === registration.desktop!.scopeIdentity);
      if (!connection) { if (connections.length >= 64) throw failure('agent_dsh_connection_limit', 'DSH 关联配置数量已达上限。'); connection = { id: 'dsh-' + crypto.randomUUID(), agentId: registration.id, label: registration.label, executable: registration.executable, dshHome: registration.dshHome, ...registration.desktop!, version: registration.version, disconnected: false }; connections.push(connection); }
      else Object.assign(connection, { agentId: registration.id, label: registration.label, version: registration.version, disconnected: false });
      id = connection.id;
    });
    return this.view(this.connection(id));
  }
  disconnect(agentId: string) { this.repository.mutate(connections => { for (const c of connections) if (c.agentId === agentId) c.disconnected = true; }); }
  async openSession(connectionId: string, nativeSessionId: string): Promise<{ opened: true; nativeSessionId: string }> {
    const client = this.client(this.connection(connectionId));
    try {
      await client.start(); const result = await client.request('openSession', { sessionId: nativeSessionId }) as { opened?: boolean; sessionId?: string };
      this.assertConnectionActive(connectionId);
      if (result?.opened !== true || result.sessionId !== nativeSessionId) throw failure('agent_dsh_navigation_unconfirmed', 'DSH 尚未确认目标聊天已打开。', 503);
      return { opened: true, nativeSessionId };
    } finally { await this.release(client); }
  }
  async openTask(connectionId: string, nativeSessionId: string, taskUrl: string): Promise<{ opened: true; nativeSessionId: string; taskUrl: string }> {
    const origin = this.dependencies.readOrigin?.();
    let target: URL;
    try { target = new URL(taskUrl, origin ?? undefined); } catch { throw failure('agent_dsh_task_url_invalid', '需要准确的本机任务地址。'); }
    if (!origin || target.origin !== new URL(origin).origin || !/^\/workspaces\/[a-f0-9-]{36}\/tasks\/[a-z0-9][a-z0-9._-]{0,199}$/.test(target.pathname) || target.search || target.hash || target.username || target.password) throw failure('agent_dsh_task_url_invalid', '任务地址不属于当前 Buildr 的准确任务。');
    const client = this.client(this.connection(connectionId));
    try { await client.start(); const result = await client.request('openTask', { sessionId: nativeSessionId, taskUrl: target.href }) as { opened?: boolean; sessionId?: string; taskUrl?: string }; this.assertConnectionActive(connectionId); if (result?.opened !== true || result.sessionId !== nativeSessionId || result.taskUrl !== target.href) throw failure('agent_dsh_navigation_unconfirmed', 'DSH 尚未确认目标任务已打开。', 503); return { opened: true, nativeSessionId, taskUrl: target.href }; }
    finally { await this.release(client); }
  }
  private async release(client: DshDesktopTransport) { this.clients.delete(client); await client.close(); }
  async close() { if (this.closed) return; this.closed = true; const clients = [...this.clients]; this.clients.clear(); await Promise.all(clients.map(client => client.close())); }

}
