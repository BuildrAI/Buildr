import { agentFailure, type AgentExecutionProvider, type AgentProviderGenerationInput, type DshAgentRegistration } from '../domain/agent-operations.ts';
import { dshDesktopScopeIdentity } from './dsh-entry.ts';
import { DshDesktopTransport, readDesktopDiscovery } from './dsh-desktop-transport.ts';
export class DshDesktopProvider implements AgentExecutionProvider {
  private client: DshDesktopTransport | null = null;
  private registration: DshAgentRegistration;
  constructor(registration: DshAgentRegistration) { this.registration = registration; }
  get alive() { return this.client?.alive ?? false; }
  async start() {
    const desktop = this.registration.desktop;
    if (!desktop) throw agentFailure('agent_dsh_desktop_confirmation_required', '此 DSH 仍为旧登记，请重新检查接入以确认同一桌面后台；登记和默认项已保留。', 409);
    if (dshDesktopScopeIdentity(this.registration.executable, this.registration.dshHome, desktop.appPath) !== desktop.scopeIdentity) throw agentFailure('agent_dsh_desktop_scope_changed', 'DSH 配置目录身份已变化，原登记和关系保留，请核对接入。', 409);
    const discovery = readDesktopDiscovery(this.registration.dshHome, desktop.channel);
    if (discovery.appPath !== desktop.appPath || discovery.executable !== this.registration.executable || discovery.dshVersion !== this.registration.version) throw agentFailure('agent_dsh_desktop_scope_changed', 'DSH 桌面安装或版本与已确认接入不同，请重新检查；原登记保留。', 409);
    if (this.client?.alive && this.client.discovery.hostInstanceId === discovery.hostInstanceId) return;
    await this.client?.close();
    const client = this.client = new DshDesktopTransport(discovery);
    try { await client.start(); } catch (error) { await client.close(); throw error; }
  }
  async generate(input: AgentProviderGenerationInput): Promise<unknown> {
    if (input.environment) throw agentFailure('agent_dsh_environment_unsupported', 'DSH 桌面生成仅支持给定材料；本次原生文件读取未启用。', 422);
    await this.start();
    const text = await this.client!.generate({ ...input, timeoutMs: input.execution?.timeoutMs });
    try { return JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')); }
    catch { throw agentFailure('agent_output_invalid', 'DSH 生成结果不符合结构要求，已有说明保持。', 502); }
  }
  async close() { const client = this.client; this.client = null; await client?.close(); }
}
