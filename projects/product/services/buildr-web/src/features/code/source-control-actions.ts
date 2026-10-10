import type { AgentRun } from '../agents/api/agent-operations-api';
import type { CodeActionSource, CodeActionsClient, CommitContext, CommitMode, GitMutationResult } from './api/code-actions-api';

export type Generation = { token: number; agentId: string; label: string; runId: string | null; phase: 'queued' | 'starting' | 'running' | 'cancelling'; revision: string };
export type SourceControlActionState = {
  text: string;
  textVersion: number;
  overrideId: string | null;
  context: CommitContext | null;
  contextLoading: boolean;
  contextError: string;
  generation: Generation | null;
  generatedBy: {agentId: string; label: string; registrationRevision: string; revision: string; executionConfig: AgentRun['executionConfig']} | null;
  generationError: string;
  stale: boolean;
  gitPending: CommitMode | 'push' | null;
  gitResult: GitMutationResult | null;
  gitError: string;
  unknownCommit: boolean;
};
type Ticket = {token: number; cancelled: boolean; runId: string | null; textVersion: number; label: string; agentId: string; revision: string};
export const actionSourceKey = (source: CodeActionSource) => JSON.stringify([source.workspaceId, source.repositoryId, source.worktreeId, source.branch]);
export function emptyActionState(): SourceControlActionState {
  return {text: '', textVersion: 0, overrideId: null, context: null, contextLoading: false, contextError: '', generation: null, generatedBy: null, generationError: '', stale: false, gitPending: null, gitResult: null, gitError: '', unknownCommit: false};
}
export function commitMessageOutput(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('commitMessage' in value) || typeof value.commitMessage !== 'string' || !value.commitMessage.trim()) return null;
  return value.commitMessage;
}
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const terminal = (run: AgentRun) => run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled';
const rejectedBeforeCommit = new Set(['code_commit_location_invalid', 'code_commit_input_invalid', 'code_commit_no_changes', 'code_commit_index_locked', 'code_commit_index_prepare_failed', 'code_commit_stage_failed', 'code_commit_tree_failed', 'code_worktree_identity_changed', 'code_source_changed', 'session_forbidden', 'code_query_invalid', 'code_commit_request_invalid']);
function knownRejection(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && rejectedBeforeCommit.has(error.code); }
function sameResultSource(source: CodeActionSource, result: GitMutationResult) { return result.source.repositoryId === source.repositoryId && result.source.worktreeId === source.worktreeId; }

