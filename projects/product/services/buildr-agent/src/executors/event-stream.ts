import type { ExecutorEvent } from '../contracts.ts';

/** Cumulative text is replaceable; control events always cross an immediate ordered barrier. */
export class ExecutorEventStream {
  private pending?: ExecutorEvent;
  private cancel?: () => void;
  private observation?: string;
  private readonly deliver: (event: ExecutorEvent) => void;
  private readonly schedule: (flush: () => void) => () => void;
  constructor(deliver: (event: ExecutorEvent) => void,
    schedule: (flush: () => void) => () => void = flush => {
      const timer = setTimeout(flush, 40); timer.unref(); return () => clearTimeout(timer);
    }) { this.deliver = deliver; this.schedule = schedule; }
  push(event: ExecutorEvent): void {
    if (event.type === 'item' && event.item.status === 'running' && (event.item.kind === 'message' && event.item.role === 'assistant' || event.item.kind === 'tool' && event.item.nativeTool)) {
      const previous = this.pending;
      if (previous?.type === 'item' && (previous.item.kind !== event.item.kind || previous.item.id !== event.item.id || previous.item.executionId !== event.item.executionId || previous.item.parentToolId !== event.item.parentToolId)) this.flush();
      this.pending = event;
      this.cancel ??= this.schedule(() => { this.cancel = undefined; this.flush(); });
      return;
    }
    if (event.type === 'observation') {
      const signature = JSON.stringify(event.observation);
      if (signature === this.observation) return;
      this.flush(); this.observation = signature;
    } else { this.flush(); this.observation = undefined; }
    this.deliver(event);
  }
  flush(): void {
    this.cancel?.(); this.cancel = undefined;
    const event = this.pending; this.pending = undefined;
    if (event) this.deliver(event);
  }
}
