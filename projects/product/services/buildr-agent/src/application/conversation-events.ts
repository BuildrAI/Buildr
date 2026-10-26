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
    const queue: ServiceEvent[] = [];
    let notify: (() => void) | undefined;
    const close = () => { closed = true; this.observers.delete(observer); notify?.(); };
    const observer = {
      accept: (event: ServiceEvent) => {
        if (closed || !predicate(event)) return;
        const size = Buffer.byteLength(JSON.stringify(event));
        if (queue.length >= 1000 || bytes + size > 8 * 1024 * 1024) { close(); return; }
        queue.push(event); bytes += size; notify?.();
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
            const event = queue.shift()!; bytes -= Buffer.byteLength(JSON.stringify(event)); yield event;
          }
        } finally { close(); }
      },
    };
    return { events, close };
  }
  close(): void { for (const observer of this.observers) observer.close(); }
}