/** Source-owned state survives selection changes. Issued writes are never cancelled by navigation. */
export class SourceControlActions {
  private records = new Map<string, SourceControlActionState>();
  private tickets = new Map<string, Ticket>();
  private reads = new Map<string, {serial: number; controller: AbortController}>();
  private listeners = new Set<() => void>();
  private serial = 0;
  private disposed = false;
  private client: CodeActionsClient;
  private onRefresh: () => void | Promise<void>;
  private onRuntimeChanged: () => void | Promise<void>;
  private wait: () => Promise<void>;
  constructor(client: CodeActionsClient, onRefresh: () => void | Promise<void>, onRuntimeChanged: () => void | Promise<void> = () => {}, wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 700))) { this.client = client; this.onRefresh = onRefresh; this.onRuntimeChanged = onRuntimeChanged; this.wait = wait; }
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  state(source: CodeActionSource): SourceControlActionState {
    const key = actionSourceKey(source);
    if (!this.records.has(key)) this.records.set(key, emptyActionState());
    return this.records.get(key)!;
  }
  private update(source: CodeActionSource, patch: Partial<SourceControlActionState>) { this.records.set(actionSourceKey(source), {...this.state(source), ...patch}); if (!this.disposed) for (const listener of this.listeners) listener(); }
  setText(source: CodeActionSource, text: string) { const current = this.state(source); this.update(source, {text, textVersion: current.textVersion + 1}); }
  setOverride(source: CodeActionSource, overrideId: string | null) { this.update(source, {overrideId}); }
  async observe(source: CodeActionSource): Promise<void> {
    const key = actionSourceKey(source), serial = ++this.serial, controller = new AbortController();
    this.reads.get(key)?.controller.abort(); this.reads.set(key, {serial, controller}); this.update(source, {contextLoading: true});
    try {
      const context = await this.client.context(source, controller.signal);
      if (this.disposed || controller.signal.aborted || this.reads.get(key)?.serial !== serial) return;
      if (context.source.repositoryId !== source.repositoryId || context.source.worktreeId !== source.worktreeId || context.branch !== source.branch) throw Error('当前工作位置或分支已变化，请刷新后重新选择。');
      const previous = this.state(source);
      this.update(source, {context, contextError: '', contextLoading: false, stale: previous.stale || Boolean(previous.generatedBy && previous.generatedBy.revision !== context.revision)});
    } catch (error) { if (!this.disposed && !controller.signal.aborted && this.reads.get(key)?.serial === serial) this.update(source, {contextError: message(error, '无法核对提交内容。'), contextLoading: false}); }
  }
  async generate(source: CodeActionSource, executor: {id: string; label: string}): Promise<void> {
    const key = actionSourceKey(source), previous = this.state(source), context = previous.context;
    if (!context || previous.contextLoading || previous.contextError || !context.hasChanges || previous.generation || previous.gitPending) return;
    const ticket: Ticket = {token: ++this.serial, cancelled: false, runId: null, textVersion: previous.textVersion, label: executor.label, agentId: executor.id, revision: context.revision};
    this.tickets.set(key, ticket);
    this.update(source, {overrideId: null, generationError: '', generation: {token: ticket.token, agentId: executor.id, label: executor.label, runId: null, phase: 'queued', revision: context.revision}});
    const current = () => !this.disposed && this.tickets.get(key) === ticket;
    try {
      let run = await this.client.generate(source, context.revision, executor.id);
      ticket.runId = run.id;
      if (!current()) return;
      if (run.agentId !== ticket.agentId) throw Error('返回的执行者与本次选择不一致，原说明已保留。');
      if (ticket.cancelled) run = await this.client.cancel(run.id);
      void this.onRuntimeChanged();
      while (current()) {
        if (terminal(run)) { this.finish(source, ticket, run); return; }
        this.update(source, {generation: {token: ticket.token, agentId: ticket.agentId, label: ticket.label, runId: run.id, phase: ticket.cancelled ? 'cancelling' : run.status as 'queued' | 'starting' | 'running', revision: ticket.revision}});
        await this.wait();
        if (!current()) return;
        run = await this.client.run(run.id);
      }
    } catch (error) { if (current()) {this.tickets.delete(key); this.update(source, {generation: null, generationError: message(error, '生成失败，原说明已保留。')});} }
    finally { void this.onRuntimeChanged(); }
  }
  private finish(source: CodeActionSource, ticket: Ticket, run: AgentRun) {
    const key = actionSourceKey(source), previous = this.state(source);
    if (this.tickets.get(key) !== ticket) return;
    this.tickets.delete(key);
    if (ticket.cancelled || run.status === 'cancelled') {this.update(source, {generation: null, generationError: ''}); return;}
    const output = run.status === 'succeeded' ? commitMessageOutput(run.output) : null;
    const contentChanged = previous.context?.revision !== ticket.revision;
    if (output !== null && !contentChanged && previous.textVersion === ticket.textVersion) {
      this.update(source, {text: output, textVersion: previous.textVersion + 1, generation: null, generationError: '', stale: false, generatedBy: {agentId: run.agentId, label: ticket.label, registrationRevision: run.registrationRevision, revision: ticket.revision, executionConfig: run.executionConfig ? {...run.executionConfig} : null}});
    } else {
      this.update(source, {generation: null, generationError: run.error?.message || (contentChanged ? '变更已更新，生成结果未覆盖当前说明，请重新生成。' : output ? '说明已编辑，生成结果未覆盖当前内容。' : '生成未返回可用说明，原内容已保留。'), stale: contentChanged || Boolean(run.error && /changed|revision|stale/.test(run.error.code)) || previous.stale});
      if (run.error?.code === 'code_source_changed') void this.reobserve(source);
    }
  }
  async cancel(source: CodeActionSource): Promise<void> {
    const ticket = this.tickets.get(actionSourceKey(source));
    if (!ticket) return;
    ticket.cancelled = true;
    const generation = this.state(source).generation;
    if (generation) this.update(source, {generation: {...generation, phase: 'cancelling'}});
    if (!ticket.runId) return;
    try { const run = await this.client.cancel(ticket.runId); if (terminal(run)) this.finish(source, ticket, run); }
    catch (error) { this.update(source, {generationError: message(error, '取消请求未完成，请重试。')}); }
  }
  async commit(source: CodeActionSource, mode: CommitMode): Promise<void> {
    const before = this.state(source), context = before.context;
    if (!context || before.contextLoading || before.contextError || !context.hasChanges || !before.text.trim() || before.generation || before.gitPending || before.unknownCommit) return;
    this.update(source, {gitPending: mode, gitError: ''});
    try {
      const result = await this.client.commit(source, context.revision, before.text, mode);
      if (!sameResultSource(source, result)) throw Error('操作返回的来源不一致，请重新核对，原说明已保留。');
      const current = this.state(source), clear = result.commit.completed && current.textVersion === before.textVersion;
      this.update(source, {gitResult: result, unknownCommit: result.commit.status === 'unknown', ...(clear ? {text: '', textVersion: current.textVersion + 1, generatedBy: null, stale: false} : {})});
    } catch (error) { this.update(source, {unknownCommit: !knownRejection(error), gitError: message(error, '提交结果尚未确认，请重新核对后再操作。')}); }
    finally { await this.reobserve(source); this.update(source, {gitPending: null}); }
  }
  async retryPush(source: CodeActionSource): Promise<void> {
    const before = this.state(source), retry = before.gitResult?.push.retry;
    if (!retry || before.gitPending || !before.gitResult?.commit.completed || before.unknownCommit) return;
    this.update(source, {gitPending: 'push', gitError: ''});
    try { const result = await this.client.push(source, retry); if (!sameResultSource(source, result)) throw Error('推送返回的来源不一致，已有提交保留，请重新核对。'); this.update(source, {gitResult: result, unknownCommit: result.commit.status === 'unknown'}); }
    catch (error) {
      const retained = before.gitResult!;
      this.update(source, {gitResult: {...retained, push: {...retained.push, status: 'unknown', message: '推送结果尚未确认，请重新核对远端状态后再操作。', retry: null}}, gitError: '推送结果尚未确认：' + message(error, '请重新核对远端状态；已有提交保留。')});
    }
    finally { await this.reobserve(source); this.update(source, {gitPending: null}); }
  }
  private async reobserve(source: CodeActionSource) {
    if (this.disposed) return;
    const results = await Promise.allSettled([this.observe(source), Promise.resolve().then(() => this.onRefresh())]);
    if (results[1].status === 'rejected') this.update(source, {gitError: '操作结果已保留，但文件列表刷新失败，请重新读取。'});
  }
  async recheck(source: CodeActionSource) { await this.reobserve(source); if (!this.state(source).contextError) this.update(source, {unknownCommit: false, gitError: '已重新读取，请核对变更和提交历史后再操作。'}); }
  dispose() { this.disposed = true; for (const read of this.reads.values()) read.controller.abort(); this.listeners.clear(); }
}
