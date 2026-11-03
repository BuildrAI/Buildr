import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AgentServiceError } from '../domain/agent-state.ts';
import type { WebhookSettingsView, WebhookSettingsInput } from '../contracts.ts';

export type WebhookConfig = { url: string; secret: string; enabled: boolean };
type Snapshot = { revision: string; source: WebhookSettingsView['source']; writable: boolean; state: WebhookSettingsView['state']; config?: WebhookConfig };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function validWebhookTarget(url: string, secret: string): boolean {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !!secret && !/[^\x21-\x7e]/.test(secret); } catch { return false; }
}
const failure = (code: string, message: string, status = 409) => new AgentServiceError(code, message, status);
/** Sole owner of host-private settings. Never surface file contents or filesystem errors. */
export class WebhookSettings {
  private readonly filename?: string;
  private readonly environment: NodeJS.ProcessEnv;
  constructor(environment: NodeJS.ProcessEnv) {
    this.environment = environment;
    const home = environment.BUILDR_HOST_HOME || environment.HOME || environment.USERPROFILE;
    this.filename = environment.BUILDR_AGENT_WEBHOOK_CONFIG || (home ? path.join(home, '.buildr-webhook.json') : undefined);
  }
  snapshot(): Snapshot {
    const source = this.environment.BUILDR_AGENT_WEBHOOK_CONFIG ? 'external-file' : 'private-file';
    const base = { source, writable: source === 'private-file' && !!this.filename } as const;
    let descriptor: number | undefined;
    try {
      if (!this.filename) return { ...base, writable: false, revision: hash('no-home'), state: 'invalid' };
      descriptor = fs.openSync(this.filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW ?? 0));
      const info = fs.fstatSync(descriptor);
      if (!info.isFile() || (info.mode & 0o077) || info.size > 65536 || (process.getuid && info.uid !== process.getuid())) return { ...base, writable: false, revision: hash('unsafe'), state: 'invalid' };
      const body = fs.readFileSync(descriptor, 'utf8');
      const revision = hash(body);
      let value: unknown;
      try { value = JSON.parse(body); } catch { return { ...base, revision, state: 'invalid' }; }
      const config = value as WebhookConfig | null;
      if (!config || typeof config !== 'object' || Array.isArray(config) || typeof config.url !== 'string' || typeof config.secret !== 'string' || (config.enabled !== undefined && typeof config.enabled !== 'boolean') || !validWebhookTarget(config.url, config.secret)) return { ...base, revision, state: 'invalid' };
      return { ...base, revision, state: config.enabled === false ? 'disabled' : 'enabled', config: { ...config, enabled: config.enabled !== false } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && source === 'private-file') {
        const url = this.environment.BUILDR_AGENT_WEBHOOK_URL, secret = this.environment.BUILDR_AGENT_WEBHOOK_SECRET;
        if (url || secret) return { source: 'environment', writable: false, revision: hash(JSON.stringify([url, secret])), state: url && secret && validWebhookTarget(url, secret) ? 'enabled' : 'invalid', config: url && secret && validWebhookTarget(url, secret) ? { url, secret, enabled: true } : undefined };
        return { ...base, revision: hash('absent'), state: 'unconfigured' };
      }
      return { ...base, writable: false, revision: hash('unavailable'), state: 'invalid' };
    } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
  view(): WebhookSettingsView {
    const current = this.snapshot();
    return { revision: current.revision, source: current.source, writable: current.writable, state: current.state, url: current.config?.url ?? '', hasSecret: !!current.config?.secret };
  }
  current(expectedRevision: string): Snapshot {
    const current = this.snapshot();
    if (current.revision !== expectedRevision) throw failure('agent_webhook_conflict', '通知配置已变化，请重新读取后再操作。');
    return current;
  }
  reveal(input: { expectedRevision: string }): { secret: string } {
    const current = this.current(input.expectedRevision);
    if (!current.config) throw failure('agent_webhook_unavailable', '当前没有可查看的有效密钥。');
    return { secret: current.config.secret };
  }
  save(input: WebhookSettingsInput): WebhookSettingsView {
    const current = this.current(input.expectedRevision);
    if (!current.writable || !this.filename) throw failure('agent_webhook_readonly', '当前配置由外部管理或文件不安全，未写入。');
    const config: WebhookConfig = { url: input.url, secret: input.secret || current.config?.secret || '', enabled: input.enabled };
    if (config.url.length > 8192 || config.secret.length > 4096 || !validWebhookTarget(config.url, config.secret)) throw failure('agent_webhook_invalid', '请输入有效的 HTTP(S) 地址和非空可打印 ASCII 密钥，地址不能含账号密码。', 400);
    const lock = this.filename + '.lock', temporary = this.filename + '.' + randomUUID() + '.tmp';
    let locked = false;
    try {
      const descriptor = fs.openSync(lock, 'wx', 0o600); locked = true; fs.closeSync(descriptor);
      this.current(input.expectedRevision);
      fs.writeFileSync(temporary, JSON.stringify(config) + '\n', { mode: 0o600, flag: 'wx' });
      this.current(input.expectedRevision);
      fs.renameSync(temporary, this.filename);
    } catch (error) {
      if (error instanceof AgentServiceError) throw error;
      throw failure('agent_webhook_save_failed', '私有通知配置未能保存，请核对文件安全权限或是否有其他配置操作。');
    } finally {
      try { fs.unlinkSync(temporary); } catch { /* Not created or already renamed. */ }
      if (locked) try { fs.unlinkSync(lock); } catch { /* Keep error details private. */ }
    }
    return this.view();
  }
}
