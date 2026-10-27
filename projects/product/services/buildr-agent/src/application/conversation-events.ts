import type { ServiceEvent } from '../contracts.ts';

/** Bounded live observation; durable conversation records remain the recovery authority. */
export class ConversationEvents {
  private cursor = 0;
  private readonly observers = new Set<{ accept(event: ServiceEvent): void; close(): void }>();
  readonly generation: string;
  constructor(generation: string) { this.generation = generation; }
  publish(event: Omit<ServiceEvent, 'cursor' | 'generation'>): void {
    const value = { ...event, cursor: ++this.cursor, generation: this.generation };
    for (const observer of this.observers) observer.accept(value);
  }
  subscribe(snapshot: Omit<ServiceEvent, 'cursor' | 'generation'>, predicate: (event: ServiceEvent) => boolean): { events: AsyncIterable<ServiceEvent>; close(): void } {
    let closed = false; let bytes = 0;
    const queue: Array<{ event: ServiceEvent; size: number }> = [];
    let notify: (() => void) | undefined;
    const close = () => { closed = true; this.observers.delete(observer); notify?.(); };
    const observer = {
      accept: (event: ServiceEvent) => {
        if (closed || !predicate(event)) return;
        // Each conversation event carries the complete current view, so a newer
        // state supersedes an undelivered one. A slow reader then observes the
        // latest state instead of filling the queue with megabytes per token and
        // losing the stream entirely.
        if (event.type === 'conversation') {
          for (let index = queue.length - 1; index >= 0; index--) {
            const pending = queue[index]!.event;
            if (pending.type === 'conversation' && pending.conversationId === event.conversationId) { bytes -= queue[index]!.size; queue.splice(index, 1); break; }
          }
        }
        const size = Buffer.byteLength(JSON.stringify(event));
        // The initial snapshot is the mandatory first frame and cannot be superseded;
        // count only what accumulates behind it.
        const buffered = queue[0]?.event.type === 'snapshot' ? bytes - queue[0].size : bytes;
        if (queue.length >= 1000 || buffered + size > 8 * 1024 * 1024) { close(); return; }
        queue.push({ event, size }); bytes += size; notify?.();
      }, close,
    };
    // Registration and snapshot have no async gap. Its cursor describes all preceding commits.
    this.observers.add(observer);
    observer.accept({ ...snapshot, cursor: this.cursor, generation: this.generation });
    const events: AsyncIterable<ServiceEvent> = {
      async *[Symbol.asyncIterator]() {
        try {
          while (!closed || queue.length) {
            if (!queue.length) { await new Promise<void>(resolve => { notify = resolve; if (closed) resolve(); }); notify = undefined; continue; }
            const item = queue.shift()!; bytes -= item.size; yield item.event;
          }
        } finally { close(); }
      },
    };
    return { events, close };
  }
  close(): void { for (const observer of this.observers) observer.close(); }
}
