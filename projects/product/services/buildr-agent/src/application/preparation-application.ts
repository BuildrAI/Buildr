import { randomUUID } from 'node:crypto';
import type { AgentProgramManager, PreparationInput, PreparationState, PreparationView } from '../contracts.ts';
import { expected, fail, safeDiagnostic } from '../domain/agent-state.ts';
import type { ConnectionApplication } from './connection-application.ts';

type Attempt = { view: Omit<PreparationView, 'connection'>; input: PreparationInput; controller: AbortController; work?: Promise<void>; loginId?: string };
const active = new Set<PreparationState>(['discovering', 'installing', 'connecting', 'waiting-login']);

/** Preparation is observable independently of native login and model work. */
export class PreparationApplication {
  private attempts = new Map<string, Attempt>();
  private closing = false;
  private readonly connections: ConnectionApplication;
  private readonly programs: AgentProgramManager;
  private readonly generation: string;
  private readonly now: () => string;
  constructor(connections: ConnectionApplication, programs: AgentProgramManager, generation: string, now: () => string) { this.connections = connections; this.programs = programs; this.generation = generation; this.now = now; }

  begin(id: string, input: PreparationInput): PreparationView {
    if (this.closing) fail('agent_service_closing', '智能体服务正在退出。', 503);
    const connection = this.connections.get(id, true);
    expected(connection.revision, input.expectedRevision);
    if (input.executable && connection.executable && input.executable !== connection.executable) fail('agent_configuration_bound', '已有接入不能改绑程序；请保留原程序、账号及历史。', 409);
    const current = this.attempts.get(id);
    if (current?.work && current.controller.signal.aborted) fail('agent_preparation_busy', '上次准备正在释放资源，请稍后重新检查。', 409);
    if (current && active.has(this.read(id, current.view.id).state)) {
      if (current.input.executable !== input.executable || Boolean(current.input.install) !== Boolean(input.install)) fail('agent_preparation_busy', '当前准备尚未结束，请先取消本次准备。', 409);
      return this.read(id, current.view.id);
    }
    const attempt: Attempt = { view: { id: randomUUID(), connectionId: id, generation: this.generation, state: 'discovering', message: '正在检查本机程序与兼容版本。', updatedAt: this.now() }, input, controller: new AbortController() };
    this.attempts.set(id, attempt);
    attempt.work = this.prepare(id, attempt).catch(error => {
      if (!attempt.controller.signal.aborted) this.update(attempt, 'failed', safeDiagnostic(error));
    }).finally(() => { attempt.work = undefined; });
    return this.read(id, attempt.view.id);
  }
  read(id: string, attemptId: string): PreparationView {
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.view.id !== attemptId) fail('agent_preparation_missing', '准备尝试已结束或服务已重启，请重新检查本机程序。', 404);
    const connection = this.connections.get(id, true);
    if (attempt.view.state === 'waiting-login') {
      if (connection.status === 'ready' && connection.models.length) this.update(attempt, 'ready', '账号与可用模型已验证，可以开始对话。');
      else if (!connection.enabled || ['cancelled', 'expired', 'failed'].includes(connection.loginAttempt?.state ?? '')) this.update(attempt, 'failed', connection.loginAttempt?.diagnostic ?? '登录尚未完成，可重新准备并连接。');
      else if (connection.status === 'failed') this.update(attempt, 'failed', connection.diagnostic ?? '连接检查未完成，请重试。');
    }
    return { ...structuredClone(attempt.view), connection };
  }
  current(id: string): PreparationView | null {
    this.connections.get(id);
    const attempt = this.attempts.get(id);
    return attempt ? this.read(id, attempt.view.id) : null;
  }
  async cancel(id: string, attemptId: string): Promise<PreparationView> {
    const attempt = this.attempts.get(id); this.read(id, attemptId);
    if (!attempt || ['ready', 'cancelled'].includes(attempt.view.state)) return this.read(id, attemptId);
    attempt.controller.abort();
    const connection = this.connections.get(id);
    const login = connection.loginAttempt;
    this.update(attempt, 'cancelled', '已取消本次准备；已有程序、账号和对话均保留。');
    if (login && login.id === attempt.loginId && ['initializing', 'waiting-browser', 'checking'].includes(login.state)) await this.connections.cancelLogin(id, login.id, connection.revision);
    return this.read(id, attemptId);
  }
  private update(attempt: Attempt, state: PreparationState, message: string): void {
    attempt.view.state = state; attempt.view.message = message; attempt.view.updatedAt = this.now();
  }
  private async prepare(id: string, attempt: Attempt): Promise<void> {
    const signal = attempt.controller.signal, input = attempt.input;
    const original = this.connections.get(id);
    // An established native binding is never replaced by newly discovered installs.
    if (this.connections.binding(id) && !input.executable && !original.executable) {
      this.update(attempt, 'connecting', '正在核对已有接入与原生配置。');
      await this.finishConnection(id, attempt, original.executable); return;
    }
    attempt.view.catalog = await this.programs.discover({ provider: original.provider, executable: input.executable, boundExecutable: original.executable, signal });
    signal.throwIfAborted();
    expected(this.connections.get(id).revision, input.expectedRevision);
    const candidates = attempt.view.catalog.candidates.filter(candidate => candidate.compatible);
    let executable: string | undefined;
    if (candidates.length > 1 && !input.executable && !original.executable) {
      this.update(attempt, 'selection-required', '发现多个兼容程序，请选择本次接入使用的来源。'); return;
    }
    if (candidates.length) executable = original.executable ?? candidates[0]!.executable;
    else if (input.install && !input.executable && !original.executable && attempt.view.catalog.installation.canInstall) {
      this.update(attempt, 'installing', '正在准备独立程序，不改动全局安装。');
      executable = await this.programs.install({ provider: original.provider, signal, progress: message => { if (!signal.aborted) this.update(attempt, 'installing', message); } });
      signal.throwIfAborted();
      const installed = await this.programs.discover({ provider: original.provider, executable, signal });
      if (!installed.candidates.some(candidate => candidate.compatible)) fail('agent_install_verification_failed', '安装后程序验证未通过，未启用此接入。');
      attempt.view.catalog = installed;
    } else {
      if (original.executable) this.connections.programUnavailable(id, input.expectedRevision, '原绑定程序已缺失或版本不兼容，账号和历史已保留；请恢复原程序或核对兼容版本。');
      this.update(attempt, 'installation-required', original.executable || input.executable ? '指定程序缺失或不兼容，请核对原程序；不会自动切换来源。' : '尚未发现兼容程序，请安装后重新检查，或准备独立程序。'); return;
    }
    await this.finishConnection(id, attempt, executable);
  }
  private async finishConnection(id: string, attempt: Attempt, executable?: string): Promise<void> {
    attempt.controller.signal.throwIfAborted();
    expected(this.connections.get(id).revision, attempt.input.expectedRevision);
    this.update(attempt, 'connecting', '正在核验程序与独立配置。');
    const connection = await this.connections.connect(id, { expectedRevision: attempt.input.expectedRevision, executable, programOnly:true });
    attempt.controller.signal.throwIfAborted();
    this.update(attempt, 'ready', '程序已就绪。账号登录与模型检查在“模型”中管理。');
  }
  activity() { return [{kind:'program-preparation',count:[...this.attempts.values()].filter(attempt=>Boolean(attempt.work)||active.has(attempt.view.state)).length}].filter(value=>value.count>0); }
  beginClosing(): void { this.closing = true; for (const attempt of this.attempts.values()) attempt.controller.abort(); }
  async close(): Promise<void> { this.beginClosing(); await Promise.allSettled([...this.attempts.values()].map(attempt => attempt.work)); }
}
