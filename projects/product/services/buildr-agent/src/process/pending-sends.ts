import path from 'node:path';
import type { AgentService } from '../application/agent-service.ts';
import { PendingSendRepository } from '../persistence/pending-send-repository.ts';
import { AgentServiceError, safeDiagnostic } from '../domain/agent-state.ts';

/** Only the current receiver dispatches. Request lookup closes the crash window. */
export class PendingSends {
  private running = false;
  private readonly repository: PendingSendRepository;
  private readonly options: {
    dataRoot: string;
    service: AgentService;
    active(): boolean;
    generationAlive(generation: string): boolean;
    conversationBusy(scope: string, id: string): Promise<boolean>;
  };
  constructor(options: PendingSends['options']) { this.options = options; this.repository = new PendingSendRepository(path.join(options.dataRoot, 'agent-service')); }
  async pump(): Promise<void> {
    if (this.running || !this.options.active()) return;
    this.running = true;
    try {
      for (const row of this.repository.list()) {
        if (!this.options.active()) break;
        if (row.state === 'failed') continue;
        const service = this.options.service;
        const prior = service.conversations.lookupRequest(row.scope, row.conversationId, row.id);
        if (prior.found) { this.repository.finish(row, 'delivered', '已登记执行。'); continue; }
        if (row.state === 'dispatching' && row.owner && this.options.generationAlive(row.owner)) continue;
        let claimed: ReturnType<PendingSendRepository['claim']> = undefined;
        try {
          if (row.draft.waitingHandoff) {
            service.checkWaitingHandoff(row.scope,row.conversationId,row.id);
            await service.verifyNext(row.scope,row.conversationId);
            const waiting = service.conversations.read(row.scope,row.conversationId);
            if (waiting.run?.status==='waiting-question' && !row.handoffStopRequested) {
              const preview = service.conversations.prepareSend(row.scope,row.conversationId,{...row.draft,expectedRevision:waiting.revision});
              if(!preview.fits)throw new AgentServiceError('agent_input_too_large',preview.diagnostic??'交接内容超过所选模型容量。',409);
            }
            if (!this.options.active()) continue;
            claimed=this.repository.claim(row,service.generation,this.options.generationAlive);
            if(!claimed)continue;
            service.preserveWaitingQuestions(row.scope,row.conversationId,row.id);
          }
          if (await this.options.conversationBusy(row.scope, row.conversationId)) { const reason='当前接收后台暂未就绪，内容已保存；不等待原命令退出。'; if(claimed||row.reason!==reason)this.repository.finish(claimed??row,'waiting',reason); continue; }
          await service.verifyNext(row.scope, row.conversationId);
          if(row.draft.waitingHandoff){
            if(!this.options.active()){this.repository.finish(claimed!,'waiting','交接已保存，等待当前接收后台就绪。');continue;}
            service.dispatchWaitingHandoff(row.scope,row.conversationId,row.id);
            this.repository.finish(claimed!,'delivered','已登记执行。');continue;
          }
          const current = service.conversations.read(row.scope, row.conversationId);
          const draft = { ...row.draft, expectedRevision: current.revision };
          const preview = await service.conversations.prepareHandoff(row.scope, row.conversationId, draft);
          if (!preview.fits) throw new AgentServiceError('agent_input_too_large', preview.diagnostic ?? '待发送内容超过当前模型限制。', 409);
          if (!this.options.active() || await this.options.conversationBusy(row.scope, row.conversationId)) { if(claimed)this.repository.finish(claimed,'waiting','交接已保存，等待当前接收后台就绪。'); continue; }
          claimed ??= this.repository.claim(row, service.generation, this.options.generationAlive);
          if (!claimed) continue;
          service.conversations.send(row.scope, row.conversationId, { ...draft, previewToken: preview.token, clientRequestId: row.id });
          this.repository.finish(claimed, 'delivered', '已登记执行。');
        } catch (error) {
          const saved = service.conversations.lookupRequest(row.scope, row.conversationId, row.id);
          if (saved.found) { this.repository.finish(claimed ?? row, 'delivered', '已登记执行。'); continue; }
          const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
          // Retry preparation only; accepted request lookup above prevents replay.
          const waiting = /host_.*(unavailable|unreachable)|revision_conflict|preview_stale|conversation_busy|process_state_unconfirmed/.test(code);
          this.repository.finish(claimed ?? row, waiting ? 'waiting' : 'failed', safeDiagnostic(error));
        }
      }
    } finally { this.running = false; }
  }
  get busy(): boolean { return this.running; }
  waiting(reason: string): void {
    for(const row of this.repository.list())if(row.state==='waiting')this.repository.finish(row,'waiting',reason);
  }
}
