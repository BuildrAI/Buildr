import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { DSH_DESKTOP_BRIDGE_SCHEMA, DSH_DESKTOP_BRIDGE_DISCOVERY_SEGMENTS, DSH_DESKTOP_BRIDGE_LIMITS, dshDesktopDiscoveryFilename, readDshDesktopDiscovery, dshDesktopRecord, type DshDesktopChannel, type DshDesktopDiscovery, type DshDesktopInspection, type DshDesktopRequest, type DshDesktopFrame } from '../contracts/dsh-desktop-bridge.ts';
import { agentFailure, readAgentExecutionConfig, type AgentExecutionConfig } from '../domain/agent-operations.ts';

export function readDesktopDiscovery(home: string, channel: DshDesktopChannel): DshDesktopDiscovery {
  try {
    const profileKey = fs.realpathSync(home);
    let directory = profileKey;
    for (const segment of DSH_DESKTOP_BRIDGE_DISCOVERY_SEGMENTS) {
      directory = path.join(directory, segment);
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) throw new Error('unsafe directory');
    }
    const file = path.join(directory, dshDesktopDiscoveryFilename(channel)), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 || process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) throw new Error('unsafe file');
    const discovery = readDshDesktopDiscovery(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (discovery.channel !== channel || discovery.profileKey !== profileKey || !path.isAbsolute(discovery.appPath) || !path.isAbsolute(discovery.executable)) throw new Error('scope mismatch');
    return discovery;
  } catch { throw agentFailure('agent_dsh_desktop_unavailable', 'DSH 桌面后台或 Buildr 插件连接当前不可用，请打开已确认的桌面并检查插件。', 503); }
}

type Pending = { resolve(value: unknown): void; reject(error: unknown): void; timer: NodeJS.Timeout; configured?(config: AgentExecutionConfig): void; running?(): void };
/** Owns one socket and its requests, never the DSH process or native sessions. */
export class DshDesktopTransport {
  private socket: net.Socket | null = null;
  private pending = new Map<string, Pending>();
  private buffer = '';
  private ready = false;
  private opening: Promise<DshDesktopInspection> | null = null;
  readonly discovery: DshDesktopDiscovery;
  private connectTimeoutMs: number;
  constructor(discovery: DshDesktopDiscovery, connectTimeoutMs = 3000) { this.discovery = discovery; this.connectTimeoutMs = connectTimeoutMs; }
  get alive() { return this.ready && !!this.socket && !this.socket.destroyed; }
  start(): Promise<DshDesktopInspection> {
    if (this.opening) return this.opening;
    this.opening = this.open();
    return this.opening;
  }
  private async open(): Promise<DshDesktopInspection> {
    const socket = this.socket = net.createConnection(this.discovery.address);
    socket.setNoDelay(true);
    socket.setEncoding('utf8');
    socket.on('data', data => this.receive(String(data)));
    socket.on('error', () => this.fail(agentFailure('agent_dsh_desktop_disconnected', 'DSH 桌面连接已中断，本次结果未写入。', 503)));
    socket.on('close', () => this.fail(agentFailure('agent_dsh_desktop_disconnected', 'DSH 桌面连接已断开，请重新检查接入。', 503)));
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { reject(agentFailure('agent_dsh_desktop_unavailable', 'DSH 桌面连接超时。', 503)); socket.destroy(); }, this.connectTimeoutMs);
        const connected = () => { clearTimeout(timer); socket.off('error', failed); resolve(); };
        const failed = () => { clearTimeout(timer); socket.off('connect', connected); reject(agentFailure('agent_dsh_desktop_unavailable', 'DSH 桌面后台当前不可用。', 503)); };
        socket.once('connect', connected); socket.once('error', failed);
      });
      const d = this.discovery;
      const output = await this.request('hello', { schemaVersion: DSH_DESKTOP_BRIDGE_SCHEMA, channel: d.channel, profileKey: d.profileKey, hostInstanceId: d.hostInstanceId, credential: d.credential }, this.connectTimeoutMs);
      const inspection = this.validateInspection(output);
      this.ready = true;
      return inspection;
    } catch (error) { await this.close(); throw error; }
  }
  private validateInspection(value: unknown): DshDesktopInspection {
    const row = dshDesktopRecord(value), d = this.discovery, caps = dshDesktopRecord(row.capabilities);
    if (row.schemaVersion !== d.schemaVersion || row.channel !== d.channel || row.profileKey !== d.profileKey || row.hostInstanceId !== d.hostInstanceId || row.appPath !== d.appPath || row.executable !== d.executable || row.dshVersion !== d.dshVersion || !['generate', 'currentSession', 'openSession', 'openTask'].every(key => typeof caps[key] === 'boolean') || !Array.isArray(row.clients)) throw agentFailure('agent_dsh_desktop_scope_changed', 'DSH 桌面范围或连接协议已变化，请重新发现并确认。', 409);
    return value as DshDesktopInspection;
  }
  async inspect(): Promise<DshDesktopInspection> { await this.start(); return this.validateInspection(await this.request('inspect')); }
  request(method: DshDesktopRequest['method'], params?: unknown, timeoutMs: number = DSH_DESKTOP_BRIDGE_LIMITS.navigationTimeoutMs, events?: { configured?(config: AgentExecutionConfig): void; running?(): void }, id = crypto.randomUUID()): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.destroyed) return Promise.reject(agentFailure('agent_dsh_desktop_disconnected', 'DSH 桌面连接不可用。', 503));
    const frame = JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n';
    if (Buffer.byteLength(frame) > DSH_DESKTOP_BRIDGE_LIMITS.frameBytes || this.pending.size >= DSH_DESKTOP_BRIDGE_LIMITS.requestsPerConnection) return Promise.reject(agentFailure('agent_dsh_request_limit', '本次 DSH 请求超出范围。', 413));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(agentFailure('agent_dsh_request_timeout', 'DSH 桌面请求未在预算内完成。', 503)); void this.close(); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, ...events });
      socket.write(frame);
    });
  }
  private receive(data: string) {
    this.buffer += data;
    if (Buffer.byteLength(this.buffer) > DSH_DESKTOP_BRIDGE_LIMITS.frameBytes) { this.fail(agentFailure('agent_dsh_protocol_invalid', 'DSH 桌面返回超出范围。', 502)); void this.close(); return; }
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      let frame: DshDesktopFrame;
      try { frame = JSON.parse(line); } catch { this.fail(agentFailure('agent_dsh_protocol_invalid', 'DSH 桌面返回格式无效。', 502)); void this.close(); return; }
      const pending = frame && typeof frame.id === 'string' ? this.pending.get(frame.id) : null;
      if (!pending) continue;
      if (frame.type === 'configured') { try { pending.configured?.(readAgentExecutionConfig(frame.config)); } catch (error) { this.fail(error); void this.close(); return; } continue; }
      if (frame.type === 'running') { try { pending.running?.(); } catch (error) { this.fail(error); void this.close(); return; } continue; }
      if (frame.type !== 'result' && frame.type !== 'error') { this.fail(agentFailure('agent_dsh_protocol_invalid', 'DSH 桌面返回事件无效。', 502)); void this.close(); return; }
      this.pending.delete(frame.id!); clearTimeout(pending.timer);
      if (frame.type === 'error') {
        const safeCodes = ['agent_dsh_client_ambiguous', 'agent_dsh_client_unavailable', 'agent_dsh_generation_cancelled', 'agent_dsh_generation_timeout', 'agent_dsh_navigation_unconfirmed', 'agent_dsh_navigation_timeout', 'agent_dsh_model_unconfirmed', 'agent_dsh_request_failed'];
        const code = safeCodes.includes(frame.error?.code) ? frame.error.code : 'agent_dsh_request_failed';
        // Host messages are bounded operational messages, never raw vendor errors.
        const messages: Record<string, string> = { agent_dsh_client_ambiguous: '有多个 DSH 桌面窗口，暂不能确定导航目标。', agent_dsh_client_unavailable: '没有可用的 DSH 桌面窗口。', agent_dsh_generation_cancelled: '本次生成已取消。', agent_dsh_generation_timeout: '本次生成超时，已有说明保持。', agent_dsh_navigation_unconfirmed: 'DSH 尚未确认准确目标已打开。', agent_dsh_navigation_timeout: 'DSH 导航未在预算内确认。', agent_dsh_model_unconfirmed: 'DSH 未确认本次模型配置。' };
        const message = messages[code] ?? 'DSH 桌面请求未完成，请检查接入；已有内容保持。';
        pending.reject(agentFailure(code, message, 503));
      } else pending.resolve(frame.output);
    }
  }
  private fail(error: unknown) { this.ready = false; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
  async generate(input: { prompt: string; outputSchema: unknown; timeoutMs?: number; signal: AbortSignal; onConfigured(config: AgentExecutionConfig): void; onRunning(): void }): Promise<string> {
    const inspection = await this.start();
    if (!inspection.capabilities.generate) throw agentFailure('agent_dsh_generation_unavailable', '当前 DSH 桌面插件尚未提供生成能力。', 503);
    if (input.signal.aborted) throw agentFailure('agent_run_cancelled', '本次生成已取消。', 409);
    const id = crypto.randomUUID();
    let aborted = false, configured = false;
    let cancelTimer: NodeJS.Timeout | undefined;
    const abort = () => {
      if (aborted) return; aborted = true;
      cancelTimer = setTimeout(() => { void this.close(); }, DSH_DESKTOP_BRIDGE_LIMITS.cancelTimeoutMs);
      void this.request('cancel', { requestId: id }, DSH_DESKTOP_BRIDGE_LIMITS.cancelTimeoutMs).then(value => { const ack = dshDesktopRecord(value); if (ack.requestId !== id || ack.settled !== true || typeof ack.cancelled !== 'boolean') return this.close(); }, () => this.close());
    };
    input.signal.addEventListener('abort', abort, { once: true });
    try {
      const timeoutMs = Math.min(input.timeoutMs ?? DSH_DESKTOP_BRIDGE_LIMITS.defaultTimeoutMs, DSH_DESKTOP_BRIDGE_LIMITS.maxTimeoutMs);
      const output = await this.request('generate', { prompt: input.prompt, outputSchema: input.outputSchema, timeoutMs }, timeoutMs + DSH_DESKTOP_BRIDGE_LIMITS.cancelTimeoutMs, { configured: config => { if (configured || !config.model || !config.modelProvider) throw agentFailure('agent_dsh_model_unconfirmed', 'DSH 未确认唯一有效的本次模型配置。', 502); configured = true; input.onConfigured(config); }, running: () => { if (!configured) throw agentFailure('agent_dsh_model_unconfirmed', 'DSH 未确认本次模型配置。', 502); input.onRunning(); } }, id);
      if (!configured) throw agentFailure('agent_dsh_model_unconfirmed', 'DSH 未确认本次模型配置，结果未采用。', 502);
      if (aborted || input.signal.aborted) throw agentFailure('agent_run_cancelled', '本次生成已取消。', 409);
      if (typeof output !== 'string' || Buffer.byteLength(output) > DSH_DESKTOP_BRIDGE_LIMITS.outputBytes) throw agentFailure('agent_output_invalid', 'DSH 生成结果格式无效，已有说明保持。', 502);
      return output;
    } finally { if (cancelTimer) clearTimeout(cancelTimer); input.signal.removeEventListener('abort', abort); }
  }
  async close(): Promise<void> { this.ready = false; const socket = this.socket; this.socket = null; socket?.destroy(); this.fail(agentFailure('agent_dsh_desktop_disconnected', '本次 DSH 桌面连接已释放。', 503)); }
}
